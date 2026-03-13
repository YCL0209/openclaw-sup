# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Cron 排程任務範本

### 常用指令
```markdown
# 每 30 分鐘查詢信件（須指定 --to）
openclaw cron add --every 30m --name "查詢信件" --message "檢查是否有新信件" --announce --channel telegram --to <CHAT_ID>

# 每日早上 9 點執行的任務
openclaw cron add --cron "0 9 * * *" --name "每日任務" --message "要做的事" --announce --channel telegram --to <CHAT_ID>
```

### 參數說明
| 參數 | 用途 |
|------|------|
| `--every <duration>` | 固定間隔執行（如 30m, 1h, 2h） |
| `--cron <expr>` | Cron 表達式（5 格或 6 格） |
| `--name` | 任務名稱 |
| `--message` | 執行時傳給 Agent 的訊息 |
| `--announce` | 將結果回傳到聊天 |
| `--channel` | 傳送頻道（telegram, line, discord 等） |
| `--to` | 目標對象（必填！否則會傳送失敗） |

### 你的常用 ID
- **Telegram Chat ID:** 8331678146
