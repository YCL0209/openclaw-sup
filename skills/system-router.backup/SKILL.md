---
name: system-router
description: ERP 訂單系統路由器。檢測用戶意圖關鍵詞（建立訂單、生成訂單、查詢訂單、訂單），自動識別並路由到對應的 skill（如 create-order、query-order）。用於 Clawdbot 中央意圖分發，根據用戶輸入的自然語言自動匹配訂單相關操作。
---

# System Router - ERP 訂單系統路由器

## 功能概述

`system-router` 是 Clawdbot 與 ERP 系統的中央路由層，負責：

1. **意圖偵測** — 識別用戶想執行的操作類型
2. **自動路由** — 將用戶請求導向對應的 skill
3. **上下文保留** — 保持對話連貫性

## 觸發關鍵詞

### 建立/新增訂單
- 「建立訂單」
- 「生成訂單」
- 「新訂單」
- 「下訂單」
- 「建單」

### 查詢訂單
- 「查詢訂單」
- 「查訂單」
- 「訂單狀態」
- 「看訂單」

### 訂單 (前綴詞)
- 「訂單…」（泛指訂單相關）

## 路由規則

```
輸入訊息 
  ↓
[意圖分析] — 使用 Claude 識別意圖
  ↓
  ├─ Intent: CREATE_ORDER → 呼叫 create-order skill
  ├─ Intent: QUERY_ORDER → 呼叫 query-order skill（未來實現）
  ├─ Intent: UNKNOWN → 回覆「不確定您的意圖」
  └─ Intent: NOT_RELEVANT → 進行普通對話
```

## 使用方式

當用戶傳送以下類型的訊息時，system-router 自動觸發：

### 範例 1: 建立訂單

```
用戶：幫我建立訂單，客戶王小明，A產品x2

system-router 分析：
  - 關鍵詞：「建立訂單」
  - 意圖：CREATE_ORDER
  - 操作：路由到 create-order skill
  
create-order skill 接手：
  - 解析訂單資訊
  - 與 ERP API 互動
```

### 範例 2: 查詢訂單

```
用戶：查詢訂單編號 ORD26ABCXYZ

system-router 分析：
  - 關鍵詞：「查詢訂單」
  - 意圖：QUERY_ORDER
  - 操作：路由到 query-order skill（未來實現）
```

### 範例 3: 模糊訂單相關

```
用戶：訂單怎麼建？

system-router 分析：
  - 關鍵詞：「訂單」
  - 意圖：UNKNOWN（因為涉及多個可能操作）
  - 操作：詢問用戶「您是想建立訂單還是查詢訂單？」
```

## 實現細節

### intent_map.json — 意圖詞彙表

系統使用一份關鍵詞詞表快速初步篩選：

```json
{
  "CREATE_ORDER": [
    "建立訂單", "生成訂單", "新訂單", "下訂單", "建單", 
    "create order", "new order"
  ],
  "QUERY_ORDER": [
    "查詢訂單", "查訂單", "訂單狀態", "看訂單", "訂單進度",
    "query order", "order status"
  ],
  "UNKNOWN": [
    "訂單", "order"
  ]
}
```

### 分析流程

1. **快速匹配** — 檢查訊息是否包含 CREATE_ORDER / QUERY_ORDER 的精確關鍵詞
2. **AI 分析** — 如果快速匹配不確定，用 Claude 分析用戶意圖
3. **路由** — 根據偵測結果呼叫對應 skill

### 上下文保留

在 Clawdbot 的對話上下文中保存：

```json
{
  "routerContext": {
    "lastIntent": "CREATE_ORDER",
    "lastSkill": "create-order",
    "timestamp": "2026-01-28T16:10:00Z"
  }
}
```

## 配置

在 Clawdbot config 中設定 system-router：

```yaml
skills:
  system-router:
    enabled: true
    priority: 100  # 高優先級，在其他 skill 前執行
    keywords:
      - "建立訂單"
      - "生成訂單"
      - "查詢訂單"
      - "訂單"
```

## 錯誤處理

| 情況 | 回覆 |
|------|------|
| 意圖不清楚 | 「我沒有完全理解您的需求。您想建立訂單、查詢訂單，還是有其他需求？」 |
| 多個可能意圖 | 「您似乎想做多件事情。請先告訴我，您要建立訂單還是查詢訂單？」 |
| 訊息不相關 | 正常對話（不觸發路由） |

## 未來擴展

- **MODIFY_ORDER** — 編輯訂單
- **CANCEL_ORDER** — 取消訂單
- **ORDER_HISTORY** — 訂單歷史紀錄
- **INVENTORY_CHECK** — 庫存查詢

---

## 技術細節（供開發者參考）

### 與 Clawdbot 框架整合

system-router 需要在 Clawdbot 的訊息處理管道中的最前端執行：

```
訊息到達 
  → [system-router] 意圖偵測 + 路由
  → 如無路由 → 進入普通對話
  → 回覆用戶
```

### Claude 提示詞模板

```
你是一個訂單系統意圖分析器。分析用戶的訊息，識別他們想執行的操作。

用戶訊息：「{message}」

可能的意圖：
- CREATE_ORDER: 用戶想建立新訂單
- QUERY_ORDER: 用戶想查詢訂單狀態
- UNKNOWN: 無法確定（多種可能）
- NOT_RELEVANT: 與訂單無關

請回覆 JSON 格式：
{
  "intent": "CREATE_ORDER|QUERY_ORDER|UNKNOWN|NOT_RELEVANT",
  "confidence": 0.0-1.0,
  "reasoning": "簡要說明",
  "suggestedSkill": "create-order|query-order|null"
}
```

---

*此 skill 是 Clawdbot + ERP 整合方案的核心路由層。*
