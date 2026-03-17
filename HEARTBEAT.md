# HEARTBEAT.md

## 超時清理（每次 heartbeat 執行）

每次 heartbeat 觸發時，先清理逾時任務：

```bash
node /Users/liaoyacheng/.openclaw/lib/mongodb-tools/index.js timeout-stale-tasks
```

如果 `timedOut > 0`，後續的通知掃描會自動推播超時通知給用戶。

## 通知掃描（每次 heartbeat 執行）

1. 用 `exec` 執行通知掃描：
```bash
node /Users/liaoyacheng/.openclaw/lib/mongodb-tools/index.js scan-notifications
```

2. 檢查輸出：
   - 如果 `count` 為 0 → 不做任何事，靜默結束
   - 如果有未推播通知 → 依照以下規則處理：

3. 處理通知：
   - 讀取每個通知的 `type`、`priority`、`payload`
   - 用 `message` tool 推送給對應的 `userId`
   - 推送後用 `exec` 執行：
     ```bash
     node /Users/liaoyacheng/.openclaw/lib/mongodb-tools/index.js mark-delivered --notificationId <id>
     ```

4. 格式化推播訊息：
   - email 類型：「📬 {payload.summary}」+ 詳情
   - reminder 類型：「⏰ {payload.content}」
   - task_timeout 類型：「⚠️ {payload.summary}」
   - erp 類型：「📋 {payload.summary}」
   - 其他類型：直接輸出 payload.summary

**注意：如果 scan-notifications 回傳 count: 0，不要回覆任何訊息。**
