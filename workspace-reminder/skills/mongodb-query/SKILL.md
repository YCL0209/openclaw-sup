# mongodb-query

MongoDB Agent Hub 資料庫操作工具。

## 用法

所有指令透過共用函式庫執行：

```bash
node /Users/liaoyacheng/.openclaw/lib/mongodb-tools/index.js <command> [--option value ...]
```

## 可用指令

| 指令 | 說明 |
|------|------|
| `claim-task --type <type> --agentId <id>` | 認領待處理任務 |
| `write-result --requestId <id> --agentId <id> --summary "..." --details '{...}'` | 回報任務結果 |
| `push-notification --userId <id> --type <type> --payload '{...}' --source <agent>` | 推送通知 |
| `check-notified --userId <id> --threadId <id>` | 檢查是否已通知 |
| `mark-notified --userId <id> --threadId <id> --source <source>` | 標記已通知 |
| `scan-notifications --userId <id>` | 掃描未推播通知 |
| `timeout-stale-tasks` | 清理逾時任務 |

## 輸出

所有指令輸出 JSON 到 stdout。
