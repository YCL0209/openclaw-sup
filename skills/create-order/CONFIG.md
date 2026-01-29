# Create Order Skill - 配置指南

## 安裝步驟

### 1. 前置要求

- Clawdbot 已安裝並運行
- ERP 系統正在運行（預設 `http://localhost:3000`）
- 已在 ERP 中建立 Bot 專用帳號

### 2. 設定環境變數

在你的 Clawdbot 配置中，設定以下環境變數：

```bash
# ERP API 連線
export ERP_API_URL="http://localhost:3000"
export ERP_TAX_ID="12345678"          # 你的統一編號
export ERP_BOT_EMAIL="bot@yourcompany.com"
export ERP_BOT_PASSWORD="secure-password-here"

# Token 管理（可選，使用預設值）
export ERP_TOKEN_REFRESH_INTERVAL="3600"      # 1 小時
export ERP_TOKEN_EXPIRY_BUFFER="300"          # 提前 5 分鐘刷新
```

#### 設定方式

**方式 1：Clawdbot CLI**

```bash
clawd config set ERP_API_URL "http://localhost:3000"
clawd config set ERP_TAX_ID "12345678"
clawd config set ERP_BOT_EMAIL "bot@yourcompany.com"
clawd config set ERP_BOT_PASSWORD "secure-password-here"
```

**方式 2：編輯配置檔案**

編輯 `~/.clawdbot/config.json`（或 `config.yml`）：

```json
{
  "skills": {
    "create-order": {
      "enabled": true,
      "erp": {
        "apiUrl": "http://localhost:3000",
        "taxId": "12345678",
        "botEmail": "bot@yourcompany.com",
        "botPassword": "secure-password-here"
      }
    }
  }
}
```

**方式 3：環境變數檔案**

建立 `.env` 文件在 Clawdbot 工作目錄：

```
ERP_API_URL=http://localhost:3000
ERP_TAX_ID=12345678
ERP_BOT_EMAIL=bot@yourcompany.com
ERP_BOT_PASSWORD=secure-password-here
```

### 3. 驗證 ERP 連線

測試 Bot 能否連接 ERP：

```bash
# 健康檢查（不需認證）
curl http://localhost:3000/api/auth/health

# 應回應：
# { "status": "ok" }
```

### 4. 測試登入

驗證 Bot 帳號能否登入：

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678",
    "email": "bot@yourcompany.com",
    "password": "secure-password-here"
  }'

# 應回應（成功）：
# {
#   "success": true,
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIs...",
#     "sessionId": "sess_abc123",
#     "expiresIn": 86400
#   }
# }
```

如果失敗，檢查：
- 統編（taxId）是否正確
- Bot 帳號是否在 ERP 中建立
- 密碼是否正確

### 5. 重啟 Clawdbot

配置完成後，重啟 Clawdbot 以加載新設定：

```bash
clawd gateway restart
```

## 使用方式

### 快速建單

在通訊軟體（LINE、Telegram、Discord 等）傳送訊息：

```
/order 王小明 A產品x2 B產品x1
```

Clawdbot 會：
1. 解析訂單資訊
2. 從 ERP 查詢客戶
3. 顯示確認訊息
4. 等待你確認
5. 建立訂單

### 引導模式

傳送 `/order` 後接客戶名稱：

```
/order 王小明
```

Clawdbot 會逐步引導：
- 「請問要訂什麼品項？」
- 「需要指定送貨地址嗎？」
- 「確認建立訂單？」

### 新客戶建立

如果找不到客戶，Clawdbot 會詢問是否建立新客戶。建立成功後，會自動繼續訂單流程。

## 日誌查看

### 查看 Clawdbot 日誌

```bash
# 即時日誌
clawd logs -f

# 查詢特定關鍵詞
clawd logs | grep "create-order"
clawd logs | grep "ERP"
```

### 查看 ERP 日誌

如果 ERP 系統有日誌，查看：

```bash
# 假設 ERP 在 /Users/liaoyacheng/Desktop/OrderManagement-2025
cd /Users/liaoyacheng/Desktop/OrderManagement-2025
tail -f logs/server.log
```

## 故障排除

### 問題 1: 「ERP 登入失敗」

**原因：** 帳號或密碼錯誤

**解決：**
1. 驗證 `ERP_BOT_EMAIL` 和 `ERP_BOT_PASSWORD` 是否正確
2. 確認 Bot 帳號在 ERP 系統中存在
3. 在 ERP 網頁端檢查帳號是否啟用

```bash
# 測試登入
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678",
    "email": "bot@yourcompany.com",
    "password": "your-password"
  }'
