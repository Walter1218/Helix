# 🧬 Helix — One Thought, Three Thousand Worlds

> **One-liner**: Helix is an autonomous code-task execution engine built on top of the MiMo-Code core. You describe the goal; it plans, executes, verifies, and evolves—without human intervention.

---

## Why Helix?

Most AI coding assistants today are **interactive companions**—they help you write code, but you still drive. Helix addresses the **engineering gap between "Agent Demo" and "Production-Ready Agent"**:

| Problem | How Helix Solves It |
|---------|---------------------|
| **Long-horizon tasks fail midway** | Hybrid FSM + Workflow Journal persistence + adaptive timeout with idle/dead-loop detection |
| **Dirty data poisons the model** | `HeuristicFilter` gates—OOM, timeout, and infra failures are physically excluded from the evolution loop |
| **Unsafe autonomous execution** | Shadow Worktree (Git-level isolation) + AST-level command filtering + VFS sandbox |
| **Memory bloat & pollution** | BM25 + Vector hybrid RAG with automatic memory decay based on code changes |
| **Overfitting to test cases** | Regression test suite (20+ general tasks) + DPO fine-tuning with rule lifecycle management |
| **No observability into agent reasoning** | `TraceReporter` + `AlignmentGuard`—full execution tree tracing with real-time deviation alerts |

---

## Our Path & Relationship to MiMo-Code

Helix is **not a fork from scratch**. It inherits the full MiMo-Code engine (Bun runtime, Effect framework, Tool Registry, Actor system, Multi-provider support) and **engineers it for autonomous production use**.

### What We Kept
- Multi-Agent modes (`build` / `plan` / `compose`)
- TUI / CLI / HTTP API / MCP Server multi-entry architecture
- Effect-based functional service layer
- SQLite FTS5 + Drizzle ORM persistence layer

### What We Added (The "Helix Layer")

| Layer | MiMo-Code (Original) | Helix (This Repo) |
|-------|---------------------|-------------------|
| **Observability** | ❌ None | ✅ `TraceReporter` + `HeuristicFilter` + `AlignmentGuard` |
| **Memory Retrieval** | SQLite FTS5 only | ✅ BM25 + Vector RAG (`sqlite-vec` + Embedder) with hybrid scoring |
| **Evolution Flywheel** | ❌ None | ✅ `script/dogfooding/`—14 tools for automated case generation, DPO export, cron-scheduled evolution loops |
| **Safety Sandbox** | Basic Shadow Worktree | ✅ + VFS sandbox + AST-level `ToolInterceptor` + `AlignmentGuard` inbox correction |
| **IM Integration** | ❌ None | ✅ Native Feishu Gateway with fully-autonomous mode, adaptive timeout, real-time progress |
| **Workflow Engine** | Script-based runtime | ✅ + `vfs-sandbox.ts`, global semaphore concurrency, breakpoint resume |
| **Auto-Dev Scheduler** | ❌ None | ✅ `launchd`/cron 自动调度 + Roadmap 任务管理 + Pipeline 验证 + 飞书通知 |
| **OpenSpec Integration** | ❌ None | ✅ 需求规范管理 + Spec→Roadmap 自动转换 + 执行结果回写 + 变更追踪 |
| **Enhanced Judge** | ❌ None | ✅ 7 项检查：安全性/相关性/过量改动/完整性/回归风险/一致性/Trace覆盖 |
| **Documentation** | Feature-focused | ✅ Architecture whitepapers, capability roadmap, evolution loop design docs |

---

## ✨ Core Innovations

### 1. Evolution Flywheel (Self-Improving Agent)

The only way to escape the "prompt-tuning treadmill" is to let the agent learn from its own execution traces.

```
Execution → Trace Recording → Heuristic Filter → DPO Dataset Export →
Offline Prompt Optimization → Regression Validation → Rule Injection → Next Execution
```

- **`generate_cases.ts --daily-expand`**: Auto-generates 50+ adversarial cases daily, weighted toward recent failure modes (adaptive sampling)
- **`export_dpo.ts`**: Exports Chosen/Rejected JSONL with a **Judge Gate** that prevents "cheating trajectories" (deleting assertions to pass tests, shrinking code to 30%, trivial diffs)
- **`beta_evolution_loop.ts`**: Intelligent process guardian with category-based thresholds (`COMP`: 30min / `AST`: 15min / `PLAN`: 5min), auto-kills only when truly stuck
- **`setup_local_cron.sh`**: macOS `launchd` runs the flywheel daily at 11:50

### 2. Observability Layer (The Agent's Nervous System)

