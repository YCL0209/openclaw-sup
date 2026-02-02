---
name: create-order
description: 當用戶說「建立訂單」、「下單」、「訂購」、「我要訂」、「建單」、「創建訂單」等關鍵詞時，啟動 ERP 訂單建立流程。互動式訂單工具，通過自然語言解析客戶資訊、品項、數量，自動連接公司 ERP 系統的 REST API 建立訂單。支持查詢客戶、確認訂單詳情、處理未知客戶等完整流程。
---

# Create Order - ERP 訂單建立系統

## 概述

`create-order` 是一個完整的訂單建立工作流 skill，能夠：

1. **自然語言解析** — 從用戶訊息中提取訂單資訊（客戶、品項、數量、地址等）
2. **客戶驗證** — 查詢 ERP 客戶資料庫，驗證客戶是否存在
3. **互動確認** — 若客戶不存在，詢問是否建立新客戶
4. **訂單確認** — 列出完整訂單詳情供用戶最終確認
5. **API 調用** — 與本地 ERP 系統 REST API 溝通建立訂單
6. **回饋結果** — 回傳訂單編號、狀態等成功或失敗資訊

## 工作流程

```
用戶輸入訊息
    ↓
[步驟 1] 解析訂單資訊
    ↓ 提取：客戶、品項、數量、地址、備註
    ↓
[步驟 2] ERP 查詢客戶
    ↓
    ├─ 找到客戶 → [步驟 3A]
    └─ 未找到 → [步驟 2A] 詢問是否建立新客戶
        ├─ 建立新客戶 → [步驟 2B]
        └─ 取消 / 重新輸入 → 返回
    ↓
[步驟 3] 組合訂單資料 + 顯示確認訊息
    ↓
[步驟 4] 等待用戶確認
    ↓
[步驟 5] 呼叫 ERP API 建立訂單
    ↓
[步驟 6] 回傳結果（訂單編號 & 狀態）
```

## 使用範例

### 快速模式（一次提供完整資訊）

```
📱 用戶：
/order 王小明 A產品x2@500 B產品x1@300 台北市信義區

🤖 Clawdbot：
✅ Order Summary
━━━━━━━━━━━━━━━━
👤 Customer: 王小明 (CUS0001)
📦 Items:
  • A產品 × 2 @ $500 = $1000
  • B產品 × 1 @ $300 = $300
💰 Total: $1300
📍 Address: 台北市信義區
💳 Payment: 現金（客戶預設）

Reply "confirm" to create order, or "cancel"

📱 用戶：確認

🤖 Clawdbot：
✅ 訂單建立成功
━━━━━━━━━━━━━━━━
📋 Order #: ORD26ABCXYZ
👤 Customer: 王小明
📦 Items:
  • A產品 × 2 @ $500
  • B產品 × 1 @ $300
💰 Total: $1300
⏱️ 狀態：待處理
```

**品項格式說明：**
- **有價格**：`品名x數量@單價` 例如：`ABC電線x1@500`
- **無價格**：`品名x數量` 例如：`ABC電線x1` (價格標記為 0，可後續在 ERP 補填)
- **多品項**：用逗號分隔 例如：`A產品x2@500, B產品x1@300`
```

### 引導模式（逐步填寫）

```
📱 用戶：/order

🤖 Clawdbot：
請問客戶名稱？

📱 用戶：王小明

🤖 Clawdbot：
找到客戶：王小明（CUS0001）
請問要訂什麼品項？

格式：
  品名x數量@單價（推薦）
  或 品名x數量（價格留空）

範例：
  ABC電線x1@500
  ABC電線x1@500, DEF開關x2@200
  ABC電線x1（不填價格，之後補）

📱 用戶：A產品x2@500, B產品x1@300

🤖 Clawdbot：
需要指定送貨地址嗎？
（直接回「不用」則使用客戶預設地址：台北市信義區）

📱 用戶：不用

🤖 Clawdbot：
✅ Order Summary
━━━━━━━━━━━━━━━━
👤 Customer: 王小明 (CUS0001)
📦 Items:
  • A產品 × 2 @ $500 = $1000
  • B產品 × 1 @ $300 = $300
💰 Total: $1300
📍 Address: 台北市信義區（預設）
💳 Payment: 現金

