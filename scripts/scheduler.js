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

const mongo = require('../../lib/mongodb-tools');
const { runNotify } = require('../../workspace-reminder/skills/check-email/index.js');

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
  const db = await mongo.getDb();

  try {
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
