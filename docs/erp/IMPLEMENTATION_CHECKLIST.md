# 🎯 Clawdbot + ERP 整合 — 實施檢查清單

## ✅ 已完成的工作

### Skills 已創建

| Skill | 位置 | 狀態 | 說明 |
|-------|------|------|------|
| **system-router** | `~/clawd/skills/system-router/` | ✅ 完成 | 意圖偵測與路由 |
| **create-order** | `~/clawd/skills/create-order/` | ✅ 完成 | 訂單建立與 ERP 整合 |

### 檔案清單

```
~/clawd/
├── skills/
│   ├── system-router/
│   │   └── SKILL.md                          # 路由器規範文檔
│   │
│   └── create-order/
│       ├── SKILL.md                          # 訂單系統規範文檔
│       ├── CONFIG.md                         # 配置與故障排除
│       ├── index.js                          # Node.js 實現代碼
│       └── ERP-INTEGRATION-ANALYSIS.md       # ERP API 參考
│
├── ERP_SKILLS_SETUP.md                      # 快速開始指南 📖
├── IMPLEMENTATION_CHECKLIST.md               # 本文件 (你在這裡)
├── .env.example                              # 環境變數範例
│
└── [其他已存在檔案]
```

---

## 📋 實施步驟 (5 分鐘快速開始)

### Phase 1️⃣: 前置驗證 (5 分鐘)

#### ☐ 1.1 驗證 ERP 系統運行

```bash
# 檢查 ERP 健康狀態
curl http://localhost:3000/api/auth/health

# 預期回應：{ "status": "ok" }
```

**若失敗**：啟動 ERP
```bash
cd /Users/liaoyacheng/Desktop/OrderManagement-2025
npm start
# 等待看到：Server running on port 3000
```

#### ☐ 1.2 驗證 Bot 帳號存在

1. 登入 ERP 網頁 (`http://localhost:3000`)
2. 進入「設定 → 帳號管理」
3. 確認存在帳號：
   - Email: `bot@yourcompany.com`
   - Role: `bot` 或 `admin`
   - Status: 啟用

若帳號不存在，立即建立一個新帳號。

#### ☐ 1.3 測試 Bot 登入

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678",
    "email": "bot@yourcompany.com",
    "password": "your-bot-password"
  }'

# 預期回應（成功）：
# {
#   "success": true,
#   "data": { "token": "...", "sessionId": "...", "expiresIn": 86400 }
# }
```

**失敗原因排查**：
- ❌ 「Invalid credentials」→ 檢查 email/password
- ❌ 「tax ID not registered」→ 檢查統編

---

### Phase 2️⃣: Clawdbot 配置 (3 分鐘)

#### ☐ 2.1 設定環境變數 (選一種方式)

**方式 A：使用 clawd CLI** (推薦)

```bash
clawd config set ERP_API_URL "http://localhost:3000"
clawd config set ERP_TAX_ID "12345678"
clawd config set ERP_BOT_EMAIL "bot@yourcompany.com"
clawd config set ERP_BOT_PASSWORD "your-bot-password"
```

**方式 B：編輯配置檔案**

編輯 `~/.clawdbot/config.yaml`，添加：

```yaml
env:
  ERP_API_URL: "http://localhost:3000"
  ERP_TAX_ID: "12345678"
  ERP_BOT_EMAIL: "bot@yourcompany.com"
  ERP_BOT_PASSWORD: "your-bot-password"

skills:
  system-router:
    enabled: true
    priority: 100
  
  create-order:
    enabled: true
```

**方式 C：使用 .env 檔案**

```bash
# 複製環境變數範例
cp ~/clawd/.env.example ~/clawd/.env

# 編輯 .env 填入實際值
nano ~/clawd/.env
```

#### ☐ 2.2 重啟 Clawdbot

```bash
clawd gateway restart

# 等待看到：✅ Gateway restarted
```

#### ☐ 2.3 驗證 Skills 載入成功

```bash
clawd status

# 應看到：skills 區域中 system-router 和 create-order 都已啟用
```

---

### Phase 3️⃣: 功能測試 (5 分鐘)

#### ☐ 3.1 啟動通訊軟體

連接你已設定的通訊軟體（LINE、Telegram、Discord 等）。

#### ☐ 3.2 測試訂單建立

**測試 1：找不到客戶的情況**

傳送訊息：
```
/order 王小明 A產品x2
```

**預期回應**：
```
Customer "王小明" not found.

Options:
1️⃣ Create new customer "王小明"
2️⃣ Re-enter customer name
3️⃣ Cancel

