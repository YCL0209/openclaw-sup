# 💾 設定管理重要事項

## Clawdbot 設定策略

### ❌ 錯誤做法（已修正）
- **不要**建立多個設定檔副本（.bak, .bak.1 等）
- Clawdbot 可能同時讀取多個設定來源，導致混亂
- 2026-01-29 曾因備份檔案導致設定衝突

### ✅ 正確做法
**只維護一份有效設定檔**

| 設定 | 位置 | 用途 |
|------|------|------|
| **全域設定** | `~/.clawdbot/clawdbot.json` | Clawdbot 本體設定（LINE、Gateway、agents 等） |
| **Skill 設定** | `~/clawd/skills/<skill-name>/.env` | 單一 skill 的環境變數 |

### 📋 目前的設定位置

1. **~/.clawdbot/clawdbot.json** （單一來源）
   - LINE Channel 設定
   - Gateway 設定
   - Agent 預設模型
   - 不包含 ERP 登入資訊

2. **~/clawd/skills/create-order/.env**
   - ERP_API_URL
   - ERP_TAX_ID
   - ERP_BOT_EMAIL
   - ERP_BOT_PASSWORD

3. **~/clawd/skills/system-router/.env**
   - 路由器設定（目前為空）

### 🔧 修改設定的規則

- **修改 Clawdbot 全域設定** → 編輯 `~/.clawdbot/clawdbot.json`
- **修改 ERP 登入資訊** → 編輯 `~/clawd/skills/create-order/.env`
- **修改完後** → 立即執行 `clawd gateway restart`
- **不要**建立 .bak 備份檔案

### 📝 設定修改歷史

**2026-01-29**
- 問題：多個 .bak 檔案導致設定混亂
- 原因：不了解 Clawdbot 的設定管理機制
- 解決：刪除所有 clawdbot.json.bak* 檔案，保留唯一設定來源
- 狀態：✅ 已修復

---

## 其他重要設定資訊

### Clawdbot 基本資訊
- **工作目錄**：`~/clawd/`
- **設定目錄**：`~/.clawdbot/`
- **Skills 目錄**：`~/clawd/skills/`
- **Gateway 連接埠**：18789

### ERP 系統資訊
- **API 位址**：http://localhost:3000
- **統編**：00091103
- **Bot Email**：info@sui-yao.com
- **Bot 密碼**：000000（已儲存在 .env）

### LINE 設定
- **enabled**：true
- **Channel**：已連線
- **接收訊息**：✅ 運作中

### Skills 狀態
- **system-router**：✅ 建立完成
- **create-order**：✅ 建立完成（待測試）

---

## 🎯 下一步

1. 重啟 Clawdbot：`clawd gateway restart`
2. 測試 `/order` 指令
3. 驗證 ERP 訂單建立功能

---

## 🧹 系統清理紀錄

**2026-02-02**
- 移除舊的 Clawdbot LaunchAgent (`com.clawdbot.gateway.plist`)
- 解除安裝 clawdbot npm 套件（釋放 ~481MB）
- 清理多餘設定備份（只保留最新 2 個 .bak 檔案）
- **目前唯一運行**：OpenClaw (ai.openclaw.gateway)
- **設定檔位置**：`~/.openclaw/openclaw.json`

---

*最後更新：2026-02-02 11:41*
