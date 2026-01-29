# Clawdbot + ERP 整合系統 — 快速開始指南

## 📋 已創建的 Skills

我為你創建了 2 個核心 skills，放在 `~/clawd/skills/` 目錄中：

### 1. **system-router** — 意圖路由器
- **位置**：`~/clawd/skills/system-router/`
- **功能**：偵測用戶關鍵詞（「建立訂單」、「查詢訂單」等），自動路由到對應 skill
- **關鍵詞**：
  - 建立訂單、生成訂單、新訂單、下訂單、建單
  - 查詢訂單、查訂單、訂單狀態、看訂單
  - 訂單（泛指訂單相關）

### 2. **create-order** — 訂單建立系統
- **位置**：`~/clawd/skills/create-order/`
- **功能**：完整的互動式訂單建立流程
  - 自然語言解析訂單資訊
  - 查詢 ERP 客戶資料庫
  - 互動式確認
  - 與 ERP API 整合建立訂單

## 🚀 快速開始（5 步驟）

### Step 1: 驗證 ERP 系統正在運行

```bash
# 檢查 ERP 服務器是否在線
curl http://localhost:3000/api/auth/health

# 預期回應：{ "status": "ok" }
```

如果失敗，確保 ERP 系統已啟動：

```bash
cd /Users/liaoyacheng/Desktop/OrderManagement-2025
npm start
# 應看到：Server running on port 3000
```

### Step 2: 設定 Clawdbot 環境變數

選擇以下任一方式設定：

#### 方式 A：使用 clawd CLI（推薦）

```bash
clawd config set ERP_API_URL "http://localhost:3000"
clawd config set ERP_TAX_ID "12345678"          # 改成你的統編
clawd config set ERP_BOT_EMAIL "bot@yourcompany.com"
clawd config set ERP_BOT_PASSWORD "your-secure-password"
```

#### 方式 B：編輯 ~/.clawdbot/config.yaml

添加以下內容：

```yaml
skills:
  system-router:
    enabled: true
    priority: 100
  
  create-order:
    enabled: true
    erp:
      apiUrl: "http://localhost:3000"
      taxId: "12345678"
      botEmail: "bot@yourcompany.com"
      botPassword: "your-secure-password"
```

### Step 3: 重啟 Clawdbot

```bash
clawd gateway restart
```

等待重啟完成（約 10-20 秒）。

### Step 4: 測試連線

在通訊軟體（LINE、Telegram、Discord）傳送測試訊息：

```
測試訊息：
/order 王小明 A產品x1
```

**期望行為：**
1. Clawdbot 解析訊息
2. 詢問「找不到客戶『王小明』，要建立新客戶嗎？」
3. 你回覆「1」建立新客戶
4. Clawdbot 顯示訂單確認訊息
5. 你回覆「確認」
6. ✅ 訂單建立成功（回傳訂單編號）

### Step 5: 驗證訂單已在 ERP 建立

登入 ERP 網頁，查看訂單列表確認訂單已建立。

---

## 📚 詳細文檔

### 核心配置

- **System Router 說明**：`~/clawd/skills/system-router/SKILL.md`
- **Create Order 說明**：`~/clawd/skills/create-order/SKILL.md`
- **Create Order 配置指南**：`~/clawd/skills/create-order/CONFIG.md`
- **ERP API 文檔**：`~/Desktop/VS/line-clawdbot-bridge/clawdbot-erp-integration拷貝.md`

### 文件結構

```
~/clawd/
├── skills/
│   ├── system-router/
│   │   └── SKILL.md              # 路由器說明文檔
│   │
│   └── create-order/
│       ├── SKILL.md              # 訂單系統說明文檔
│       ├── CONFIG.md             # 配置與故障排除
│       └── index.js              # 實現代碼（Node.js）
│
└── ERP_SKILLS_SETUP.md          # 這個文件
```

---

## 💡 使用範例

### 範例 1: 快速建單

```
用戶：
/order 王小明 A產品x2 B產品x1 台北市信義區 下午配送

Clawdbot：
✅ Order Summary
━━━━━━━━━━━━━━━━
👤 Customer: 王小明 (CUS0001)
📦 Items: A產品 × 2, B產品 × 1
📍 Address: 台北市信義區
💳 Payment: Cash
📝 Notes: 下午配送
━━━━━━━━━━━━━━━━
Reply "confirm" to create order, or "cancel"

用戶：
confirm

Clawdbot：
✅ Order created successfully!
━━━━━━━━━━━━━━━━
📋 Order #: ORD26ABCXYZ
👤 Customer: 王小明
📦 Items: 3 unit(s)
⏱️ Status: Pending
━━━━━━━━━━━━━━━━
```