Please reply with 1, 2, or 3
```

**操作**：回覆 `1` 建立新客戶

**預期結果**：顯示訂單確認訊息

**操作**：回覆 `confirm`

**預期結果**：
```
✅ Order created successfully!
📋 Order #: ORD26XXXXX
👤 Customer: 王小明
📦 Items: 2 unit(s)
⏱️ Status: Pending
```

**測試 2：已存在客戶**

先在 ERP 手動建立一個客戶，然後傳送：
```
/order [客戶名稱] [產品名稱]x[數量]
```

預期應直接顯示訂單確認，無需建立新客戶。

#### ☐ 3.3 驗證訂單在 ERP 建立成功

1. 登入 ERP 網頁 (`http://localhost:3000`)
2. 進入「訂單」或「銷售訂單」
3. 確認看到剛建立的訂單
4. 訂單號應與回覆訊息中的編號一致

---

### Phase 4️⃣: 進階驗證 (可選，10 分鐘)

#### ☐ 4.1 測試快速建單 (一次提供完整資訊)

傳送訊息：
```
/order 李先生 B產品x3 C產品x1 台北市中山區 明日上午配送
```

應直接顯示完整的訂單確認訊息，無需逐步引導。

#### ☐ 4.2 測試引導模式

傳送訊息：
```
/order
```

Clawdbot 應逐步詢問：
1. 「Please enter customer name」
2. 「What items do you want to order」
3. 「Do you need to specify address」

#### ☐ 4.3 查看詳細日誌

```bash
# 查看 Clawdbot 日誌
clawd logs -f | grep -E "(create-order|ERP|Order)"

# 應看到類似：
# [Order] Parsing message: /order ...
# [ERP] Authenticating as bot account...
# [ERP] API call: POST /api/orders
# [Order] Creating order in ERP: {...}
```

---

### Phase 5️⃣: 生產就緒檢查 (5 分鐘)

#### ☐ 5.1 安全性檢查

- [ ] Bot 密碼是否是強密碼？(12+ 字元，含大小寫、數字、符號)
- [ ] 是否使用環境變數而非硬編碼密碼？
- [ ] 是否限制了 ERP API 的訪問源？
- [ ] 是否啟用了 HTTPS 用於生產環境？

#### ☐ 5.2 性能監控

```bash
# 查看 API 成本
clawd status

# 每筆訂單預計消耗 ~2,800 tokens (~$0.05-0.10)
```

#### ☐ 5.3 備份配置

```bash
# 備份配置檔案
cp ~/.clawdbot/config.yaml ~/.clawdbot/config.yaml.backup
cp ~/.env ~/.env.backup
```

#### ☐ 5.4 文檔準備

分享以下文檔給團隊：
- `~/clawd/ERP_SKILLS_SETUP.md` — 快速開始指南
- `~/clawd/skills/create-order/CONFIG.md` — 配置與故障排除

---

## 🆘 快速故障排除

### 「ERP 連線失敗」

```bash
# 1. 檢查 ERP 是否運行
curl http://localhost:3000/api/auth/health

# 2. 若回應 Connection refused，啟動 ERP
cd /Users/liaoyacheng/Desktop/OrderManagement-2025
npm start
```

### 「ERP 登入失敗」

```bash
# 1. 檢查帳號和密碼
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678",
    "email": "bot@yourcompany.com",
    "password": "check-this-password"
  }'

# 2. 若失敗，確認：
#    - 統編是否正確
#    - 帳號是否在 ERP 系統中建立
#    - 密碼是否正確
```

### 「Skills 未加載」

```bash
# 1. 檢查 skills 目錄是否正確
ls -la ~/clawd/skills/

# 2. 檢查 Clawdbot 配置
clawd status

# 3. 重啟 Clawdbot
clawd gateway restart
```

更詳細的故障排除：`~/clawd/skills/create-order/CONFIG.md`

---

## 📖 相關文檔

| 文檔 | 用途 |
|------|------|
| **ERP_SKILLS_SETUP.md** | 快速開始、使用範例、進階配置 |
| **system-router/SKILL.md** | 了解路由機制 |
| **create-order/SKILL.md** | 了解訂單系統工作流程 |
| **create-order/CONFIG.md** | 配置、性能最佳化、進階設定 |
| **.env.example** | 環境變數參考 |

---

## ✨ 成功標誌

完成整個實施後，你應該能夠：

✅ 在通訊軟體傳送 `/order [客戶名稱] [品項]`  
✅ Clawdbot 自動解析並詢問確認  
✅ 回覆確認後，訂單立即在 ERP 系統建立  
✅ 回傳訂單編號給你確認  

如果以上都能順利進行，**恭喜！整合成功！** 🎉

---

## 🚀 下一步

1. **充分測試**：在實際環境中測試各種訂單場景
2. **監控運行**：定期檢查 Clawdbot 日誌和 ERP 系統狀況
3. **自定義優化**：根據需要調整訊息格式、確認流程等
4. **團隊培訓**：教導團隊成員如何使用新的訂單系統
5. **反饋收集**：收集用戶反饋並持續改進

---

**估計完整實施時間：15-20 分鐘**

**最後更新：2026-01-29**

祝你的 ERP 整合實施順利！如有問題，參考對應的故障排除文檔或 Clawdbot 社區：https://discord.com/invite/clawd
