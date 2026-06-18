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

### Feishu IM (Recommended)

```bash
cd packages/feishu-gateway
cp .env.example .env
# Edit .env: FEISHU_APP_ID, FEISHU_APP_SECRET

./start-feishu.sh
```

Then simply message the bot in Feishu!

### CLI

```bash
# Interactive TUI
mimo

# One-shot task
mimo run "Refactor src/types.ts, extract shared types into a common module"

# HTTP API server
mimo serve --port 3095
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  User Entrypoints                                            │
│  Feishu IM │ CLI │ HTTP API │ MCP Server                    │
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
├── script/dogfooding/     # Evolution flywheel tools (14 files)
├── docs/                  # Architecture docs & testing suite
├── AGENTS.md              # Agent rules & evolution guidelines
└── start-feishu.sh        # One-click Feishu launcher
```

---

## 📚 Documentation

- [Core Architecture](docs/architecture/helix_core_architecture.md)
- [Evolution Flywheel Design](docs/testing/dogfooding_suite/beta_evolution_loop.md)
- [Feishu Gateway Design](docs/integration/feishu_gateway_design.md)
- [Capability Roadmap](docs/architecture/helix_capability_roadmap.md)
- [Usage Guide](docs/USAGE.md)

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📄 License

See [LICENSE](LICENSE)
