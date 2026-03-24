#!/usr/bin/env node
/**
 * scheduler.js — 通用定時引擎
 *
 * 系統 cron 每分鐘觸發，掃描 MongoDB scheduled_tasks，
 * 判斷到期的任務並執行對應 handler。不經過 LLM，零成本。
 */

// 確保 HOME 環境變數存在（cron 環境需要）
if (!process.env.HOME) {
  process.env.HOME = '/Users/liaoyacheng';
}

// 守護 cron job（每次執行時自動檢查 + 修復）
try {
  require('./heartbeat-guard');
} catch (err) {
  console.error(`[scheduler] heartbeat-guard error: ${err.message}`);
}

const fs = require('fs');
const path = require('path');
const https = require('https');
const mongo = require('../../lib/mongodb-tools');
const { runNotify } = require('../../workspace-reminder/skills/check-email/index.js');

// ========================================
// Telegram Helper (複用 check-email 的邏輯)
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
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Telegram API parse error: ${body}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ========================================
// Reminder Scanner（每次執行都掃描到期提醒）
// ========================================

const DEFAULT_CHAT_ID = '8331678146';

function calcNextRemindAt(remindAt, repeat) {
  const next = new Date(remindAt);

  switch (repeat.type) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      return next;

    case 'weekly': {
      const weekdays = repeat.weekdays || [];
      if (weekdays.length === 0) return null;
      // 找下一個符合的 weekday（1=週一 ... 7=週日）
      for (let i = 1; i <= 7; i++) {
        const candidate = new Date(remindAt);
        candidate.setDate(candidate.getDate() + i);
        const dow = candidate.getDay() || 7; // Sunday=0 → 7
        if (weekdays.includes(dow)) return candidate;
      }
      return null;
    }

    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (repeat.dayOfMonth) next.setDate(repeat.dayOfMonth);
      return next;

    case 'interval':
      if (!repeat.intervalMs) return null;
      return new Date(remindAt.getTime() + repeat.intervalMs);

    default:
      return null;
  }
}