```ts
// TraceReporter: type-safe execution tree tracing
TraceNodeEvent = { id, type: "node_start|action|decision|error", status, timestamp }

// HeuristicFilter: dirty-data gate
DIRTY_PATTERNS = [/timeout/i, /out of memory/i, /toolinterceptor blocked/i]

// AlignmentGuard: real-time deviation correction via Actor inbox
inbox.send({ senderActorID: "alignment-guard", content: "<alignment-guard>..." })
```

**Trace 日志覆盖 (85% 覆盖率)**:
- `session` - 会话创建、提示处理、完成状态
- `server` - HTTP 请求接收和处理
- `llm` - LLM 流式调用（providerID、modelID、agent、mode）
- `tool` - 工具初始化、执行开始/完成/失败
- `provider` - 模型解析、语言模型加载
- `memory` - 记忆协调、索引、剪枝
- `agent` - 状态初始化和就绪（部分覆盖）

**关键路径**: 会话创建 → HTTP 请求 → LLM 调用 → 工具执行 → 会话完成

### 3. Hybrid Memory (FTS5 + Vector RAG)

```ts
// Memory service: dual retrieval with weighted scoring
const combined = bm25Score * 0.6 + vectorScore * 0.4
const boost = bothHit ? 1.3 : 1.0
```

- **FTS5 BM25**: Exact keyword matching for tool names, file paths
- **Vector RAG**: Semantic understanding for intent matching
- **Memory Decay**: Auto-aging based on code changes (keeps memory relevant)

### 4. Safety-First Autonomous Execution

- **Shadow Worktree**: Every dangerous operation runs in a `git worktree` on branch `mimocode/{name}`; auto-commit on success, auto-clean on failure
- **AST-Level Filtering**: `shell-tokenize.ts` parses commands before execution; blocks `rm -rf /`, `> /etc/passwd`, etc.
- **VFS Sandbox**: Copy-on-Write overlay for file operations inside workflows

### 5. Feishu IM — Truly Autonomous Mode

Unlike chatbots that ask for confirmation every step, Helix's Feishu Gateway supports **fully autonomous execution**:

- **Adaptive Timeout**: Base 3min → extend 3min per step → max 15min, with deviation evaluation before extension
- **Auto-Answer AskUserQuestion**: "Continue executing; use local resources to complete the task autonomously."
- **Real-Time Progress**: Streaming agent reasoning and tool calls to the terminal

### 6. VS Code Extension — Event-Driven GUI

The VS Code extension (`sdks/vscode`) provides a GUI panel with full agent integration:

- **SSE Streaming**: Real-time rendering of agent's reasoning → tool calls → text conclusions via `/event` SSE stream (not one-shot response)
- **6-Mode Switcher**: Ask / Build / Plan / Compose / Loop / Max
- **Event-Driven**: Listens to `session.status`, `permission.asked`, `question.asked`, `session.error`, `session.retry.attempt`, `session.diff`, `task.updated` — no polling
- **Two-Tier Tool Display**: InlineTool (pending/running) → BlockTool (completed with output), auto-collapse >10 lines
- **Reasoning Cards**: Collapsible "Thought" cards with title + duration, click to expand
- **Real Data**: Online mode loads tasks/todo from API, no mock data
- **SSE Resilience**: 20s heartbeat + auto-reconnect

### 7. Auto-Loop Workflow (Plan → Execute → Test → Heal → Distill)

Helix implements a fully autonomous engineering loop that iterates until the goal is achieved:

```bash
# Enable experimental workflow tool
export MIMOCODE_EXPERIMENTAL_WORKFLOW_TOOL=1

# Run auto-loop workflow
mimo run "Use the workflow tool to run auto-loop with args: 'Your task description'"
```

**Loop Phases:**
1. **Plan**: Analyze goal, explore codebase, create execution plan
2. **Execute**: Implement code changes using available tools
3. **Test**: Run tests and verify changes work correctly
4. **Heal**: If tests fail, diagnose root cause and fix (up to 3 attempts)
5. **Distill**: Evaluate completion, extract learnings, decide next action

**Key Features:**
- Self-healing: Automatically diagnoses and fixes test failures
- Iterative: Up to 5 plan-execute-test cycles
- Persistent: Workflow journal survives interruptions

### 8. Auto-Dev Scheduler (无人值守自动开发)

Helix 支持基于 `launchd`/`cron` 的定时自动开发，从 roadmap.json 自动读取任务并执行完整 Pipeline：

```bash
# 单次执行（测试用）
bun run script/auto-dev/scheduler.ts --once --dry-run

# 持续执行（生产用）
bun run script/auto-dev/scheduler.ts --chat-id <feishu_chat_id>
```

