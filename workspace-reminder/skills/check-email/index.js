/**
 * Check Email Skill
 *
 * 排程模式（--scheduled）：查 Gmail 未讀信 → 去重 → 有新信輸出摘要，沒新信輸出 HEARTBEAT_OK
 * 手動模式（export）：直接回報所有未讀信，不做去重
 */

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ========================================
// Configuration
// ========================================

const WORKSPACE = path.resolve(__dirname, '../..');
const STATE_FILE = path.join(WORKSPACE, 'data', 'notified-emails.json');
const LOCK_FILE = path.join(WORKSPACE, 'data', '.check-email.lock');
const GOG_ACCOUNT = process.env.GOG_ACCOUNT || 'info@sui-yao.com';
const MAX_RESULTS = 20;
const MAX_NOTIFIED_RECORDS = 200;

// ========================================
// File Lock (prevent concurrent execution)
// ========================================

let lockFd = null;

function acquireLock() {
  try {
    lockFd = fs.openSync(LOCK_FILE, 'wx');
    // Write PID for debugging
    fs.writeSync(lockFd, String(process.pid));
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Check if the lock is stale (older than 5 minutes)
      try {
        const stat = fs.statSync(LOCK_FILE);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 5 * 60 * 1000) {
          // Stale lock, remove and retry
          fs.unlinkSync(LOCK_FILE);
          return acquireLock();
        }
      } catch (_) {
        // stat failed, lock file gone
        return acquireLock();
      }
      return false;
    }
    throw err;
  }
}

function releaseLock() {
  try {
    if (lockFd !== null) {
      fs.closeSync(lockFd);
      lockFd = null;
    }
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (_) {
    // ignore cleanup errors
  }
}

// ========================================
// State Management (notified-emails.json)
// ========================================

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { notified: [], lastCheckAt: null };
  }
}

