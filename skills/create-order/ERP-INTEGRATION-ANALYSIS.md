# 🔗 Clawdbot + OrderManagement-2025 整合分析

## 📊 整體架構分析

### ERP 專案結構

```
OrderManagement-2025/
├── src/
│   ├── routes/
│   │   ├── auth.ts              ← JWT 登入/刷新
│   │   ├── orders.ts            ← 訂單 API
│   │   └── customers.ts         ← 客戶 API
│   │
│   ├── middleware/
│   │   └── auth.ts              ← Token 驗證中介軟體
│   │
│   ├── services/
│   │   ├── authService.ts       ← 登入邏輯、Token 生成
│   │   ├── orderService.ts      ← 訂單業務邏輯
│   │   └── sessionService.ts    ← 會話管理
│   │
│   ├── controllers/
│   │   ├── orderController.ts   ← 訂單處理
│   │   └── customerController.ts← 客戶處理
│   │
│   └── config/
│       └── sessionConfig.ts     ← 會話和 Token 配置
│
├── models/
│   ├── Order.ts                 ← 訂單資料模型
│   ├── Customer.ts              ← 客戶資料模型
│   └── User.ts                  ← 使用者資料模型
│
├── .env                         ← 環境變數（JWT_SECRET）
└── package.json
```

---

## 🔐 JWT 認證工作流程

### 登入流程

```
步驟 1: Bot 傳送登入請求
POST /api/auth/login
{
  "taxId": "12345678",
  "email": "bot@yourcompany.com",
  "password": "bot-password"
}
         ↓
步驟 2: ERP authService.ts 處理
├─ 查找租戶 (Tenant.findOne by taxId)
├─ 查找使用者 (User.findOne by email + tenantId)
├─ 驗證密碼 (user.comparePassword)
├─ 檢查會話限制 (maxConcurrentSessions: 3)
└─ 生成 JWT Token
         ↓
步驟 3: ERP 回傳登入回應
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "sessionId": "sess_abc123",
    "expiresIn": 28800  ← 8 小時（配置：JWT_EXPIRES_IN: "8h"）
  }
}
         ↓
步驟 4: Skill 儲存 Token 到記憶體
jwtToken = "eyJhbGciOiJIUzI1NiIs..."
tokenExpiry = now + 28800 秒
```

### Token 結構

JWT Token 內含這些資訊：

```javascript
{
  "userId": "user_id",
  "email": "bot@yourcompany.com",
  "role": "bot",
  "tenantId": "12345678",           ← 統一編號
  "tenantName": "公司名稱",
  "databaseName": "tenant_db_12345678",
  
  // 系統自動加入
  "iat": 1234567890,
  "exp": 1234596690,                ← 8 小時後過期
  "issuer": "order-management-system"
}
```

### Token 驗證流程

```
每個 API 請求都需要驗證 Token：

GET /api/customers
Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
         ↓
middleware/auth.ts::authenticate()
├─ 提取 Token from Authorization header
├─ 呼叫 authService.verifyToken(token)
├─ 驗證簽章（用 JWT_SECRET）
├─ 檢查是否過期
└─ 解析 payload，設定 req.user, req.tenant
         ↓
✅ 通過驗證，繼續處理請求
```

---

## 📋 ERP API 端點詳解

### 1. 登入端點

```
URL: POST /api/auth/login
需要認證: 否（第一次呼叫）

請求:
{
  "taxId": "12345678",
  "email": "bot@yourcompany.com",
  "password": "bot-password",
  "deviceInfo": "LINE Bot"  ← 可選
}

回應 (HTTP 200):
{
  "success": true,
  "message": "登入成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 28800,              ← 秒數
    "sessionId": "sess_abc123",
    "user": {
      "id": "user_id",
      "email": "bot@yourcompany.com",
      "name": "OrderBot",
      "role": "bot"
    },
    "tenant": {
      "id": "tenant_id",
      "taxId": "12345678",
      "companyName": "你的公司"
    }
  }
}
```

### 2. 刷新 Token 端點

```
URL: POST /api/auth/refresh-token
需要認證: 是（需要舊 Token）

請求:
Header: Authorization: Bearer <舊token>
Body: {
  "sessionId": "sess_abc123"
}

回應 (HTTP 200):
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",  ← 新 Token
    "expiresIn": 28800
  }
}

回應 (HTTP 401): Token 過期或無效
{
  "success": false,
  "message": "Token 已過期或無效"
}
```

### 3. 查詢客戶端點

```
URL: GET /api/customers
需要認證: 是

請求:
Header: Authorization: Bearer <token>
Query: 
  - search=王小明       (可選，搜尋客戶名)
  - type=customer       (可選，客戶類型)

回應 (HTTP 200):
{
  "success": true,
  "message": "客戶清單獲取成功",
  "data": [
    {
      "_id": "ObjectId",
      "customerCode": "CUS0001",
      "name": "王小明",
      "contact": "王先生",
      "phone": "0912345678",
      "email": "wang@example.com",
      "address": "台北市信義區...",
      "taxId": "87654321",
      "type": "customer",
      "payment": {
        "method": "monthly",
        "creditDays": 30,
        "settlementDay": 25
      },
      "active": true
    }
  ]
}
```

