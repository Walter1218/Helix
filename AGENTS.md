# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

- Always use superpowers skill instead of builtin plan mode.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

## Common Commands

### Building

```bash
# Compile the core engine (packages/opencode)
bun run packages/opencode/script/build.ts

# Single-target build for current platform only
bun run packages/opencode/script/build.ts --single

# Regenerate the JavaScript SDK
./packages/sdk/js/script/build.ts
```

### Development

```bash
# TUI interactive mode (uses .dev-home as MIMOCODE_HOME)
bun dev

# Headless single run
MIMOCODE_HOME=$PWD/.dev-home bun run --cwd packages/opencode --conditions=browser src/index.ts run "task description"

# Web app dev server
bun run dev:web

# Console dev server
bun run dev:console
```

### Type Checking

Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.

```bash
# Typecheck all packages via turbo
bun typecheck

# Typecheck a specific package
cd packages/opencode && bun typecheck
```

### Testing

Tests cannot run from repo root (guard: `do-not-run-tests-from-root`). Run from package dirs.

```bash
# Run all tests in a package
cd packages/opencode && bun test

# Run a single test file
cd packages/opencode && bun test test/agent/agent.test.ts

# Run tests with CI reporter
cd packages/opencode && bun run test:ci
```

### Linting

```bash
# Lint entire repo
bun run lint
```

### Database

```bash
# Drizzle kit commands (from packages/opencode)
cd packages/opencode && bun run db
```

### Evolution & Flywheel

```bash
# Export DPO dataset from traces
bun run script/dogfooding/export_dpo.ts

# Setup local cron for daily evolution
./script/dogfooding/setup_local_cron.sh
```

### Feishu Gateway

```bash
# 一键启动（推荐）
./start-feishu.sh [port]

# 或手动启动
cd packages/feishu-gateway && cp .env.example .env
# Edit .env with FEISHU_APP_ID and FEISHU_APP_SECRET
MIMOCODE_SERVER_PASSWORD=test123 mimo serve --port 3095 &
HELIX_URL=http://localhost:3095 bun run src/index.ts
```

## Project Architecture

### Monorepo Structure

This is a Bun monorepo with workspaces defined in root `package.json`. Key packages:

- **`packages/opencode`** — Core engine. The main CLI (`mimo`), TUI, HTTP server, FSM, memory system, and tool registry live here.
- **`packages/app`** — Web UI (SolidJS + Tailwind) that gets embedded into the binary.
- **`packages/console`** — Console application.
- **`packages/desktop`** — Desktop application.
- **`packages/feishu-gateway`** — Independent Bun package for Feishu IM integration via WebSocket.
- **`packages/sdk/js`** — JavaScript SDK for external integration.
- **`packages/ui`** — Shared UI components.
- **`packages/shared`** — Shared utilities.
- **`packages/plugin`** — Plugin system.
- **`packages/script`** — Build scripts.

### Core Engine Architecture (packages/opencode)

The engine follows a layered architecture:

- **L3 Access Layer** — MCP Server, HTTP API + SSE, SDK, Event Bus, Trace instrumentation.
- **L2 Control Layer** — Hybrid FSM, Judge Agent, AlignmentGuard, AskQuestion, ProgressObserver.
- **L1 Memory Layer** — SQLite FTS5 BM25 + Vector RAG (sqlite-vec), Memory Decay, Multi-LLM embedding.
- **L0 Security Layer** — Shadow Worktree (git worktree isolation), ToolInterceptor (AST-level command filtering), VFSOverlay, Screenshot analysis.

Key directories under `packages/opencode/src/`:

- **`cli/`** — Command-line interface, TUI rendering, command handlers.
- **`agent/`** — Agent configuration and spawning.
- **`actor/`** — Actor system for concurrent task execution.
- **`acp/`** — Agent Communication Protocol (session management).
- **`tool/`** — Tool registry (bash, read, write, edit, etc.) registered as `Effect.Service`.
- **`server/`** — HTTP API routes and Hono adapters.
- **`mcp/`** — Model Context Protocol implementation.
- **`lsp/`** — Language Server Protocol support.
- **`bus/`** — Central Event Bus for trace events and alerts.
- **`config/`** — Configuration parsing and validation. Follows self-export pattern: `export * as ConfigAgent from "./agent"`.
- **`project/`** — Project probing and AST dependency graph.
- **`memory/`** — Memory storage, FTS5 indexing, vector RAG, memory decay.
- **`worktree/`** — Shadow worktree creation and garbage collection.
- **`storage/`** — Database layer with Drizzle ORM.

