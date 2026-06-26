# Helix Communication System Architecture

## Overview

Helix uses a **publish-subscribe event-driven architecture** for real-time communication between the core engine, terminal UI (TUI), and external integrations (Feishu Gateway, SDK clients).

```
┌─────────────────────────────────────────────────────────┐
│                    Helix Core Engine                      │
│  (packages/opencode)                                     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Session   │  │ Tool     │  │ Workflow │              │
│  │ Manager   │  │ Executor │  │ Runner   │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│       └──────────────┼──────────────┘                    │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │   Event Bus   │  ← Central pub/sub        │
│              │   (Bus.*)     │                           │
│              └───────┬───────┘                           │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │  SSE Endpoint │  GET /event               │
│              │  (per-instance)│                           │
│              └───────┬───────┘                           │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │ Global Event  │  GET /global/event        │
│              │ Stream        │                           │
│              └───────────────┘                           │
└──────────────┬──────────────────────────────────────────┘
               │
      ┌────────┼────────┐
      │        │        │
      ▼        ▼        ▼
┌─────────┐ ┌──────┐ ┌──────────────┐
│ Helix   │ │ SDK  │ │ Feishu       │
│ TUI     │ │ Client│ │ Gateway     │
└─────────┘ └──────┘ └──────────────┘
```

## Event Bus System

### Core Components

- **`BusEvent.define(type, schema)`** — Registers a typed event with Zod schema validation
- **`Bus.publish(EventDef, data)`** — Publishes an event to all subscribers
- **`Bus.subscribe(EventDef, handler)`** — Subscribes to a specific event type
- **`Bus.subscribeAll(handler)`** — Subscribes to all events (used by SSE endpoint)

### Event Taxonomy

#### Session Lifecycle
| Event | Type String | Description |
|-------|------------|-------------|
| `Session.Event.Status` | `session.status` | Session state changes (idle/busy/retry) |
| `Session.Event.Idle` | `session.idle` | Session becomes idle (deprecated, use Status) |
| `Session.Event.Error` | `session.error` | Session error occurred |
| `Session.Event.Diff` | `session.diff` | Session content changed |
| `Session.Event.RetryAttempt` | `session.retry_attempt` | LLM retry attempt |

#### Message Streaming
| Event | Type String | Description |
|-------|------------|-------------|
| `Message.Event.PartDelta` | `message.part.delta` | Real-time text/tool-call streaming delta |
| `Message.Event.PartUpdated` | `message.part.updated` | Part fully updated |
| `Message.Event.PartRemoved` | `message.part.removed` | Part removed |
| `Message.Event.Removed` | `message.removed` | Message removed |

#### Tool Execution
| Event | Type String | Description |
|-------|------------|-------------|
| `Metrics.ToolCall` | `metrics.tool_call` | Tool call completed with metrics |
| `Metrics.ModelCall` | `metrics.model_call` | LLM call completed with metrics |
| `Metrics.AgentRequest` | `metrics.agent_request` | Agent request completed |

#### Observability
| Event | Type String | Description |
|-------|------------|-------------|
| `TraceNodeEvent` | `observability.trace_node` | Execution trace tree node |
| `AlignmentAlert` | `observability.alignment_alert` | Agent deviation warning |

#### Permission & Questions
| Event | Type String | Description |
|-------|------------|-------------|
| `Permission.Event.Asked` | `permission.asked` | Permission requested |
| `Permission.Event.Replied` | `permission.replied` | Permission answered |
| `Question.Event.Asked` | `question.asked` | Question asked to user |
| `Question.Event.Replied` | `question.replied` | Question answered |
| `Question.Event.Rejected` | `question.rejected` | Question rejected |

#### Workflow
| Event | Type String | Description |
|-------|------------|-------------|
| `WorkflowStarted` | `workflow.started` | Workflow run started |
| `WorkflowFinished` | `workflow.finished` | Workflow run completed |
| `WorkflowPhase` | `workflow.phase` | Workflow phase change |
| `WorkflowLog` | `workflow.log` | Workflow log message |
| `WorkflowAgentFailed` | `workflow.agent_failed` | Agent in workflow failed |
| `WorkflowChildFailed` | `workflow.child_failed` | Child workflow failed |

