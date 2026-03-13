---
name: check-email
description: 檢查 Gmail 未讀信件並通知，支援排程去重（HEARTBEAT_OK 機制）和手動查詢兩種模式。
user-invocable: true
---

# Check Email - 信件檢查

## AI 行為指引

### 何時啟動此 Skill
- 用戶主動要求查信、檢查信箱
- 關鍵詞：查信、檢查信件、有沒有新信、check email、查看信箱
- Cron 排程觸發時（message 中包含 exec 指令）

### 何時不要啟動
- 用戶要寫信、回信、轉寄信件（那是 Gmail 操作，不是查信）
- 用戶問信件相關技術問題

## 兩種執行模式

### 模式 A：排程模式（Cron 觸發）

Cron 的 message 會指示你用 `exec` tool 執行：
```bash
cd /Users/liaoyacheng/.openclaw/workspace && node skills/check-email/index.js --scheduled
```

**index.js 會自行完成所有邏輯**（查信、去重、格式化），你只需要處理輸出：

| 輸出內容 | AI 應做的事 |
|----------|-------------|
| `HEARTBEAT_OK` | **不回覆任何訊息**，靜默結束 |
| 信件摘要表格 | **原樣轉發**給用戶 |

**重要：不要自己再跑 `gog gmail search`，index.js 已經做完了。**

### 模式 B：手動模式（用戶觸發）

用戶主動說「查信」時：
1. 用 `exec` 執行 `cd /Users/liaoyacheng/.openclaw/workspace && node skills/check-email/index.js`（不加 `--scheduled`）
2. 將輸出回覆給用戶
3. 手動模式不做去重，會列出所有未讀信

## 快速記憶

- 排程用 `--scheduled` 旗標，手動不加
- `HEARTBEAT_OK` = 沒新信，不要回覆
- 去重狀態存在 `data/notified-emails.json`
- 不需要自己跑 gog，index.js 會處理
