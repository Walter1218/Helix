# opencode VS Code Extension

A Visual Studio Code extension that integrates Helix (opencode) directly into your development workflow.

## Two Modes

| Mode | Description | How to Open |
|------|-------------|-------------|
| **GUI Mode** | Full Webview panel with 6-mode switcher (Ask/Build/Plan/Compose/Loop/Max), task list, file review, and inline chat. | `Cmd+Esc` (Mac) / `Ctrl+Esc` (Win/Linux) |
| **Terminal Mode** | Split terminal with opencode TUI (legacy). | `Cmd+Shift+Esc` (Mac) / `Ctrl+Shift+Esc` (Win/Linux) |

## Features

- **6-Mode AI Assistant**: Ask (💬), Build (🛠️), Plan (📋), Compose (🎼), Loop (🔄), Max (⚡)
- **Real AI Integration**: Connect to Helix CLI for real AI responses (online mode)
- **Offline Mode**: Fallback to mock responses when CLI is not available
- **SSE Streaming**: Real-time rendering of agent's reasoning → tool calls → text conclusions via Server-Sent Events (not one-shot response)
- **Reasoning Process Display**: Collapsible "Thought" cards showing agent's thinking process with title and duration (click to expand body)
- **Two-Tier Tool Visualization**: InlineTool (single-line `⚙ tool args` for pending/running) and BlockTool (left-border panel with `$ command` + output for completed, auto-collapse >10 lines)
- **Event-Driven Architecture**: Listens to `session.status`, `permission.asked`, `question.asked`, `session.error`, `session.retry.attempt`, `session.diff`, `task.updated`, `todo.updated` via global `/event` SSE stream
- **Session Management**: Create, switch, and delete chat sessions with history persistence
- **Permission Management**: Approve or deny tool permissions with "Always Allow" option (triggered by `permission.asked` events)
- **Question Dialog**: Agent can ask user questions via `question.asked` events, with option selection UI
- **Error & Retry Display**: Shows session errors and retry attempts in real-time
- **Tool Noise Reduction**: Completed tools hidden by default, "Show Details" toggle reveals all
- **Real Task List**: Loads tasks from `/session/:id/task` API (no mock data in online mode)
- **Message Actions**: Copy message content and regenerate responses
- **Markdown Rendering**: AI responses with syntax highlighting, code blocks, tables, and more
- **Minimal Mode (Default)**: Clean, distraction-free interface with sidebar and status bar hidden
- **Collapsible Sidebar**: Click ◀/▶ button to collapse/expand the side panel
- **Context Awareness**: Automatically share your current selection or tab with Helix
- **File Reference Shortcuts**: Use `Cmd+Option+K` (Mac) or `Alt+Ctrl+K` (Win/Linux) to insert file references. For example, `@File#L37-42`.
- **Task List & Checkpoints**: Monitor AI task progress and review file changes directly in the panel
- **Pre-flight Check & Cardinal**: Harness-layer safety guardrails with UI feedback
- **Settings Panel**: Configure model, behavior, appearance, and shortcuts (`Cmd+,`)
- **Model Selection**: Choose from multiple AI providers and models (MiMo, GPT-4, Claude, Gemini)
- **AlignmentGuard**: Drift detection with visual warnings for file drift, rabbit holes, and distractions
- **Status Bar**: Shows connection status, current model, and session info
- **SSE Resilience**: 20s heartbeat timeout + automatic reconnect with 250ms backoff
- **Frontend Error Reporting**: Errors in webview JS are reported to Extension Host via bridge (observability coverage)

## Prerequisites

- **opencode CLI** must be installed and available in `PATH`. For local development, the extension will auto-detect `packages/opencode/dist/mimo`.
- **Node.js 20+** (for `fetch` API support in the extension host)

## Quick Start

1. `code sdks/vscode` — Open the `sdks/vscode` directory in VS Code. **Do not open from repo root.**
2. `bun install` — Run inside the `sdks/vscode` directory.
3. `bun run build:media` — Copy `packages/app/dist` frontend assets into `media/`.
4. Press `F5` to start debugging — This launches a new VS Code window with the extension loaded.
5. In the debug window, press `Cmd+Esc` to open the Helix GUI panel.

## Making Changes

`tsc` and `esbuild` watchers run automatically during debugging (visible in the Terminal tab). Changes to the extension are automatically rebuilt in the background.

To test your changes:

1. In the debug VS Code window, press `Cmd+Shift+P`
2. Search for `Developer: Reload Window`
3. Reload to see your changes without restarting the debug session

## Architecture

```
sdks/vscode/
├── src/
│   ├── extension.ts          # Entry point: register commands, start backend
│   ├── webview/
│   │   └── panel.ts          # Webview panel: load HTML, inject bridge script
│   └── server.ts             # Backend manager: spawn opencode CLI, wait for ready
├── media/                    # Frontend assets (copied from packages/app/dist)
├── images/                   # Extension icons
└── dist/
    └── extension.js          # Bundled extension (esbuild output)
```

### Communication Flow

```
VS Code Extension Host
    │
    ├─► HelixServer (spawns mimo --port <random>)
    │   └─► Helix CLI (HTTP API + SSE on localhost)
    │
    ├─► HelixWebviewPanel
        │
        ├─► Bridge Script (injected into Webview)
        │   ├─► Overrides window.fetch → postMessage to Extension Host
        │   └─ Extension Host proxies fetch to localhost HTTP API
        │
        └─► Frontend App (helix-welcome.html, vanilla JS)
            ├─► API calls via fetch → Bridge → Extension Host → Helix HTTP
            └─► Real-time updates via SSE (/event) → Bridge → Extension Host → Helix SSE
                ├─ message.part.updated (reasoning/tool/text parts, streamed)
                ├─ session.status (idle/busy/retry — drives finishGeneration)
                ├─ permission.asked (tool permission requests)
                ├─ question.asked (agent questions to user)
                ├─ session.error / session.retry.attempt
                ├─ session.diff (file changes)
                └─ task.updated / todo.updated
```

> **Note**: WebSocket bridging exists in the bridge script but is not fully utilized. Real-time updates use SSE (`/event` endpoint) which is the primary event delivery mechanism.

## Build Scripts

```bash
# Copy frontend assets (run after packages/app build)
bun run build:media

# Full package (types + lint + esbuild)
bun run package

# Watch mode for development
bun run watch:esbuild
```

## Trace 日志系统

Helix 集成了完整的 Trace 日志系统，支持问题定位和迭代优化：

**覆盖模块**:
- `session` - 会话创建、提示处理、完成状态
- `server` - HTTP 请求接收和处理
- `llm` - LLM 流式调用（providerID、modelID、agent、mode）
- `tool` - 工具初始化、执行开始/完成/失败
- `provider` - 模型解析、语言模型加载
- `memory` - 记忆协调、索引、剪枝
- `agent` - 状态初始化和就绪

**日志格式**:
```
INFO  2026-06-18T11:35:25 +0ms service=session id=ses_xxx ... created
INFO  2026-06-18T11:35:25 +0ms service=llm providerID=mimo modelID=mimo-auto agent=ask mode=primary stream
INFO  2026-06-18T11:35:35 +92ms service=tool tool=write sessionID=ses_xxx tool.execute.start
```

**查看日志**:
```bash
# 查看最新日志
tail -100 ~/.dev-home/data/log/*.log

# 过滤特定模块
grep "service=agent\|service=tool\|service=provider" ~/.dev-home/data/log/*.log
```

## Support

This is an early release. If you encounter issues or have feedback, please create an issue at https://github.com/anomalyco/opencode/issues.
