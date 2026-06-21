<h1 align="center">🧬 Helix — 一念三千</h1>

<p align="center">
  <strong>基于 MiMo-Code 引擎，面向生产环境的自主代码任务执行与自我进化系统</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | 中文
</p>

---

## 一句话介绍

Helix 是一个**能自主执行复杂代码任务并自我进化**的 AI 智能体。你只需描述目标，它会自动规划、执行、验证，从执行轨迹中学习并持续改进——无需人工干预。

---

## 为什么做 Helix？

今天的 AI 编程助手大多是**交互式伴侣**——它们帮你写代码，但方向盘仍在你手里。Helix 要解决的是 **"Agent 从 Demo 到生产可用"之间的工程鸿沟**：

| 问题 | Helix 的解法 |
|------|-------------|
| **长任务中途失败** | Hybrid FSM + Workflow Journal 持久化 + 自适应超时（含空闲/死循环检测） |
| **脏数据污染模型** | `HeuristicFilter` 网关——OOM、超时、基础设施失败等物理隔离，不进入进化循环 |
| **自主执行不安全** | Shadow Worktree（Git 级隔离）+ AST 级命令过滤 + VFS 沙箱 |
| **记忆膨胀与污染** | BM25 + Vector 混合 RAG，基于代码变更自动代谢过时记忆 |
| **过拟合测试用例** | 回归测试集（20+ 通用任务）+ DPO 微调 + 规则生命周期管理 |
| **Agent 推理不可观测** | `TraceReporter` + `AlignmentGuard`——完整执行树追踪 + 实时偏离告警 |

---

## 我们的路径：与 MiMo-Code 的关系

Helix **不是从零 fork**。它完整继承了 MiMo-Code 引擎（Bun 运行时、Effect 框架、工具注册表、Actor 系统、多 Provider 支持），并**在其上工程化了一层面向自主生产的增强**。

### 保留了什么（MiMo-Code 引擎）
- 多智能体模式（`build` / `plan` / `compose`）
- TUI / CLI / HTTP API / MCP Server 多入口架构
- 基于 Effect 的函数式服务层
- SQLite FTS5 + Drizzle ORM 持久层
- 子智能体并行与生命周期管理

### 新增了什么（Helix 层）

| 能力层 | MiMo-Code（原始） | Helix（本仓库） |
|--------|------------------|----------------|
| **可观测性** | ❌ 无 | ✅ `TraceReporter` + `HeuristicFilter` + `AlignmentGuard` |
| **记忆检索** | 仅 SQLite FTS5 | ✅ BM25 + Vector 混合 RAG（`sqlite-vec` + Embedder）双路加权排序 |
| **进化飞轮** | ❌ 无 | ✅ `script/dogfooding/` 14 个工具：自动用例生成、DPO 导出、定时进化循环 |
| **安全沙箱** | 基础 Shadow Worktree | ✅ + VFS 沙箱 + AST 级 `ToolInterceptor` + `AlignmentGuard` 收件箱纠偏 |
| **IM 集成** | ❌ 无 | ✅ 原生飞书 Gateway，完全自主模式、自适应超时、实时进度推送 |
| **工作流引擎** | 脚本化运行时 | ✅ + `vfs-sandbox.ts`、全局信号量并发控制、断点续跑 |
| **文档体系** | 功能特性说明 | ✅ 架构白皮书、能力路线图、进化闭环设计文档 |

---

## 核心创新点

### 1. 进化飞轮（Self-Improving Agent）—— 逃离 Prompt 调优跑步机

唯一让 Agent 持续变强的方式，是让它从自己的执行轨迹中学习。

```
执行 → 轨迹记录 → 启发式过滤 → DPO 数据集导出 →
夜间离线 Prompt 优化 → 回归测试验证 → 规则注入 → 下一轮执行
```

- **`generate_cases.ts --daily-expand`**：每天自动生成 50+ 对抗性用例，按近期失败率动态倾斜采样权重（自适应采样），防止"偏科"
- **`export_dpo.ts`**：导出 Chosen/Rejected JSONL，内置 **Judge 验证门**——防止"删断言骗通过"、代码量缩水至 30%、差异过小的作弊轨迹进入数据集
- **`beta_evolution_loop.ts`**：智能进程守护者，按任务复杂度分级观测（`COMP` 30分钟 / `AST` 15分钟 / `PLAN` 5分钟），只在真正卡死时才杀进程
- **`setup_local_cron.sh`**：macOS `launchd` 每天 11:50 自动运转飞轮