### 4. 建立訂單端點

```
URL: POST /api/orders
需要認證: 是

請求:
Header: Authorization: Bearer <token>
Body: {
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
    }
  ],
  "paymentInfo": {
    "method": "cash",
    "isPaid": false,
    "paidAmount": 0
  },
  "notes": "備註資訊"
}

回應 (HTTP 200):
{
  "success": true,
  "data": {
    "_id": "order_id",
    "orderNumber": "ORD26ABCXYZ",
    "orderType": "sales",
    "status": "pending",
    "totalAmount": 0,
    "createdAt": "2026-01-29T..."
  }
}
```

---

## ⚙️ 關鍵配置資訊

### JWT 和會話配置（來自 sessionConfig.ts）

```javascript
// .env 中的配置
JWT_SECRET = 'f1b1c8f45b79329d7a7ad3a8eb4d45c73a006ac881fa266ad89e472c84599e7ee9f638d2f5326f8dffced87a0e4613a809463ba5548cd58c7eb093438d158d82'
JWT_EXPIRES_IN = '8h'                              // 8 小時
TOKEN_GRACE_PERIOD_MINUTES = 30                    // 寬限期 30 分鐘
MAX_CONCURRENT_SESSIONS = 3                        // 最多 3 個同時登入
SESSION_TIMEOUT_MINUTES = 480                      // 會話逾時 8 小時
SESSION_ACTIVITY_THRESHOLD_MINUTES = 30            // 30 分鐘無活動標記為不活躍
```

### 總有效期計算

```
Token 生成 → Token 過期（8 小時後）→ 寬限期（30 分鐘）→ 最終失效

實際有效期 = 8 小時 + 30 分鐘 = 8.5 小時（510 分鐘）
```

---

## 🛠️ Clawdbot Skill 整合方案

### 需要在 Skill 中實現的功能

#### 1. Token 管理

```typescript
// 全域變數
let jwtToken: string | null = null;
let sessionId: string | null = null;
let tokenExpiry: Date | null = null;

// 登入函數
async function loginToERP() → Token

// Token 維護函數
async function ensureValidToken() → Token
// - 如果沒有 Token → 呼叫 loginToERP
// - 如果 Token 快過期（< 1 分鐘）→ 呼叫 refreshToken
// - 否則 → 回傳現有 Token

// Token 刷新函數
async function refreshToken() → new Token
```

#### 2. API 呼叫

```typescript
// 通用 API 呼叫函數
async function callERP(
  path: string,
  method: string,
  body?: object
) → response

// 具體的業務函數
async function findCustomer(name: string) → Customer | null
async function createOrder(orderData: object) → Order
```

#### 3. 互動流程

```
使用者: /order 王小明 A產品x2

Step 1: AI 解析
  → { customer: "王小明", items: [{name: "A產品", qty: 2}] }

Step 2: 確保 Token 有效
  → ensureValidToken()
  → 自動登入或刷新

Step 3: 查詢客戶
  → findCustomer("王小明")
  → 獲得 customerId

Step 4: 創建訂單
  → createOrder({ ...orderData })
  → 獲得 orderNumber

Step 5: 回傳成功訊息
  → "✅ 訂單 ORD26ABCXYZ 已建立"
```

---

## 📝 Bot 帳戶資訊

根據你的 ERP 程式碼註解，已有兩個測試帳戶：

### 生產帳戶
```
統編 (taxId): 00091103
帳戶: info@sui-yao.com
密碼: 000000
公司: 穗鈅科技有限公司
```

### 測試帳戶
```
統編 (taxId): 12345678
帳戶: test@example.com
密碼: testpass123
公司: 測試公司
```

**問題：你想用哪個帳戶作為 Bot 帳戶？** 還是新建一個專用的 Bot 帳戶？

---

## 🚀 實現順序

### Phase 1: 基礎認證（1 天）
1. 實現 `loginToERP()` 函數
2. 實現 `ensureValidToken()` 函數
3. 測試登入和 Token 獲取

### Phase 2: API 整合（1-2 天）
1. 實現 `callERP()` 通用函數
2. 實現 `findCustomer()` 函數
3. 實現 `createOrder()` 函數
4. 測試各個 API 端點

### Phase 3: 業務邏輯（1-2 天）
1. 實現 AI 解析
2. 實現確認流程
3. 實現錯誤處理
4. 全流程測試

### Phase 4: 上線（1 天）
1. 配置環境變數
2. 部署到生產
3. 監控和日誌

---

## 🔑 關鍵要點總結

| 項目 | 說明 |
|-----|------|
| **認證方式** | JWT Bearer Token |
| **登入端點** | `POST /api/auth/login` |
| **刷新端點** | `POST /api/auth/refresh-token` |
| **Token 有效期** | 8 小時（自動續期） |
| **寬限期** | 30 分鐘（Token 過期後仍可刷新） |
| **最大並行會話** | 3 個 |
| **API 基址** | `http://localhost:3000` |
| **主要 API** | `/api/customers`, `/api/orders` |
| **錯誤處理** | 401 Token 無效，400 驗證失敗，500 伺服器錯誤 |

---

**準備好了嗎？我現在可以為你寫完整的 `index.ts` 程式碼！**
