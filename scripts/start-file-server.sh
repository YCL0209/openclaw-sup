#!/bin/bash
# 启动临时文件服务器用于分享 PDF

PORT=8888
PDF_DIR="/Users/liaoyacheng/Desktop/異地備份/pdf"

echo "启动文件服务器..."
echo "访问地址: http://localhost:$PORT"
echo "PDF 目录: $PDF_DIR"
echo ""
echo "按 Ctrl+C 停止服务器"

cd "$PDF_DIR"
python3 -m http.server $PORT
