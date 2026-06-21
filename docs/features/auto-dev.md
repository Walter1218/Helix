# Token 预算自动开发功能

## 概述

基于每日 token 上限，自动分析项目、识别需求、调度任务并执行开发。

## 配置

在 `~/.config/mimocode/mimocode.json` 中添加：

```json
{
  "token_budget": {
    "daily_limit": 20000000,
    "planning_ratio": 0.15,
    "execution_ratio": 0.70,
    "review_ratio": 0.10,
    "reserve_ratio": 0.05
  }
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `daily_limit` | 每日 token 上限 | 0 (不限) |
| `planning_ratio` | 规划阶段占比 | 0.15 |
| `execution_ratio` | 执行阶段占比 | 0.70 |
| `review_ratio` | 审查阶段占比 | 0.10 |
| `reserve_ratio` | 预留占比 | 0.05 |

## 命令

### 分析项目

```bash
mimo auto-dev analyze
mimo auto-dev analyze --path /path/to/project
mimo auto-dev analyze --budget 5000000
```

输出：
- 项目文件数、测试数、语言分布
- 识别出的需求列表（按优先级排序）
- 预算分配计划

### 执行自动开发

```bash
mimo auto-dev run
mimo auto-dev run --dry-run    # 仅预览计划
mimo auto-dev run --budget 10000000
```

流程：
1. 扫描项目 → 识别缺失项
2. 按优先级排序 → 根据预算选任务
3. 逐个执行 → 记录 token 消耗

### 查看预算

```bash
mimo auto-dev budget
```

显示：今日预算、已用、剩余、各用途分布

### 查看用量

```bash
mimo auto-dev usage
mimo auto-dev usage --days 30
```

### 生成报告

```bash
mimo auto-dev report
```

## 自动调度

### 完整流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Auto-Dev Pipeline                         │
├─────────────────────────────────────────────────────────────┤
│  1. 执行任务 ──→ mimo run "任务描述"                        │
│       ↓                                                      │
│  2. 编译验证 ──→ bun run build --single                    │
│       ↓                                                      │
│  3. 类型检查 ──→ bun typecheck                              │
│       ↓                                                      │
│  4. 运行测试 ──→ bun test                                   │
│       ↓                                                      │
│  5. Lint 检查 ─→ bun run lint                               │
│       ↓                                                      │
│  6. 文档更新 ──→ 更新 CHANGELOG (如有变更)                  │
│       ↓                                                      │
│  7. Git 提交 ──→ git add + commit + push                   │
└─────────────────────────────────────────────────────────────┘
```

**失败处理**：
- 任务执行失败 → 终止，回滚状态
- 编译失败 → 终止，回滚状态
- 测试/Lint 失败 → 继续，标记警告
- Git 推送失败 → 已提交，跳过推送

### 安装定时任务 (macOS)

```bash
# 安装 (每天凌晨2点自动执行)
./script/auto-dev/setup.sh install

# 查看状态
./script/auto-dev/setup.sh status

# 立即执行一次
./script/auto-dev/setup.sh run

# 干运行 (不实际执行)
./script/auto-dev/setup.sh run --dry-run

# 不推送远程
./script/auto-dev/setup.sh run --no-push

# 卸载
./script/auto-dev/setup.sh uninstall
```

### 主线任务

任务定义在 `.mimocode/roadmap.json`，包含：

| 里程碑 | 名称 | 状态 |
|--------|------|------|
| M1 | 自动开发能力完善 | 进行中 |
| M2 | 代码质量提升 | 待开始 |
| M3 | 文档完善 | 待开始 |
| M4 | 性能优化 | 待开始 |

调度器会自动：
1. 读取 roadmap.json 中的待办任务
2. 按优先级选择任务
3. 检查 token 预算
4. 执行任务并更新状态

### 日志

```bash
# 查看调度日志
cat ~/.local/share/mimocode/log/auto-dev-$(date +%Y-%m-%d).log

# 查看 launchd 日志
cat ~/.local/share/mimocode/log/auto-dev-launchd.log
```

## 需求识别规则

| 条件 | 生成的需求 | 优先级 |
|------|-----------|--------|
| 无测试文件 | 添加单元测试 | high |
| 无 README | 创建 README | medium |
| 无 docs 目录 | 添加文档 | medium |
| 测试覆盖率 < 20% | 提高测试覆盖率 | high |

## Token 预估

| 复杂度 | 基础 token |
|--------|-----------|
| simple | 5,000 |
| moderate | 20,000 |
| complex | 60,000 |
| epic | 150,000 |

按类别调整：
- feature: ×1.2
- bugfix: ×0.8
- test: ×0.7
- docs: ×0.4

## 数据库

新增两张表：
- `token_usage` - token 使用记录
- `daily_budget` - 每日预算快照

迁移文件：`migration/20260621071711_add-token-tracking-and-task-extensions/`

## 文件结构

```
src/
├── token/
│   ├── token.sql.ts      # 数据库 schema
│   ├── tracker.ts        # TokenTracker 服务
│   └── index.ts
├── automation/
│   ├── requirement-analyzer.ts   # 需求分析器
│   ├── complexity-estimator.ts   # 复杂度预估
│   ├── token-scheduler.ts        # Token 调度器
│   ├── auto-dev-workflow.ts      # 工作流引擎
│   ├── progress-tracker.ts       # 进度追踪
│   └── index.ts
├── cli/cmd/
│   └── auto-dev.ts       # CLI 命令
└── config/config.ts      # token_budget 配置

script/auto-dev/
├── scheduler.ts          # 调度器脚本
├── setup.sh              # 安装脚本
└── com.helix.auto-dev.plist  # launchd 配置

.mimocode/
└── roadmap.json          # 主线任务定义
```
