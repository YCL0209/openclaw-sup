# 定時任務引擎架構

## 系統概覽

```
macOS LaunchAgent (每 10 分鐘)
    ↓
scheduler.js
    ↓
掃描 MongoDB scheduled_tasks
    ↓
逐一執行到期的任務 (handlers)
    ↓
通知用戶 (Telegram / Line)
```

## 核心檔案

| 檔案 | 用途 |
|------|------|
| `~/Library/LaunchAgents/com.openclaw.scheduler.plist` | macOS 觸發器，每 600 秒執行一次 scheduler.js |
| `~/.openclaw/workspace/scripts/scheduler.js` | 主程式，掃描 DB 並執行到期任務 |
| `~/.openclaw/workspace/HEARTBEAT.md` | Heartbeat 守護指示，確保 cron job 存在 |
| `~/.openclaw/cron/jobs.json` | OpenClaw 內建 cron 定義（目前 disabled） |
| `~/.openclaw/logs/scheduler.log` | 執行 log（stdout） |
| `~/.openclaw/logs/scheduler.err.log` | 錯誤 log（stderr） |

## 資料庫結構

### scheduled_tasks (MongoDB: agent_hub)

| 欄位 | 類型 | 說明 |
|------|------|------|
| `taskId` | string | 唯一識別（如 `email-check-user-A`） |
| `taskType` | string | 任務類型，對應 handler（如 `email-check`） |
| `userId` | string | 用戶識別 |
| `status` | string | `active` / `paused` |
| `interval` | number | 最小執行間隔（ms），防止重複執行 |
| `config` | object | 傳給 handler 的設定（如 `{ account, chatId }`） |
| `activeHours` | object | `{ start: "09:00", end: "21:00" }` 活動時段 |
| `timezone` | string | 時區（預設 `Asia/Taipei`） |
| `lastRunAt` | Date | 上次執行時間 |
| `lastResult` | string | 上次執行結果摘要 |

### task_results (MongoDB: agent_hub)

每次執行會寫入一筆記錄：

| 欄位 | 說明 |
|------|------|
| `requestId` | 對應 taskId |
| `scriptId` | 對應 taskType |
| `status` | `success` / `error` |
| `summary` | 結果摘要 |
| `details` | 完整結果物件 |
| `executedAt` | 執行時間 |
| `durationMs` | 執行耗時 |

## Handler Registry

目前已註冊的任務類型：

| taskType | Handler | 說明 |
|----------|---------|------|
| `email-check` | `runNotify(chatId)` | 查詢 Gmail 未讀信件，有新信時透過 Telegram 通知 |

## 執行流程

1. LaunchAgent 每 10 分鐘觸發 `scheduler.js`
2. 連接 MongoDB，查詢所有 `status: 'active'` 的任務
3. 對每個任務依序檢查：
   - 是否在 `activeHours` 時段內？
   - 距離 `lastRunAt` 是否已超過 `interval`？
4. 條件符合 → 呼叫對應 handler 執行
5. 更新 `lastRunAt` 和 `lastResult`，寫入 `task_results`
6. 在啟動時自動檢查並清理重複的 cron job（dedup）

## 防重複機制

scheduler.js 啟動時會檢查 `cron/jobs.json`，如果有多個 enabled 的 `scheduler-heartbeat` job，自動保留最舊的並刪除其餘的。

---

## 擴充指南

### 新增用戶（同類型任務）

只需在 MongoDB 插入新文件，不需要改程式碼：

```javascript
db.scheduled_tasks.insertOne({
  taskId: 'email-check-user-B',
  taskType: 'email-check',
  userId: '<telegram-user-id>',
  status: 'active',
  interval: 300000,
  config: {
    account: 'userB@example.com',
    chatId: '<telegram-chat-id>'
  },
  activeHours: { start: '09:00', end: '21:00' },
  timezone: 'Asia/Taipei',
  lastRunAt: new Date(),
  createdAt: new Date()
})
```

前提：該信箱需要先完成 Google OAuth 授權（`gog` 工具）。

### 新增任務類型

需要兩步：

**Step 1：在 scheduler.js 註冊 handler**

```javascript
// scheduler.js — Handler Registry
const handlers = {
  'email-check': async (config) => { ... },

  // 新增：例如天氣通知
  'weather-notify': async (config) => {
    const { chatId, city } = config;
    // 實作查詢天氣 + 通知邏輯
    // 回傳 { notified: true/false, ... }
  }
};
```

**Step 2：在 MongoDB 插入任務定義**

```javascript
db.scheduled_tasks.insertOne({
  taskId: 'weather-user-A',
  taskType: 'weather-notify',
  userId: '8331678146',
  status: 'active',
  interval: 3600000,       // 最小間隔 1 小時
  config: {
    chatId: '8331678146',
    city: 'Taipei'
  },
  activeHours: { start: '07:00', end: '08:00' },
  timezone: 'Asia/Taipei',
  lastRunAt: new Date(),
  createdAt: new Date()
})
```

### 調整觸發頻率

修改 LaunchAgent 的 `StartInterval`：

```bash
# 編輯
vim ~/Library/LaunchAgents/com.openclaw.scheduler.plist
# <integer>600</integer>  ← 秒數

# 重載
launchctl unload ~/Library/LaunchAgents/com.openclaw.scheduler.plist
launchctl load ~/Library/LaunchAgents/com.openclaw.scheduler.plist
```

### 暫停/恢復任務

```javascript
// 暫停
db.scheduled_tasks.updateOne(
  { taskId: 'email-check-user-A' },
  { $set: { status: 'paused' } }
)

// 恢復
db.scheduled_tasks.updateOne(
  { taskId: 'email-check-user-A' },
  { $set: { status: 'active' } }
)
```

## Log 與監控

```bash
# 即時監控
tail -f ~/.openclaw/logs/scheduler.log

# 查看錯誤
tail -f ~/.openclaw/logs/scheduler.err.log

# 搜尋特定記錄
grep "dedup\|error\|pushed" ~/.openclaw/logs/scheduler.log

# 查詢 DB 執行歷史
mongosh --quiet --eval '
  db.task_results.find({requestId: /user-A/})
    .sort({executedAt: -1}).limit(10)
    .forEach(r => print(r.executedAt.toISOString(), r.status, r.summary))
' agent_hub
```

### Log 清理

crontab 已設定每天 2:00 AM 刪除 7 天以上的 `.log` 檔案。