async function checkReminders(db) {
  const now = new Date();
  const reminders = await db.collection('reminders').find({
    status: 'pending',
    remindAt: { $lte: now }
  }).toArray();

  if (reminders.length === 0) return;

  const botToken = loadBotToken();
  let sent = 0;

  for (const r of reminders) {
    const chatId = r.userId || DEFAULT_CHAT_ID;
    const timeStr = r.remindAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const repeatLabel = r.repeat ? ` 🔁 ${r.repeat.type}` : '';
    const text = `⏰ *提醒*${repeatLabel}\n\n${r.content}\n\n_設定時間：${timeStr}_`;

    try {
      await sendTelegram(botToken, chatId, text);

      if (r.repeat && r.repeat.type) {
        // 重複提醒：更新 remindAt 到下次時間
        const nextAt = calcNextRemindAt(r.remindAt, r.repeat);
        if (nextAt) {
          await db.collection('reminders').updateOne(
            { _id: r._id },
            { $set: { remindAt: nextAt, lastDeliveredAt: new Date() } }
          );
          console.log(`[scheduler] reminder repeated: ${r.content} → next: ${nextAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
        } else {
          // 無法計算下次時間，標記完成
          await db.collection('reminders').updateOne(
            { _id: r._id },
            { $set: { status: 'delivered', deliveredAt: new Date() } }
          );
        }
      } else {
        // 單次提醒：標記 delivered
        await db.collection('reminders').updateOne(
          { _id: r._id },
          { $set: { status: 'delivered', deliveredAt: new Date() } }
        );
      }

      sent++;
      console.log(`[scheduler] reminder delivered: ${r.content}`);
    } catch (err) {
      console.error(`[scheduler] reminder send failed: ${err.message}`);
    }
  }

  if (sent > 0) {
    console.log(`[scheduler] ${sent} reminders delivered`);
  }
}

// ========================================
// Cron Job Dedup
// ========================================

const JOBS_FILE = path.join(process.env.HOME, '.openclaw', 'cron', 'jobs.json');

async function dedupCronJobs() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch { return; }

  const heartbeatJobs = (parsed.jobs || [])
    .filter(j => j.name === 'scheduler-heartbeat' && j.enabled);

  if (heartbeatJobs.length <= 1) return;

  heartbeatJobs.sort((a, b) => a.createdAtMs - b.createdAtMs);
  const keep = heartbeatJobs[0];
  const toRemove = heartbeatJobs.slice(1);

  console.log(`[scheduler] dedup: found ${heartbeatJobs.length} scheduler-heartbeat jobs, keeping ${keep.id}, removing ${toRemove.length}`);

  // 嘗試透過 gateway API 刪除
  try {
    const { GATEWAY_PORT, GATEWAY_TOKEN } = require('../mission-control/lib/config');
    const { gatewayInvoke } = require('../mission-control/lib/helpers');

    for (const job of toRemove) {
      try {
        await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', {
          action: 'remove',
          jobId: job.id
        });
        console.log(`[scheduler] dedup: removed ${job.id} via gateway`);
      } catch (err) {
        console.error(`[scheduler] dedup: gateway remove failed for ${job.id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`[scheduler] dedup: gateway unavailable (${err.message})`);
  }

  // 確保檔案也同步清理（gateway 內存與檔案可能不同步）
  try {
    const fresh = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    const removeIds = new Set(toRemove.map(j => j.id));
    const before = fresh.jobs.length;
    fresh.jobs = fresh.jobs.filter(j => !removeIds.has(j.id));
    if (fresh.jobs.length < before) {
      fs.writeFileSync(JOBS_FILE, JSON.stringify(fresh, null, 2));
      console.log(`[scheduler] dedup: cleaned ${before - fresh.jobs.length} duplicates from jobs.json`);
    }
  } catch (err) {
    console.error(`[scheduler] dedup: file cleanup failed: ${err.message}`);
  }
}

// ========================================
// Handler Registry
// ========================================

const handlers = {
  'email-check': async (config) => {
    const chatId = config.chatId;
    if (!chatId) throw new Error('missing chatId in config');
    return await runNotify(chatId);
  }
};

// ========================================
// activeHours Check
// ========================================

function isWithinActiveHours(task) {
  const { activeHours, timezone } = task;
  if (!activeHours || !activeHours.start || !activeHours.end) return true;

  const tz = timezone || 'Asia/Taipei';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const nowMinutes = hour * 60 + minute;

  const [startH, startM] = activeHours.start.split(':').map(Number);
  const [endH, endM] = activeHours.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

// ========================================
// Main
// ========================================

async function main() {
  console.log(`[scheduler] started at ${new Date().toISOString()}`);

  // 清理重複的 cron job（防止 HEARTBEAT 重複建立）
  await dedupCronJobs();

  const db = await mongo.getDb();

  try {
    // 掃描到期提醒（每次都檢查，不受 interval 限制）
    await checkReminders(db);

    // 查所有 active 的定時任務
    const tasks = await db.collection('scheduled_tasks')
      .find({ status: 'active' }).toArray();

    if (tasks.length === 0) return;

    const now = Date.now();

    for (const task of tasks) {
      // 檢查 activeHours
      if (!isWithinActiveHours(task)) {
        continue;
      }

      const elapsed = now - new Date(task.lastRunAt).getTime();
      if (elapsed < task.interval) continue;

      const handler = handlers[task.taskType];
      if (!handler) {
        console.error(`[scheduler] unknown taskType: ${task.taskType}, skipping`);
        continue;
      }

      const startMs = Date.now();
      let result;
      let status = 'success';
      let summary = '';

      try {
        result = await handler(task.config || {});
        summary = result.notified
          ? `pushed ${result.newCount} new emails`
          : 'no new emails';
      } catch (err) {
        status = 'error';
        summary = err.message;
        result = { ok: false, error: err.message };
      }

      const durationMs = Date.now() - startMs;

      // 更新 lastRunAt + lastResult
      await db.collection('scheduled_tasks').updateOne(
        { taskId: task.taskId },
        { $set: { lastRunAt: new Date(), lastResult: summary } }
      );

      // 寫 task_results log
      await db.collection('task_results').insertOne({
        requestId: task.taskId,
        scriptId: task.taskType,
        status,
        summary,
        details: result || {},
        executedAt: new Date(),
        durationMs
      });

      if (status === 'success') {
        console.log(`[scheduler] ${task.taskId}: ${summary}`);
      } else {
        console.error(`[scheduler] ${task.taskId} error: ${summary}`);
      }
    }
  } finally {
    await mongo.close();
  }
}

main().catch(err => {
  console.error(`[scheduler] fatal: ${err.message}`);
  mongo.close().catch(() => {});
  process.exit(1);
});
