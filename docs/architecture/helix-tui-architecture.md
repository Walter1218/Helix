# Helix TUI Architecture

## Overview

Helix TUI is a terminal-based user interface built with **SolidJS + OpenTUI** that provides a cyberpunk-themed interactive experience for the Helix AI engine. It communicates with the Helix core engine via HTTP API + SSE for real-time event streaming.

```
┌─────────────────────────────────────────────────────────┐
│                    Helix TUI                             │
│  (packages/helix-tui)                                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                 App Layer                         │   │
│  │  App.tsx → Routes (Home/Chat/Project/Monitor/     │   │
│  │           Settings) + Sidebar                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Component Layer                      │   │
│  │  Sidebar │ SessionInfoPanel │ Cyberpunk          │   │
│  │  Dialog system (Alert/Confirm/Prompt/Select)     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Context Layer                        │   │
│  │  SDK (HTTP + SSE) │ Theme │ Route │ Dialog       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Communication Layer                    │   │
│  │  HttpAdapter │ WebSocketAdapter │ GrpcAdapter    │   │
│  │  CommunicationManager (pluggable)                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Plugin System                        │   │
│  │  PluginManager │ PluginContext │ HelixPlugin      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Services                             │   │
│  │  Voice Service │ Config Manager │ Trace          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
packages/helix-tui/src/
├── index.ts              # Entry point
├── run.tsx               # CLI runner
├── bootstrap.tsx         # Application bootstrap
├── app.tsx               # Root component
├── trace.ts              # Event tracing
├── routes/               # Page components
│   ├── home.tsx          # Home dashboard
│   ├── chat.tsx          # AI chat interface
│   ├── project.tsx       # Project explorer
│   ├── monitor.tsx       # System monitor
│   └── settings.tsx      # Settings panel
├── component/            # Reusable UI components
│   ├── sidebar.tsx       # Navigation sidebar
│   ├── session-info-panel.tsx  # Session info display
│   └── cyberpunk.tsx     # Cyberpunk theme elements
├── context/              # SolidJS context providers
│   ├── sdk.tsx           # SDK client + SSE events
│   ├── theme.tsx         # Theme management
│   ├── route.tsx         # Routing
│   ├── helper.tsx        # Context helpers
│   └── dialog.tsx        # Dialog system
├── communication/        # Communication adapters
│   ├── types.ts          # Adapter interfaces
│   ├── manager.ts        # Adapter manager
│   ├── http-adapter.ts   # HTTP adapter
│   ├── websocket-adapter.ts  # WebSocket adapter
│   └── index.ts          # Exports
├── plugin/               # Plugin system
│   ├── types.ts          # Plugin interfaces
│   ├── manager.ts        # Plugin manager
│   └── index.ts          # Exports
├── ui/                   # UI primitives
│   ├── dialog.tsx        # Dialog context
│   ├── dialog-alert.tsx  # Alert dialog
│   ├── dialog-confirm.tsx # Confirm dialog
│   ├── dialog-prompt.tsx # Prompt dialog
│   └── dialog-select.tsx # Select dialog
├── voice/                # Voice service
│   ├── service.ts        # Voice recognition
│   └── index.ts          # Exports
├── config/               # Configuration
│   ├── manager.ts        # Config manager
│   └── index.ts          # Exports
├── i18n/                 # Internationalization
└── util/                 # Utilities
```

## Core Systems

### 1. SDK Context (Real-Time Communication)

The SDK context manages the connection to the Helix core engine:

```typescript
// context/sdk.tsx
const client = createOpencodeClient({ baseUrl: url })
const events = client.event.subscribe()  // SSE stream

// Event subscription with 16ms batching
sdk.subscribe((event) => {
  switch (event.type) {
    case "message.part.delta":
      // Stream text/tool-call deltas to UI
      break
    case "session.idle":
      // Mark session as complete
      break
    case "permission.asked":
      // Show permission dialog
      break
  }
})
```

**Key Features:**
- Auto-reconnect with exponential backoff
- 16ms batched event processing for smooth UI
- Per-session event filtering
- Connection status tracking

### 2. Route System

Simple hash-based routing with SolidJS signals:

```typescript
// context/route.tsx
type Route =
  | { type: "home" }
  | { type: "chat" }
  | { type: "project" }
  | { type: "monitor" }
  | { type: "settings" }

// Keyboard shortcuts: 1-5 for navigation
useKeyboard((evt) => {
  if (evt.name >= "1" && evt.name <= "5") {
    route.navigate({ type: routes[parseInt(evt.name) - 1] })
  }
})
```

### 3. Chat System

The chat route (`routes/chat.tsx`) is the primary interface:

**State Management:**
- `sessionID` — Current session
- `messages[]` — Display messages with tool calls
- `mode` — Agent mode (ask/build/plan/compose/loop/max)
- `currentModel` — Model selection (standard/ultra/lite)
- `permission` / `question` — Active prompts

