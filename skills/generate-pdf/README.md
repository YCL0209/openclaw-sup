# Generate PDF Skill

生成訂單 PDF 文件並轉換為圖片發送到 LINE。

## 功能

- 從現有訂單生成 PDF 文件
- 支持三種單據類型：報價單、採購單、銷貨單
- 自動轉換 PDF 為 PNG 圖片
- 透過 LINE 發送圖片

## 使用方式

### 直接指定類型
```
生成報價單 ORD-260123-SA7M
生成採購單 ORD-260123-SA7M
生成銷貨單 ORD-260123-SA7M
```

### 縮寫關鍵詞
```
報價單 ORD-260123-SA7M
採購單 ORD-260123-SA7M
銷貨單 ORD-260123-SA7M
```

### 互動選擇
```
生成 PDF ORD-260123-SA7M
→ 系統詢問選擇類型
→ 回覆 1/2/3 選擇
```

## 互動流程範例

```
👤 您：生成報價單 ORD-260123-SA7M

🤖 系統：
正在查詢訂單...
✅ 找到訂單 ORD-260123-SA7M
客戶：香港商日本脈衝有限公司台灣分公司
總額：NT$ 110,250

正在生成報價單...
✅ 報價單已生成（共 1 張）

⚡ 執行動作：使用 message tool 發送以下圖片（共 1 張）
圖片 1：/tmp/clawdbot-images/xxx-quotation-1.png

請依序發送給當前用戶。

[自動發送圖片到 LINE]
```

## 技術要求

- ERP API 必須支援 `/api/orders/{id}/pdf?type={type}` 端點
- 需要安裝 `pdftoppm`（poppler-utils）
- 需要配置 ERP 連線資訊（.env）

## 配置

在 `.env` 文件中設置：
```
ERP_API_URL=http://localhost:3000
ERP_TAX_ID=00091103
ERP_BOT_EMAIL=info@sui-yao.com
ERP_BOT_PASSWORD=000000
```

## 檔案說明

- `SKILL.md` - Skill 說明文件（給 AI agent 閱讀）
- `index.js` - 主要邏輯實現
- `skill.json` - Skill 配置
- `.env` - 環境變數配置
- `README.md` - 使用說明（給人類閱讀）

## 輸出位置

- PDF：`/tmp/clawdbot-pdf/{orderId}-{type}.pdf`
- 圖片：`/tmp/clawdbot-images/{orderId}-{type}-{頁碼}.png`

## 注意事項

- 訂單必須存在於 ERP 系統
- 圖片會暫存在 /tmp 目錄
- 建議定期清理舊的 PDF 和圖片文件
