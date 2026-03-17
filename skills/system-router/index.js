#!/usr/bin/env node
/**
 * system-router — 意圖路由器
 *
 * 接收 LLM 分類結果（JSON），驗證 type 後分派到對應處理邏輯。
 * 用法：node index.js --intent '{"type":"email","params":{}}' --userId 8331678146
 * 輸出：JSON
 */

const MONGO_LIB = process.env.MONGO_LIB_PATH || '/Users/liaoyacheng/.openclaw/lib/mongodb-tools';
const mongo = require(MONGO_LIB);

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

  // default: scan notifications
  const query = { delivered: false };
  if (userId) query.userId = userId;
  const notifications = await db.collection('notifications')
    .find(query).sort({ createdAt: 1 }).limit(50).toArray();
  for (const n of notifications) n._id = n._id.toString();
  return { ok: true, action: 'query', data: { count: notifications.length, notifications } };
}

async function handleEmail(params, userId) {
  const db = await mongo.getDb();
  const doc = {
    type: 'email-check', status: 'pending',
    userId: userId || null, params, context: {},
    createdAt: new Date(), claimedBy: null, claimedAt: null
  };
  const result = await db.collection('task_requests').insertOne(doc);
  return { ok: true, action: 'dispatched', taskType: 'email-check', data: { taskId: result.insertedId.toString() } };
}

async function handleReminder(params, userId) {
  const db = await mongo.getDb();
  const doc = {
    type: 'reminder', status: 'pending',
    userId: userId || null, params, context: {},
    createdAt: new Date(), claimedBy: null, claimedAt: null
  };
  const result = await db.collection('task_requests').insertOne(doc);
  return { ok: true, action: 'dispatched', taskType: 'reminder', data: { taskId: result.insertedId.toString() } };
}

async function handleErp(params, userId) {
  const db = await mongo.getDb();
  const doc = {
    type: 'erp', status: 'pending',
    userId: userId || null, params, context: {},
    createdAt: new Date(), claimedBy: null, claimedAt: null
  };
  const result = await db.collection('task_requests').insertOne(doc);
  return { ok: true, action: 'dispatched', taskType: 'erp', data: { taskId: result.insertedId.toString() } };
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

  // 3. 路由
  try {
    let result;
    switch (type) {
      case 'query':    result = await handleQuery(params, userId); break;
      case 'email':    result = await handleEmail(params, userId); break;
      case 'reminder': result = await handleReminder(params, userId); break;
      case 'erp':      result = await handleErp(params, userId); break;
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
