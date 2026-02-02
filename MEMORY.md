# 💾 配置管理重要事项

## Clawdbot 配置策略

### ❌ 错误做法（已修正）
- **不要**创建多个配置文件副本（.bak, .bak.1 等）
- Clawdbot 可能同时读多个配置源，导致混乱
- 2026-01-29 曾因备份文件导致配置冲突

### ✅ 正确做法
**只维护一份活动配置文件**

| 配置 | 位置 | 用途 |
|------|------|------|
| **全域配置** | `~/.clawdbot/clawdbot.json` | Clawdbot 本体设置（LINE、Gateway、agents 等） |
| **Skill 配置** | `~/clawd/skills/<skill-name>/.env` | 单个 skill 的环境变数 |

### 📋 当前的配置位置

1. **~/.clawdbot/clawdbot.json** （单一来源）
   - LINE Channel 配置
   - Gateway 设置
   - Agent 默认模型
   - 不包含 ERP 登入信息

2. **~/clawd/skills/create-order/.env**
   - ERP_API_URL
   - ERP_TAX_ID
   - ERP_BOT_EMAIL
   - ERP_BOT_PASSWORD

3. **~/clawd/skills/system-router/.env**
   - 路由器配置（目前为空）

### 🔧 修改配置的规则

- **修改 Clawdbot 全局设置** → 编辑 `~/.clawdbot/clawdbot.json`
- **修改 ERP 登入信息** → 编辑 `~/clawd/skills/create-order/.env`
- **修改完后** → 立即运行 `clawd gateway restart`
- **不要**创建 .bak 备份文件

### 📝 配置修改历史

**2026-01-29**
- 问题：多个 .bak 文件导致配置混乱
- 原因：我不了解 Clawdbot 的配置管理机制
- 解决：删除所有 clawdbot.json.bak* 文件，保留唯一配置源
- 状态：✅ 已修复

---

## 其他重要配置信息

### Clawdbot 基本信息
- **工作目录**：`~/clawd/`
- **配置目录**：`~/.clawdbot/`
- **Skills 目录**：`~/clawd/skills/`
- **Gate way 端口**：18789

### ERP 系统信息
- **API 地址**：http://localhost:3000
- **统编**：00091103
- **Bot Email**：info@sui-yao.com
- **Bot 密码**：000000（已存储在 .env）

### LINE 配置
- **enabled**：true
- **Channel**：已连接
- **接收消息**：✅ 工作中

### Skills 状态
- **system-router**：✅ 创建完成
- **create-order**：✅ 创建完成（待测试）

---

## 🎯 下一步

1. 重启 Clawdbot：`clawd gateway restart`
2. 测试 `/order` 命令
3. 验证 ERP 订单建立功能

---

## 🧹 系统清理记录

**2026-02-02**
- 移除旧的 Clawdbot LaunchAgent (`com.clawdbot.gateway.plist`)
- 卸载 clawdbot npm 包（释放 ~481MB）
- 清理多余配置备份（只保留最新 2 个 .bak 文件）
- **当前唯一运行**：OpenClaw (ai.openclaw.gateway)
- **配置文件位置**：`~/.openclaw/openclaw.json`

---

*最后更新：2026-02-02 11:41*
