#!/usr/bin/env node
/**
 * heartbeat-guard.js — cron job 守護腳本
 *
 * 確保 scheduler-heartbeat cron job 存在且唯一運作。
 * 由 heartbeat agent 透過 exec: 觸發，不需要 LLM 推理。
 */

const { execSync } = require('child_process');

const JOB_NAME = 'scheduler-heartbeat';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
}

function listJobs() {
  try {
    const output = run('openclaw cron list --json --all');
    const data = JSON.parse(output);
    return (data.jobs || []).filter(j => j.name === JOB_NAME);
  } catch (err) {
    console.error(`[heartbeat-guard] cron list 失敗: ${err.message}`);
    return null;
  }
}

function rebuildJob() {
  console.log('[heartbeat-guard] scheduler-heartbeat 不存在，重建中...');
  try {
    run([
      'openclaw cron add',
      `--name "${JOB_NAME}"`,
      '--every "1h"',
      '--session isolated',
      '--announce',
      '--channel telegram',
      '--to 8331678146',
      '--message "exec: cd ~/.openclaw/workspace && node scripts/scheduler.js"'
    ].join(' '));
    console.log('[heartbeat-guard] 已重建 scheduler cron job');
  } catch (err) {
    console.error(`[heartbeat-guard] 重建失敗: ${err.message}`);
  }
}

function enableJob(id) {
  try {
    run(`openclaw cron enable ${id}`);
    console.log(`[heartbeat-guard] 已啟用 job ${id}`);
  } catch (err) {
    console.error(`[heartbeat-guard] 啟用失敗: ${err.message}`);
  }
}

function removeJob(id) {
  try {
    run(`openclaw cron rm ${id}`);
    console.log(`[heartbeat-guard] 已刪除 job ${id}`);
  } catch (err) {
    console.error(`[heartbeat-guard] 刪除失敗: ${err.message}`);
  }
}

function main() {
  const jobs = listJobs();
  if (jobs === null) return; // list 失敗，跳過

  if (jobs.length === 0) {
    // 不存在 → 重建
    rebuildJob();
    return;
  }

  // 按 createdAtMs 排序，最新的在最後
  jobs.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
  const newest = jobs[jobs.length - 1];
  const enabledJobs = jobs.filter(j => j.enabled);

  if (enabledJobs.length === 0) {
    // 全部 disabled → 啟用最新的，刪其餘
    enableJob(newest.id);
    for (const j of jobs) {
      if (j.id !== newest.id) removeJob(j.id);
    }
    console.log(`[heartbeat-guard] 已重新啟用，保留 ${newest.id}`);
    return;
  }

  if (enabledJobs.length > 1) {
    // 多個 enabled → 只保留最新的
    const newestEnabled = enabledJobs[enabledJobs.length - 1];
    for (const j of jobs) {
      if (j.id !== newestEnabled.id) removeJob(j.id);
    }
    console.log(`[heartbeat-guard] 已清理重複 job，保留 ${newestEnabled.id}`);
    return;
  }

  // 只有一個 enabled → 正常
  console.log('HEARTBEAT_OK');
}

main();
