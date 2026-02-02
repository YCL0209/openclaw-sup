# ERP 整合文档

这个目录包含所有与 ERP 系统整合相关的文档。

## 📁 文档列表

### 通用文档

| 文档 | 说明 |
|------|------|
| `ERP_SKILLS_SETUP.md` | ERP Skills 设置指南 |
| `IMPLEMENTATION_CHECKLIST.md` | Clawdbot + ERP 整合实施检查清单 |

### Skills 特定文档

ERP 相关的 skills 文档位于各自的 skill 目录：

```
~/clawd/skills/
├── create-order/
│   ├── SKILL.md                          # Skill 主文档
│   ├── CONFIG.md                         # 配置说明
│   ├── ERP-INTEGRATION-ANALYSIS.md       # ERP 整合分析
│   └── erp-pdf-api.md                    # （已移至 generate-pdf）
│
├── generate-pdf/
│   ├── SKILL.md                          # Skill 主文档
│   └── erp-pdf-api.md                    # PDF API 技术规格
│
└── system-router.backup/
    └── SKILL.md                          # 路由器 skill（已禁用）
```

## 🚀 已实现的功能

### ✅ 建立订单 (create-order)
- 互动式订单建立流程
- 客户验证与新建
- 品项解析（支持价格格式 `@500`）
- ERP API 整合
- 繁体中文界面

**触发关键词：** 建立訂單、下單、訂購、我要訂、建單、創建訂單

### ✅ 生成 PDF (generate-pdf)
- 报价单生成
- 采购单生成
- 销货单生成
- ERP PDF API 整合

**触发关键词：** 生成 PDF、導出 PDF、生成報價單、生成採購單、生成銷貨單

## 📝 待实现的功能

### 🔄 查询订单 (query-order)
- [ ] 查询最近订单
- [ ] 按订单编号查询
- [ ] 按客户名称查询
- [ ] 按日期范围查询
- [ ] 按状态筛选

## 🔗 相关链接

- **ERP API 基础地址：** `http://localhost:3000`
- **认证方式：** Bearer JWT Token
- **主要端点：**
  - `/api/auth/login` - 登录认证
  - `/api/customers` - 客户管理
  - `/api/orders` - 订单管理
  - `/api/orders/:id/pdf` - PDF 生成

## 📞 技术支持

如有问题，请参考各 skill 目录中的 `SKILL.md` 文档。
