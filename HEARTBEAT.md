# HEARTBEAT

## 定時引擎守護

Heartbeat 的唯一職責：確保 `scheduler-heartbeat` cron job 存在且正常運作。

### 檢查流程

1. 執行 `openclaw cron list`
2. 檢查是否存在 name 為 `"scheduler-heartbeat"` 的 job
3. 根據結果：

| 狀態 | 動作 |
|------|------|
| 不存在 | 執行以下指令重建，然後回報「已重建 scheduler cron job」 |
| 存在但 enabled: false | 執行 `openclaw cron enable <job-id>`，回報「已重新啟用 scheduler cron job」 |
| 存在且 enabled: true | 回覆 `HEARTBEAT_OK` |

### 重建指令

```bash
openclaw cron add \
  --name "scheduler-heartbeat" \
  --every "1h" \
  --session isolated \
  --delivery-mode none \
  --message "exec: cd ~/.openclaw/workspace && node scripts/scheduler.js"
```

### 注意

- **不要**自己執行 scheduler.js，那是 cron job 的工作
- **不要**查詢 MongoDB scheduled_tasks，那是 scheduler.js 的工作
- Heartbeat 只負責確保 cron job 活著
