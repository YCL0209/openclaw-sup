#!/usr/bin/env node
/**
 * 簡單的 PDF 檔案伺服器
 * 提供 ~/clawd/public/pdf/ 目錄的靜態檔案存取
 * 運行在埠號 8889（Gateway 在 18789）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8889;
const PDF_DIR = path.join(process.env.HOME, 'clawd/public/pdf');

// 確保目錄存在
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  // 只處理 /pdf/ 路徑
  if (!req.url.startsWith('/pdf/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  // 提取檔案名稱
  const filename = req.url.replace('/pdf/', '');
  const filepath = path.join(PDF_DIR, filename);

  // 檢查檔案是否存在
  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('PDF Not Found');
    return;
  }

  // 讀取並傳送 PDF
  const stat = fs.statSync(filepath);
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': stat.size,
    'Content-Disposition': `inline; filename="${filename}"`
  });

  const fileStream = fs.createReadStream(filepath);
  fileStream.pipe(res);
});

server.listen(PORT, () => {
  console.log(`📄 PDF 檔案伺服器已啟動`);
  console.log(`   埠號: ${PORT}`);
  console.log(`   目錄: ${PDF_DIR}`);
  console.log(`   存取: http://localhost:${PORT}/pdf/filename.pdf`);
  console.log('');
  console.log('按 Ctrl+C 停止伺服器');
});
