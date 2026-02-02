# LINE 图片发送问题诊断报告

## 📋 问题现状

**症状**：使用 `message` tool 发送图片到 LINE 失败，错误代码：`400 - Bad Request`

**尝试的方法**：
1. `filePath` 参数 ❌
2. `path` 参数 ❌  
3. `media` 参数 ❌

**文本消息**：✅ 正常发送

---

## 🔍 根本原因

通过查看 OpenClaw LINE extension 的源代码和测试文件，发现：

### LINE API 的限制

LINE Messaging API **不支持直接上传本地文件**，必须满足以下条件：

1. **必须使用 HTTPS URL**
   - 图片必须托管在可公开访问的 HTTPS 服务器上
   - LINE 服务器会下载该 URL 的图片然后发送给用户

2. **URL 格式要求**（从测试代码）
   ```javascript
   mediaUrl: "https://example.com/img.jpg"  // ✅ 正确
   mediaUrl: "/Users/xxx/image.png"          // ❌ 错误
   ```

3. **支持的参数**（从源代码）
   ```javascript
   payload: {
     mediaUrl: "https://...",  // 单个图片
     // 或
     mediaUrls: ["https://..."], // 多个图片
   }
   ```

---

## ✅ 解决方案

### 方案 A：临时本地查看（立即可用）

直接在 Mac 上打开图片：
```bash
open /Users/liaoyacheng/clawd/quotation-ORD-260123-SA7M.png
```

---

### 方案 B：设置文件服务器（推荐）

#### 步骤 1：创建静态文件服务器

你已经有公开的 HTTPS webhook（用于 LINE），可以复用这个域名。

**选项 1 - 使用 Express 静态文件服务**
```javascript
// 在 ERP 或单独的 Node.js 服务中
app.use('/files', express.static('/Users/liaoyacheng/clawd'));
```

**选项 2 - 使用 Nginx**
```nginx
location /files/ {
    alias /Users/liaoyacheng/clawd/;
    autoindex off;
}
```

**选项 3 - 使用简单的 Python 服务器（测试用）**
```bash
cd /Users/liaoyacheng/clawd
python3 -m http.server 8080
```
然后用 ngrok 或 Tailscale 暴露到公网。

#### 步骤 2：修改 generate-pdf skill

修改 `~/clawd/skills/generate-pdf/index.js`，在生成 PDF 后：

```javascript
// 生成 PDF 后
const pdfPath = `/Users/liaoyacheng/clawd/quotation-${orderNumber}.png`;

// 构建公开 URL
const publicUrl = `https://your-domain.com/files/quotation-${orderNumber}.png`;

// 使用 message tool 发送
await message.send({
  channel: 'line',
  target: userId,
  mediaUrl: publicUrl,  // 关键：使用公开的 HTTPS URL
  message: `訂單 ${orderNumber} 的報價單`
});
```

---

### 方案 C：使用第三方存储（云服务）

1. **AWS S3**
   - 上传图片到 S3
   - 生成短期 URL
   - 发送到 LINE

2. **Imgur API**
   - 免费的图片托管
   - 自动生成 HTTPS URL

3. **Cloudinary**
   - 支持图片处理和CDN
   - 免费套餐够用

---

## 📝 当前配置状态

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

## 🎯 推荐行动

1. **立即**：使用方案 A 查看当前图片
2. **短期**：实施方案 B 步骤 1（设置文件服务器）
3. **中期**：修改 generate-pdf skill 自动使用公开 URL
4. **长期**：考虑方案 C（如果需要更好的稳定性和CDN）

---

## 📚 参考资源

- **LINE Messaging API 文档**：https://developers.line.biz/en/docs/messaging-api/
- **OpenClaw LINE extension 源码**：`/opt/homebrew/lib/node_modules/clawdbot/extensions/line/`
- **测试文件**：`channel.sendPayload.test.ts` (第 207-221 行证实需要 HTTPS URL)

---

*报告生成时间：2026-02-02*
*OpenClaw 版本：2026.1.24-3*