### Technology Stack

- **Runtime**: Bun 1.3+
- **Language**: TypeScript (compiled with `tsgo` for typecheck, bundled with `Bun.build`)
- **Framework**: Effect (functional effect system), SolidJS (TUI), Hono (HTTP server)
- **Database**: SQLite with FTS5 + sqlite-vec for vector search; Drizzle ORM for schema management
- **UI**: OpenTUI (terminal UI framework), TailwindCSS (web)
- **Build**: Bun bundler with compile-to-binary, Turbo for task orchestration

### Configuration

Global config lives at `~/.config/mimocode/mimocode.json` (copied from `mimocode.example.json`). Project-level config can also be placed at `.mimocode/mimocode.json`. API Keys should use `${ENV_VAR}` syntax. The default model is `xiaomi/mimo-v2.5-pro`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file when adding a new config module

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

### React Imports

Always ensure `import React from 'react'` is present when writing JSX in `.tsx` files.

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`

## Evolution & Flywheel (Phase 3)

- **Trace Recording**: Ensure `TraceReporter` and `HeuristicFilter` are active during testing to record high-quality execution trajectories.
- **DPO Datasets**: Run `bun run script/dogfooding/export_dpo.ts` periodically to convert raw traces into Chosen/Rejected JSONL datasets for local model fine-tuning.
- **Rule Lifecycle**: Rules added by the DSPy Optimizer to this file are considered *temporary context augmentation*. Once the DPO fine-tuning merges these rules into the model's weights, the corresponding text rules should be pruned from `AGENTS.md` to prevent context bloat.

### Self-Upgrade Mechanism

The binary includes an auto-update system that downloads platform-specific deltas from GitHub Releases.

```bash
# Check for updates
opencode upgrade check

# Upgrade to latest version
opencode upgrade run

# Upgrade to specific version
opencode upgrade run --version 1.2.3

# Download full binary instead of delta
opencode upgrade run --no-delta
```

**Registry**: `registry.json` maps platform identifiers to release assets:
- `darwin-arm64`, `darwin-x64` — macOS (Apple Silicon, Intel)
- `linux-x64`, `linux-arm64` — Linux
- `win32-x64` — Windows

**Delta Updates**: The system uses `bsdiff` for efficient binary patches (~1-5MB vs ~50MB full binary). If delta patching fails, it automatically falls back to full download.

**Shell Installer**: `scripts/install.sh` provides a one-liner installation method:
```bash
curl -fsSL https://raw.githubusercontent.com/sinco-lab/opencode/dev/scripts/install.sh | bash
```

**Installation Directory**: Binaries are installed to `~/.opencode/bin/` by default (configurable via `OPENCODE_HOME`).

## Agent Communication System

The Helix Agent Communication System enables CLI-based interaction with AI agents through WebSocket connections.

### Quick Start

```bash
# 1. Start the Helix server
MIMOCODE_HOME=.mimo bun run packages/opencode/src/index.ts serve --port 3096

# 2. Chat with an agent
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent ask "What does this code do?"

# 3. Build mode (read-write)
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent build "Create a new file"
```

### Agent Modes

- **Ask Mode** (`--agent ask`): Read-only access for code analysis and questions
- **Build Mode** (`--agent build`): Full read-write access for task execution

### CLI Commands

```bash
# Chat with agent
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat <session_id> [options] "message"

# List sessions
bun run packages/helix-tui/test/utils/helix-chat-cli.ts sessions

# Check server health
bun run packages/helix-tui/test/utils/helix-chat-cli.ts health
```

### Options

- `--agent <mode>`: Agent mode (`ask` or `build`, default: `ask`)
- `--timeout <ms>`: Timeout in milliseconds (default: 180000)
- `--verbose`: Enable detailed logging
- `--json`: Output raw JSON responses

### Session Management

Use the same session ID to continue a conversation:

```bash
# First interaction
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent ask "Hello"

# Continue same session
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent ask "Tell me more"
```

### Programming API

```typescript
import { HelixChat } from './test/utils/helix-chat'

const chat = new HelixChat({
  serverUrl: 'http://localhost:3096',
  sessionId: 'my_session',
  onText: (text) => console.log(text),
  onToolCall: (call) => console.log('Tool:', call),
  onError: (error) => console.error('Error:', error),
  onEnd: () => console.log('Done'),
})

await chat.sendMessage('What does this code do?', 'ask')
chat.close()
```

### Documentation

For detailed documentation, see [docs/helix-agent-communication-system.md](docs/helix-agent-communication-system.md).
