#!/usr/bin/env node
/**
 * system-router — 意圖路由器
 *
 * 接收 LLM 分類結果（JSON），驗證 type 後分派到對應處理邏輯。
 * email 類型：查 skill-registry.json → exec script → 統一寫 write-result → 回傳結果
 * 用法：node index.js --intent '{"type":"email","params":{}}' --userId 8331678146
 * 輸出：JSON
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MONGO_LIB = process.env.MONGO_LIB_PATH || '/Users/liaoyacheng/.openclaw/lib/mongodb-tools';
const mongo = require(MONGO_LIB);

const BASE_DIR = '/Users/liaoyacheng/.openclaw';
const REGISTRY_PATH = path.join(__dirname, 'skill-registry.json');

const VALID_TYPES = ['email', 'erp', 'reminder', 'query', 'chat'];

// ========================================
// CLI Helpers
// ========================================

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

function out(data) {
  console.log(JSON.stringify(data, null, 2));
}

function loadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(raw);
}

// ========================================
// Route Handlers
// ========================================

async function handleQuery(params, userId) {
  const db = await mongo.getDb();
  const source = params.source || 'notifications';

  if (source === 'task_status') {
    const query = { status: { $in: ['pending', 'claimed'] } };
    const tasks = await db.collection('task_requests')
      .find(query).sort({ createdAt: 1 }).limit(20).toArray();
    for (const t of tasks) t._id = t._id.toString();
    return { ok: true, action: 'query', data: { count: tasks.length, tasks } };
  }

  if (source === 'scheduled_tasks') {
    const query = {};
    if (userId) query.userId = userId;
    const tasks = await db.collection('scheduled_tasks')
      .find(query).sort({ createdAt: 1 }).toArray();
    for (const t of tasks) t._id = t._id.toString();
    return { ok: true, action: 'query', data: { count: tasks.length, tasks } };
  }

  if (source === 'pause_task') {
    const result = await db.collection('scheduled_tasks').updateOne(
      { taskId: params.taskId },
      { $set: { status: 'paused', updatedAt: new Date() } }
    );
    return { ok: true, action: 'query', data: { modified: result.modifiedCount, message: '已暫停' } };
  }

  if (source === 'resume_task') {
    const result = await db.collection('scheduled_tasks').updateOne(
      { taskId: params.taskId },
      { $set: { status: 'active', updatedAt: new Date() } }
    );
    return { ok: true, action: 'query', data: { modified: result.modifiedCount, message: '已恢復' } };
  }

  if (source === 'update_interval') {
    const result = await db.collection('scheduled_tasks').updateOne(
      { taskId: params.taskId },
      { $set: { interval: parseInt(params.interval), updatedAt: new Date() } }
    );
    return { ok: true, action: 'query', data: { modified: result.modifiedCount, message: '已更新間隔' } };
  }

  if (source === 'create_task') {
    const doc = {
      taskId: `${params.taskType}-user-${userId}`,
      userId,
      taskType: params.taskType,
      status: 'active',
      interval: parseInt(params.interval),
      config: params.config || {},
      activeHours: params.activeHours || { start: "09:00", end: "21:00" },
      timezone: params.timezone || "Asia/Taipei",
      lastRunAt: null,
      lastResult: null,
      createdAt: new Date()
    };
    const result = await db.collection('scheduled_tasks').insertOne(doc);
    return { ok: true, action: 'query', data: { inserted: result.insertedId.toString(), taskId: doc.taskId, message: '已建立定時任務' } };
  }

  if (source === 'delete_task') {
    const result = await db.collection('scheduled_tasks').deleteOne({ taskId: params.taskId });
    return { ok: true, action: 'query', data: { deleted: result.deletedCount, message: '已刪除' } };
  }

  if (source === 'cancel_reminder') {
    const { ObjectId } = require('mongodb');
    let filter;
    if (params.reminderId) {
      filter = { _id: new ObjectId(params.reminderId) };
    } else if (params.content) {
      filter = { content: { $regex: params.content, $options: 'i' }, status: 'pending' };
    } else {
      return { ok: false, error: '需要 reminderId 或 content 來取消提醒' };
    }
    const result = await db.collection('reminders').updateOne(
      filter,
      { $set: { status: 'cancelled', cancelledAt: new Date() } }
    );
    return { ok: true, action: 'query', data: { modified: result.modifiedCount, message: result.modifiedCount ? '已取消提醒' : '找不到符合的提醒' } };
  }

  if (source === 'list_reminders') {
    const reminders = await db.collection('reminders')
      .find({ status: 'pending', userId: userId || undefined })
      .sort({ remindAt: 1 }).limit(20).toArray();
    for (const r of reminders) r._id = r._id.toString();
    return { ok: true, action: 'query', data: { count: reminders.length, reminders } };
  }

  // default: scan notifications
  const query = { delivered: false };
  if (userId) query.userId = userId;
  const notifications = await db.collection('notifications')
    .find(query).sort({ createdAt: 1 }).limit(50).toArray();
  for (const n of notifications) n._id = n._id.toString();
  return { ok: true, action: 'query', data: { count: notifications.length, notifications } };
}

async function handleScriptExec(type, params, userId) {
  const registry = loadRegistry();
  const entry = registry[type];
  if (!entry) {
    return { ok: false, error: `type "${type}" not found in skill-registry.json` };
  }

  const db = await mongo.getDb();

  // 1. 寫 task_requests（log）
  const taskDoc = {
    type, status: 'executing',
    userId: userId || null, params, context: {},
    createdAt: new Date(), claimedBy: 'system-router', claimedAt: new Date()
  };
  const taskResult = await db.collection('task_requests').insertOne(taskDoc);
  const taskId = taskResult.insertedId.toString();

  // 2. exec script
  const scriptPath = path.join(BASE_DIR, entry.script);
  const startMs = Date.now();

  try {
    // 組裝 CLI 參數：把 params 展開為 --key value，加上 --userId
    const cliArgs = [];
    if (userId) cliArgs.push(`--userId "${userId}"`);
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        if (v !== null && v !== undefined) {
          cliArgs.push(`--${k} "${String(v).replace(/"/g, '\\"')}"`);
        }
      }
    }
    const argsStr = cliArgs.length > 0 ? ' ' + cliArgs.join(' ') : '';

    const stdout = execSync(`node "${scriptPath}"${argsStr}`, {
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const durationMs = Date.now() - startMs;
    const summary = stdout.trim();

    // 3. 寫 task_results（success）
    await db.collection('task_results').insertOne({
      requestId: taskId,
      scriptId: type,
      status: 'success',
      summary,
      details: {},
      executedAt: new Date(),
      durationMs
    });

    // 4. 更新 task_requests 狀態
    await db.collection('task_requests').updateOne(
      { _id: taskResult.insertedId },
      { $set: { status: 'completed', completedAt: new Date() } }
    );

    return { ok: true, action: 'result', data: { summary, taskId } };

  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errorMsg = err.stderr ? err.stderr.trim() : err.message;

    // 寫 task_results（error）
    await db.collection('task_results').insertOne({
      requestId: taskId,
      scriptId: type,
      status: 'error',
      summary: '',
      details: { error: errorMsg, exitCode: err.status },
      executedAt: new Date(),
      durationMs
    });

    // 更新 task_requests 狀態
    await db.collection('task_requests').updateOne(
      { _id: taskResult.insertedId },
      { $set: { status: 'error', completedAt: new Date() } }
    );

    return { ok: false, error: errorMsg, data: { taskId } };
  }
}

function handleChat() {
  return { ok: true, action: 'chat' };
}

// ========================================
// Main
// ========================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userId = args.userId || null;

  // 1. 解析 intent JSON
  let intent;
  try {
    intent = JSON.parse(args.intent);
  } catch {
    out({ ok: true, action: 'chat', fallback: true, reason: 'invalid intent JSON' });
    return;
  }

  const type = intent.type;
  const params = intent.params || {};

  // 2. 驗證 type
  if (!VALID_TYPES.includes(type)) {
    out({ ok: false, action: 'chat', error: `invalid type: ${type}`, validTypes: VALID_TYPES });
    return;
  }

  // 3. params 正規化（防守 LLM 傳錯欄位名稱）
  if (type === 'reminder') {
    if (params.message && !params.content) params.content = params.message;
    if (params.date && !params.remindAt) params.remindAt = params.date;
    if (params.time && !params.remindAt) params.remindAt = params.time;
    if (params.text && !params.content) params.content = params.text;
  }

  // 4. 路由
  try {
    let result;
    switch (type) {
      case 'query':    result = await handleQuery(params, userId); break;
      case 'email':    result = await handleScriptExec('email', params, userId); break;
      case 'reminder': result = await handleScriptExec('reminder', params, userId); break;
      case 'erp':      result = await handleScriptExec('erp', params, userId); break;
      case 'chat':     result = handleChat(); break;
    }
    out(result);
  } catch (err) {
    out({ ok: false, error: err.message });
    process.exit(1);
  } finally {
    await mongo.close();
  }
}

main();
