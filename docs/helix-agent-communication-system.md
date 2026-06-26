# Helix Agent Communication System

## Overview

The Helix Agent Communication System enables CLI-based interaction with AI agents through a WebSocket connection. It supports two agent modes: **Ask** (read-only) and **Build** (read-write), allowing users to query codebases and execute tasks.

## Architecture

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   CLI Client    │ ────► │  Helix Server   │ ────► │   AI Agent      │
│ (helix-chat-cli)│ ◄──── │  (WebSocket)    │ ◄──── │ (Ask/Build)     │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Components

1. **HelixChat Class** (`test/utils/helix-chat.ts`)
   - Manages WebSocket connections
   - Handles session lifecycle
   - Processes streaming responses

2. **CLI Interface** (`test/utils/helix-chat-cli.ts`)
   - Command-line interface for agent interaction
   - Supports multiple commands (chat, sessions, health)

3. **Agent Modes**
   - **Ask Mode**: Read-only access for code analysis
   - **Build Mode**: Full read-write access for task execution

## Usage

### Prerequisites

1. Start the Helix server:
   ```bash
   MIMOCODE_HOME=.mimo bun run packages/opencode/src/index.ts serve --port 3096
   ```

2. Ensure the server is running:
   ```bash
   curl http://localhost:3096/health
   ```

### CLI Commands

#### Chat with Agent

```bash
# Basic syntax
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat <session_id> [options]

# Ask mode (read-only)
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent ask "What does this code do?"

# Build mode (read-write)
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent build "Create a new file"

# With options
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session \
  --agent ask \
  --timeout 120000 \
  --verbose \
  "Explain the architecture"
```

**Options:**
- `--agent <mode>`: Agent mode (`ask` or `build`, default: `ask`)
- `--timeout <ms>`: Timeout in milliseconds (default: 180000)
- `--verbose`: Enable detailed logging
- `--json`: Output raw JSON responses

#### List Sessions

```bash
bun run packages/helix-tui/test/utils/helix-chat-cli.ts sessions
```

#### Check Server Health

```bash
bun run packages/helix-tui/test/utils/helix-chat-cli.ts health
```

### Session Management

Sessions are automatically created when you start a chat. Use the same session ID to continue a conversation:

```bash
# First interaction
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent ask "Hello"

# Continue same session
bun run packages/helix-tui/test/utils/helix-chat-cli.ts chat my_session --agent ask "Tell me more"
```

## Agent Capabilities

### Ask Mode

- Read files and directories
- Search code with grep
- Analyze code structure
- Answer questions about codebase
- No file modifications allowed

**Example Use Cases:**
- "What does the `bootstrap.tsx` file do?"
- "Find all TypeScript files in src/"
- "Explain the error handling pattern"

### Build Mode

- All Ask mode capabilities
- Create and modify files
- Run commands
- Execute tasks
- Full system access

**Example Use Cases:**
- "Create a new React component"
- "Fix the bug in auth.ts"
- "Add tests for the user service"

## Response Format

The CLI displays responses in a formatted manner:

```
✅ 代理响应（耗时 12.3s，456 tokens）:

The code in bootstrap.tsx initializes the application...
```

### Streaming Output

Responses are streamed in real-time:
- **Text**: Displayed as received
- **Tool Calls**: Shown with progress indicators
- **Tool Results**: Displayed after completion

## Error Handling

### Common Errors

1. **Connection Failed**
   ```
   ❌ Health check failed: fetch failed
   ```
   - Ensure server is running
   - Check port availability

2. **Session Not Found**
   ```
   ❌ Session not found: ses_xxx
   ```
   - Use a valid session ID
   - Create a new session

3. **Timeout**
   ```
   ❌ Timeout: no response within 180s
   ```
   - Increase timeout with `--timeout`
   - Simplify the request

4. **Permission Denied**
   ```
   ❌ Permission denied: cannot write in ask mode
   ```
   - Switch to build mode for write operations

## Programming API

### HelixChat Class

```typescript
import { HelixChat } from './test/utils/helix-chat'

const chat = new HelixChat({
  serverUrl: 'http://localhost:3096',
  sessionId: 'my_session',
  timeout: 180000,
  onText: (text) => console.log(text),
  onToolCall: (call) => console.log('Tool:', call),
  onToolResult: (result) => console.log('Result:', result),
  onError: (error) => console.error('Error:', error),
  onEnd: () => console.log('Done'),
})

// Send message
await chat.sendMessage('What does this code do?', 'ask')

// Close connection
chat.close()
```

### Configuration

```typescript
interface HelixChatConfig {
  serverUrl: string      // Server URL (default: http://localhost:3096)
  sessionId?: string     // Session ID (auto-generated if not provided)
  timeout?: number       // Timeout in ms (default: 180000)
  onText?: (text: string) => void
  onToolCall?: (call: ToolCall) => void
  onToolResult?: (result: ToolResult) => void
  onError?: (error: Error) => void
  onEnd?: () => void
}
```

## Testing

### Running Tests

```bash
# Run all agent communication tests
cd packages/helix-tui && bun test test/e2e-*.test.ts

# Run specific test
cd packages/helix-tui && bun test test/e2e-user-task.test.ts
```

### Test Examples

```typescript
import { HelixChat } from './utils/helix-chat'

test('ask mode should read files', async () => {
  const chat = new HelixChat({
    serverUrl: 'http://localhost:3096',
    sessionId: 'test_session',
    onText: (text) => { /* handle response */ },
  })

  await chat.sendMessage('Read package.json', 'ask')
  chat.close()
})
```

## Troubleshooting

### Server Not Starting

```bash
# Check if port is in use
lsof -i :3096

# Kill existing process
kill -9 <PID>

# Restart server
MIMOCODE_HOME=.mimo bun run packages/opencode/src/index.ts serve --port 3096
```

### Connection Issues

```bash
# Test connection
curl http://localhost:3096/health

# Check server logs
tail -f /tmp/helix-server.log
```

### Performance Issues

1. Increase timeout for complex tasks
2. Use `--verbose` to monitor progress
3. Break large tasks into smaller ones

## Best Practices

1. **Session Management**
   - Use descriptive session IDs
   - Reuse sessions for related tasks
   - Clean up old sessions

2. **Agent Selection**
   - Use Ask mode for queries
   - Use Build mode only when necessary
   - Verify Build mode changes

3. **Error Handling**
   - Always check server health first
   - Implement retry logic for transient errors
   - Log errors for debugging

4. **Performance**
   - Set appropriate timeouts
   - Use streaming for long responses
   - Monitor token usage

## Related Documentation

- [Helix Architecture](./helix-agent-architecture.md)
- [TUI Framework Alignment](./helix-tui-framework-alignment.md)
- [Testing Guide](./helix-tui-test-plan.md)
