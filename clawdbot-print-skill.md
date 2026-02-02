# Clawdbot Print Label Skill 說明文件

> 本文件說明如何在 Clawdbot 中建立標籤列印 Skill，與 Windows 中繼 API 串接。

---

## 一、架構定位

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Mac (Clawdbot)                             │
│                                                                         │
│   LINE 使用者                                                            │
│       │                                                                 │
│       ▼                                                                 │
│   OpenClaw Gateway                                                      │
│       │                                                                 │
│       ▼                                                                 │
│   Agent (理解意圖)                                                       │
│       │                                                                 │
│       ▼                                                                 │
│   ┌─────────────────────────────────┐                                   │
│   │  Print Label Skill              │  ← 這份文件要建立的                │
│   │  - 解析使用者輸入                 │                                   │
│   │  - 組裝列印請求                   │                                   │
│   │  - 發送 HTTP 到 Windows          │                                   │
│   │  - 回傳結果給 Agent              │                                   │
│   └─────────────────────────────────┘                                   │
│                    │                                                    │
└────────────────────┼────────────────────────────────────────────────────┘
                     │
                     │ HTTP POST
                     ▼
              Windows 中繼 API
              (見另一份文件)
```

---

## 二、Skill 目錄結構

在 Clawdbot 的 skills 資料夾中建立：

```
~/clawd/skills/
└── print-label/
    ├── SKILL.md          # Skill 說明（給 Agent 看）
    └── index.js          # Skill 程式碼
```

---

## 三、SKILL.md 內容

```markdown
---
name: print-label
description: 列印標籤到精臣標籤機
---

# Print Label Skill

## 功能說明

透過 Windows 中繼 API，將標籤內容傳送到精臣標籤機列印。

## 支援的列印內容

- 文字（產品名稱、說明等）
- 一維條碼（CODE128、EAN13 等）
- QR Code
- 圖片（Base64 格式）

## 輸入參數

| 參數 | 必填 | 說明 |
|------|------|------|
| name | 是 | 產品名稱或標籤標題 |
| barcode | 否 | 條碼內容 |
| qrcode | 否 | QR Code 內容（如網址） |
| quantity | 否 | 列印數量，預設 1 |

## 使用範例

使用者可能會說：

- 「列印標籤：產品 A」
- 「印 3 張標籤，名稱是 iPhone 16，條碼 ABC123」
- 「列印 QR Code 標籤，內容是 https://example.com」
- 「幫我印標籤，產品：藍牙耳機，條碼：BT-001，數量：5」

## 輸出格式

成功時回傳：
```
✅ 標籤列印成功！
產品：iPhone 16
數量：3 張
```

失敗時回傳：
```
❌ 列印失敗：找不到標籤機，請確認 Windows 電腦和標籤機已開啟
```

## 注意事項

- 需確保 Windows 中繼服務已啟動
- 標籤機需透過 USB 連接到 Windows 電腦
- 標籤機需開機且機蓋關閉
```

---

## 四、index.js 程式邏輯

### 4.1 核心流程

```
接收 Agent 傳入的參數
        │
        ▼
解析並驗證參數
        │
        ▼
組裝列印請求 JSON
        │
        ▼
發送 HTTP POST 到 Windows 中繼 API
http://10.0.5.125:3000/print-label
        │
        ▼
處理回應
        │
        ├── 成功 → 回傳「✅ 已列印 X 張標籤」
        │
        └── 失敗 → 回傳「❌ 列印失敗：錯誤原因」
