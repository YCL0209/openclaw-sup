# 💾 配置管理重要事項

## Clawdbot 配置策略

### ❌ 錯誤做法（已修正）
- **不要**創建多個配置文件副本（.bak, .bak.1 等）
- Clawdbot 可能同時讀多個配置來源，導致混亂
- 2026-01-29 曾因備份文件導致配置衝突

### ✅ 正確做法
**只維護一份活動配置文件**

| 配置 | 位置 | 用途 |
|------|------|------|
| **全域配置** | `~/.clawdbot/clawdbot.json` | Clawdbot 本體設定（LINE、Gateway、agents 等） |
| **Skill 配置** | `~/clawd/skills/<skill-name>/.env` | 單個 skill 的環境變數 |

### 📋 當前的配置位置

1. **~/.clawdbot/clawdbot.json** （單一來源）
   - LINE Channel 配置
   - Gateway 設定
   - Agent 預設模型
   - 不包含 ERP 登入資訊

2. **~/clawd/skills/create-order/.env**
   - ERP_API_URL
   - ERP_TAX_ID
   - ERP_BOT_EMAIL
   - ERP_BOT_PASSWORD

3. **~/clawd/skills/system-router/.env**
   - 路由器配置（目前為空）

### 🔧 修改配置的規則

- **修改 Clawdbot 全域設定** → 編輯 `~/.clawdbot/clawdbot.json`
- **修改 ERP 登入資訊** → 編輯 `~/clawd/skills/create-order/.env`
- **修改完後** → 立即運行 `clawd gateway restart`
- **不要**創建 .bak 備份文件

### 📝 配置修改歷史

**2026-01-29**
- 問題：多個 .bak 文件導致配置混亂
- 原因：我不了解 Clawdbot 的配置管理機制
- 解決：刪除所有 clawdbot.json.bak* 文件，保留唯一配置來源
- 狀態：✅ 已修復

---

## 其他重要配置資訊

### Clawdbot 基本資訊
- **工作目錄**：`~/clawd/`
- **配置目錄**：`~/.clawdbot/`
- **Skills 目錄**：`~/clawd/skills/`
- **Gateway 埠號**：18789

### ERP 系統資訊
- **API 位址**：http://localhost:3000
- **統編**：00091103
- **Bot Email**：info@sui-yao.com
- **Bot 密碼**：000000（已儲存在 .env）

### 📋 ERP 訂單編號規則（重要！）
**只有兩種訂單類型：**
- `PUR-YYMMDD-XXXX` - 採購訂單
- `ORD-YYMMDD-XXXX` - 銷售訂單

**不要使用：**
- ❌ `SAL-` 開頭（不存在）
- ❌ `QUO-` 開頭（不存在）

*更新時間：2026-02-03*

### LINE 配置
- **enabled**：true
- **Channel**：已連接
- **接收訊息**：✅ 工作中

### Skills 狀態
- **system-router**：✅ 創建完成
- **create-order**：✅ 創建完成（待測試）

---

## 🎯 下一步

1. 重啟 Clawdbot：`clawd gateway restart`
2. 測試 `/order` 命令
3. 驗證 ERP 訂單建立功能

---

## 🧹 系統清理記錄

**2026-02-02**
- 移除舊的 Clawdbot LaunchAgent (`com.clawdbot.gateway.plist`)
- 解除安裝 clawdbot npm 套件（釋放 ~481MB）
- 清理多餘配置備份（只保留最新 2 個 .bak 文件）
- **當前唯一運行**：OpenClaw (ai.openclaw.gateway)
- **配置文件位置**：`~/.openclaw/openclaw.json`

---

*最後更新：2026-02-02 11:41*
