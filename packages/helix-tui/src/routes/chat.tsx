import { createSignal, For, Show, onMount, onCleanup, batch, createMemo } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect } from "../ui/dialog-select"
import { DialogAlert } from "../ui/dialog-alert"
import { SessionInfoPanel } from "../component/session-info-panel"
import * as trace from "../trace"

type Mode = {
  id: string
  label: string
  description: string
  color: "info" | "success" | "warning" | "accent"
}

const MODES: Mode[] = [
  { id: "ask", label: "Ask", description: "纯对话，不改代码", color: "info" },
  { id: "build", label: "Build", description: "标准开发，读写代码", color: "success" },
  { id: "plan", label: "Plan", description: "规划模式，只读不写", color: "warning" },
  { id: "compose", label: "Compose", description: "组合模式，技能注入", color: "accent" },
  { id: "loop", label: "Loop", description: "循环模式，自动重试", color: "warning" },
  { id: "max", label: "Max", description: "最大能力，全工具开放", color: "error" as any },
]

type ToolCall = {
  id: string
  name: string
  input: string
  output?: string
  status: "running" | "done" | "error"
}

export type DisplayMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  status?: "pending" | "streaming" | "done" | "error"
  error?: string
  toolCalls?: ToolCall[]
  agent?: string
  model?: string
}

type SessionInfo = {
  id: string
  title: string
  createdAt?: number
}

type PermissionRequest = {
  id: string
  permission: string
  patterns: string[]
  message: string
}

type QuestionRequest = {
  id: string
  question: string
  options?: string[]
}

