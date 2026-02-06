# PDF 類型與品號格式支援說明

## 📄 PDF 類型

### 1. 文字型 PDF（Text-based PDF）

**✅ 完整支援**

**特徵：**
- 文字可以選取和複製
- 檔案較小（通常 < 500 KB）
- 由軟體直接生成

**來源範例：**
- Word/Excel → 匯出 PDF
- ERP 系統生成的報價單
- 網頁另存為 PDF
- Google Docs/Sheets 下載

**提取方式：**
```bash
pdftotext quote.pdf -
```

**效果：**
```
百凌工业股份有限公司
品號: PRO-183  品名: 工業控制器  數量: 30
總計: NT$ 15,000
```

---

### 2. 圖片型 PDF（Image-based PDF）

**⚠️ 需要 OCR（光學字元識別）**

**特徵：**
- 文字無法選取（是圖片）
- 檔案較大（通常 > 1 MB）
- 掃描或拍照產生

**來源範例：**
- 紙本文件掃描
- 手機拍照轉 PDF
- 傳真件
- 截圖拼接的 PDF

**提取方式：**
```bash
# 需要先轉圖片，再 OCR
pdftoppm -png scanned.pdf page
tesseract page-1.png stdout -l chi_tra+eng
```

**當前狀態：**
- ✅ Tesseract OCR 已安裝
- ✅ pdftoppm 工具已安裝
- ❌ 繁體中文語言包未安裝

**安裝繁體中文支援：**
```bash
# 方式 1: Homebrew（推薦）
brew install tesseract-lang

# 方式 2: 手動下載
cd /opt/homebrew/share/tessdata/
curl -LO https://github.com/tesseract-ocr/tessdata/raw/main/chi_tra.traineddata

# 驗證安裝
tesseract --list-langs
# 應該看到: chi_tra, eng
```

---

## 🔢 品號格式支援

### 完整支援的格式

| 格式 | 範例 | 正則表達式 | 優先級 | 信心度 |
|------|------|-----------|--------|--------|
| **PRO-數字** | `PRO-183` | `/\b(PRO-\d+)\b/gi` | 1 | 100% |
| **英文-數字** | `ABC-12345` | `/\b([A-Z]{2,4}-\d{3,6})\b/gi` | 2 | 90% |
| **品號:數字** | `品號: 12345678` | `/品號[：:\s]*(\d{4,8})/gi` | 3 | 80% |
| **中文品號** | `品號: 控制器-A型` | `/品號[：:\s]*([\u4e00-\u9fa5A-Z0-9\-]{2,20})/gi` | 4 | 70% |
| **英數混合** | `ABC123XYZ` | `/\b([A-Z0-9]{6,12})\b/gi` | 5 | 60% |

### 供應商專用格式

可以為特定供應商建立專用格式：

```javascript
{
  name: '百凌品號',
  pattern: /\b(BL-\d{4})\b/gi,
  example: 'BL-1234',
  priority: 1,
  supplier: '百凌工业股份有限公司',
  confidence: 1.0
}
```

### 如何新增品號格式

編輯 `product-code-patterns.js`：

```javascript
export const PRODUCT_CODE_PATTERNS = [
  // 在這裡新增你的格式
  {
    name: '新格式名稱',
    pattern: /你的正則表達式/gi,
    example: '範例: ABC-123',
    priority: 2,  // 數字越小優先級越高
    extract: (match) => ({
      productCode: match[1],
      confidence: 0.9
    })
  },
  
  // 現有格式...
];
```

### 測試品號提取

```bash
cd ~/clawd/skills/pdf-to-order
node product-code-patterns.js
```

---

## 🧪 如何判斷 PDF 類型

### 手動測試

```bash
# 使用檢測腳本
/tmp/check-pdf-type.sh your-file.pdf
```

### 腳本輸出範例

**文字型 PDF：**
```
=== PDF 類型檢測 ===
檔案: quote.pdf
📦 檔案大小: 48K
📝 提取文字長度: 523 字元

✅ 文字型 PDF（可直接處理）

前 10 行內容：
━━━━━━━━━━━━━━━━
百凌工业股份有限公司
報價單
品號: PRO-183
...
```

**圖片型 PDF：**
```
=== PDF 類型檢測 ===
檔案: scanned.pdf
📦 檔案大小: 2.1M
📝 提取文字長度: 3 字元

❌ 圖片型 PDF（需要 OCR）
   - 文字無法提取
   - 需要使用 Tesseract OCR
```

