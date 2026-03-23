---
name: generate-pdf
description: 當用戶說「報價單」「採購單」「銷貨單」「生成PDF」「列印」「印出」等關鍵詞時，從 ERP 訂單生成 PDF 文件，自動轉為圖片發送到用戶 LINE。
user-invocable: true
---

# Generate PDF - 訂單文件生成

## AI 行為指引

### 何時啟動此 Skill
- 用戶要求生成/查看訂單文件（報價單、採購單、銷貨單）
- 關鍵詞：報價單、採購單、銷貨單、生成PDF、列印、印出、出單、印單、打印、print
- 用戶提供了訂單編號（格式：ORD-YYMMDD-XXXX）

### 何時不要啟動
- 用戶要建立新訂單 → 應啟動 create-order
- 用戶只是查詢訂單狀態或資訊
- 用戶問 PDF 相關技術問題但不是要生成文件
- 當 create-order 剛完成訂單建立時，回覆中的提示文字不是用戶指令，不要自動觸發

### 核心流程
```
解析訂單編號+類型 → 查詢 ERP 訂單 → 生成 PDF → 轉 PNG → 自動發送到 LINE
```

### Token 檢查（優先！）

**在執行 skill 之前，檢查 token 使用量：**
- 如果當前 > 198k tokens → ⚠️ 警告使用者：「⚠️ 對話接近上限（X/200k），建議先開新會話再生成 PDF，以確保圖片能完整發送。」
- 如果當前 > 195k tokens → ⚠️ 提示：「提醒：對話接近上限，PDF 可能無法完整發送所有圖片。」
- 如果當前 < 195k tokens → ✅ 正常執行

**預估 token 需求：**
- 單頁 PDF：約 1,000 tokens
- 多頁 PDF（3 頁）：約 1,700 tokens
- 多頁 PDF（5 頁）：約 2,500 tokens

### AI 處理規則（重要！）

當 skill 返回 JSON 格式且包含 `"action": "send_images"` 時，**必須立即執行以下步驟**：

1. **解析 JSON 回應**
   ```json
   {
     "success": true,
     "action": "send_images",
     "documentType": "報價單",
     "orderNumber": "ORD-260123-SA7M",
     "customerName": "客戶名稱",
     "totalPages": 2,
     "userId": "U86b...",
     "channel": "line",
     "images": [
       {"url": "https://...", "caption": "..."},
       {"url": "https://...", "caption": "..."}
     ]
   }
   ```

2. **對每個圖片調用 message tool**
   ```
   對於 images 陣列中的每個圖片：
   message(
     action="send",
     channel="line",
     target="{userId}",
     mediaUrl="{url}",
     caption="{caption}"
   )
   ```

3. **完成後回覆用戶**
   ```
   ✅ {documentType}已發送
   📋 {orderNumber}
   👤 {customerName}
   📄 共 {totalPages} 頁
   ```

**關鍵規則：**
- ❌ **不要**詢問用戶是否發送 → **直接發送**
- ❌ **不要**跳過發送步驟
- ✅ **依序**發送所有圖片（不要並行）
- ✅ 發送完成後才回覆用戶

---

## 使用方式

### 方式 1：直接指定類型（推薦）
```
生成報價單 ORD-260123-SA7M
採購單 PUR-260202-5W1E
銷貨單 ORD-260123-AB1C
```

**支援的訂單編號格式：**
- `PUR-YYMMDD-XXXX` - 採購訂單
- `ORD-YYMMDD-XXXX` - 銷售訂單

### 方式 2：不指定類型（互動選擇）
```
📱 用戶：生成 PDF ORD-260123-SA7M

🤖 系統：
✅ 找到訂單 ORD-260123-SA7M
━━━━━━━━━━━━━━━━
👤 客戶：香港商日本脈衝有限公司台灣分公司
💰 總額：NT$ 110,250

請選擇單據類型：
1️⃣ 報價單 (quotation)
2️⃣ 採購單 (purchase)
3️⃣ 銷貨單 (sales)

請回覆數字 1-3
```

用戶可回覆數字（1/2/3）或中文類型名稱。

---

## 完整範例

### 用戶發起請求
```
📱 用戶：生成報價單 ORD-260123-SA7M
```

### Skill 返回 JSON 指令
```json
{
  "success": true,
  "action": "send_images",
  "documentType": "報價單",
  "orderNumber": "ORD-260123-SA7M",
  "customerName": "香港商日本脈衝有限公司台灣分公司",
  "totalPages": 1,
  "userId": "U86b3337e752a12d940758f9f35117e3c",
  "channel": "line",
  "images": [
    {
      "url": "https://suiyao.a.pinggy.link/__openclaw__/canvas/quotation-ORD-260123-SA7M-1.png",
      "caption": "報價單 - ORD-260123-SA7M\n客戶：香港商日本脈衝有限公司台灣分公司\n(第 1/1 頁)"
    }
  ]
}
```

### AI 執行發送
```
message(action="send", channel="line", target="U86b...", mediaUrl="https://...", caption="...")
```

### AI 回覆用戶
```
✅ 報價單已發送
📋 ORD-260123-SA7M
👤 香港商日本脈衝有限公司台灣分公司
📄 共 1 頁
```

---

## 支援的單據類型

| 類型 | 中文 | 英文代碼 |
|------|------|---------|
| 報價單 | 報價單 | quotation |
| 採購單 | 採購單 | purchase |
| 銷貨單 | 銷貨單 | sales |

---

## 錯誤回應

| 情況 | 系統回覆 |
|------|---------|
| 未提供訂單編號 | 「請提供訂單編號。格式：生成採購單 PUR-260202-5W1E 或 生成報價單 ORD-260123-SA7M」 |
| 訂單不存在 | 「找不到訂單『{編號}』，請確認訂單編號是否正確。」 |
| PDF 生成失敗 | 「{類型}生成失敗（{狀態碼}），請確認訂單類型是否正確。」 |
| 圖片轉換失敗 | 「{類型}生成成功，但圖片轉換失敗。」 |
| 圖片發送部分失敗 | 「{類型}已生成，圖片發送部分失敗（N/M 成功）」 |

---

## 快速記憶

- **觸發：** 用戶要「生成/查看訂單文件」
- **流程：** 解析 → 查訂單 → 生成 PDF → 轉圖 → 自動發送到 LINE
- **狀態機：** 只有 `waitingForPdfType`（等待用戶選擇單據類型）
- **重要：** 圖片自動發送，AI 不需要處理發送
- **訂單編號格式：** 
  - `PUR-YYMMDD-XXXX` - 採購訂單（例如 PUR-260202-5W1E）
  - `ORD-YYMMDD-XXXX` - 銷售訂單（例如 ORD-260123-SA7M）