```

### 問題 2: 「連線 ERP 失敗」

**原因：** ERP 伺服器未運行或 API URL 不正確

**解決：**
1. 確認 ERP 伺服器正在運行

```bash
# 進入 ERP 目錄
cd /Users/liaoyacheng/Desktop/OrderManagement-2025

# 啟動 ERP
npm start  # 或 node server.js

# 應看到輸出：Server running on port 3000
```

2. 檢查 `ERP_API_URL` 是否正確

```bash
# 健康檢查
curl http://localhost:3000/api/auth/health
```

3. 確認防火牆或網絡限制

### 問題 3: 「找不到客戶」

**原因：** 客戶名稱與 ERP 系統中的不完全相符

**解決：**
1. 在 ERP 網頁確認客戶名稱的完整拼法
2. 使用完整名稱再試一次
3. 選擇「建立新客戶」選項

### 問題 4: 「品項解析失敗」

**原因：** 訊息格式不符期望格式

**解決：**
1. 檢查品項數量是否正確格式

```
✅ 正確：A產品x2, B產品x1
✅ 正確：A產品 2 個，B產品 1 個
✅ 正確：2 個 A 產品，1 個 B 產品
❌ 錯誤：A產品，B產品（缺少數量）
❌ 錯誤：A 產品 (不清楚數量)
```

2. 一次只提供必需資訊（客戶、品項），其他可在確認時補充

### 問題 5: Token 過期錯誤

**原因：** JWT Token 已過期（很少發生，系統自動處理）

**解決：**
系統會自動刷新或重新登入。如果持續出錯：

1. 檢查 Bot 帳號是否仍有效
2. 檢查 ERP 系統日誌
3. 重啟 Clawdbot

## 性能最佳化

### 1. 批量建單

如果需要一次建立多個訂單，可以分別傳送多次訊息，Clawdbot 會逐一處理。

### 2. 減少 API 呼叫

系統已自動優化：
- 客戶列表已快取（減少重複查詢）
- Token 自動管理（避免不必要的登入）

### 3. 監控成本

每筆訂單消耗 ~2,800 tokens ≈ $0.05-0.10  
監控用量：

```bash
clawd status  # 查看當天使用統計
```

## 進階設定

### 自定義客戶搜尋

編輯 `index.js` 的 `findCustomer()` 函數以改進客戶匹配邏輯：

```javascript
// 例如：支持客戶代碼搜尋
function findCustomer(searchName, customers) {
  // ... 現有邏輯 ...
  
  // 新增：按客戶代碼搜尋
  const match = customers.find(c => c.customerCode === searchName);
  if (match) return match;
  
  return null;
}
```

### 自動新客戶建立

若要完全自動（無需詢問），修改 `handleCustomerChoice()` 函數。

### 自定義訂單確認訊息

編輯 `buildOrderConfirmation()` 以改變確認訊息格式。

## 安全性檢查清單

- [ ] Bot 密碼使用強密碼（至少 12 字元，含大小寫、數字、符號）
- [ ] 不要在配置檔案中硬編碼密碼，使用環境變數
- [ ] 定期更換 Bot 密碼
- [ ] 監控 ERP 系統日誌，檢查異常登入
- [ ] 限制 Clawdbot 的 IP 範圍（如果可能）
- [ ] 啟用 HTTPS 用於生產環境

## 備份和恢復

### 備份訂單資料

ERP 系統已備份所有訂單資料。定期備份 MongoDB 資料庫：

```bash
# 備份命令（具體方式取決於 ERP 配置）
# 建議在 ERP 文檔中查詢正確的備份程序
```

### 恢復

若訂單未正確建立：
1. 檢查 Clawdbot 日誌確認是否真的呼叫了 API
2. 檢查 ERP 系統是否有訂單記錄
3. 若無記錄，重新輸入訂單

## 支持聯繫

遇到問題？

1. 檢查此故障排除指南
2. 查看日誌找線索
3. 確認 ERP API 文檔
4. 聯繫 Clawdbot 社區：https://discord.com/invite/clawd

---

*最後更新：2026-01-29*