**Pipeline 流程:**
```
任务选择 → 任务执行 → Judge审查 → 增强Judge审查 → 编译验证 → 类型检查
    → 测试运行 → Lint检查 → Judge验证 → 文档更新 → Spec回写 → Git提交 → 飞书通知
```

**关键特性:**
- **自动任务选择**: 基于优先级和里程碑自动选择待办任务
- **失败重试**: 最多重试 3 次，带重复错误检测
- **权限请求转发**: 自动将权限问题通知到飞书
- **预算控制**: 每日 token 消耗上限，防止过度使用

### 9. OpenSpec Integration (需求规范管理)

Helix 集成 OpenSpec 实现需求驱动开发，确保每个代码变更都有对应的需求规范：

```bash
# 扫描 specs 并更新 roadmap
bun run script/auto-dev/spec-converter.ts [--dry-run]

# 手动更新 spec 状态
bun run script/auto-dev/spec-writer.ts <specPath> <requirement> <success>
```

**集成架构:**
```
OpenSpec specs/          roadmap.json         Scheduler Pipeline
┌──────────────┐        ┌──────────────┐     ┌──────────────┐
│ auth/spec.md │───────→│ M_SPEC-T1    │────→│ Execute      │
│ dev/spec.md  │        │ M_SPEC-T2    │     │ Judge Review │
│ judge/spec.md│        │ M_SPEC-T3    │     │ Spec Write   │
└──────────────┘        └──────────────┘     └──────────────┘
       ↑                                         │
       └───────────── 回写执行结果 ───────────────┘
```

**关键特性:**
- **需求可追溯**: 每个代码变更都有对应 spec
- **自动任务生成**: spec 中的 pending 需求自动转为 roadmap 任务
- **执行结果回写**: 成功/失败状态自动更新到 spec
- **智能匹配**: 支持中文关键词匹配普通任务到对应 spec

### 10. Enhanced Judge (7 项代码审查)

Helix 的 Judge 系统提供 7 项自动化代码审查，确保代码质量和安全性：

| 检查项 | 说明 | 触发条件 |
|--------|------|----------|
| **安全性检查** | eval/exec/密钥泄露/危险命令 | 所有变更 |
| **相关性检查** | 变更文件是否在任务范围内 | 所有变更 |
| **过量改动检测** | 改动文件超出任务复杂度 | 所有变更 |
| **完整性检查** | 代码是否实现 spec 需求 | 有 spec 时 |
| **回归风险检查** | 导出删除/参数减少/类型字段删除 | 所有变更 |
| **一致性检查** | 命名规范/any类型/console.log | 所有变更（建议） |
| **Trace 覆盖检查** | 新增文件缺少 trace 埋点 | 新增文件（建议） |

```bash
# 运行 Judge 验收测试
bun run script/auto-dev/test-judge-acceptance.ts
```

---

## 🚀 Quick Start

### Environment Setup (First Time)

```bash
# 1. Install Bun runtime
curl -fsSL https://bun.sh/install | bash

# 2. Install dependencies
bun install

# 3. Compile the core engine (required first time)
bun run packages/opencode/script/build.ts
# Or single-platform build (faster)
bun run packages/opencode/script/build.ts --single
```

### VS Code Extension (Recommended, GUI)

```bash
# 1. Compile the core engine (required first time)
bun run packages/opencode/script/build.ts --single

# 2. Build VS Code extension
cd sdks/vscode && bun install && bun run package

# 3. Install the VSIX in VS Code
# Extensions → ... → Install from VSIX → select sdks/vscode/*.vsix

# 4. Configure API Key
# Global config: ~/.config/mimocode/mimocode.json
# See mimocode.example.json for Token Plan setup
```

Press `Cmd+Esc` (Mac) / `Ctrl+Esc` (Win/Linux) to open the GUI panel.

### CLI / TUI

```bash
# Interactive TUI (default entry)
mimo

# One-shot task (headless)
mimo run "Refactor src/types.ts, extract shared types into a common module"

# HTTP API daemon (for GUI / gateway)
mimo serve --port 3095

# Web interface (server + browser)
mimo web
```

### Feishu IM (Fully Autonomous)

```bash
cd packages/feishu-gateway
cp .env.example .env
# Edit .env: FEISHU_APP_ID, FEISHU_APP_SECRET

./start-feishu.sh
```

Then simply message the bot in Feishu — it plans, executes, and validates autonomously.

### Desktop App (In Development)

```bash
cd packages/desktop
bun install
bun dev                              # Dev mode (hot reload)
bun run build && bun run package:mac # Build macOS app
```