### 2. 可观测性层（Agent 的神经系统）

```ts
// TraceReporter：类型安全的执行树追踪
TraceNodeEvent = { id, type: "node_start|action|decision|error", status, timestamp }

// HeuristicFilter：脏数据网关
DIRTY_PATTERNS = [/timeout/i, /out of memory/i, /toolinterceptor blocked/i]

// AlignmentGuard：实时偏离纠偏，可直接投递到 Actor 收件箱
inbox.send({ senderActorID: "alignment-guard", content: "<alignment-guard>..." })
```

这是**生产级 Agent 的必备基础设施**——没有观测，就没有进化。

### 3. 混合记忆系统（FTS5 + Vector RAG）

```ts
// 双路检索加权融合
const combined = bm25Score * 0.6 + vectorScore * 0.4
const boost = 双路同时命中 ? 1.3 : 1.0
```

- **FTS5 BM25**：精确匹配关键词、文件路径、工具名
- **Vector RAG**：语义理解用户意图，召回相关但字面不匹配的记忆
- **Memory Decay**：基于代码变更自动老化记忆，防止记忆污染

### 4. 安全优先的自主执行

- **Shadow Worktree**：每次危险操作都在 `git worktree` 隔离目录执行，分支 `mimocode/{name}`；成功自动提交，失败自动清理
- **AST 级命令过滤**：`shell-tokenize.ts` 执行前解析命令结构，拦截 `rm -rf /`、`> /etc/passwd` 等高危操作
- **VFS 沙箱**：Copy-on-Write 文件覆盖层，工作流内文件操作不污染主工作区

### 5. 飞书 IM —— 真正无人值守的模式

与每步都要确认的"聊天机器人"不同，Helix 的飞书 Gateway 支持**完全自主执行**：

- **自适应超时**：基础 3 分钟 → 每次延长 3 分钟 → 最多 15 分钟，每次延长前评估任务偏离状态
- **自动回答追问**：检测到 `AskUserQuestion` 时自动回答"继续执行，使用本地资源自主完成任务"
- **实时进度可视化**：流式输出智能体推理过程和工具调用状态到终端

### 6. VS Code 扩展 —— 事件驱动 GUI

VS Code 扩展（`sdks/vscode`）提供完整的智能体集成 GUI 面板：

- **SSE 流式渲染**：通过 `/event` SSE 流实时渲染智能体的思考 → 工具调用 → 文本结论（非一次性返回）
- **6 模式切换**：Ask / Build / Plan / Compose / Loop / Max
- **事件驱动**：监听 `session.status`、`permission.asked`、`question.asked`、`session.error`、`session.retry.attempt`、`session.diff`、`task.updated` —— 无轮询
- **两级工具展示**：InlineTool（pending/running 单行）→ BlockTool（completed 带输出面板），超 10 行自动折叠
- **思考卡片**：可折叠的"Thought"卡片，展示标题 + 耗时，点击展开正文
- **真实数据**：在线模式从 API 拉取 task/todo，不使用 mock 数据
- **SSE 容错**：20s 心跳 + 自动重连

### 7. Auto-Loop 工作流（Plan → Execute → Test → Heal → Distill）

Helix 实现了完整的自主工程循环，自动迭代直到目标达成：

```bash
# 启用实验性 workflow 工具
export MIMOCODE_EXPERIMENTAL_WORKFLOW_TOOL=1

# 运行 auto-loop 工作流
mimo run "Use the workflow tool to run auto-loop with args: '你的任务描述'"
```

**循环阶段：**
1. **Plan（规划）**：分析目标，探索代码库，制定执行计划
2. **Execute（执行）**：使用可用工具实施代码修改
3. **Test（测试）**：运行测试验证修改是否正确
4. **Heal（自愈）**：如果测试失败，诊断根因并修复（最多 3 次尝试）
5. **Distill（蒸馏）**：评估完成度，提取经验，决定下一步

**核心特性：**
- 自愈能力：自动诊断并修复测试失败
- 迭代执行：最多 5 个规划-执行-测试循环
- 持久化：工作流日志支持断点续跑

---

## 快速开始

### 环境准备（首次使用）

```bash
# 1. 安装 Bun 运行时
curl -fsSL https://bun.sh/install | bash

# 2. 安装依赖
bun install

# 3. 编译核心引擎（首次必须）
bun run packages/opencode/script/build.ts
# 或仅编译当前平台（更快）
bun run packages/opencode/script/build.ts --single
```

