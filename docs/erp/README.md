# ERP 整合文件

這個目錄包含所有與 ERP 系統整合相關的文件。

## 📁 文件清單

### 通用文件

| 文件 | 說明 |
|------|------|
| `ERP_SKILLS_SETUP.md` | ERP Skills 設定指南 |
| `IMPLEMENTATION_CHECKLIST.md` | Clawdbot + ERP 整合實施檢查清單 |

### Skills 特定文件

ERP 相關的 skills 文件位於各自的 skill 目錄：

```
~/clawd/skills/
├── create-order/
│   ├── SKILL.md                          # Skill 主文件
│   ├── CONFIG.md                         # 配置說明
│   ├── ERP-INTEGRATION-ANALYSIS.md       # ERP 整合分析
│   └── erp-pdf-api.md                    # （已移至 generate-pdf）
│
├── generate-pdf/
│   ├── SKILL.md                          # Skill 主文件
│   └── erp-pdf-api.md                    # PDF API 技術規格
│
└── system-router.backup/
    └── SKILL.md                          # 路由器 skill（已停用）
```

## 🚀 已實現的功能

### ✅ 建立訂單 (create-order)
- 互動式訂單建立流程
- 客戶驗證與新建
- 品項解析（支援價格格式 `@500`）
- ERP API 整合
- 繁體中文介面

**觸發關鍵詞：** 建立訂單、下單、訂購、我要訂、建單、創建訂單

### ✅ 生成 PDF (generate-pdf)
- 報價單生成
- 採購單生成
- 銷貨單生成
- ERP PDF API 整合

**觸發關鍵詞：** 生成 PDF、匯出 PDF、生成報價單、生成採購單、生成銷貨單

## 📝 待實現的功能

### 🔄 查詢訂單 (query-order)
- [ ] 查詢最近訂單
- [ ] 按訂單編號查詢
- [ ] 按客戶名稱查詢
- [ ] 按日期範圍查詢
- [ ] 按狀態篩選

## 🔗 相關連結

- **ERP API 基礎位址：** `http://localhost:3000`
- **認證方式：** Bearer JWT Token
- **主要端點：**
  - `/api/auth/login` - 登入認證
  - `/api/customers` - 客戶管理
  - `/api/orders` - 訂單管理
  - `/api/orders/:id/pdf` - PDF 生成

## 📞 技術支援

如有問題，請參考各 skill 目錄中的 `SKILL.md` 文件。
