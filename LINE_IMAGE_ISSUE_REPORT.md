# LINE 圖片傳送問題診斷報告

## 📋 問題現狀

**症狀**：使用 `message` tool 傳送圖片到 LINE 失敗，錯誤代碼：`400 - Bad Request`

**嘗試的方法**：
1. `filePath` 參數 ❌
2. `path` 參數 ❌  
3. `media` 參數 ❌

**文字訊息**：✅ 正常傳送

---

## 🔍 根本原因

透過查看 OpenClaw LINE extension 的原始碼和測試檔案，發現：

### LINE API 的限制

LINE Messaging API **不支援直接上傳本地檔案**，必須滿足以下條件：

1. **必須使用 HTTPS URL**
   - 圖片必須託管在可公開存取的 HTTPS 伺服器上
   - LINE 伺服器會下載該 URL 的圖片然後傳送給使用者

2. **URL 格式要求**（從測試程式碼）
   ```javascript
   mediaUrl: "https://example.com/img.jpg"  // ✅ 正確
   mediaUrl: "/Users/xxx/image.png"          // ❌ 錯誤
   ```

3. **支援的參數**（從原始碼）
   ```javascript
   payload: {
     mediaUrl: "https://...",  // 單個圖片
     // 或
     mediaUrls: ["https://..."], // 多個圖片
   }
   ```

---

## ✅ 解決方案

### 方案 A：臨時本地查看（立即可用）

直接在 Mac 上開啟圖片：
```bash
open /Users/liaoyacheng/clawd/quotation-ORD-260123-SA7M.png
```

---

### 方案 B：設定檔案伺服器（推薦）

#### 步驟 1：創建靜態檔案伺服器

你已經有公開的 HTTPS webhook（用於 LINE），可以複用這個網域。

**選項 1 - 使用 Express 靜態檔案服務**
```javascript
// 在 ERP 或單獨的 Node.js 服務中
app.use('/files', express.static('/Users/liaoyacheng/clawd'));
```

**選項 2 - 使用 Nginx**
```nginx
location /files/ {
    alias /Users/liaoyacheng/clawd/;
    autoindex off;
}
```

**選項 3 - 使用簡單的 Python 伺服器（測試用）**
```bash
cd /Users/liaoyacheng/clawd
python3 -m http.server 8080
```
然後用 ngrok 或 Tailscale 暴露到公網。

#### 步驟 2：修改 generate-pdf skill

修改 `~/clawd/skills/generate-pdf/index.js`，在生成 PDF 後：

```javascript
// 生成 PDF 後
const pdfPath = `/Users/liaoyacheng/clawd/quotation-${orderNumber}.png`;

// 構建公開 URL
const publicUrl = `https://your-domain.com/files/quotation-${orderNumber}.png`;

// 使用 message tool 傳送
await message.send({
  channel: 'line',
  target: userId,
  mediaUrl: publicUrl,  // 關鍵：使用公開的 HTTPS URL
  message: `訂單 ${orderNumber} 的報價單`
});
```

---

### 方案 C：使用第三方儲存（雲端服務）

1. **AWS S3**
   - 上傳圖片到 S3
   - 生成短期 URL
   - 傳送到 LINE

2. **Imgur API**
   - 免費的圖片託管
   - 自動生成 HTTPS URL

3. **Cloudinary**
   - 支援圖片處理和 CDN
   - 免費方案夠用

---

## 📝 當前配置狀態

### LINE 配置（正常）
```json
{
  "channels": {
    "line": {
      "enabled": true,
      "channelAccessToken": "u75vgPcQTwBKPc...",
      "channelSecret": "cff8bf6583d7f6f7...",
      "webhookPath": "/line/webhook"
    }
  }
}
```

### Gateway 配置（正常）
```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback"
  }
}
```

---

## 🎯 推薦行動

1. **立即**：使用方案 A 查看當前圖片
2. **短期**：實施方案 B 步驟 1（設定檔案伺服器）
3. **中期**：修改 generate-pdf skill 自動使用公開 URL
4. **長期**：考慮方案 C（如果需要更好的穩定性和 CDN）

---

## 📚 參考資源

- **LINE Messaging API 文件**：https://developers.line.biz/en/docs/messaging-api/
- **OpenClaw LINE extension 原始碼**：`/opt/homebrew/lib/node_modules/clawdbot/extensions/line/`
- **測試檔案**：`channel.sendPayload.test.ts` (第 207-221 行證實需要 HTTPS URL)

---

*報告生成時間：2026-02-02*
*OpenClaw 版本：2026.1.24-3*