### Evolution Flywheel (Developers)

```bash
bun run script/dogfooding/generate_cases.ts  # Generate test cases
bun run script/dogfooding/export_dpo.ts      # Export DPO dataset
bash script/dogfooding/setup_local_cron.sh   # Setup cron job
```

### Auto-Dev Scheduler (无人值守自动开发)

```bash
# 1. 初始化 OpenSpec（首次）
npm install -g @fission-ai/openspec@latest
cd /path/to/Helix

# 2. 扫描 specs 并生成 roadmap 任务
bun run script/auto-dev/spec-converter.ts

# 3. 单次执行（测试用）
bun run script/auto-dev/scheduler.ts --once --dry-run

# 4. 持续执行（生产用，带飞书通知）
bun run script/auto-dev/scheduler.ts --chat-id <feishu_chat_id>

# 5. 设置 launchd 定时任务（macOS）
bash script/auto-dev/setup.sh
```

### OpenSpec 需求管理

```bash
# 查看当前 specs
ls openspec/specs/

# 创建新 spec
openspec create <spec-name>

# 扫描并更新 roadmap
bun run script/auto-dev/spec-converter.ts

# 手动更新 spec 状态
bun run script/auto-dev/spec-writer.ts openspec/specs/auth-session/spec.md "Session expiration" true

# 运行集成测试
bun run script/auto-dev/test-openspec-integration.ts
bun run script/auto-dev/test-openspec-trigger.ts
```

### Judge 审查测试

```bash
# 运行 Judge 验收测试（11 个场景）
bun run script/auto-dev/test-judge-acceptance.ts

# 查看检查项覆盖
# ✓ 正常开发场景（应通过）
# ✗ 安全风险场景（应拦截）：eval/密钥泄露/导出删除/参数减少
# ⚠ 代码质量场景（提建议）：any类型/console.log/magic number
```

### Slack Gateway

```bash
cd packages/slack && bun install && bun run src/index.ts
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  User Entrypoints                                            │
│  VS Code │ Desktop │ CLI/TUI │ HTTP API │ Feishu/Slack     │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│  Helix Engine (MiMo-Code Core + Helix Layer)             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Task Planner │ │ Tool Executor │ │ Memory System │     │
│  │ (Hybrid FSM) │ │ (20+ tools)   │ │ (FTS5+Vector)│     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Safety Layer │ │ Observability│ │ Evolution    │     │
│  │ (Shadow Tree)│ │ (Trace+Guard)│ │ (Flywheel)   │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
└────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
Helix/
├── packages/
│   ├── opencode/          # Core engine (MiMo-Code base + Helix enhancements)
│   ├── feishu-gateway/    # Feishu IM gateway (WebSocket, fully autonomous)
│   ├── app/               # Web UI (SolidJS + Tailwind)
│   └── sdk/               # JavaScript SDK
├── script/
│   ├── dogfooding/        # Evolution flywheel tools (14 files)
│   └── auto-dev/          # Auto-dev scheduler & OpenSpec integration
│       ├── scheduler.ts      # 主调度器
│       ├── spec-converter.ts # Spec → Roadmap 转换
│       ├── spec-writer.ts    # 执行结果 → Spec 回写
│       ├── judge-enhanced.ts # 增强版 Judge（7 项检查）
│       ├── setup.sh          # launchd 定时任务配置
│       └── test-*.ts         # 集成测试
├── openspec/
│   └── specs/             # OpenSpec 需求规范
│       ├── auth-session/     # 认证会话需求
│       ├── auto-dev/         # 自动开发需求
│       ├── feishu-gateway/   # 飞书网关需求
│       └── judge-agent/      # Judge Agent 需求
├── .mimocode/
│   └── roadmap.json       # Mainline task definitions
├ docs/                    # Architecture docs & testing suite
├── AGENTS.md              # Agent rules & evolution guidelines
└── start-feishu.sh        # One-click Feishu launcher
```

---

## 📚 Documentation

- [Core Architecture](docs/architecture/helix_core_architecture.md)
- [Evolution Flywheel Design](docs/testing/dogfooding_suite/beta_evolution_loop.md)
- [Feishu Gateway Design](docs/integration/feishu_gateway_design.md)
- [Capability Roadmap](docs/architecture/helix_capability_roadmap.md)
- [Auto-Dev Scheduler](docs/features/auto-dev.md)
- [OpenSpec Integration](docs/features/openspec-integration.md)
- [OpenSpec Dev Plan](docs/features/openspec-dev-plan.md)
- [Usage Guide](docs/USAGE.md)

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📄 License

See [LICENSE](LICENSE)