**Event Processing:**
```typescript
// Real-time streaming
if (type === "message.part.delta" && props.field === "text") {
  // Append to last assistant message
}

// Tool call tracking
if (type === "tool.call.start") {
  // Add tool call indicator
}
if (type === "tool.call.end") {
  // Update tool call status
}
```

**Features:**
- Session management (create/switch/rename/delete)
- Input history (Up/Down arrows)
- Mode cycling (Tab/Shift+Tab)
- Model switching (F2)
- Abort support (Escape)
- Auto-recovery of last session

### 4. Theme System

Cyberpunk-themed color palette:

```typescript
// context/theme.tsx
const theme = {
  primary: "#00ff9f",    // Neon green
  secondary: "#00b8ff",  // Cyan
  accent: "#ff6b9d",     // Pink
  warning: "#ffd93d",    // Yellow
  error: "#ff4757",      // Red
  success: "#2ed573",    // Green
  background: "#0a0a0f", // Dark
  text: "#e0e0e0",       // Light gray
}
```

### 5. Dialog System

Modal dialogs using SolidJS portals:

```typescript
// Usage
const dialog = useDialog()
const result = await DialogConfirm.show(dialog, "Title", "Message")
const input = await DialogPrompt.show(dialog, "Title", { placeholder: "..." })
const selected = await DialogSelect.show(dialog, "Title", options)
```

### 6. Communication Layer

Pluggable adapter architecture:

```typescript
// communication/types.ts
interface CommunicationAdapter {
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): Promise<void>
  request<T>(endpoint: string, data?: unknown): Promise<T>
  stream<T>(endpoint: string, data?: unknown): AsyncGenerator<T>
  subscribe<T>(channel: string, callback: (data: T) => void): Subscription
}
```

**Adapters:**
- **HttpAdapter** — REST + SSE (default)
- **WebSocketAdapter** — Full-duplex WebSocket
- **GrpcAdapter** — gRPC streaming (stub)

### 7. Plugin System

Dynamic plugin loading:

```typescript
// plugin/types.ts
interface HelixPlugin {
  metadata: PluginMetadata
  onInit?(context: PluginContext): Promise<void>
  onActivate?(): Promise<void>
  onDeactivate?(): Promise<void>
  routes?: any[]
  components?: any[]
}
```

**Plugin Context:**
- `communication` — Access to adapters
- `theme` — Theme customization
- `voice` — Voice service
- `ui` — UI components
- `config` — Configuration
- `events` — Event system

## Build System

```bash
# Development
bun run dev  # Build + run with --conditions=browser

# Production
bun run build  # Build to dist/

# Type checking
bun run typecheck

# Tests
bun test
```

**Build Tool:** `createSolidTransformPlugin` from `@opentui/solid/bun-plugin`

**Output:** ESM modules with `--conditions=browser` for OpenTUI compatibility

## Event Flow

```
User Input → Chat.handleSend()
  ↓
SDK.session.prompt({ sessionID, parts, agent })
  ↓
Helix Core Engine processes
  ↓
SSE Events stream back:
  ├─ message.part.delta (text streaming)
  ├─ tool.call.start / tool.call.end
  ├─ session.status (busy/idle)
  ├─ permission.asked / question.asked
  └─ session.error
  ↓
SDK context batches events (16ms)
  ↓
Chat component updates UI
  ↓
User sees real-time updates
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-5` | Navigate to route (Home/Chat/Project/Monitor/Settings) |
| `Tab` | Cycle agent mode forward |
| `Shift+Tab` | Cycle agent mode backward |
| `F2` | Cycle model |
| `Enter` | Send message |
| `Shift+Enter` | Newline in input |
| `Escape` | Abort current operation |
| `Up/Down` | Input history navigation |
| `Ctrl+K` | Command palette (planned) |

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test test/routes/chat.test.ts
```

**Test Pattern:** SolidJS `TestRender` with `kittyKeyboard: true` for modifier keys.

## Architecture Decisions

### Why SolidJS over React?

1. **Fine-grained reactivity** — No virtual DOM diffing
2. **Smaller bundle** — ~7KB vs ~40KB
3. **Better TypeScript** — Generic components without boilerplate
4. **OpenTUI integration** — Native SolidJS support

### Why SSE over WebSocket?

1. **Simpler** — HTTP-based, works through proxies
2. **Auto-reconnect** — Built-in browser support
3. **Unidirectional** — Server→Client events are one-way
4. **HTTP/2** — Multiplexed connections

### Why Plugin Architecture?

1. **Extensibility** — Third-party integrations
2. **Modularity** — Load only what's needed
3. **Isolation** — Plugins can't break core
4. **Hot-reload** — Future capability
