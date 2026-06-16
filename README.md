# 🧬 Helix - Autonomous Code Agent

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
