#!/usr/bin/env node
/**
 * 简单的 PDF 文件服务器
 * 提供 ~/clawd/public/pdf/ 目录的静态文件访问
 * 运行在端口 8889（Gateway 在 18789）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8889;
const PDF_DIR = path.join(process.env.HOME, 'clawd/public/pdf');

// 确保目录存在
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  // 只处理 /pdf/ 路径
  if (!req.url.startsWith('/pdf/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  // 提取文件名
  const filename = req.url.replace('/pdf/', '');
  const filepath = path.join(PDF_DIR, filename);

  // 检查文件是否存在
  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('PDF Not Found');
    return;
  }

  // 读取并发送 PDF
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
  console.log(`📄 PDF 文件服务器已启动`);
  console.log(`   端口: ${PORT}`);
  console.log(`   目录: ${PDF_DIR}`);
  console.log(`   访问: http://localhost:${PORT}/pdf/filename.pdf`);
  console.log('');
  console.log('按 Ctrl+C 停止服务器');
});