---

## 📊 效能與準確度

### 文字型 PDF

- **速度：** 快（< 1 秒）
- **準確度：** 100%
- **成本：** 無（本地處理）

### 圖片型 PDF（OCR）

- **速度：** 較慢（5-30 秒，取決於頁數）
- **準確度：** 85-95%（取決於圖片品質）
- **成本：** 無（本地處理，但耗 CPU）

### 提升 OCR 準確度

1. **提高掃描解析度：** 300 DPI 以上
2. **確保清晰對比：** 黑字白底最佳
3. **避免傾斜：** 文字保持水平
4. **良好光線：** 避免陰影和反光

---

## 🚀 使用流程

### 流程 A：文字型 PDF（自動）

```
用戶上傳 PDF → 偵測為文字型 → pdftotext 提取 → 解析品項 → 建立訂單
```

### 流程 B：圖片型 PDF（需 OCR）

```
用戶上傳 PDF → 偵測為圖片型 → PDF 轉圖片 → Tesseract OCR → 解析品項 → 建立訂單
```

### 智能自動判斷

系統會自動判斷 PDF 類型並選擇合適的處理方式：

```javascript
// 在 pdf-to-order/index.js 中
import { smartExtractText } from './ocr-support.js';

const result = await smartExtractText(pdfPath);
// 自動選擇 pdftotext 或 OCR
```

---

## ⚙️ 配置選項

### OCR 設定

```javascript
const ocrOptions = {
  language: 'chi_tra+eng',  // 繁體中文 + 英文
  dpi: 300,                 // 解析度
  outputDir: '/tmp/pdf-ocr' // 臨時檔案目錄
};

const result = await extractTextWithOcr(pdfPath, ocrOptions);
```

### 品號提取設定

```javascript
// 調整優先級
const patterns = PRODUCT_CODE_PATTERNS.sort((a, b) => a.priority - b.priority);

// 只使用高信心度的格式
const highConfidence = patterns.filter(p => p.priority <= 2);
```

---

## 🔧 疑難排解

### 問題 1: OCR 提取為空

**可能原因：**
- 圖片解析度太低
- 文字傾斜或模糊
- 繁體中文語言包未安裝

**解決方式：**
```bash
# 安裝繁體中文語言包
brew install tesseract-lang

# 提高 DPI（在 OCR 時）
const result = await extractTextWithOcr(pdf, { dpi: 400 });
```

### 問題 2: 品號識別錯誤

**可能原因：**
- PDF 格式特殊
- 品號格式不在已知列表中

**解決方式：**
1. 檢查實際 PDF 內容：
   ```bash
   pdftotext quote.pdf - | head -50
   ```

2. 新增對應的品號格式到 `product-code-patterns.js`

3. 測試新格式：
   ```bash
   node product-code-patterns.js
   ```

### 問題 3: OCR 速度慢

**優化方式：**
- 降低 DPI（300 → 200）
- 只處理關鍵頁面
- 預先裁切非必要區域

---

## 📝 最佳實踐

### 供應商提供 PDF 的建議

**最佳（文字型）：**
- 使用 Excel/Word 直接匯出 PDF
- 確保表格清晰、欄位對齊
- 使用標準品號格式（PRO-XXX）

**可接受（圖片型）：**
- 掃描解析度 ≥ 300 DPI
- 黑白模式（減少檔案大小）
- 文字水平、無傾斜
- 清晰對比、無陰影

**避免：**
- 手寫文字
- 低解析度掃描（< 150 DPI）
- 彩色背景、浮水印
- 嚴重傾斜或模糊

---

## 🎯 未來擴展

- [ ] **Claude Vision API：** 使用 AI 視覺模型處理複雜格式
- [ ] **表格檢測：** 智能識別表格結構
- [ ] **手寫辨識：** 支援手寫報價單
- [ ] **多語言：** 支援簡體中文、日文等
- [ ] **品號對照表：** 供應商品號 → 內部品號自動轉換

---

## 📚 參考資源

- [Tesseract OCR 官方文件](https://github.com/tesseract-ocr/tesseract)
- [Poppler 工具集](https://poppler.freedesktop.org/)
- [正則表達式測試](https://regex101.com/)

---

**最後更新：** 2026-02-05
