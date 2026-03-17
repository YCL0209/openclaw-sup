# system-router

意圖路由器 — 接收 LLM 分類結果，驗證並分派到對應的處理邏輯。

## 觸發方式

由窗口 Agent 在分類完用戶意圖後呼叫：

```bash
node skills/system-router/index.js --intent '{"type":"email","params":{}}' --userId 8331678146
```

## 參數

- `--intent`：JSON 字串，包含 `type` 和 `params`
- `--userId`：用戶 ID

## 合法 type

`email` | `erp` | `reminder` | `query` | `chat`

## 輸出

JSON 到 stdout，格式：

```json
{ "ok": true, "action": "dispatched|query|chat", "data": { ... } }
```
