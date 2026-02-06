# PDF to Order Skill

從 PDF 報價單自動建立 ERP 訂單，或單純提取文字內容。

## 功能

- ✅ 偵測 LINE 訊息中的 PDF 附件
- ✅ 下載 PDF 文件到本地
- ✅ 使用 pdftotext 提取文字（文字型 PDF）
- ✅ 使用 OCR 提取文字（圖片型 PDF）
- ✅ **智能詢問用戶意圖**（截取文字/建立採購單/建立銷貨單）
- ✅ 智能解析訂單資訊（供應商、品項、數量、價格）
- ✅ 自動判斷訂單類型（採購單/銷售單）
- ✅ 確認機制（避免誤建訂單）
- ✅ 整合 create-order skill

## 使用方式

### 方式 1: LINE 上傳 PDF（推薦）

```
1. 在 LINE 上傳 PDF 文件
2. 系統自動詢問意圖：
   1️⃣ 截取文字回傳
   2️⃣ 建立採購單
   3️⃣ 建立銷貨單
3. 回覆數字（1/2/3）或關鍵詞
4. 根據選擇執行對應動作
```

### 方式 2: LINE 上傳 + 明確意圖

```
1. 在 LINE 上傳 PDF
2. 同時輸入意圖：
   - 「這份我要購買」（建立採購單）
   - 「幫我報價」（建立銷貨單）
   - 「提取文字」（只截取內容）
3. 系統跳過詢問，直接執行
4. 回覆「確認」建立訂單（若選擇建單）
```

### 方式 3: 指定本地檔案

```
1. 將 PDF 放到 ~/clawd/uploads/
2. 輸入：「根據 quote-2026.pdf 建立採購單」
3. 系統讀取並解析
4. 回覆「確認」建立訂單
```

## 觸發關鍵詞

- 我要購買
- 建立採購單
- 根據這份下單
- 這份我要訂
- 依這份報價

## PDF 格式要求

系統會嘗試識別以下資訊：

| 資訊 | 識別方式 |
|------|---------|
| 供應商名稱 | 抬頭、「供應商」欄位、第一行 |
| 品號 | PRO-XXX 格式 |
| 品名 | 品號旁邊的文字 |
| 數量 | 數字 + 單位 |
| 單價 | 金額格式 |
| 總額 | 「總計」「Total」欄位 |

## 訂單類型判斷

- **採購單（PUR-）：** 用戶說「購買」「採購」或 PDF 包含「採購單」
- **銷售單（ORD-）：** 用戶說「報價」或 PDF 包含「報價單」
- **預設：** 採購單

## 依賴

- `pdftotext` (poppler-utils) - 用於 PDF 文字提取
- `axios` - 用於 LINE API 呼叫

## 測試

```bash
# 手動測試
cd ~/clawd/skills/pdf-to-order
node index.js "我要購買" "test.pdf"
```

## 錯誤處理

| 錯誤 | 處理方式 |
|------|---------|
| PDF 下載失敗 | 提示用戶稍後再試 |
| 文字提取失敗 | 提示確認 PDF 格式 |
| 解析失敗 | 引導用戶手動輸入 |
| 供應商不存在 | 轉交 create-order 處理 |

## 與其他 Skills 的整合

- **pdf-extract:** 用於提取 PDF 文字
- **create-order:** 用於建立 ERP 訂單
- **generate-pdf:** 訂單建立後可生成文件

## 檔案結構

```
pdf-to-order/
├── SKILL.md          # AI 行為指引
├── index.js          # 主邏輯
├── package.json      # 依賴配置
└── README.md         # 說明文件
```

## 狀態管理

| 狀態 | 說明 |
|------|------|
| `processingPdf` | 正在處理 PDF |
| `waitingForOrderConfirmation` | 等待用戶確認 |
| `creatingOrder` | 正在建立訂單 |

## 注意事項

1. **確保 pdftotext 已安裝：**
   ```bash
   # macOS
   brew install poppler
   
   # Linux
   sudo apt install poppler-utils
   ```

2. **LINE 配置：** 確保 `~/.openclaw/openclaw.json` 包含 LINE channelAccessToken

3. **上傳目錄：** 系統會自動建立 `~/clawd/uploads/` 目錄

## 未來改進

- [ ] 支援更多 PDF 格式（Excel 轉 PDF、掃描件）
- [ ] OCR 支援（圖片型 PDF）
- [ ] 品號對照表（供應商品號 → 內部品號）
- [ ] 多頁 PDF 處理優化
- [ ] AI 輔助解析（使用 Claude Vision API）

## 版本歷史

- **v1.0.0** (2026-02-05)
  - 初始版本
  - 支援 LINE PDF 上傳
  - 支援本地文件讀取
  - 基本訂單資訊解析
  - 整合 create-order skill
