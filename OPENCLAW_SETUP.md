# OpenClaw 建置文檔

## 📋 系統資訊

**建置日期：** 2026-02-06  
**OpenClaw 版本：** 2026.2.3-1  
**Node 版本：** v24.4.0  
**系統：** macOS 15.5 (arm64)

---

## 🔧 安裝位置

```
OpenClaw：    /opt/homebrew/lib/node_modules/openclaw
工作目錄：    /Users/liaoyacheng/clawd
配置目錄：    ~/.openclaw/
Gateway 端口：18789
Canvas 端口： 18790
```

---

## 🤖 Agent 配置

### 已配置的 Agents

| Agent ID | 用途 | 工作目錄 | 狀態 |
|----------|------|----------|------|
| `dev` | 開發助手（預設） | `/Users/liaoyacheng/clawd` | ✅ 活躍 |
| `assistant` | LINE 聊天助手 | `/Users/liaoyacheng/clawd` | ✅ 活躍 |
| `main` | 主要助手 | `/Users/liaoyacheng/clawd` | ✅ 活躍 |

### Agent 綁定

- **LINE channel** → `assistant` agent

---

## 🎯 模型配置

### 當前使用模型

```json
{
  "primary": "anthropic/claude-sonnet-4-5",
  "fallbacks": ["anthropic/claude-opus-4-5"]
}
```

### 模型別名

- `sonnet` → `anthropic/claude-sonnet-4-5`
- `opus` → `anthropic/claude-opus-4-5`

### 可用的最新模型

- ✅ `anthropic/claude-sonnet-4-5` (當前)
- 🆕 `anthropic/claude-3-7-sonnet-latest` (2025-02-19)
- ⚡ `anthropic/claude-haiku-4-5` (快速版)
- 🧠 `google/gemini-2.5-pro` (1024k ctx)
- 💻 `openai/gpt-5.2-codex` (391k ctx)

---

## 📡 通道配置

### LINE

```yaml
狀態: ✅ 已啟用
DM 政策: pairing
白名單:
  - U091884e59e8027a8007b351c13f1b557
  - U86b3337e752a12d940758f9f35117e3c
Webhook: /line/webhook
媒體下載: ~/clawd-line/downloads/
最大檔案: 20MB
```

### Webchat

```yaml
狀態: ✅ 預設啟用
功能: 基本文字交互
```

---

## 🛠️ Skills 清單

### ERP 整合相關

| Skill | 功能 | 狀態 |
|-------|------|------|
| `create-order` | 建立 ERP 訂單（採購/銷售） | ✅ 運作中 |
| `generate-pdf` | 生成訂單 PDF 並轉圖片 | ✅ 運作中 |
| `print-label` | 精臣標籤機列印 | ✅ 運作中 |
| `pdf-to-order` | PDF 轉訂單 | ✅ 運作中 |
| `pdf-extract` | PDF 文字提取 | ✅ 運作中 |

### 系統相關

| Skill | 功能 | 狀態 |
|-------|------|------|
| `weather` | 天氣查詢 | ✅ 可用 |
| `coding-agent` | 背景運行編碼代理 | ✅ 可用 |
| `skill-creator` | 建立/更新 Skills | ✅ 可用 |
| `clawhub` | ClawHub CLI 管理 | ✅ 可用 |

---

## 🔐 環境變數配置

### ERP 系統配置
位置：`~/clawd/skills/create-order/.env`

```bash
ERP_API_URL=http://localhost:3000
ERP_TAX_ID=00091103
ERP_BOT_EMAIL=info@sui-yao.com
ERP_BOT_PASSWORD=******
```

---

## 🚀 啟動與管理

### Gateway 管理

```bash
# 檢查狀態
openclaw status

# 重啟 Gateway
openclaw gateway restart

# 查看日誌
openclaw logs --follow

# 檢查模型
openclaw models list
```

### LaunchAgent 狀態

```bash
Gateway service: ✅ 已安裝並運行 (PID 89930)
Node service:    ❌ 未安裝
```

---

## 📊 會話管理

### 當前活躍會話

```
- agent:dev:main (webchat)
- agent:assistant:line:dm:* (LINE 私訊)
- agent:assistant:line:group:* (LINE 群組)
- agent:main:* (主助手)
```

### 上下文管理

```yaml
模式: cache-ttl
TTL: 1h
壓縮: safeguard
最大並發: 4
子代理並發: 8
```

---

## 🔄 Heartbeat 配置

```yaml
dev: 1h
assistant: disabled
main: disabled
```

---

## 📝 記憶系統

### 記憶文件結構

```
~/clawd/
├── MEMORY.md                    # 長期記憶（主會話專用）
├── memory/
│   ├── YYYY-MM-DD.md           # 每日記錄
│   ├── heartbeat-state.json    # Heartbeat 狀態追蹤
│   └── line-usage-check.md     # LINE 使用檢查
```

### 記憶策略

- **主會話**：讀取 MEMORY.md + 最近 2 天的每日記錄
- **共享會話**（Discord/群組）：僅讀取每日記錄
- **寫入規則**：重要決策、學習心得 → MEMORY.md；日常記錄 → memory/YYYY-MM-DD.md

---

## 🔧 故障排除

### 常見問題

**Q: Gateway 無法啟動**
```bash
# 檢查端口是否被佔用
lsof -i :18789

# 重啟 Gateway
openclaw gateway restart
```

**Q: LINE 收不到訊息**
```bash
# 檢查 webhook 狀態
openclaw status --deep

# 查看日誌
openclaw logs --follow
```

**Q: 模型無法使用**
```bash
# 檢查認證
openclaw models auth

# 重新掃描模型
openclaw models list --all
```

---

## 📚 相關文檔

- OpenClaw 官方文檔：https://docs.openclaw.ai
- GitHub：https://github.com/openclaw/openclaw
- Discord 社群：https://discord.com/invite/clawd
- ClawHub：https://clawhub.com

---

## 🔒 安全注意事項

1. **敏感資訊**：
   - ERP 密碼已存放在 `.env` 文件
   - LINE token 存放在 `~/.openclaw/openclaw.json`
   - 這些文件不應上傳到公開倉庫

2. **配置備份**：
   - ❌ 不要創建 `.bak` 備份文件（會導致配置衝突）
   - ✅ 使用 git 進行版本控制

3. **Gateway Token**：
   - 當前 token：`26963b1b46de0966de24292f462483070fafdd9115085032`
   - 僅限本地回環（loopback）訪問

---

## 📅 維護日誌

### 2026-02-06
- ✅ OpenClaw 更新至 2026.2.3-1
- ✅ 確認所有 skills 正常運作
- ✅ 檢查模型列表（無 Claude Sonnet 5.0）
- ✅ 創建 openclaw-setup 分支

### 2026-02-03
- ✅ 完成 ERP 助理整合
- ✅ 創建 erp助理 分支
- ✅ 清理舊配置備份文件

### 2026-02-02
- ✅ 移除 Clawdbot LaunchAgent
- ✅ 統一使用 OpenClaw
- ✅ 清理多餘配置

---

*最後更新：2026-02-06 14:23*
