# ERP 訂單 PDF 生成 API 說明

## API 端點

```
GET /api/orders/:id/pdf?type={documentType}
```

需要認證：Bearer JWT Token

### 支援的文件類型

| type 參數 | 文件名稱 | 用途 |
|-----------|---------|------|
| `quotation` | 報價單 | 報價給客戶（預設值） |
| `purchase` | 採購單 | 向供應商採購 |
| `sales` | 銷貨單 | 銷售出貨 |

### Query 參數

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `type` | string | 否 | `quotation` | 文件類型 |
| `saveToUSB` | string | 否 | `true` | 是否儲存到 USB 備份 |

### 回應格式

**成功（HTTP 200）：**

- Content-Type: `application/pdf`
- Content-Disposition: `inline; filename="訂單編號-公司名.pdf"`
- Body: 二進位 PDF 檔案串流

額外 Header：
- `X-USB-Saved`: `true` 或 `false`（是否已存到 USB）
- `X-USB-Path`: USB 儲存路徑（僅當 X-USB-Saved 為 true）

**失敗：**

| HTTP 狀態碼 | 回應 |
|------------|------|
| 404 | `{ "success": false, "message": "訂單不存在" }` |
| 500 | `{ "success": false, "message": "PDF 生成失敗" }` |

---

## 三種文件類型詳細說明

### 1. 報價單（quotation）

```
GET /api/orders/{orderId}/pdf?type=quotation
```

**PDF 內容：**

| 區域 | 內容 |
|------|------|
| 頁首 | 公司 Logo + 統編 + 電話 + 地址 + Email |
| 標題 | 報 價 單 |
| 客戶資訊 | 客戶名稱、統一編號、聯絡人、E-mail、報價日期、報價單號、發票地址、交貨地址、付款條件 |
| 明細表 | 項次、品名、型號、數量PC、單價、金額 |
| 金額匯總 | 合計（未稅）、營業稅（5%）、總計 |
| 付款資訊 | 匯款戶名 + 銀行帳號 |
| 交易條款 | 5 條預設條款（報價有效期、取消手續費、運費規定等） |
| 簽章 | 左：客戶確認訂購簽章欄 / 右：聯絡人資訊 + 公司章 |

**預設交易條款：**
1. 報價有效期限：本報價單自報價日起七日內有效
2. 下單後取消收取 10% 手續費，特殊訂購品不接受退貨
3. 訂購金額未滿 3000 元加收運費
4. 受貨人未付款前公司保有所有權
5. 出貨前公司保有調整貨價或決定是否出貨之權利

### 2. 採購單（purchase）

```
GET /api/orders/{orderId}/pdf?type=purchase
```

**PDF 內容：**

| 區域 | 內容 |
|------|------|
| 頁首 | 公司 Logo + 統編 + 電話 + 地址 + Email |
| 標題 | 採 購 單 |
| 供應商資訊 | 採購日期、統一編號、廠商名稱、廠商電話、送貨地址（公司地址）、廠商傳真、付款條件、幣別、採購人員 |
| 明細表 | 項次、品名、型號、數量PC、單價、金額 |
| 金額匯總 | 合計（未稅）、營業稅（5%）、總計 |
| 付款資訊 | 匯款戶名 + 銀行帳號 |
| 交易條款 | 3 條預設條款（訂單確認、交期規定、退貨規定） |
| 簽章 | 左：主管 + 採購（含印章） / 右：廠商簽核欄 |

**預設交易條款：**
1. 收到本訂單確認單者，視為已接受本確認單之規定並立即生效
2. 訂單貨品交期需依敝司回覆實際交貨日為主要
3. 交易行為成立，除非商品有嚴重瑕疵，不得退貨退款

### 3. 銷貨單（sales）

```
GET /api/orders/{orderId}/pdf?type=sales
```

**PDF 內容：**

| 區域 | 內容 |
|------|------|
| 頁首 | 公司 Logo + 統編 + 電話 + 地址 + Email |
| 標題 | 銷 貨 單 |
| 客戶資訊 | 銷貨日期、銷貨單號、發票日期、發票號碼、客戶名稱、統一編號、送貨地址、客戶傳真、客戶電話、幣別、客戶訂單號、業務人員、收款條件 |
| 明細表 | 項次、品名、型號、數量PC、單價、金額 |
| 金額匯總 | 合計（未稅）、營業稅（5%）、總計 |
| 付款資訊 | 匯款戶名 + 銀行帳號 |
| 交易條款 | 無預設條款 |
| 簽章 | 備註欄 + 發票章 |