### 方式一：VS Code 扩展（推荐，图形界面）

```bash
# 1. 编译核心引擎（首次必须）
bun run packages/opencode/script/build.ts --single

# 2. 编译 VS Code 扩展
cd sdks/vscode && bun install && bun run package

# 3. 安装 VSIX
# 在 VS Code 中：Extensions → ... → Install from VSIX → 选择 sdks/vscode/*.vsix

# 4. 配置 API Key
# 全局配置：~/.config/mimocode/mimocode.json
# 参考 mimocode.example.json 填入你的 Token Plan Key
```

启动后按 `Cmd+Esc`（Mac）/ `Ctrl+Esc`（Win/Linux）打开 GUI 面板。

### 方式二：命令行 TUI / CLI

```bash
# 交互式 TUI（默认入口）
mimo

# 单次任务执行（Headless）
mimo run "重构 src/types.ts，提取公共类型到独立模块"

# HTTP API 守护进程（供 GUI / 网关调用）
mimo serve --port 3095

# Web 界面（启动 server + 浏览器）
mimo web
```

### 方式三：飞书 IM（完全自主模式）

```bash
# 1. 配置飞书凭证
cd packages/feishu-gateway
cp .env.example .env
# 编辑 .env 填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET

# 2. 一键启动（mimo serve + feishu-gateway）
./start-feishu.sh
```

然后在飞书中给机器人发消息即可。机器人会自主规划、执行、验证，直到完成。

### 方式四：Desktop 桌面应用（开发中）

```bash
cd packages/desktop
bun install
bun dev              # 开发模式（热更新）
# 或构建打包
bun run build && bun run package:mac   # macOS
```

### 方式五：启动进化飞轮（开发者）

```bash
# 生成测试用例
bun run script/dogfooding/generate_cases.ts

# 导出 DPO 数据集
bun run script/dogfooding/export_dpo.ts

# 启动定时进化任务
bash script/dogfooding/setup_local_cron.sh
```

### 方式六：IM 网关（Slack）

```bash
cd packages/slack
bun install
bun run src/index.ts
```

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│  用户入口层                                                   │
│  VS Code 扩展 │ Desktop 应用 │ CLI/TUI │ HTTP API │ 飞书/Slack│
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│  Helix 引擎（MiMo-Code 核心 + Helix 增强层）              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 任务规划器    │ │ 工具执行器    │ │ 记忆系统      │       │
│  │ (Hybrid FSM) │ │ (20+ 工具)   │ │ (FTS5+Vector)│       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 安全隔离层    │ │ 可观测性层    │ │ 进化飞轮      │       │
│  │ (Shadow Tree)│ │ (Trace+Guard)│ │ (Dogfooding) │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
└────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
Helix/
├── packages/
│   ├── opencode/          # 核心引擎（MiMo-Code 基础 + Helix 增强）
│   ├── app/               # Web UI（SolidJS + Tailwind，嵌入二进制）
│   ├── desktop/           # Desktop 桌面应用（Electron + electron-vite）
│   ├── console/           # Console 应用
│   ├── feishu-gateway/    # 飞书 IM 网关（WebSocket、完全自主模式）
│   ├── slack/             # Slack 集成
│   ├── sdk/js/            # JavaScript SDK
│   ├── plugin/            # 插件系统
│   └── ui/                # 共享 UI 组件
├── sdks/vscode/           # VS Code 扩展（GUI 面板 + 守护进程管理）
├── script/dogfooding/     # 进化飞轮工具链（14 个文件）
├── docs/                  # 架构文档与测试套件
├── AGENTS.md              # 智能体规则与进化指南
├── mimocode.example.json  # 配置文件示例
└── start-feishu.sh        # 飞书一键启动脚本
```

> ⚠️ **安全提醒**：API Key 等敏感信息应配置在 `~/.config/mimocode/mimocode.json`（全局）或项目的 `.mimocode/mimocode.json` 中，**切勿提交到 Git**。参考 `mimocode.example.json` 使用 `${ENV_VAR}` 语法引用环境变量。

---

## 文档

- [核心架构设计](docs/architecture/helix_core_architecture.md)
- [进化飞轮架构](docs/testing/dogfooding_suite/beta_evolution_loop.md)
- [飞书 Gateway 设计](docs/integration/feishu_gateway_design.md)
- [能力补全路线图](docs/architecture/helix_capability_roadmap.md)
- [使用与集成指南](docs/USAGE.md)

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## 许可证

详见 [LICENSE](LICENSE)
