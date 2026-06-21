# Token 预算自动开发功能

> 基于每日 token 上限，围绕项目主线任务，自动调度、执行、验证并提交代码。

## 架构

```
launchd (每天 14:00)
  → scheduler.ts
    → 从 roadmap.json 选任务 (优先级排序)
    → 通过 Gateway API 执行
    → 7 步 Pipeline
    → 飞书通知 (成功/失败 + token 消耗)
```

## 当前配置

| 配置项 | 值 | 位置 |
|--------|-----|------|
| 每日 token 上限 | 20,000,000 | `~/.config/mimocode/mimocode.json` |
| 定时执行 | 每天 14:00 | `~/Library/LaunchAgents/com.helix.auto-dev.plist` |
| 主线任务 | `.mimocode/roadmap.json` | M1-M4 里程碑 |
| 飞书通知 | `oc_adb8a26e34983ef16da7589560e24f5a` | scheduler `--chat-id` |

## Pipeline (7 步)

| 步骤 | 命令 | 失败策略 |
|------|------|----------|
| 1. 执行任务 | Gateway API → Helix Agent | 终止 |
| 2. 编译验证 | `bun run build --single` | 终止 |
| 3. 类型检查 | `bun typecheck` | 警告 (预存问题) |
| 4. 测试 | `bun test` | 警告 (预存问题) |
| 5. Lint | `bun run lint` | 警告 |
| 6. 文档更新 | CHANGELOG | 继续 |
| 7. Git 提交 | `git add + commit + push` | 继续 |

**成功判定**：执行成功 + 编译通过 = 任务成功

## 飞书通知

每次执行完成后发送通知到飞书，包含：
- 任务结果 (成功/失败)
- Token 消耗 (本次/每日/剩余)
- Pipeline 各步骤状态
- 日志路径

## 手动命令

```bash
# 分析项目
bun run script/auto-dev/scheduler.ts --once --dry-run

# 执行任务
bun run script/auto-dev/scheduler.ts --once --chat-id <飞书chatId>

# 查看预算
mimo auto-dev budget

# 查看用量
mimo auto-dev usage --days 7

# 生成报告
mimo auto-dev report
```

## Launchd 管理

```bash
# 查看状态
launchctl list | grep helix

# 卸载
launchctl unload ~/Library/LaunchAgents/com.helix.auto-dev.plist

# 重新加载
launchctl load ~/Library/LaunchAgents/com.helix.auto-dev.plist
```

## 主线任务

定义在 `.mimocode/roadmap.json`，结构：

```json
{
  "milestones": [
    {
      "id": "M1",
      "name": "自动开发能力完善",
      "tasks": [
        {
          "id": "M1-T1",
          "title": "自动调度能力",
          "status": "done",
          "priority": "critical",
          "estimated_tokens": 50000
        }
      ]
    }
  ],
  "auto_dev_config": {
    "daily_token_limit": 20000000,
    "focus_milestones": ["M1", "M2", "M3", "M4"]
  }
}
```

调度器只从 `focus_milestones` 中选任务，按优先级排序。

## 文件结构

```
script/auto-dev/
├── scheduler.ts          # 调度器 (选任务 + 7步pipeline + 飞书通知)
├── setup.sh              # launchd 安装脚本
└── com.helix.auto-dev.plist  # launchd 配置

packages/opencode/src/
├── token/
│   ├── token.sql.ts      # token_usage + daily_budget 表
│   └── tracker.ts        # TokenTracker 服务
├── automation/
│   ├── requirement-analyzer.ts
│   ├── complexity-estimator.ts
│   ├── token-scheduler.ts
│   ├── auto-dev-workflow.ts
│   ├── progress-tracker.ts
│   └── index.ts
├── cli/cmd/auto-dev.ts   # CLI 命令
└── storage/db.ts         # 迁移容错 (migrateWithTolerance)

packages/feishu-gateway/src/router/
└── api-router.ts         # /api/task + /api/notify 端点

.mimocode/
└── roadmap.json          # 主线任务定义
```

## 安全规则

**禁止提交的内容：**
- `.dev-home/` — API keys 和本地配置
- `*.db` / `*.db-wal` / `*.db-shm` — 数据库文件
- `packages/*/dist/` — 编译产物
- `*.log` — 日志文件
- `node_modules/` — 依赖

这些规则已在 `.gitignore` 中配置。