Reply "confirm" to create order, or "cancel"

請回覆「確認」以建立訂單。

📱 用戶：確認

🤖 Clawdbot：
✅ 訂單建立成功
📋 訂單編號：ORD26ABCXYZ
```

### 客戶不存在的處理

```
📱 用戶：
/order 陳先生 C產品x3

🤖 Clawdbot：
找不到客戶「陳先生」。
1️⃣ 建立新客戶「陳先生」
2️⃣ 重新輸入客戶名稱
3️⃣ 取消

請選擇（1 / 2 / 3）

📱 用戶：1

🤖 Clawdbot：
正在建立新客戶「陳先生」...
請提供聯絡電話？（可跳過）

📱 用戶：0912345678

🤖 Clawdbot：
✅ 新客戶已建立：陳先生（CUS0015）
現在繼續建立訂單...

確認建立訂單？
✓ 客戶：陳先生（CUS0015） [新建]
✓ 品項：C產品 x3
✓ 地址：未填
✓ 付款方式：現金（預設）

請回覆「確認」以建立訂單。
```

## ERP API 集成

### 必需的 API 端點

#### 1. 認證

```
POST /api/auth/login
  用途：取得 JWT Token，以便之後的 API 請求
  
  請求：
  {
    "taxId": "12345678",
    "email": "bot@yourcompany.com",
    "password": "bot-password"
  }
  
  回應：
  {
    "success": true,
    "data": {
      "token": "jwt_token_string",
      "sessionId": "sess_abc123",
      "expiresIn": 86400  // 秒
    }
  }
```

#### 2. 查詢客戶

```
GET /api/customers
  用途：取得所有客戶列表，用於驗證客戶是否存在
  認證：需要 Bearer Token
  
  回應：
  {
    "success": true,
    "data": [
      {
        "_id": "ObjectId",
        "name": "王小明",
        "contact": "聯絡人",
        "phone": "0912345678",
        "address": "台北市信義區...",
        "payment": {
          "method": "cash",
          "creditDays": 30
        }
      }
    ]
  }
```

#### 3. 建立新客戶（可選）

```
POST /api/customers
  用途：若客戶不存在，建立新客戶
  認證：需要 Bearer Token
  
  請求：
  {
    "name": "陳先生",
    "phone": "0912345678",
    "type": "customer",
    "payment": { "method": "cash" }
  }
  
  回應：
  {
    "success": true,
    "data": {
      "_id": "ObjectId",
      "name": "陳先生",
      "customerCode": "CUS0015",
      "phone": "0912345678"
    }
  }
```

#### 4. 建立訂單

```
POST /api/orders
  用途：在 ERP 系統建立訂單
  認證：需要 Bearer Token
  
  請求：
  {
    "orderType": "sales",
    "customerId": "ObjectId",
    "customerName": "王小明",
    "customerPhone": "0912345678",
    "shippingAddress": "台北市信義區...",
    "items": [
      {
        "productCode": "A產品",
        "productName": "A產品",
        "quantity": 2,
        "unitPrice": 0
      },
      {
        "productCode": "B產品",
        "productName": "B產品",
        "quantity": 1,
        "unitPrice": 0
      }
    ],
    "paymentInfo": {
      "method": "cash",
      "isPaid": false,
      "paidAmount": 0
    },
    "notes": "下午配送"
  }
  
  回應：
  {
    "success": true,
    "data": {
      "_id": "ObjectId",
      "orderNumber": "ORD26ABCXYZ",
      "customerName": "王小明",
      "status": "pending",
      "createdAt": "2026-01-28T..."
    }
  }
```

## 配置

在 Clawdbot config 中配置環境變數：

```bash
# ERP 系統設置
export ERP_API_URL="http://localhost:3000"
export ERP_TAX_ID="12345678"
export ERP_BOT_EMAIL="bot@yourcompany.com"
export ERP_BOT_PASSWORD="your-secure-password"