```

### 4.2 設定檔

建議將中繼 API 位址和 API Key 放在環境變數或設定檔：

```javascript
// 設定
const PRINTER_API_URL = process.env.PRINTER_API_URL || 'http://10.0.5.125:3000';
const PRINTER_API_KEY = process.env.PRINTER_API_KEY || 'your-secret-key';
```

### 4.3 請求格式

發送到 Windows 中繼 API 的 JSON 格式：

```javascript
{
  "label": {
    "width": 40,      // 標籤寬度 (mm)
    "height": 30,     // 標籤高度 (mm)
    "rotate": 0       // 旋轉角度
  },
  "content": [
    {
      "type": "text",
      "x": 5,
      "y": 5,
      "width": 30,
      "height": 10,
      "text": "產品名稱",
      "fontSize": 14,
      "bold": true,
      "align": "center"
    },
    {
      "type": "barcode",
      "x": 5,
      "y": 18,
      "width": 30,
      "height": 10,
      "content": "ABC123456",
      "codeType": "CODE128",
      "showText": true
    }
  ],
  "copies": 1
}
```

### 4.4 回應處理

```javascript
// 成功回應
{
  "success": true,
  "message": "已列印 1 張標籤",
  "printedAt": "2026-02-02T10:30:00Z"
}

// 失敗回應
{
  "success": false,
  "error": "PRINTER_NOT_FOUND",
  "message": "找不到標籤機，請確認 USB 連接"
}
```

### 4.5 錯誤碼對照

| 錯誤碼 | 回覆使用者的訊息 |
|--------|------------------|
| `SERVICE_NOT_RUNNING` | Windows 列印服務未啟動，請確認電腦狀態 |
| `PRINTER_NOT_FOUND` | 找不到標籤機，請確認 USB 連接 |
| `PRINTER_BUSY` | 標籤機忙碌中，請稍後再試 |
| `COVER_OPEN` | 標籤機蓋子未關閉 |
| `LOW_BATTERY` | 標籤機電量不足，請充電 |
| `NETWORK_ERROR` | 無法連接 Windows 電腦 |

---

## 五、標籤版面設計

### 5.1 預設版面（40mm x 30mm）

```
┌────────────────────────────────────────┐
│                                        │
│            [產品名稱]                   │  y=5, 文字置中
│                                        │
│         |||||||||||||||||||            │  y=18, 條碼
│           ABC123456                    │
│                                        │
└────────────────────────────────────────┘
```

### 5.2 座標系統

- 原點 (0, 0) 在左上角
- 單位：毫米 (mm)
- X 軸向右增加
- Y 軸向下增加

### 5.3 常用版面配置

**純文字標籤：**
```javascript
content: [
  { type: "text", x: 5, y: 12, width: 30, height: 10, text: "產品名稱", fontSize: 16, align: "center" }
]
```

**文字 + 條碼：**
```javascript
content: [
  { type: "text", x: 5, y: 5, width: 30, height: 8, text: "產品名稱", fontSize: 12 },
  { type: "barcode", x: 5, y: 15, width: 30, height: 12, content: "ABC123", codeType: "CODE128" }
]
```

**文字 + QR Code：**
```javascript
content: [
  { type: "text", x: 20, y: 5, width: 18, height: 8, text: "產品名稱", fontSize: 10 },
  { type: "qrcode", x: 2, y: 5, width: 15, height: 15, content: "https://example.com" }
]
```

---

## 六、環境變數設定

在 Clawdbot 的環境中設定：

```bash
# .env 或環境變數
PRINTER_API_URL=http://10.0.5.125:3000
PRINTER_API_KEY=your-secret-key-here
```

---

## 七、測試方式

### 7.1 直接測試 Skill

透過 LINE 傳送測試訊息：

- 「列印測試標籤」
- 「印標籤：測試產品，數量 1」

### 7.2 檢查 Windows 連線

在 Mac 終端機：

```bash
# 測試網路連線
ping 10.0.5.125

# 測試 API 連線
curl http://10.0.5.125:3000/printer/status
```

---

## 八、部署清單

- [ ] 建立 `skills/print-label/` 目錄
- [ ] 建立 `SKILL.md` 檔案
- [ ] 建立 `index.js` 檔案
- [ ] 設定環境變數 `PRINTER_API_URL`
- [ ] 設定環境變數 `PRINTER_API_KEY`
- [ ] 重啟 Clawdbot Gateway
- [ ] 測試列印功能

---

## 九、相依文件

- **Windows 中繼 API 文件**：說明 Windows 端的服務建置方式
- **精臣打印機 API 文檔**：完整的 SDK 參考

---

**文件版本**：1.0  
**建立日期**：2026-02-02  
**適用對象**：Clawdbot Skill 開發
