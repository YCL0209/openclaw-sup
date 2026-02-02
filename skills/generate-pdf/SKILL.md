---
name: generate-pdf
description: 當用戶說「生成 PDF」「導出 PDF」「生成報價單」「生成採購單」「生成銷貨單」「打印訂單」等關鍵詞時，調用此 skill 生成訂單 PDF 文件。支持報價單、採購單、銷貨單三種格式。
---

# Generate PDF - 訂單文件生成系統

## 功能概述

從現有訂單生成 PDF 文件並轉換為圖片發送到 LINE。支持三種單據類型：
- **報價單** (quotation)
- **採購單** (purchase)  
- **銷貨單** (sales)

## 使用方式

### 方式 1：直接指定類型
```
生成報價單 ORD-260123-SA7M
生成採購單 ORD-260123-SA7M
生成銷貨單 ORD-260123-SA7M
```

### 方式 2：縮寫關鍵詞
```
報價單 ORD-260123-SA7M
採購單 ORD-260123-SA7M
銷貨單 ORD-260123-SA7M
```

### 方式 3：通用指令（互動選擇）
```
生成 PDF ORD-260123-SA7M
→ 系統會詢問：「請選擇單據類型：1. 報價單 2. 採購單 3. 銷貨單」
→ 用戶回覆數字選擇
```

## 工作流程

1. **解析訂單編號**：從用戶訊息中提取訂單編號
2. **確定單據類型**：
   - 如果訊息包含「報價單」→ quotation
   - 如果訊息包含「採購單」→ purchase
   - 如果訊息包含「銷貨單」→ sales
   - 否則詢問用戶選擇
3. **查詢訂單**：從 ERP 查詢訂單是否存在
4. **生成 PDF**：調用 ERP API 生成 PDF
5. **轉換圖片**：用 pdftoppm 轉換成 PNG
6. **自動發送**：直接透過 OpenClaw Gateway 發送圖片到用戶

## API 端點

```
GET /api/orders?orderNumber={訂單編號}
→ 查詢訂單，取得 orderId

GET /api/orders/{orderId}/pdf?type={類型}
→ 生成 PDF
→ 類型：quotation | purchase | sales
```

## 錯誤處理

- 訂單編號格式不正確 → 提示正確格式
- 訂單不存在 → 「找不到訂單 {編號}」
- PDF 生成失敗 → 「PDF 生成失敗，請稍後再試」
- 圖片轉換失敗 → 「圖片轉換失敗，但 PDF 已生成」

## 輸出格式

成功時回傳：
```
✅ {單據類型}已生成並發送
📋 {訂單編號}
👤 {客戶名稱}
📄 共 N 頁
```

**注意：** 圖片會自動發送到用戶的 LINE，無需 AI 額外操作。

## 技術細節

- PDF 儲存：`/tmp/clawdbot-pdf/{orderId}-{type}.pdf`
- 圖片輸出：`/tmp/clawdbot-images/{orderId}-{type}-{頁碼}.png`
- 轉換指令：`pdftoppm -png -r 150 {PDF路徑} {輸出前綴}`
- 圖片解析度：150 DPI

## 範例對話

```
👤 用戶：生成報價單 ORD-260123-SA7M

🤖 系統：
正在查詢訂單...
✅ 找到訂單 ORD-260123-SA7M
客戶：香港商日本脈衝有限公司台灣分公司
總額：NT$ 110,250

正在生成報價單...
✅ 報價單已生成並發送
📋 ORD-260123-SA7M
👤 香港商日本脈衝有限公司台灣分公司
📄 共 1 頁

（圖片已自動發送到您的 LINE）
```

## 注意事項

- 訂單必須存在於 ERP 系統
- ERP API 必須支援 PDF 生成功能
- 需要 `pdftoppm` 工具（poppler-utils）
- 圖片會暫存在 canvas 目錄（用於 HTTPS 存取）
- 需要配置 `OPENCLAW_GATEWAY_TOKEN` 環境變數
- 建議定期清理舊的 PDF 和圖片文件

## 配置需求

在 `.env` 檔案中設定：
```bash
# ERP 系統
ERP_API_URL=http://localhost:3000
ERP_TAX_ID=00091103
ERP_BOT_EMAIL=info@sui-yao.com
ERP_BOT_PASSWORD=000000

# OpenClaw Gateway（用於自動發送圖片）
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token-here
```