#### File System
| Event | Type String | Description |
|-------|------------|-------------|
| `File.Event.Edited` | `file.edited` | File edited by agent |
| `FileWatcher.Event.Updated` | `file.updated` | File changed on disk |

## SSE Endpoints

### Per-Instance: `GET /event`

Returns all events for the current instance. Used by:
- **Helix TUI** — Real-time UI updates
- **SDK clients** — Event streaming
- **Feishu EventBridge** — Per-session event forwarding

```typescript
// Subscribe to all events
const response = await fetch(`${url}/event`)
const reader = response.body.getReader()
// Parse SSE: data: {"type":"message.part.delta","properties":{...}}
```

### Global: `GET /global/event`

Returns events across all instances. Used by:
- **AlignmentNotifier** — Global deviation monitoring
- **Cross-instance dashboards**

## Real-Time Streaming Protocol

### Text Streaming Flow

```
1. User sends prompt → session.prompt()
2. LLM starts generating → Session.Status { type: "busy" }
3. Text deltas → message.part.delta { field: "text", delta: "..." }
4. Tool calls → message.part.delta { field: "tool-call", ... }
5. Tool results → message.part.delta { field: "tool-result", ... }
6. Generation complete → Session.Status { type: "idle" }
```

### PartDelta Event Schema

```typescript
{
  type: "message.part.delta",
  properties: {
    sessionID: string,
    messageID: string,
    partID: string,
    field: "text" | "tool-call" | "tool-result" | "reasoning",
    delta: string  // Incremental content
  }
}
```

## Client Integration Patterns

### Helix TUI (packages/helix-tui)

The TUI uses the **SDK context** pattern:

```typescript
// context/sdk.tsx
const client = createOpencodeClient({ baseUrl: url })
const events = client.event.subscribe()  // SSE stream

// Subscribe to events
sdk.subscribe((event) => {
  if (event.type === "message.part.delta") {
    // Update UI with streaming text
  }
  if (event.type === "tool.call.start") {
    // Show tool execution indicator
  }
})
```

**Event Processing**: 16ms batching via `queueEvent()` + `flushEvents()` for smooth UI updates.

### Feishu Gateway (packages/feishu-gateway)

The Feishu Gateway uses **two parallel event streams**:

1. **EventBridge** (per-session) — Subscribes to `/event` for active sessions
2. **AlignmentNotifier** (global) — Subscribes to `/global/event` for deviation alerts

```typescript
// EventBridge subscribes to per-session events
eventBridge.subscribe(sessionID, chatId, onMsg, onCard)

// AlignmentNotifier subscribes globally
alignmentNotifier.start()
alignmentNotifier.registerChat(sessionID, chatId)
```

### SDK Clients

```typescript
import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const client = createOpencodeClient({ baseUrl: "http://localhost:3095" })

// Subscribe to events
const { stream } = await client.event.subscribe()
for await (const event of stream) {
  console.log(event.type, event.properties)
}

// Send prompt
await client.session.prompt({
  sessionID: "abc123",
  parts: [{ type: "text", text: "Hello" }],
  agent: "build"
})
```

## Authentication

All endpoints require HTTP Basic Auth:

```
Authorization: Basic base64(mimocode:${MIMOCODE_SERVER_PASSWORD})
```

Default password: `test123`

## Architecture Decisions

### Why SSE over WebSocket?

1. **Simplicity** — SSE is HTTP-based, works through proxies/load balancers
2. **Auto-reconnect** — Browsers auto-reconnect SSE connections
3. **Unidirectional** — Server→Client events are inherently one-way
4. **HTTP/2 multiplexing** — Multiple SSE streams over single connection

### Why Central Bus?

1. **Decoupling** — Producers don't know about consumers
2. **Multiple consumers** — Same event can be consumed by TUI, Feishu, SDK, traces
3. **Type safety** — Zod schemas enforce event structure
4. **Observability** — All events flow through one point for tracing

### Event Ordering

Events are published synchronously within a single async context. The Bus delivers to subscribers in registration order. For cross-session consistency, each event carries a `sessionID` field.

## Performance Characteristics

- **Event throughput**: ~1000 events/sec sustained (tested with trace-heavy workloads)
- **SSE latency**: <5ms from publish to client receipt (local network)
- **Memory**: Bus uses weak references; disposed instances auto-cleanup
- **Backpressure**: AsyncQueue with configurable capacity prevents slow consumers from blocking producers