export function Chat() {
  const theme = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const dimensions = useTerminalDimensions()

  const wide = createMemo(() => dimensions().width > 120)

  // Session state
  const [sessionID, setSessionID] = createSignal<string | null>(null)
  const [sessionTitle, setSessionTitle] = createSignal("New Chat")
  const [sessions, setSessions] = createSignal<SessionInfo[]>([])
  const [showSessionList, setShowSessionList] = createSignal(false)

  // Message state
  const [messages, setMessages] = createSignal<DisplayMessage[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [permission, setPermission] = createSignal<PermissionRequest | null>(null)
  const [question, setQuestion] = createSignal<QuestionRequest | null>(null)

  // Mode state
  const [mode, setMode] = createSignal<Mode>(MODES[1]!) // default: build

  // Model state
  const [currentModel, setCurrentModel] = createSignal<string>("mimo-v2.5-pro")
  const MODELS = ["mimo-v2.5-pro", "mimo-v2-flash", "gpt-4o", "claude-sonnet-4"]

  // Input history
  const [inputHistory, setInputHistory] = createSignal<string[]>([])
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [draftInput, setDraftInput] = createSignal("")

  function cycleModel() {
    const idx = MODELS.indexOf(currentModel())
    setCurrentModel(MODELS[(idx + 1) % MODELS.length]!)
    trace.emit("user.navigate", "info", `Model changed: ${currentModel()}`, { model: currentModel() })
  }

  let textarea: any
  let scroll: any

  // Load session list from server
  async function loadSessions() {
    try {
      const { data, error: err } = await sdk.client.session.list({ limit: 50 })
      if (data && !err) {
        const list: SessionInfo[] = data.map((s: any) => ({
          id: s.id,
          title: s.title || "Untitled",
          createdAt: s.time?.created,
        }))
        setSessions(list)
      }
    } catch {}
  }

  // Switch to a specific session
  async function switchSession(sid: string) {
    if (sid === sessionID()) return

    setSessionID(sid)
    setMessages([])
    setError(null)
    setPermission(null)
    setQuestion(null)

    const session = sessions().find((s) => s.id === sid)
    if (session) setSessionTitle(session.title)

    await loadMessages(sid)
    setShowSessionList(false)

    // Persist last session ID
    try { localStorage.setItem("helix-tui:lastSessionID", sid) } catch {}

    trace.emit("user.navigate", "info", "Switched session", { sessionID: sid })
  }

  // Create a new unnamed session
  async function newSession() {
    setSessionID(null)
    setSessionTitle("New Chat")
    setMessages([])
    setError(null)
    setPermission(null)
    setQuestion(null)
    setShowSessionList(false)

    try { localStorage.removeItem("helix-tui:lastSessionID") } catch {}

    trace.emit("user.navigate", "info", "New session")
  }

  // Create a new named session via dialog
  async function newNamedSession() {
    const title = await DialogPrompt.show(dialog, "New Session", {
      placeholder: "Enter session title...",
      value: `${mode().label} Chat`,
    })
    if (title == null) return

    trace.emit("session.create", "info", "Creating named session", { title })
    const { data, error: err } = await sdk.client.session.create({ title })
    if (err || !data) {
      trace.emit("session.error", "error", "Failed to create named session", { error: err ? JSON.stringify(err) : "no data" })
      DialogAlert.show(dialog, "Error", "Failed to create session. Please try again.")
      return
    }

    setSessionID(data.id)
    setSessionTitle(data.title)
    setMessages([])
    setError(null)
    setPermission(null)
    setQuestion(null)
    setShowSessionList(false)

    try { localStorage.setItem("helix-tui:lastSessionID", data.id) } catch {}

    loadSessions()
    trace.emit("session.created", "info", "Named session created", { sessionID: data.id, title: data.title })
  }

  // Delete current session
  async function handleDeleteSession() {
    const sid = sessionID()
    if (!sid) return
    const title = sessionTitle()
    const confirmed = await DialogConfirm.show(dialog, "Delete Session", `Delete "${title}"?`)
    if (confirmed !== true) return

    trace.emit("session.delete", "info", "Deleting session", { sessionID: sid })
    try {
      await sdk.client.session.delete({ sessionID: sid })
      DialogAlert.show(dialog, "Deleted", `Session "${title}" deleted.`)
      newSession()
      loadSessions()
    } catch {
      DialogAlert.show(dialog, "Error", "Failed to delete session.")
    }
  }

  // Rename current session
  async function renameSession() {
    const sid = sessionID()
    if (!sid) return
    const newTitle = await DialogPrompt.show(dialog, "Rename Session", {
      placeholder: "Enter new title...",
      value: sessionTitle(),
    })
    if (newTitle == null) return

    trace.emit("session.rename", "info", "Renaming session", { sessionID: sid, newTitle })
    try {
      await sdk.client.session.update({ sessionID: sid, title: newTitle })
      setSessionTitle(newTitle)
      loadSessions()
    } catch {
      DialogAlert.show(dialog, "Error", "Failed to rename session.")
    }
  }

  // Open session dialog for switching
  async function openSessionDialog() {
    const opts = sessions().map((s) => ({
      title: s.title,
      value: s.id,
      description: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : undefined,
    }))
    const selected = await DialogSelect.show(dialog, "Switch Session", opts, sessionID() ?? undefined)
    if (selected) {
      await switchSession(selected.value)
    }
  }

  const addMessage = (role: DisplayMessage["role"], content: string, status?: DisplayMessage["status"]) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        role,
        content,
        timestamp: Date.now(),
        status: status ?? "done",
      },
    ])
  }

  const updateLastAssistant = (content: string, status: DisplayMessage["status"], errorMsg?: string) => {
    setMessages((prev) => {
      const next: DisplayMessage[] = prev.map((m) => ({ ...m }))
      for (let i = next.length - 1; i >= 0; i--) {
        const msg = next[i]
        if (msg && msg.role === "assistant") {
          next[i] = { ...msg, content, status, error: errorMsg }
          break
        }
      }
      return next
    })
  }

  async function ensureSession(): Promise<string> {
    let sid = sessionID()
    if (sid) return sid

    trace.emit("session.create", "info", "Creating new session")

    let lastError: any = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error: err } = await sdk.client.session.create({ title: `${mode().label} Chat` })
      if (data && !err) {
        setSessionID(data.id)
        setSessionTitle(data.title)
        trace.emit("session.created", "info", "Session created", { sessionID: data.id, title: data.title, attempt })
        loadSessions()
        try { localStorage.setItem("helix-tui:lastSessionID", data.id) } catch {}
        return data.id
      }
      lastError = err
      trace.emit("session.error", "warn", `Session creation attempt ${attempt} failed`, {
        error: err ? JSON.stringify(err) : "no data",
        attempt,
        willRetry: attempt < 3,
      })
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500))
    }

    const errMsg = lastError ? JSON.stringify(lastError) : "No response from server"
    trace.emit("session.error", "error", "Session creation failed after retries", { error: errMsg })
    throw new Error(`Failed to create session: ${errMsg}`)
  }

  async function loadMessages(sid: string) {
    const { data, error: err } = await sdk.client.session.messages({ sessionID: sid, limit: 100 })
    if (err || !data) return

    const display: DisplayMessage[] = []
    for (const msg of data) {
      const info = msg.info
      if (!Array.isArray(msg.parts)) continue
      const textParts = msg.parts.filter((p: any) => p.type === "text")
      const toolParts = msg.parts.filter((p: any) => p.type === "tool-call" || p.type === "tool-result")
      const content = textParts.map((p: any) => p.text).join("\n")
      if (!content && info.role === "user" && toolParts.length === 0) continue

      const toolCalls: ToolCall[] = toolParts.map((p: any) => ({
        id: p.id || Math.random().toString(36).slice(2),
        name: p.name || p.toolName || "unknown",
        input: typeof p.input === "string" ? p.input : JSON.stringify(p.input ?? p.args ?? {}, null, 2),
        output: p.output || p.result || undefined,
        status: p.state === "running" ? "running" : p.state === "error" ? "error" : "done",
      }))

      display.push({
        id: info.id,
        role: info.role as DisplayMessage["role"],
        content: content || (toolCalls.length > 0 ? "" : "(no text content)"),
        timestamp: (info as any).time?.created ?? Date.now(),
        status: "done",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        agent: (info as any).agent,
        model: (info as any).model?.modelID,
      })
    }
    setMessages(display)
  }

  async function handleSend() {
    let text = ""
    try { text = (textarea?.plainText ?? "").trim() } catch {}
    if (!text || isLoading()) return

    if (text.length > 100000) {
      trace.emit("ui.error", "warn", "Message too long", { length: text.length })
      setError("Message too long (max 100,000 characters)")
      return
    }

    trace.emit("user.send", "info", `User sent message (${text.length} chars) [${mode().id}]`, { length: text.length, mode: mode().id }, sessionID() ?? undefined)

    batch(() => {
      addMessage("user", text)
      addMessage("assistant", "", "pending")
      setIsLoading(true)
      setError(null)
    })

    if (textarea) {
      try { textarea.clear() } catch { /* EditBuffer may be destroyed in test environments */ }
    }

    // Save to input history (deduplicated, max 50)
    setInputHistory((prev) => {
      const filtered = prev.filter((h) => h !== text)
      const next = [text, ...filtered].slice(0, 50)
      return next
    })
    setHistoryIndex(-1)
    setDraftInput("")

    try {
      const sid = await ensureSession()
      trace.emit("session.prompt", "info", "Sending prompt to server", { sessionID: sid, length: text.length, mode: mode().id }, sid)

      const { data, error: err } = await sdk.client.session.prompt({
        sessionID: sid,
        parts: [{ type: "text", text }],
        agent: mode().id,
        modelRef: currentModel(),
      })

      console.log("DEBUG prompt response:", JSON.stringify({ data, err }))

      if (err || !data || !Array.isArray(data.parts)) {
        const errMsg = err ? JSON.stringify(err) : data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : !Array.isArray(data.parts) ? "Invalid response format from server" : "No response from server"
        trace.emit("session.error", "error", "Prompt failed", { error: errMsg }, sid)
        updateLastAssistant("", "error", `Server error: ${errMsg}`)
        setError(`Prompt failed: ${errMsg}`)
        return
      }

      const textParts = data.parts.filter((p: any) => p.type === "text")
      const content = textParts.map((p: any) => p.text).join("\n")
      trace.emit("session.prompt_response", "info", "Received response", { length: content.length }, sid)
      updateLastAssistant(content || "(no text response)", "done")
    } catch (e: any) {
      const errMsg = e.message || "Unknown error"
      trace.emit("session.error", "error", "Prompt exception", { error: errMsg }, sessionID() ?? undefined)
      updateLastAssistant("", "error", errMsg)
      setError(errMsg)
    } finally {
      setIsLoading(false)
    }
  }

  async function retryMessage(msg: DisplayMessage) {
    // Find the last user message before this assistant message
    const msgs = messages()
    const idx = msgs.findIndex((m) => m.id === msg.id)
    if (idx < 0) return

    let userText = ""
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i]!.role === "user") {
        userText = msgs[i]!.content
        break
      }
    }
    if (!userText) return

    // Remove the failed assistant message and re-send
    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    setError(null)

    if (textarea) {
      try { textarea.setPlainText(userText) } catch { /* EditBuffer may be destroyed in test environments */ }
    }
    await handleSend()
  }

  async function handleAbort() {
    const sid = sessionID()
    if (!sid) return
    trace.emit("user.abort", "info", "User aborted session", { sessionID: sid }, sid)
    try { await sdk.client.session.abort({ sessionID: sid }) } catch {}
  }

  async function handlePermissionReply(reply: "once" | "always" | "reject") {
    const perm = permission()
    if (!perm) return
    trace.emit("user.permission_reply", "info", `User replied to permission: ${reply}`, { permission: perm.permission, reply, patterns: perm.patterns }, sessionID() ?? undefined)
    try {
      await sdk.client.permission.reply({ requestID: perm.id, reply })
      setPermission(null)
    } catch {}
  }

  async function handleQuestionReply(answer: string) {
    const q = question()
    if (!q) return
    trace.emit("user.question_reply", "info", `User answered question: ${answer}`, { question: q.question, answer }, sessionID() ?? undefined)
    try {
      await sdk.client.question.reply({ requestID: q.id, answers: [[answer]] })
      setQuestion(null)
    } catch {}
  }

  // SSE event subscription
  const unsub = sdk.subscribe((event) => {
    const payload = (event as any).payload ?? event
    const type = payload?.type
    const props = payload?.properties
    if (!type || !props) return

    const sid = sessionID()
    if (props.sessionID && sid && props.sessionID !== sid) return

    if (type === "message.part.delta" && props.field === "text") {
      trace.emit("event.delta", "debug", "Received text delta", { delta: (props.delta ?? "").length }, sid ?? undefined)
      setMessages((prev) => {
        const next: DisplayMessage[] = prev.map((m) => ({ ...m }))
        for (let i = next.length - 1; i >= 0; i--) {
          const msg = next[i]
          if (msg && msg.role === "assistant" && msg.status === "pending") {
            next[i] = { ...msg, content: msg.content + (props.delta ?? ""), status: "streaming" }
            break
          }
        }
        return next
      })
    }

    // Tool call start
    if (type === "tool.call.start" || (type === "message.part.delta" && props.field === "tool-call")) {
      const toolId = props.id || props.toolID || Math.random().toString(36).slice(2)
      const toolName = props.name || props.toolName || "tool"
      const toolInput = props.input || props.args || ""
      setMessages((prev) => {
        const next: DisplayMessage[] = prev.map((m) => ({ ...m }))
        for (let i = next.length - 1; i >= 0; i--) {
          const msg = next[i]
          if (msg && msg.role === "assistant") {
            const existing = msg.toolCalls ? [...msg.toolCalls] : []
            const idx = existing.findIndex((t) => t.id === toolId)
            if (idx >= 0) {
              existing[idx] = { ...existing[idx]!, status: "running", input: typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput) }
            } else {
              existing.push({ id: toolId, name: toolName, input: typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput), status: "running" })
            }
            next[i] = { ...msg, toolCalls: existing }
            break
          }
        }
        return next
      })
    }

    // Tool call end
    if (type === "tool.call.end" || (type === "message.part.delta" && props.field === "tool-result")) {
      const toolId = props.id || props.toolID
      const toolOutput = props.output || props.result || ""
      const toolError = props.error
      setMessages((prev) => {
        const next: DisplayMessage[] = prev.map((m) => ({ ...m }))
        for (let i = next.length - 1; i >= 0; i--) {
          const msg = next[i]
          if (msg && msg.role === "assistant" && msg.toolCalls) {
            const updated = msg.toolCalls.map((t) =>
              t.id === toolId
                ? { ...t, status: toolError ? "error" as const : "done" as const, output: toolError || (typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput)) }
                : t,
            )
            next[i] = { ...msg, toolCalls: updated }
            break
          }
        }
        return next
      })
    }

    if (type === "session.idle") {
      trace.emit("session.idle", "info", "Session idle", {}, sid ?? undefined)
      setIsLoading(false)
      setMessages((prev) => {
        const next: DisplayMessage[] = prev.map((m) => ({ ...m }))
        for (let i = next.length - 1; i >= 0; i--) {
          const msg = next[i]
          if (msg && msg.role === "assistant" && msg.status === "streaming") {
            next[i] = { ...msg, status: "done" }
            break
          }
        }
        return next
      })
    }

    if (type === "session.error") {
      setIsLoading(false)
      const errMsg = props.error?.message ?? "Unknown error"
      trace.emit("session.error", "error", "Session error from server", { error: errMsg }, sid ?? undefined)
      setError(errMsg)
      updateLastAssistant("", "error", errMsg)
    }

    if (type === "permission.asked") {
      trace.emit("event.permission_asked", "info", `Permission requested: ${props.permission}`, { permission: props.permission, patterns: props.patterns }, sid ?? undefined)
      setPermission({
        id: props.id,
        permission: props.permission,
        patterns: props.patterns ?? [],
        message: `Permission required: ${props.permission} on ${(props.patterns ?? []).join(", ")}`,
      })
    }

    if (type === "question.asked") {
      trace.emit("event.question_asked", "info", `Question asked: ${props.question}`, { question: props.question, options: props.options }, sid ?? undefined)
      setQuestion({
        id: props.id,
        question: props.question ?? "Agent needs your input",
        options: props.options,
      })
    }
  })

  onCleanup(() => unsub())

  // Keyboard shortcuts
  useKeyboard((evt) => {
    if (evt.name === "f2") {
      cycleModel()
    }
    if (evt.name === "tab" && !evt.shift) {
      const idx = MODES.findIndex((m) => m.id === mode().id)
      setMode(MODES[(idx + 1) % MODES.length]!)
      trace.emit("user.navigate", "info", `Mode changed: ${mode().id}`, { mode: mode().id })
    }
    if (evt.name === "tab" && evt.shift) {
      const idx = MODES.findIndex((m) => m.id === mode().id)
      setMode(MODES[(idx - 1 + MODES.length) % MODES.length]!)
      trace.emit("user.navigate", "info", `Mode changed: ${mode().id}`, { mode: mode().id })
    }
  })

  // Load sessions on mount + auto-recovery
  onMount(() => {
    loadSessions().then(() => {
      // Auto-recovery: try to restore last session
      try {
        const lastID = localStorage.getItem("helix-tui:lastSessionID")
        if (lastID) {
          const exists = sessions().find((s) => s.id === lastID)
          if (exists) {
            switchSession(lastID)
          } else {
            localStorage.removeItem("helix-tui:lastSessionID")
          }
        }
      } catch {}
    })
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  return (
    <box flexDirection="row" flexGrow={1}>
      {/* Session list sidebar */}
      <Show when={showSessionList()}>
        <box
          flexDirection="column"
          width={30}
          flexShrink={0}
          border={true}
          borderColor={theme.getColor("border")}
          backgroundColor={theme.getColor("backgroundSecondary")}
        >
          <box height={1} flexDirection="row" paddingLeft={1} justifyContent="space-between">
            <text fg={theme.getColor("primary")} attributes={1}>Sessions</text>
            <text fg={theme.getColor("textMuted")} onMouseDown={() => setShowSessionList(false)}>[X]</text>
          </box>
          <box height={1} />
          <text fg={theme.getColor("success")} paddingLeft={1} onMouseDown={() => newSession()}>+ New Session</text>
          <box height={1} />
          <scrollbox flexGrow={1}>
            <For each={sessions()}>
              {(s) => (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={s.id === sessionID() ? theme.getColor("backgroundTertiary") : undefined}
                  onMouseDown={() => switchSession(s.id)}
                >
                  <text fg={s.id === sessionID() ? theme.getColor("primary") : theme.getColor("text")} attributes={s.id === sessionID() ? 1 : 0}>
                    {s.title.slice(0, 26)}
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
        </box>
      </Show>

      {/* Main chat area */}
      <box flexDirection="column" flexGrow={1}>
        {/* Header */}
        <box height={1} backgroundColor={theme.getColor("backgroundSecondary")} paddingLeft={1} flexDirection="row">
          <text fg={theme.getColor("primary")} attributes={1}>AI Chat</text>
          <text fg={theme.getColor("textMuted")}> {sessionTitle()}</text>
          <text fg={sdk.connected() ? theme.getColor("success") : theme.getColor("error")}>
            {" "}{sdk.connected() ? "●" : "○"}
          </text>
          <box flexGrow={1} />
          <text fg={theme.getColor("textMuted")} onMouseDown={newNamedSession}>[+New]</text>
          <text fg={theme.getColor("textMuted")} onMouseDown={renameSession}>[Rename]</text>
          <text fg={theme.getColor("textMuted")} onMouseDown={handleDeleteSession}>[Delete]</text>
          <text fg={theme.getColor("textMuted")} onMouseDown={cycleModel}>
            [F2: {currentModel()}]
          </text>
          <text fg={theme.getColor("textMuted")} onMouseDown={() => setShowSessionList(!showSessionList())}>
            {" "}[Sessions]
          </text>
        </box>

        {/* Mode selector */}
        <box height={1} paddingLeft={1} flexDirection="row" gap={1}>
          <text fg={theme.getColor("textMuted")}>Mode:</text>
          <For each={MODES}>
            {(m) => (
              <text
                fg={mode().id === m.id ? theme.getColor(m.color) : theme.getColor("textMuted")}
                attributes={mode().id === m.id ? 1 : 0}
                onMouseDown={() => {
                  setMode(m)
                  trace.emit("user.navigate", "info", `Mode changed: ${m.id}`, { mode: m.id })
                }}
              >
                [{m.label}]
              </text>
            )}
          </For>
        </box>

        {/* Permission prompt */}
        <Show when={permission()}>
          {(perm) => (
            <box flexDirection="column" border borderColor={theme.getColor("warning")} paddingLeft={1} paddingRight={1}>
              <text fg={theme.getColor("warning")} attributes={1}>{"△ "}{perm().message}</text>
              <box flexDirection="row" gap={1}>
                <text fg={theme.getColor("success")} onMouseDown={() => handlePermissionReply("once")}>[Allow]</text>
                <text fg={theme.getColor("primary")} onMouseDown={() => handlePermissionReply("always")}>[Always]</text>
                <text fg={theme.getColor("error")} onMouseDown={() => handlePermissionReply("reject")}>[Reject]</text>
              </box>
            </box>
          )}
        </Show>

        {/* Question prompt */}
        <Show when={question()}>
          {(q) => (
            <box flexDirection="column" border borderColor={theme.getColor("info")} paddingLeft={1} paddingRight={1}>
              <text fg={theme.getColor("info")} attributes={1}>{"? "}{q().question}</text>
              <Show when={q().options?.length}>
                <box flexDirection="row" gap={1} flexWrap="wrap">
                  <For each={q().options}>
                    {(opt) => (
                      <text fg={theme.getColor("primary")} onMouseDown={() => handleQuestionReply(opt)}>
                        [{opt}]
                      </text>
                    )}
                  </For>
                </box>
              </Show>
            </box>
          )}
        </Show>

        {/* Messages */}
        <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
          <scrollbox ref={(r: any) => (scroll = r)} stickyScroll={true} stickyStart="bottom" flexGrow={1}>
            <Show when={messages().length === 0}>
              <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} height={10}>
                <text fg={theme.getColor("primary")} attributes={1}>Welcome to Helix AI</text>
                <box height={1} />
                <text fg={theme.getColor("textMuted")}>Mode: {mode().label} — {mode().description}</text>
                <text fg={theme.getColor("textMuted")}>Type a message below to start.</text>
              </box>
            </Show>

            <For each={messages()}>
              {(msg) => (
                <box flexDirection="column" marginBottom={1}>
                  {/* Message header */}
                  <box flexDirection="row">
                    <text
                      fg={
                        msg.role === "user"
                          ? theme.getColor("primary")
                          : msg.role === "assistant"
                            ? theme.getColor("secondary")
                            : theme.getColor("warning")
                      }
                      attributes={1}
                    >
                      {msg.role === "user" ? "You" : msg.role === "assistant" ? "Helix" : "System"}:
                    </text>
                    <Show when={msg.agent}>
                      <text fg={theme.getColor("accent")}> [{msg.agent}]</text>
                    </Show>
                    <Show when={msg.model}>
                      <text fg={theme.getColor("textMuted")}> {msg.model}</text>
                    </Show>
                    <text fg={theme.getColor("textMuted")}> {formatTime(msg.timestamp)}</text>
                    <Show when={msg.status === "streaming"}>
                      <text fg={theme.getColor("accent")}> {" "}streaming...</text>
                    </Show>
                    <Show when={msg.status === "pending"}>
                      <text fg={theme.getColor("textMuted")}> {" "}thinking...</text>
                    </Show>
                    <Show when={msg.status === "error"}>
                      <text fg={theme.getColor("error")}> {" "}error</text>
                    </Show>
                    <Show when={msg.status === "error"}>
                      <text fg={theme.getColor("warning")} onMouseDown={() => retryMessage(msg)}> [Retry]</text>
                    </Show>
                  </box>

                  {/* Text content */}
                  <Show when={msg.content}>
                    <text fg={theme.getColor("text")} paddingLeft={2}>
                      {msg.content}
                    </text>
                  </Show>

                  {/* Tool calls */}
                  <Show when={msg.toolCalls?.length}>
                    <For each={msg.toolCalls}>
                      {(tool) => (
                        <box flexDirection="column" paddingLeft={2} marginTop={1}>
                          <box flexDirection="row">
                            <text fg={theme.getColor("accent")} attributes={1}>
                              {tool.status === "running" ? "⟳" : tool.status === "error" ? "✗" : "✓"} {tool.name}
                            </text>
                            <Show when={tool.status === "running"}>
                              <text fg={theme.getColor("textMuted")}> running...</text>
                            </Show>
                          </box>
                          <Show when={tool.input}>
                            <text fg={theme.getColor("textMuted")} paddingLeft={2}>
                              {tool.input.length > 200 ? tool.input.slice(0, 200) + "..." : tool.input}
                            </text>
                          </Show>
                          <Show when={tool.output && tool.status === "done"}>
                            <text fg={theme.getColor("text")} paddingLeft={2}>
                              {tool.output!.length > 500 ? tool.output!.slice(0, 500) + "..." : tool.output}
                            </text>
                          </Show>
                          <Show when={tool.output && tool.status === "error"}>
                            <text fg={theme.getColor("error")} paddingLeft={2}>
                              {tool.output}
                            </text>
                          </Show>
                        </box>
                      )}
                    </For>
                  </Show>

                  {/* Error */}
                  <Show when={msg.error}>
                    <text fg={theme.getColor("error")} paddingLeft={2}>
                      {msg.error}
                    </text>
                  </Show>
                </box>
              )}
            </For>
          </scrollbox>
        </box>

        {/* Error bar */}
        <Show when={error()}>
          <box paddingLeft={1}>
            <text fg={theme.getColor("error")}>{error()}</text>
          </box>
        </Show>

        {/* Input area */}
        <box height={3} border borderColor={theme.getColor("border")} flexDirection="row" paddingLeft={1} alignItems="center">
          <text fg={theme.getColor("primary")}>{"> "}</text>
          <textarea
            ref={(r: any) => {
              textarea = r
              if (r) {
                setTimeout(() => {
                  if (!r || r.isDestroyed) return
                  r.focus()
                }, 0)
              }
            }}
            flexGrow={1}
            minHeight={1}
            maxHeight={1}
            placeholder={`${mode().label} | ${currentModel()} | Enter=send, Tab=mode, F2=model, Up=history`}
            placeholderColor={theme.getColor("textMuted")}
            textColor={theme.getColor("text")}
            focusedTextColor={theme.getColor("text")}
            onContentChange={() => {
              // no-op: we read textarea.plainText directly in handleSend
            }}
            keyBindings={[
              { name: "return", action: "submit" },
              { name: "return", shift: true, action: "newline" },
            ]}
            onSubmit={() => {
              setTimeout(() => setTimeout(() => handleSend(), 0), 0)
            }}
            onKeyDown={(e: any) => {
              if (e.name === "escape") {
                handleAbort()
                return
              }
              if (e.name === "up") {
                const hist = inputHistory()
                if (hist.length === 0) return
                const idx = historyIndex()
                if (idx < 0) {
                  // Save current draft
                  try { setDraftInput(textarea?.plainText ?? "") } catch {}
                }
                const newIdx = Math.min(idx + 1, hist.length - 1)
                if (newIdx !== idx) {
                  setHistoryIndex(newIdx)
                  if (textarea) {
                    try { textarea.setPlainText(hist[newIdx]!) } catch {}
                  }
                }
                e.preventDefault()
                e.stopPropagation()
                return
              }
              if (e.name === "down") {
                const idx = historyIndex()
                if (idx < 0) return
                const newIdx = idx - 1
                if (newIdx >= 0) {
                  setHistoryIndex(newIdx)
                  if (textarea) {
                    try { textarea.setPlainText(inputHistory()[newIdx]!) } catch {}
                  }
                } else {
                  setHistoryIndex(-1)
                  if (textarea) {
                    try { textarea.setPlainText(draftInput()) } catch {}
                  }
                }
                e.preventDefault()
                e.stopPropagation()
                return
              }
            }}
            onMouseDown={(e: any) => e.target?.focus()}
            focusedBackgroundColor={theme.getColor("backgroundSecondary")}
            cursorColor={theme.getColor("text")}
          />
          <Show when={isLoading()}>
            <text fg={theme.getColor("warning")} onMouseDown={handleAbort}> [Stop] </text>
          </Show>
        </box>
      </box>

      {/* Right info panel */}
      <SessionInfoPanel
        sessionID={sessionID()}
        sessionTitle={sessionTitle()}
        connected={sdk.connected()}
        messages={messages()}
        mode={mode().label}
        model={currentModel()}
        wide={wide()}
      />
    </box>
  )
}
