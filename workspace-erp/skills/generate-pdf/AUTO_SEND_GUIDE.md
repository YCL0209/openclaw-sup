# Generate-PDF Skill - 自動發送功能說明

## 🎉 新功能

generate-pdf skill 現在支持**自動生成並發送到 LINE**！

---

## ✨ 主要改進

### 1️⃣ 自動保存到 canvas 目錄
- **舊路徑**：`/tmp/clawdbot-images/` （臨時目錄）
- **新路徑**：`/Users/liaoyacheng/clawd/canvas/` （永久存儲）

### 2️⃣ 智能文件命名
- **舊格式**：`<orderId>-<type>-1.png`
- **新格式**：`<type>-<orderNumber>-1.png`
  - 範例：`quotation-ORD-260123-SA7M-1.png`

### 3️⃣ 自動生成公網 URL
- **格式**：`https://suiyao.a.pinggy.link/__openclaw__/canvas/<filename>.png`
- **範例**：`https://suiyao.a.pinggy.link/__openclaw__/canvas/quotation-ORD-260123-SA7M-1.png`

### 4️⃣ AI 自動發送到 LINE
- Skill 會提供詳細的發送指令給 AI
- AI 自動調用 `message` tool 發送圖片
- 支持多頁文件（依序發送）

---

## 📖 使用方式

### 基本用法（指定類型）

```
生成報價單 ORD-260123-SA7M
```

```
生成採購單 ORD-260130-ABCD
```

```
生成銷貨單 ORD-260201-XYZW
```

### 互動式選擇類型

```
生成訂單 ORD-260123-SA7M
```

AI 會詢問：
```
請選擇單據類型：
1️⃣ 報價單 (quotation)
2️⃣ 採購單 (purchase)
3️⃣ 銷貨單 (sales)

請回覆數字 1-3
```

---

## 🔧 工作流程

```
用戶輸入
  ↓
解析訂單編號和類型
  ↓
從 ERP 查詢訂單
  ↓
下載 PDF（ERP API）
  ↓
轉換為 PNG 圖片（pdftoppm）
  ↓
保存到 canvas 目錄
  ↓
構建公網 URL
  ↓
AI 自動發送到 LINE ✨
```

---

## 📊 輸出範例

### 成功生成後的回應

```
✅ 報價單已生成
━━━━━━━━━━━━━━━━
📋 訂單編號：ORD-260123-SA7M
👤 客戶：香港前日本電氣有限公司台灣分公司
💰 總額：NT$ 110,250
📄 頁數：1 頁
━━━━━━━━━━━━━━━━

🤖 **AI 執行指令**：請使用 message tool 依序發送以下圖片到 LINE

📤 **圖片 1/1**
- URL: https://suiyao.a.pinggy.link/__openclaw__/canvas/quotation-ORD-260123-SA7M-1.png
- 說明: 報價單 - ORD-260123-SA7M
客戶：香港前日本電氣有限公司台灣分公司
(第 1/1 頁)
- 目標: LINE user U091884e59e8027a8007b351c13f1b557
- 參數: { channel: "line", target: "...", media: "...", message: "..." }

⚠️ **重要**：使用 `media` 參數（不是 mediaUrl）發送圖片。
✨ 請立即執行發送！
```

---

## 🛠️ 技術細節

### 環境變數（.env）

```bash
ERP_API_URL=http://localhost:3000
ERP_TAX_ID=00091103
ERP_BOT_EMAIL=info@sui-yao.com
ERP_BOT_PASSWORD=000000
```

### 依賴工具

- **pdftoppm**：PDF 轉 PNG（Poppler 工具）
  ```bash
  brew install poppler
  ```

### AI Message Tool 參數

```javascript
{
  action: 'send',
  channel: 'line',
  target: 'U091884e59e8027a8007b351c13f1b557',
  media: 'https://suiyao.a.pinggy.link/__openclaw__/canvas/quotation-ORD-260123-SA7M-1.png',
  message: '報價單 - ORD-260123-SA7M\n客戶：...\n(第 1/1 頁)'
}
```

**⚠️ 注意**：參數名是 `media`，不是 `mediaUrl`！

---

## 🐛 故障排除

### 問題 1：圖片無法發送

**症狀**：AI 回報「發送失敗」

**檢查**：
1. 確認 canvas 目錄存在：`ls -la /Users/liaoyacheng/clawd/canvas/`
2. 確認圖片文件存在：檢查 skill 回應中的文件名
3. 測試公網訪問：`curl -I https://suiyao.a.pinggy.link/__openclaw__/canvas/文件名.png`

**解決**：
- 確保 canvasHost 已啟用（參考 openclaw.json）
- 確保 pinggy 隧道正常運行

### 問題 2：PDF 轉換失敗

**症狀**：「圖片轉換失敗」

**檢查**：
```bash
which pdftoppm
```

**解決**：
```bash
brew install poppler
```

### 問題 3：ERP 認證失敗

**症狀**：「ERP authentication failed」

**檢查**：
1. ERP 服務是否運行：`curl http://localhost:3000/api/auth/health`
2. 環境變數是否正確：檢查 `.env` 文件

**解決**：
- 重啟 ERP 服務
- 確認 bot 帳號存在且密碼正確

---

## 📝 版本歷史

### v2.0（2026-02-02）
- ✅ 自動保存到 canvas 目錄
- ✅ 生成公網 URL
- ✅ AI 自動發送到 LINE
- ✅ 改進文件命名
- ✅ 多頁支持

### v1.0（2026-01-30）
- 基本 PDF 生成功能
- 手動發送指令

---

## 🎯 未來優化

- [ ] 支持直接從 create-order 調用
- [ ] 支持批量生成（多個訂單）
- [ ] 支持自定義模板
- [ ] 支持其他通訊渠道（Telegram、Discord）

---

*更新日期：2026-02-02*
*維護者：Clawdbot + ERP Team*