---

## 明細表欄位格式

所有文件類型共用同一個明細表格式：

| 欄位 | 寬度 | 說明 |
|------|------|------|
| 項次 | 8% | 從 1 開始的序號（跨頁連續編號） |
| 品名 | 30% | `productName`（或 `productSnapshot.name`） |
| 型號 | 15% | `productSnapshot.model`（無則空白） |
| 數量PC | 12% | `quantity` |
| 單價 | 17% | `unitPrice`（千分位格式） |
| 金額 | 18% | `totalPrice`（千分位格式） |

### 金額計算

```
合計（未稅）= 所有品項的 totalPrice 加總
營業稅     = 合計 × 5%（四捨五入）
總計       = 合計 + 營業稅
```

### 自動分頁

- 超過 **35 項** 自動分頁
- 第一頁：完整頁首 + 客戶資訊 + 明細表
- 續頁：簡化頁首（公司名稱 + 頁碼）+ 明細表
- 最後一頁：明細表 + 金額匯總 + 條款 + 簽章

---

## curl 測試範例

### 1. 登入取得 Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "taxId": "12345678",
    "email": "your@email.com",
    "password": "your-password"
  }'

# 取得 token
export TOKEN="回應中的 data.token"
```

### 2. 生成報價單 PDF

```bash
curl http://localhost:3000/api/orders/{orderId}/pdf?type=quotation \
  -H "Authorization: Bearer $TOKEN" \
  -o quotation.pdf
```

### 3. 生成採購單 PDF

```bash
curl http://localhost:3000/api/orders/{orderId}/pdf?type=purchase \
  -H "Authorization: Bearer $TOKEN" \
  -o purchase.pdf
```

### 4. 生成銷貨單 PDF

```bash
curl http://localhost:3000/api/orders/{orderId}/pdf?type=sales \
  -H "Authorization: Bearer $TOKEN" \
  -o sales.pdf
```

### 5. 不儲存 USB 備份

```bash
curl http://localhost:3000/api/orders/{orderId}/pdf?type=quotation&saveToUSB=false \
  -H "Authorization: Bearer $TOKEN" \
  -o quotation.pdf
```

---

## LINE Bot 整合流程

```
1. 使用者建立訂單 → 取得 orderId

2. 呼叫 PDF API
   GET /api/orders/{orderId}/pdf?type=sales
   → 取得 binary PDF

3. 將 PDF 傳送給 LINE 使用者
   - 方法一：用 LINE Messaging API 的 file message 直接傳 PDF
   - 方法二：將 PDF 存到暫存路徑，產生下載連結給使用者
```

### 程式碼範例

```typescript
// 建立訂單後，生成 PDF 並回傳
async function getOrderPDF(orderId: string, type: string = 'sales'): Promise<Buffer> {
  const token = await ensureAuthenticated();

  const res = await fetch(
    `${ERP_API_BASE}/api/orders/${orderId}/pdf?type=${type}&saveToUSB=false`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!res.ok) {
    throw new Error(`PDF 生成失敗: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// 使用範例
const pdfBuffer = await getOrderPDF('order_id', 'quotation');
// → 將 pdfBuffer 傳送給 LINE 使用者
```

---

## 技術細節

| 項目 | 值 |
|------|-----|
| PDF 引擎 | Puppeteer（Headless Chrome） |
| 頁面尺寸 | A4（210mm × 297mm） |
| 邊距 | 10mm（上下）× 15mm（左右） |
| 字型 | Microsoft JhengHei / PingFang TC |
| 字體大小 | 10px（內文）、20px（標題） |
| 日期格式 | zh-TW locale（如 2026/1/28） |
| 稅率 | 固定 5% 營業稅 |
| 分頁閾值 | 35 項 |

---

*文件建立日期：2026-01-30*
*對應 API 位置：src/controllers/orderController.ts、src/services/pdfService.ts*