### 範例 2: 引導模式

```
用戶：
/order

Clawdbot：
Please enter customer name:

用戶：
王小明

Clawdbot：
Found customer: 王小明 (CUS0001)
What items do you want to order?
(Format: item name x quantity, comma-separated)
Example: A product x2, B product x1

用戶：
A產品x2, B產品x1

...（繼續引導）
```

### 範例 3: 新客戶建立

```
用戶：
/order 李先生 C產品x1

Clawdbot：
Customer "李先生" not found.

Options:
1️⃣ Create new customer "李先生"
2️⃣ Re-enter customer name
3️⃣ Cancel

Please reply with 1, 2, or 3

用戶：
1

Clawdbot：
New customer created: 李先生 (CUS0016)
Now continuing order creation...

[組合訂單確認訊息]
```

---

## ⚙️ 配置檢查清單

- [ ] ERP 系統正在運行（`http://localhost:3000` 可訪問）
- [ ] 已建立 Bot 帳號在 ERP 中（email 和密碼正確）
- [ ] 設定了 `ERP_API_URL` 環境變數
- [ ] 設定了 `ERP_TAX_ID` 環境變數
- [ ] 設定了 `ERP_BOT_EMAIL` 環境變數
- [ ] 設定了 `ERP_BOT_PASSWORD` 環境變數
- [ ] Clawdbot 已重啟（`clawd gateway restart`）
- [ ] 已在通訊軟體測試過 `/order` 命令
- [ ] 測試訂單已在 ERP 系統中建立成功

---

## 🔧 故障排除

### 問題：「ERP 登入失敗」

```bash
# 測試 Bot 帳號登入
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678",
    "email": "bot@yourcompany.com",
    "password": "your-password"
  }'

# 若失敗，檢查：
# 1. 統編是否正確
# 2. Bot 帳號是否在 ERP 中建立
# 3. 密碼是否正確
```

### 問題：「連線 ERP 失敗」

```bash
# 檢查 ERP 是否運行
curl http://localhost:3000/api/auth/health

# 若失敗，啟動 ERP：
cd /Users/liaoyacheng/Desktop/OrderManagement-2025
npm start
```

### 問題：訂單建立後未出現在 ERP

1. 檢查 Clawdbot 日誌：`clawd logs | grep "Order"`
2. 登入 ERP 網頁，刷新訂單列表
3. 檢查 ERP 系統日誌查看 API 回應

更詳細的故障排除請參考：`~/clawd/skills/create-order/CONFIG.md`

---

## 📞 支援資源

| 主題 | 位置 |
|------|------|
| **Clawdbot 官方文檔** | https://docs.clawd.bot |
| **ERP API 詳細說明** | `~/Desktop/VS/line-clawdbot-bridge/clawdbot-erp-integration拷貝.md` |
| **System Router 說明** | `~/clawd/skills/system-router/SKILL.md` |
| **Create Order 說明** | `~/clawd/skills/create-order/SKILL.md` |
| **配置和故障排除** | `~/clawd/skills/create-order/CONFIG.md` |
| **Clawdbot 社區** | https://discord.com/invite/clawd |

---

## 🎯 下一步

1. ✅ **快速開始**：按上面 5 步驟完成初始設定
2. 📚 **閱讀文檔**：深入了解 skills 的運作原理
3. 🧪 **充分測試**：在實際環境中測試各種訂單場景
4. ⚙️ **自定義**：根據需要調整訊息格式、客戶搜尋邏輯等
5. 📈 **監控**：定期檢查 Clawdbot 日誌和 ERP 系統健康狀況

---

## 📝 更新日誌

**2026-01-29 v1.0**
- ✅ 建立 system-router skill（意圖偵測和路由）
- ✅ 建立 create-order skill（完整訂單建立工作流）
- ✅ 與 ERP REST API 完全整合
- ✅ 支援互動式客戶驗證和新客戶建立
- ✅ 完整配置文檔和故障排除指南

---

*此整合方案包含所有必需的 skills 和配置指南。確認完成上述 5 個步驟後，即可開始使用。*

**最後更新：2026-01-29**