# Token 管理
export ERP_TOKEN_REFRESH_INTERVAL=3600  # 秒（1 小時）
export ERP_TOKEN_EXPIRY_BUFFER=300      # 秒（提前 5 分鐘刷新）
```

或在 Clawdbot 配置檔案中：

```yaml
skills:
  create-order:
    enabled: true
    erp:
      apiUrl: "http://localhost:3000"
      taxId: "12345678"
      botEmail: "bot@yourcompany.com"
      botPassword: "your-secure-password"
    features:
      autoCreateCustomer: true      # 自動建立新客戶
      confirmBeforeCreate: true     # 建立前要求確認
      sendNotification: true        # 建立後傳送通知
```

## 智能解析

### 自然語言解析

系統使用 Claude 來解析用戶訊息，提取以下資訊：

```
輸入：「王小明要 A 產品 2 個和 B 產品 1 個，要送到台北市信義區，記得下午配送」

解析結果（JSON）：
{
  "customerName": "王小明",
  "items": [
    { "name": "A產品", "quantity": 2 },
    { "name": "B產品", "quantity": 1 }
  ],
  "address": "台北市信義區",
  "notes": "下午配送",
  "confidence": 0.95
}
```

### 品項解析

支持多種品項格式：

```
"A產品x2"          → { name: "A產品", qty: 2 }
"A產品 2個"        → { name: "A產品", qty: 2 }
"2 個 A 產品"      → { name: "A產品", qty: 2 }
"A產品 2"          → { name: "A產品", qty: 2 }
"A產品*2"          → { name: "A產品", qty: 2 }
```

多項品項用逗號或「和」分隔：

```
"A產品x2, B產品x1"
"A產品 2 個和 B 產品 1 個"
"A產品x2, B產品x1, C產品x3"
```

## 錯誤處理

| 錯誤 | 原因 | 用戶提示 |
|------|------|---------|
| 解析失敗 | 訊息格式不清楚 | 「我沒有完全理解訂單資訊。請提供：客戶名稱、品項和數量」 |
| 客戶不存在 | 客戶名稱不符 | 「找不到客戶『王小明』。要建立新客戶嗎？」 |
| ERP 離線 | ERP 伺服器未響應 | 「系統無法連接 ERP。請確認伺服器是否正常運行。」 |
| 建立失敗 | API 回應錯誤 | 「建立訂單失敗（錯誤代碼：500）。請稍後再試。」 |
| Token 過期 | JWT 無效 | （自動刷新，用戶不會看到） |

## 日誌記錄

系統自動記錄每筆訂單的建立過程：

```
[2026-01-28 16:10:00] 訂單建立開始
  用戶：LINE:U091884e59...
  客戶：王小明（CUS0001）
  品項：A產品 x2, B產品 x1
  
[2026-01-28 16:10:01] ERP API 呼叫成功
  端點：POST /api/orders
  狀態碼：200
  訂單編號：ORD26ABCXYZ
  
[2026-01-28 16:10:02] 用戶已通知
  訊息：訂單建立成功
```

## 安全性

- **認證** — 所有 ERP API 請求都需要有效的 JWT Token
- **Token 刷新** — 自動管理 Token 生命周期，防止過期
- **錯誤隱藏** — 敏感錯誤不顯示給用戶（僅記錄在日誌）
- **速率限制** — 遵守 ERP 的速率限制（目前無限制）
- **驗證確認** — 建立前必須用戶明確確認

## 成本估算

每筆訂單的 API 調用成本：

| 步驟 | Token 消耗 | 費用 |
|------|----------|------|
| AI 解析訂單 | ~1,500 tokens | ~$0.03 |
| ERP API 查詢 + 建立 | ~1,000 tokens | ~$0.02 |
| 回覆訊息 | ~300 tokens | ~$0.006 |
| **總計** | **~2,800 tokens** | **~$0.056** |

平均每筆訂單費用：**$0.05-0.10**  
每天 20 筆訂單：**$1-2/天** ≈ **$30-60/月**

---

## 未來功能

- [ ] **訂單編輯** — 建立後修改訂單詳情
- [ ] **訂單查詢** — 查詢訂單狀態和歷史
- [ ] **批量建單** — 一次建立多個訂單
- [ ] **自動計價** — 查詢產品價目表自動計算
- [ ] **Webhook 通知** — ERP 訂單狀態變更時推送通知
- [ ] **多語言支持** — 英文、日文等

---

*此 skill 是 Clawdbot + ERP 系統的核心功能模組。*