function saveState(state) {
  // Keep only the most recent records
  if (state.notified.length > MAX_NOTIFIED_RECORDS) {
    state.notified = state.notified.slice(-MAX_NOTIFIED_RECORDS);
  }
  state.lastCheckAt = Date.now();

  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ========================================
// Gmail Query (via gog CLI)
// ========================================

function fetchUnreadEmails() {
  try {
    const cmd = `/opt/homebrew/bin/gog gmail search "is:unread" --max ${MAX_RESULTS} --json --account ${GOG_ACCOUNT}`;
    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const data = JSON.parse(output);
    if (!data.threads || !Array.isArray(data.threads)) {
      return [];
    }
    return data.threads;
  } catch (err) {
    console.error(`[check-email] gog 查詢失敗: ${err.message}`);
    return null; // null = error, [] = no emails
  }
}

// ========================================
// Deduplication
// ========================================

function filterNewEmails(threads, state) {
  const notifiedIds = new Set(state.notified.map(n => n.threadId));
  return threads.filter(t => !notifiedIds.has(t.id));
}

// ========================================
// Output Formatting
// ========================================

function formatSummary(newEmails) {
  const lines = [];
  lines.push(`📬 ${newEmails.length} 封新未讀信件：`);
  lines.push('');
  lines.push('| 日期 | 寄件人 | 主旨 |');
  lines.push('|------|--------|------|');

  for (const email of newEmails) {
    const date = email.date || '未知';
    const from = (email.from || '未知').replace(/[|]/g, '\\|');
    const subject = (email.subject || '(無主旨)').replace(/[|]/g, '\\|');
    lines.push(`| ${date} | ${from} | ${subject} |`);
  }

  return lines.join('\n');
}

// ========================================
// Telegram Direct Push (for --notify mode)
// ========================================

function loadBotToken() {
  const configPath = '/Users/liaoyacheng/.openclaw/openclaw.json';
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.channels.telegram.accounts.default.botToken;
}

function sendTelegram(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch {
          reject(new Error(`Telegram API parse error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ========================================
// Notify Mode (called by scheduler, pushes directly to Telegram)
// ========================================

async function runNotify(chatId) {
  if (!acquireLock()) {
    return { ok: true, newCount: 0, notified: false, reason: 'locked' };
  }

  try {
    const threads = fetchUnreadEmails();
    if (threads === null) {
      return { ok: false, error: 'Gmail query failed' };
    }
    if (threads.length === 0) {
      return { ok: true, newCount: 0, notified: false };
    }

    const state = loadState();
    const newEmails = filterNewEmails(threads, state);

    if (newEmails.length === 0) {
      return { ok: true, newCount: 0, notified: false };
    }

    // Push to Telegram directly
    const botToken = loadBotToken();
    const summary = formatSummary(newEmails);
    await sendTelegram(botToken, chatId, summary);

    // Update state
    const now = Date.now();
    for (const email of newEmails) {
      state.notified.push({ threadId: email.id, timestamp: now });
    }
    saveState(state);

    return { ok: true, newCount: newEmails.length, notified: true };
  } finally {
    releaseLock();
  }
}

// ========================================
// Scheduled Mode (called by cron via exec)
// ========================================

async function runScheduled() {
  // Acquire lock
  if (!acquireLock()) {
    console.log('HEARTBEAT_OK');
    return;
  }

  try {
    // Fetch unread emails
    const threads = fetchUnreadEmails();
    if (threads === null) {
      // Query error - still output heartbeat to avoid noisy error notifications
      console.error('[check-email] 查詢錯誤，跳過本次');
      console.log('HEARTBEAT_OK');
      return;
    }

    if (threads.length === 0) {
      console.log('HEARTBEAT_OK');
      return;
    }

    // Load state and filter
    const state = loadState();
    const newEmails = filterNewEmails(threads, state);

    if (newEmails.length === 0) {
      console.log('HEARTBEAT_OK');
      return;
    }

    // Output summary for model to forward
    console.log(formatSummary(newEmails));

    // Update state
    const now = Date.now();
    for (const email of newEmails) {
      state.notified.push({ threadId: email.id, timestamp: now });
    }
    saveState(state);

  } finally {
    releaseLock();
  }
}

// ========================================
// Manual Mode (called by user via skill trigger)
// ========================================

async function checkEmail(message, context) {
  const threads = fetchUnreadEmails();

  if (threads === null) {
    return '查詢信件時發生錯誤，請稍後再試。';
  }

  if (threads.length === 0) {
    return '目前沒有未讀信件。';
  }

  const lines = [];
  lines.push(`📬 共 ${threads.length} 封未讀信件：`);
  lines.push('');
  lines.push('| 日期 | 寄件人 | 主旨 |');
  lines.push('|------|--------|------|');

  for (const email of threads) {
    const date = email.date || '未知';
    const from = (email.from || '未知').replace(/[|]/g, '\\|');
    const subject = (email.subject || '(無主旨)').replace(/[|]/g, '\\|');
    lines.push(`| ${date} | ${from} | ${subject} |`);
  }

  return lines.join('\n');
}

// ========================================
// CLI Entry Point
// ========================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--notify')) {
    // Extract --chatId value
    const chatIdIdx = args.indexOf('--chatId');
    const chatId = chatIdIdx >= 0 ? args[chatIdIdx + 1] : null;
    if (!chatId) {
      console.log(JSON.stringify({ ok: false, error: '--chatId is required for --notify mode' }));
      process.exit(1);
    }
    runNotify(chatId).then(result => {
      console.log(JSON.stringify(result));
    }).catch(err => {
      console.error(`[check-email] notify 錯誤: ${err.message}`);
      releaseLock();
      process.exit(1);
    });
  } else if (args.includes('--scheduled')) {
    runScheduled().catch(err => {
      console.error(`[check-email] 排程執行錯誤: ${err.message}`);
      releaseLock();
      process.exit(1);
    });
  } else {
    // Default: run as manual check
    checkEmail('', {}).then(result => {
      console.log(result);
    }).catch(err => {
      console.error(`[check-email] 錯誤: ${err.message}`);
      process.exit(1);
    });
  }
}

// ========================================
// Export
// ========================================

module.exports = {
  checkEmail,
  runScheduled,
  runNotify
};
