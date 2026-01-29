# 🔗 Clawdbot + OrderManagement-2025 集成分析

## 📊 整体架构分析

### ERP 项目结构

```
OrderManagement-2025/
├── src/
│   ├── routes/
│   │   ├── auth.ts              ← JWT 登入/刷新
│   │   ├── orders.ts            ← 订单 API
│   │   └── customers.ts         ← 客户 API
│   │
│   ├── middleware/
│   │   └── auth.ts              ← Token 验证中间件
│   │
│   ├── services/
│   │   ├── authService.ts       ← 登入逻辑、Token 生成
│   │   ├── orderService.ts      ← 订单业务逻辑
│   │   └── sessionService.ts    ← 会话管理
│   │
│   ├── controllers/
│   │   ├── orderController.ts   ← 订单处理
│   │   └── customerController.ts← 客户处理
│   │
│   └── config/
│       └── sessionConfig.ts     ← 会话和 Token 配置
│
├── models/
│   ├── Order.ts                 ← 订单数据模型
│   ├── Customer.ts              ← 客户数据模型
│   └── User.ts                  ← 用户数据模型
│
├── .env                         ← 环境变量（JWT_SECRET）
└── package.json
```

---

## 🔐 JWT 认证工作流

### 登入流程

```
步骤 1: Bot 发送登入请求
POST /api/auth/login
{
  "taxId": "12345678",
  "email": "bot@yourcompany.com",
  "password": "bot-password"
}
         ↓
步骤 2: ERP authService.ts 处理
├─ 查找租户 (Tenant.findOne by taxId)
├─ 查找用户 (User.findOne by email + tenantId)
├─ 验证密码 (user.comparePassword)
├─ 检查会话限制 (maxConcurrentSessions: 3)
└─ 生成 JWT Token
         ↓
步骤 3: ERP 返回登入响应
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "sessionId": "sess_abc123",
    "expiresIn": 28800  ← 8 小时（配置：JWT_EXPIRES_IN: "8h"）
  }
}
         ↓
步骤 4: Skill 保存 Token 到内存
jwtToken = "eyJhbGciOiJIUzI1NiIs..."
tokenExpiry = now + 28800 秒
```

### Token 结构

JWT Token 内含这些信息：

```javascript
{
  "userId": "user_id",
  "email": "bot@yourcompany.com",
  "role": "bot",
  "tenantId": "12345678",           ← 统一编号
  "tenantName": "公司名称",
  "databaseName": "tenant_db_12345678",
  
  // 系统自动加入
  "iat": 1234567890,
  "exp": 1234596690,                ← 8 小时后过期
  "issuer": "order-management-system"
}
```

### Token 验证流程

```
每个 API 请求都需要验证 Token：

GET /api/customers
Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
         ↓
middleware/auth.ts::authenticate()
├─ 提取 Token from Authorization header
├─ 调用 authService.verifyToken(token)
├─ 验证签名（用 JWT_SECRET）
├─ 检查是否过期
└─ 解析 payload，设置 req.user, req.tenant
         ↓
✅ 通过验证，继续处理请求
```

---

## 📋 ERP API 端点详解

### 1. 登入端点

```
URL: POST /api/auth/login
需要认证: 否（第一次调用）

请求:
{
  "taxId": "12345678",
  "email": "bot@yourcompany.com",
  "password": "bot-password",
  "deviceInfo": "LINE Bot"  ← 可选
}

响应 (HTTP 200):
{
  "success": true,
  "message": "登入成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 28800,              ← 秒数
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

### 2. 刷新 Token 端点

```
URL: POST /api/auth/refresh-token
需要认证: 是（需要旧 Token）

请求:
Header: Authorization: Bearer <旧token>
Body: {
  "sessionId": "sess_abc123"
}

响应 (HTTP 200):
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",  ← 新 Token
    "expiresIn": 28800
  }
}

响应 (HTTP 401): Token 过期或无效
{
  "success": false,
  "message": "Token 已过期或无效"
}
```

### 3. 查询客户端点

```
URL: GET /api/customers
需要认证: 是

请求:
Header: Authorization: Bearer <token>
Query: 
  - search=王小明       (可选，搜索客户名)
  - type=customer       (可选，客户类型)

