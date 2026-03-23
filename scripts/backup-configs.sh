#!/usr/bin/env bash
# backup-configs.sh — 備份 openclaw 關鍵設定檔，保留 7 天

set -euo pipefail

BASE_DIR="$HOME/.openclaw"
BACKUP_ROOT="$BASE_DIR/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
DEST="$BACKUP_ROOT/$TIMESTAMP"

# 要備份的檔案（相對於 BASE_DIR）
FILES=(
  "openclaw.json"
  "workspace/SOUL.md"
  "workspace/AGENTS.md"
  "workspace/skills/system-router/skill-registry.json"
  "workspace/skills/system-router/index.js"
  "workspace/HEARTBEAT.md"
)

# 建立備份資料夾並複製檔案（保留相對路徑）
for f in "${FILES[@]}"; do
  src="$BASE_DIR/$f"
  if [[ -f "$src" ]]; then
    mkdir -p "$DEST/$(dirname "$f")"
    cp "$src" "$DEST/$f"
  else
    echo "[WARN] 檔案不存在，跳過：$src"
  fi
done

echo "[OK] 備份完成：$DEST"

# 刪除 7 天前的備份資料夾
find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "[OK] 已清理 7 天前的備份"