响应 (HTTP 200):
{
  "success": true,
  "message": "客户列表获取成功",
  "data": [
    {
      "_id": "ObjectId",
      "customerCode": "CUS0001",
      "name": "王小明",
      "contact": "王先生",
      "phone": "0912345678",
      "email": "wang@example.com",
      "address": "台北市信义区...",
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

### 4. 建立订单端点

```
URL: POST /api/orders
需要认证: 是

请求:
Header: Authorization: Bearer <token>
Body: {
  "orderType": "sales",
  "customerId": "ObjectId",
  "customerName": "王小明",
  "customerPhone": "0912345678",
  "shippingAddress": "台北市信义区...",
  "items": [
    {
      "productCode": "A产品",
      "productName": "A产品",
      "quantity": 2,
      "unitPrice": 0
    }
  ],
  "paymentInfo": {
    "method": "cash",
    "isPaid": false,
    "paidAmount": 0
  },
  "notes": "备注信息"
}

响应 (HTTP 200):
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

## ⚙️ 关键配置信息

### JWT 和会话配置（来自 sessionConfig.ts）

```javascript
// .env 中的配置
JWT_SECRET = 'f1b1c8f45b79329d7a7ad3a8eb4d45c73a006ac881fa266ad89e472c84599e7ee9f638d2f5326f8dffced87a0e4613a809463ba5548cd58c7eb093438d158d82'
JWT_EXPIRES_IN = '8h'                              // 8 小时
TOKEN_GRACE_PERIOD_MINUTES = 30                    // 宽限期 30 分钟
MAX_CONCURRENT_SESSIONS = 3                        // 最多 3 个同时登入
SESSION_TIMEOUT_MINUTES = 480                      // 会话超时 8 小时
SESSION_ACTIVITY_THRESHOLD_MINUTES = 30            // 30 分钟无活动标记为不活跃
```

### 总有效期计算

```
Token 生成 → Token 过期（8 小时后）→ 宽限期（30 分钟）→ 最终失效

实际有效期 = 8 小时 + 30 分钟 = 8.5 小时（510 分钟）
```

---

## 🛠️ Clawdbot Skill 集成方案

### 需要在 Skill 中实现的功能

#### 1. Token 管理

```typescript
// 全局变量
let jwtToken: string | null = null;
let sessionId: string | null = null;
let tokenExpiry: Date | null = null;

// 登入函数
async function loginToERP() → Token

// Token 维护函数
async function ensureValidToken() → Token
// - 如果没有 Token → 调用 loginToERP
// - 如果 Token 快过期（< 1 分钟）→ 调用 refreshToken
// - 否则 → 返回现有 Token

// Token 刷新函数
async function refreshToken() → new Token
```

#### 2. API 调用

```typescript
// 通用 API 调用函数
async function callERP(
  path: string,
  method: string,
  body?: object
) → response

// 具体的业务函数
async function findCustomer(name: string) → Customer | null
async function createOrder(orderData: object) → Order
```

#### 3. 交互流程

```
用户: /order 王小明 A产品x2

Step 1: AI 解析
  → { customer: "王小明", items: [{name: "A产品", qty: 2}] }

Step 2: 确保 Token 有效
  → ensureValidToken()
  → 自动登入或刷新

Step 3: 查询客户
  → findCustomer("王小明")
  → 获得 customerId

Step 4: 创建订单
  → createOrder({ ...orderData })
  → 获得 orderNumber

Step 5: 返回成功消息
  → "✅ 订单 ORD26ABCXYZ 已建立"
```

---

## 📝 Bot 账户信息

根据你的 ERP 代码注释，已有两个测试账户：

### 生产账户
```
统编 (taxId): 00091103
账户: info@sui-yao.com
密码: 000000
公司: 穗鈅科技有限公司
```

### 测试账户
```
统编 (taxId): 12345678
账户: test@example.com
密码: testpass123
公司: 测试公司
```

**问题：你想用哪个账户作为 Bot 账户？** 还是新建一个专用的 Bot 账户？

---

## 🚀 实现顺序

### Phase 1: 基础认证（1 天）
1. 实现 `loginToERP()` 函数
2. 实现 `ensureValidToken()` 函数
3. 测试登入和 Token 获取

### Phase 2: API 集成（1-2 天）
1. 实现 `callERP()` 通用函数
2. 实现 `findCustomer()` 函数
3. 实现 `createOrder()` 函数
4. 测试各个 API 端点

### Phase 3: 业务逻辑（1-2 天）
1. 实现 AI 解析
2. 实现确认流程
3. 实现错误处理
4. 全流程测试

### Phase 4: 上线（1 天）
1. 配置环境变量
2. 部署到生产
3. 监控和日志

---

## 🔑 关键要点总结

| 项目 | 说明 |
|-----|------|
| **认证方式** | JWT Bearer Token |
| **登入端点** | `POST /api/auth/login` |
| **刷新端点** | `POST /api/auth/refresh-token` |
| **Token 有效期** | 8 小时（自动续期） |
| **宽限期** | 30 分钟（Token 过期后仍可刷新） |
| **最大并发会话** | 3 个 |
| **API 基址** | `http://localhost:3000` |
| **主要 API** | `/api/customers`, `/api/orders` |
| **错误处理** | 401 Token 无效，400 验证失败，500 服务器错误 |

---

**准备好了吗？我现在可以为你写完整的 `index.ts` 代码！**
