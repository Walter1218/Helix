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

type PreFlightQuestion = {
  id: string
  text: string
  questionType: string
  options?: string[]
}

type PreFlightState = {
  active: boolean
  score: number
  mode: string
  questions: PreFlightQuestion[]
  answers: Record<string, string>
  currentIndex: number
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

/* ── Phase 2b: Cardinal / Judge / AlignmentGuard ── */
type CardinalAlert = {
  id: string
  type: string
  severity: "block" | "pause" | "warn" | "stop"
  message: string
  countdown?: number
  autoDegrade?: boolean
  resolved?: boolean
  action?: "allow" | "ignore" | "block"
}

type JudgeVerdict = {
  id: string
  status: "pass" | "reject" | "question" | "rollback" | "fail"
  checks: Array<{ name: string; passed: boolean; detail?: string }>
  summary: string
}

type AlignmentAlert = {
  id: string
  alertType: "drift" | "rabbitHole" | "fileDrift" | "distraction" | "rabbit-hole" | "file-drift"
  severity: "warning" | "critical"
  message: string
  metrics?: Record<string, number>
}

/* ── Phase 3a: SubAgent ── */
type SubAgent = {
  id: string
  name: string
  status: "spawned" | "running" | "complete" | "error" | "aborted"
  progress?: { current: number; total: number }
  result?: string
}

/* ── Phase 3b: Mode Registry ── */
type ModeRegistryState = {
  modes: Mode[]
  loaded: boolean
}

/* ── Phase 4: Decomposition / Persona / AgentStats ── */
type SubTask = {
  id: string
  name: string
  status: string
}

type DecompositionState = {
  active: boolean
  subtasks: SubTask[]
  confidence?: number
  status: "required" | "complete" | "failed" | "decision"
}

type PersonaState = {
  active: true
  name: string
  description: string
  temporary: boolean
}

type AgentStatsState = {
  active: true
  successRate: number
  avgDuration: number
  totalTasks: number
  level: "L0" | "L1" | "L2"
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
  const [currentModel, setCurrentModel] = createSignal<string>("standard")
  const MODELS = ["standard", "ultra", "lite"]

  const [preFlight, setPreFlight] = createSignal<PreFlightState | null>(null)

  // Phase 2b signals
  const [cardinalAlerts, setCardinalAlerts] = createSignal<CardinalAlert[]>([])
  const [judgeVerdict, setJudgeVerdict] = createSignal<JudgeVerdict | null>(null)
  const [alignmentAlerts, setAlignmentAlerts] = createSignal<AlignmentAlert[]>([])

  // Phase 3a signals
  const [subAgents, setSubAgents] = createSignal<SubAgent[]>([])
  const [barrierWaiting, setBarrierWaiting] = createSignal(false)
  const [barrierPendingCount, setBarrierPendingCount] = createSignal(0)

  // Phase 3b signals
  const [modeRegistry, setModeRegistry] = createSignal<ModeRegistryState>({ modes: MODES, loaded: false })

  // Phase 4 signals
  const [decomposition, setDecomposition] = createSignal<DecompositionState | null>(null)
  const [persona, setPersona] = createSignal<PersonaState | null>(null)
  const [agentStats, setAgentStats] = createSignal<AgentStatsState | null>(null)

  // Input history
  const [inputHistory, setInputHistory] = createSignal<string[]>([])
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [draftInput, setDraftInput] = createSignal("")

  function handlePreFlightSelect(num: number) {
    const pf = preFlight()
    if (!pf) return
    const q = pf.questions[pf.currentIndex]
    if (!q || !q.options || num > q.options.length || num < 1) return
    const selected = q.options[num - 1]!
    setPreFlight((prev) => {
      if (!prev) return prev
      return { ...prev, answers: { ...prev.answers, [q.id]: selected } }
    })
    trace.emit("preflight.answer", "info", "User selected preflight option", { questionId: q.id, answer: selected })
  }

  function handlePreFlightConfirm() {
    const pf = preFlight()
    if (!pf) return
    trace.emit("preflight.confirm", "info", "User confirmed preflight", { answers: pf.answers })
    setPreFlight((prev) => prev ? { ...prev, active: false } : prev)
  }

  function handlePreFlightSkip() {
    trace.emit("preflight.skip", "info", "User skipped preflight")
    setPreFlight(null)
  }

  function cycleModel() {
    const idx = MODELS.indexOf(currentModel())
    setCurrentModel(MODELS[(idx + 1) % MODELS.length]!)
    trace.emit("user.navigate", "info", `Model changed: ${currentModel()}`, { model: currentModel() })
  }

  const effectiveModes = () => modeRegistry().modes.length > 0 ? modeRegistry().modes : MODES

  function cycleMode(direction: 1 | -1) {
    const modes = effectiveModes()
    const idx = modes.findIndex((m) => m.id === mode().id)
    setMode(modes[(idx + direction + modes.length) % modes.length]!)
    trace.emit("user.navigate", "info", `Mode changed: ${mode().id}`, { mode: mode().id })
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
        trace.emit("session.list.loaded", "info", `Loaded ${list.length} sessions`, { count: list.length })
      } else {
        trace.emit("session.list.error", "warn", "Failed to load sessions", { error: err ? JSON.stringify(err) : "no data" })
      }
    } catch (e: any) {
      trace.emit("session.list.error", "error", "Exception loading sessions", { error: e.message })
    }
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
      trace.emit("session.deleted", "info", "Session deleted", { sessionID: sid, title })
      DialogAlert.show(dialog, "Deleted", `Session "${title}" deleted.`)
      newSession()
      loadSessions()
    } catch (e: any) {
      trace.emit("session.delete.error", "error", "Failed to delete session", { sessionID: sid, error: e.message })
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
      trace.emit("session.renamed", "info", "Session renamed", { sessionID: sid, newTitle })
    } catch (e: any) {
      trace.emit("session.rename.error", "error", "Failed to rename session", { sessionID: sid, error: e.message })
      DialogAlert.show(dialog, "Error", "Failed to rename session.")
    }
  }

  // Open session dialog for switching
  async function openSessionDialog() {
    trace.emit("session.dialog.open", "info", "Opening session switch dialog", { count: sessions().length })
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
    trace.emit("session.messages.load", "info", "Loading messages", { sessionID: sid }, sid)
    const { data, error: err } = await sdk.client.session.messages({ sessionID: sid, limit: 100 })
    if (err || !data) {
      trace.emit("session.messages.error", "warn", "Failed to load messages", { error: err ? JSON.stringify(err) : "no data" }, sid)
      return
    }

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
    trace.emit("session.messages.loaded", "info", `Loaded ${display.length} messages`, { sessionID: sid, count: display.length }, sid)
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

      if (err || !data || !Array.isArray(data.parts)) {
        const errMsg = err ? JSON.stringify(err) : data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : !Array.isArray(data.parts) ? "Invalid response format from server" : "No response from server"
        trace.emit("session.error", "error", "Prompt failed", { error: errMsg }, sid)
        updateLastAssistant("", "error", `Server error: ${errMsg}`)
        setError(`Prompt failed: ${errMsg}`)
        return
      }

      const textParts = data.parts.filter((p: any) => p.type === "text")
      const content = textParts.map((p: any) => p.text).join("\n")
      if (content) {
        trace.emit("session.prompt_response", "info", "Received direct response", { length: content.length }, sid)
        updateLastAssistant(content, "done")
      } else if (data.parts.length === 0) {
        // Streaming mode: HTTP returned empty parts, wait for SSE message.part.delta
        trace.emit("session.prompt_response", "info", "Streaming mode: waiting for SSE", {}, sid)
      } else {
        trace.emit("session.prompt_response", "info", "Received response (no text parts)", { parts: data.parts.length }, sid)
        updateLastAssistant("(no text response)", "done")
      }
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

    trace.emit("user.retry", "info", "User retrying message", { userTextLength: userText.length }, sessionID() ?? undefined)

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
          if (msg && msg.role === "assistant" && (msg.status === "pending" || msg.status === "streaming")) {
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
      trace.emit("event.tool.call", "info", `Tool call started: ${toolName}`, { toolId, toolName, inputLength: typeof toolInput === "string" ? toolInput.length : JSON.stringify(toolInput).length }, sid ?? undefined)
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
      trace.emit("event.tool.call", "info", `Tool call ended`, { toolId, hasError: !!toolError, outputLength: typeof toolOutput === "string" ? toolOutput.length : JSON.stringify(toolOutput).length }, sid ?? undefined)
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
          if (msg && msg.role === "assistant" && (msg.status === "streaming" || msg.status === "pending")) {
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

    if (type === "preflight.required") {
      const score = props.score ?? 0
      const pmode = props.mode ?? "ask"
      if (pmode === "skip" || score < 0.6) {
        trace.emit("preflight.skip", "info", "Pre-flight skipped", { score, mode: pmode, reason: score < 0.6 ? "low score" : "mode=skip" }, sid ?? undefined)
        return
      }
      trace.emit("preflight.card", "info", "Pre-flight card rendered", { score, mode: pmode, questionCount: props.questions?.length ?? 0 }, sid ?? undefined)
      setPreFlight({
        active: true,
        score,
        mode: pmode,
        questions: props.questions ?? [],
        answers: {},
        currentIndex: 0,
      })
    }

    /* ── Phase 2b: Cardinal ── */
    if (type === "cardinal.detected") {
      const alert: CardinalAlert = {
        id: props.id ?? Math.random().toString(36).slice(2),
        type: props.cardinalType ?? "unknown",
        severity: props.severity ?? "warn",
        message: props.message ?? "Cardinal alert",
        countdown: props.severity === "pause" ? (props.degradeTimeout ?? 30) : undefined,
        autoDegrade: props.autoDegrade ?? false,
      }
      trace.emit("cardinal.detected", props.severity === "block" || props.severity === "stop" ? "error" : "warn", `Cardinal ${alert.severity}: ${alert.type}`, { id: alert.id, type: alert.type }, sid ?? undefined)
      setCardinalAlerts((prev) => {
        const filtered = prev.filter((a) => a.id !== alert.id)
        return [...filtered, alert]
      })
    }

    if (type === "cardinal.resolved") {
      trace.emit("cardinal.action", "info", "Cardinal resolved", { id: props.id }, sid ?? undefined)
      setCardinalAlerts((prev) => prev.filter((a) => a.id !== props.id))
    }

    /* ── Phase 2b: Judge ── */
    if (type === "judge.verdict") {
      const verdict: JudgeVerdict = {
        id: props.id ?? Math.random().toString(36).slice(2),
        status: props.status ?? "question",
        checks: props.checks ?? [],
        summary: props.summary ?? "Judge verdict",
      }
      trace.emit("judge.verdict", "info", `Judge ${verdict.status}`, { checkCount: verdict.checks.length }, sid ?? undefined)
      setJudgeVerdict(verdict)
    }

    if (type === "judge.dismiss") {
      trace.emit("judge.card", "info", "Judge dismissed", { id: props.id }, sid ?? undefined)
      setJudgeVerdict(null)
    }

    /* ── Phase 2b: AlignmentGuard ── */
    if (type === "alignment.drift") {
      const alert: AlignmentAlert = {
        id: props.id ?? Math.random().toString(36).slice(2),
        alertType: props.alertType ?? "drift",
        severity: props.severity ?? "warning",
        message: props.message ?? "Alignment drift detected",
        metrics: props.metrics,
      }
      trace.emit("alignment.drift", "warn", `Alignment ${alert.alertType}`, { severity: alert.severity }, sid ?? undefined)
      setAlignmentAlerts((prev) => {
        const filtered = prev.filter((a) => a.id !== alert.id)
        return [...filtered, alert]
      })
    }

    if (type === "alignment.resolved") {
      trace.emit("alignment.drift", "info", "Alignment resolved", { id: props.id }, sid ?? undefined)
      setAlignmentAlerts((prev) => prev.filter((a) => a.id !== props.id))
    }

    /* ── Phase 3a: SubAgent ── */
    if (type === "subagent.spawn") {
      const agent: SubAgent = {
        id: props.id ?? Math.random().toString(36).slice(2),
        name: props.name ?? "subagent",
        status: "spawned",
      }
      trace.emit("subagent.spawn", "info", `Subagent spawned: ${agent.name}`, { id: agent.id }, sid ?? undefined)
      setSubAgents((prev) => [...prev.filter((a) => a.id !== agent.id), agent])
    }

    if (type === "subagent.progress") {
      trace.emit("subagent.progress", "info", `Subagent progress`, { id: props.id, current: props.current, total: props.total }, sid ?? undefined)
      setSubAgents((prev) =>
        prev.map((a) =>
          a.id === props.id
            ? { ...a, status: "running", progress: { current: props.current ?? 0, total: props.total ?? 1 } }
            : a,
        ),
      )
    }

    if (type === "subagent.complete") {
      trace.emit("subagent.complete", "info", `Subagent completed`, { id: props.id, resultLength: props.result?.length }, sid ?? undefined)
      setSubAgents((prev) =>
        prev.map((a) =>
          a.id === props.id
            ? { ...a, status: "complete", result: props.result }
            : a,
        ),
      )
      setBarrierPendingCount((c) => Math.max(0, c - 1))
    }

    if (type === "subagent.error" || type === "subagent.aborted") {
      trace.emit("subagent.complete", "warn", `Subagent ${type === "subagent.aborted" ? "aborted" : "error"}`, { id: props.id }, sid ?? undefined)
      setSubAgents((prev) =>
        prev.map((a) =>
          a.id === props.id
            ? { ...a, status: type === "subagent.aborted" ? "aborted" : "error" }
            : a,
        ),
      )
      setBarrierPendingCount((c) => Math.max(0, c - 1))
    }

    /* ── Phase 3a: Barrier ── */
    if (type === "barrier.wait") {
      trace.emit("barrier.wait", "warn", "Barrier waiting", { pending: props.pendingSubagents }, sid ?? undefined)
      setBarrierWaiting(true)
      setBarrierPendingCount(props.pendingSubagents ?? 0)
    }

    if (type === "barrier.release") {
      trace.emit("barrier.release", "info", "Barrier released", {}, sid ?? undefined)
      setBarrierWaiting(false)
      setBarrierPendingCount(0)
    }

    /* ── Phase 3b: Mode Registry ── */
    if (type === "mode.registry") {
      const newModes: Mode[] = (props.modes ?? []).map((m: any) => ({
        id: m.id,
        label: m.name ?? m.id,
        description: m.uiConfig?.statusMessage ?? "",
        color: m.color ?? "info",
      }))
      trace.emit("mode.registry.load", "info", `Mode registry loaded`, { modeCount: newModes.length }, sid ?? undefined)
      if (newModes.length > 0) {
        setModeRegistry({ modes: newModes, loaded: true })
        // Ensure current mode still exists, else fallback to first
        const currentId = mode().id
        if (!newModes.find((m) => m.id === currentId)) {
          setMode(newModes[0]!)
        }
      }
    }

    if (type === "mode.config") {
      const mId = props.modeId
      const cfg = props.config
      trace.emit("mode.config.apply", "info", `Mode config applied`, { modeId: mId }, sid ?? undefined)
      setModeRegistry((reg) => ({
        modes: reg.modes.map((m) =>
          m.id === mId
            ? { ...m, description: cfg?.statusMessage ?? m.description, color: cfg?.color ?? m.color }
            : m,
        ),
        loaded: reg.loaded,
      }))
    }

    /* ── Phase 4: Decomposition ── */
    if (type === "decomposition.required" || type === "decomposition.decision" || type === "decomposition.complete" || type === "decomposition.failed") {
      const dStatus = type.replace("decomposition.", "") as DecompositionState["status"]
      const dState: DecompositionState = {
        active: dStatus !== "complete" && dStatus !== "failed",
        subtasks: props.subtasks ?? [],
        confidence: props.confidence,
        status: dStatus,
      }
      trace.emit("decomposition.decision", "info", `Decomposition ${dStatus}`, { confidence: dState.confidence, taskCount: dState.subtasks.length }, sid ?? undefined)
      setDecomposition(dState)
    }

    /* ── Phase 4: Persona ── */
    if (type === "persona.generated") {
      const pState: PersonaState = {
        active: true,
        name: props.name ?? "Dynamic Persona",
        description: props.description ?? "",
        temporary: props.temporary !== false,
      }
      trace.emit("persona.generate", "info", `Persona generated: ${pState.name}`, { temporary: pState.temporary }, sid ?? undefined)
      setPersona(pState)
    }

    if (type === "persona.dismiss") {
      trace.emit("persona.generate", "info", "Persona dismissed", { id: props.id }, sid ?? undefined)
      setPersona(null)
    }

    /* ── Phase 4: AgentStats ── */
    if (type === "agent.stats") {
      const stats: AgentStatsState = {
        active: true,
        successRate: props.successRate ?? 0,
        avgDuration: props.avgDuration ?? 0,
        totalTasks: props.totalTasks ?? 0,
        level: props.level ?? "L0",
      }
      trace.emit("agent.stats.update", "info", `Agent stats updated: ${stats.level}`, { successRate: stats.successRate, totalTasks: stats.totalTasks }, sid ?? undefined)
      setAgentStats(stats)
    }

    if (type === "agent.stats.dismiss") {
      trace.emit("agent.stats.update", "info", "Agent stats dismissed", { id: props.id }, sid ?? undefined)
      setAgentStats(null)
    }
  })

  onCleanup(() => unsub())

  // Keyboard shortcuts
  useKeyboard((evt) => {
    if (evt.name === "f2") {
      cycleModel()
    }
  if (evt.name === "tab" && !evt.shift) {
      cycleMode(1)
      return
    }
    if (evt.name === "tab" && evt.shift) {
      cycleMode(-1)
      return
    }
  if (preFlight()?.active) {
    if (evt.name === "escape") {
      handlePreFlightSkip()
      return
    }
    if (evt.name === "return") {
      handlePreFlightConfirm()
      return
    }
    // Support numeric keys via name, input, or key properties
    const input = (evt as any).input || evt.name || (evt as any).key || ""
    const num = parseInt(input.replace(/^digit/, "").replace(/^num/, ""), 10)
    if (!isNaN(num) && num >= 1 && num <= 9) {
      handlePreFlightSelect(num)
      return
    }
  }
  })

  // Load sessions on mount + auto-recovery
  onMount(() => {
    trace.emit("ui.init", "info", "Helix TUI mounted")
    loadSessions().then(() => {
      // Auto-recovery: try to restore last session
      try {
        const lastID = localStorage.getItem("helix-tui:lastSessionID")
        if (lastID) {
          const exists = sessions().find((s) => s.id === lastID)
          if (exists) {
            trace.emit("session.auto_recovery", "info", "Auto-recovering last session", { sessionID: lastID })
            switchSession(lastID)
          } else {
            trace.emit("session.auto_recovery", "warn", "Last session not found, clearing", { sessionID: lastID })
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
          <For each={modeRegistry().modes}>
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
          {/* Cardinal status indicator */}
          <Show when={cardinalAlerts().some((a) => a.severity === "block" || a.severity === "stop")}>
            <text fg={theme.getColor("error")}> !</text>
          </Show>
          <Show when={cardinalAlerts().some((a) => a.severity === "pause") && !cardinalAlerts().some((a) => a.severity === "block" || a.severity === "stop")}>
            <text fg={theme.getColor("warning")}> !</text>
          </Show>
          {/* Alignment status indicator */}
          <Show when={alignmentAlerts().length > 0}>
            <text fg={theme.getColor("warning")}> ~</text>
          </Show>
          {/* Barrier indicator */}
          <Show when={barrierWaiting()}>
            <text fg={theme.getColor("info")}> wait{barrierPendingCount()}</text>
          </Show>
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

        {/* Pre-flight card */}
        <Show when={preFlight()?.active}>
          <box flexDirection="column" border borderColor={theme.getColor("warning")} paddingLeft={1} paddingRight={1}>
            <text fg={theme.getColor("warning")} attributes={1}>Pre-flight</text>
            <For each={preFlight()!.questions}>
              {(q, i) => (
                <box flexDirection="column" marginBottom={1}>
                  <text fg={theme.getColor("text")}>{`${i() + 1}. ${q.text}`}</text>
                  <Show when={q.options}>
                    <box flexDirection="row" gap={1} flexWrap="wrap">
                      <For each={q.options}>
                        {(opt, j) => (
                          <text fg={preFlight()!.answers[q.id] === opt ? theme.getColor("success") : theme.getColor("textMuted")}>
                            {preFlight()!.answers[q.id] === opt ? "[OK] " : ""}[{j() + 1}] {opt}
                          </text>
                        )}
                      </For>
                    </box>
                  </Show>
                </box>
              )}
            </For>
            <text fg={theme.getColor("textMuted")}>[Enter: confirm] [Esc: skip]</text>
          </box>
        </Show>

        {/* Cardinal alert cards */}
        <For each={cardinalAlerts()}>
          {(alert) => (
            <Show when={alert.severity !== "warn"}>
              <box
                flexDirection="column"
                border
                borderColor={
                  alert.severity === "block" || alert.severity === "stop"
                    ? theme.getColor("error")
                    : alert.severity === "pause"
                      ? theme.getColor("warning")
                      : theme.getColor("textMuted")
                }
                paddingLeft={1}
                paddingRight={1}
              >
            <text
              fg={
                alert.severity === "block" || alert.severity === "stop"
                  ? theme.getColor("error")
                  : alert.severity === "pause"
                    ? theme.getColor("warning")
                    : theme.getColor("textMuted")
              }
              attributes={1}
            >
              {alert.severity === "block" ? "[BLOCK]" : alert.severity === "stop" ? "[STOP]" : alert.severity === "pause" ? "[PAUSE]" : "[WARN] "}
              {" "}{alert.type}: {alert.message}
            </text>
                <Show when={alert.countdown !== undefined}>
                  <text fg={theme.getColor("textMuted")}>Auto-resolve in {alert.countdown}s</text>
                </Show>
                <box flexDirection="row" gap={1}>
                  <text fg={theme.getColor("success")} onMouseDown={() => {
                    trace.emit("cardinal.action", "info", "User allowed cardinal", { id: alert.id, type: alert.type })
                    setCardinalAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                  }}>[Allow]</text>
                  <text fg={theme.getColor("textMuted")} onMouseDown={() => {
                    trace.emit("cardinal.action", "info", "User ignored cardinal", { id: alert.id, type: alert.type })
                    setCardinalAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                  }}>[Ignore]</text>
                </box>
              </box>
            </Show>
          )}
        </For>

        {/* Judge verdict card */}
        <Show when={judgeVerdict()}>
          <box flexDirection="column" border borderColor={theme.getColor("accent")} paddingLeft={1} paddingRight={1}>
            <text fg={theme.getColor("accent")} attributes={1}>
              {judgeVerdict()!.status === "pass" ? "Judge: PASS" : judgeVerdict()!.status === "fail" || judgeVerdict()!.status === "reject" ? "Judge: FAIL" : judgeVerdict()!.status === "rollback" ? "Judge: ROLLBACK" : "Judge: QUESTION"}
            </text>
            <text fg={theme.getColor("text")}>{judgeVerdict()!.summary}</text>
            <Show when={judgeVerdict()!.checks.length > 0}>
              <box flexDirection="column" paddingLeft={1}>
                <For each={judgeVerdict()!.checks}>
                  {(check) => (
                    <box flexDirection="row">
                      <text fg={check.passed ? theme.getColor("success") : theme.getColor("error")}>
                        {check.passed ? "[PASS]" : "[FAIL]"} {check.name}
                      </text>
                      <Show when={check.detail}>
                        <text fg={theme.getColor("textMuted")}> — {check.detail}</text>
                      </Show>
                    </box>
                  )}
                </For>
              </box>
            </Show>
          </box>
        </Show>

        {/* AlignmentGuard alert cards */}
        <For each={alignmentAlerts()}>
          {(alert) => (
            <box
              flexDirection="column"
              border
              borderColor={alert.severity === "critical" ? theme.getColor("error") : theme.getColor("warning")}
              paddingLeft={1}
              paddingRight={1}
            >
            <text fg={alert.severity === "critical" ? theme.getColor("error") : theme.getColor("warning")} attributes={1}>
              {alert.alertType === "rabbitHole" || alert.alertType === "rabbit-hole" ? "Rabbit Hole" : alert.alertType === "fileDrift" || alert.alertType === "file-drift" ? "File Drift" : alert.alertType === "distraction" ? "Distraction" : "Alignment Drift"}
            </text>
              <text fg={theme.getColor("text")}>{alert.message}</text>
              <Show when={alert.metrics && Object.keys(alert.metrics).length > 0}>
                <box flexDirection="row" gap={1} flexWrap="wrap">
                  <For each={Object.entries(alert.metrics ?? {})}>
                    {([k, val]) => (
                      <text fg={theme.getColor("textMuted")}>{k}={val}</text>
                    )}
                  </For>
                </box>
              </Show>
            </box>
          )}
        </For>

        {/* SubAgent cards */}
        <For each={subAgents()}>
          {(agent) => (
            <box flexDirection="column" border borderColor={theme.getColor("info")} paddingLeft={1} paddingRight={1}>
              <box flexDirection="row">
                <text fg={theme.getColor("info")} attributes={1}>
                  {agent.status === "spawned" ? ">" : agent.status === "running" ? "~" : agent.status === "complete" ? "DONE" : agent.status === "error" ? "ERR" : "ABORT"}
                  {" "}{agent.name}
                </text>
                <text fg={theme.getColor("textMuted")}> [{agent.status}]</text>
              </box>
              <Show when={agent.progress}>
                <text fg={theme.getColor("textMuted")}>
                  Progress: {agent.progress!.current}/{agent.progress!.total}
                </text>
              </Show>
              <Show when={agent.result && agent.status === "complete"}>
                <text fg={theme.getColor("text")} paddingLeft={2}>
                  {agent.result!.slice(0, 200)}
                </text>
              </Show>
            </box>
          )}
        </For>

        {/* Decomposition card */}
        <Show when={decomposition()}>
          {(d) => d().active ? (
            <box flexDirection="column" border borderColor={theme.getColor("accent")} paddingLeft={1} paddingRight={1}>
              <text fg={theme.getColor("accent")} attributes={1}>
                {d().status === "required" ? "Task Decomposition" : d().status === "decision" ? "Decomposition Decision" : "Task Decomposition"}
              </text>
              <Show when={d().confidence !== undefined}>
                <text fg={theme.getColor("textMuted")}>Confidence: {Math.round((d().confidence ?? 0) * 100)}%</text>
              </Show>
              <Show when={d().subtasks.length > 0}>
                <box flexDirection="column" paddingLeft={1}>
                  <For each={d().subtasks}>
                    {(task) => (
                      <box flexDirection="row">
                        <text fg={theme.getColor("text")}>• {task.name}</text>
                        <text fg={theme.getColor("textMuted")}> [{task.status}]</text>
                      </box>
                    )}
                  </For>
                </box>
              </Show>
            </box>
          ) : null}
        </Show>

        {/* Persona card */}
        <Show when={persona()}>
          {(p) => p().active ? (
            <box flexDirection="column" border borderColor={theme.getColor("success")} paddingLeft={1} paddingRight={1}>
              <text fg={theme.getColor("success")} attributes={1}>
                Dynamic Persona: {p().name}
              </text>
              <text fg={theme.getColor("textMuted")}>{p().description}</text>
              <Show when={p().temporary}>
                <text fg={theme.getColor("warning")}>(temporary)</text>
              </Show>
            </box>
          ) : null}
        </Show>

        {/* AgentStats card */}
        <Show when={agentStats()}>
          {(s) => s().active ? (
            <box flexDirection="column" border borderColor={theme.getColor("primary")} paddingLeft={1} paddingRight={1}>
              <text fg={theme.getColor("primary")} attributes={1}>
                Agent Stats ({s().level})
              </text>
              <box flexDirection="row" gap={2}>
                <text fg={theme.getColor("textMuted")}>Success: {Math.round(s().successRate * 100)}%</text>
                <text fg={theme.getColor("textMuted")}>Avg: {s().avgDuration}ms</text>
                <text fg={theme.getColor("textMuted")}>Tasks: {s().totalTasks}</text>
              </box>
            </box>
          ) : null}
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
              if (preFlight()?.active) {
                try {
                  const text = (textarea?.plainText ?? "").trim()
                  const num = parseInt(text, 10)
                  if (!isNaN(num) && num >= 1 && num <= 9) {
                    handlePreFlightSelect(num)
                    if (textarea) {
                      try { textarea.clear() } catch {}
                    }
                  }
                } catch {}
                return
              }
              // no-op when preflight is not active
            }}
            keyBindings={[
              { name: "return", action: "submit" },
              { name: "return", shift: true, action: "newline" },
            ]}
            onSubmit={() => {
              if (preFlight()?.active) {
                handlePreFlightConfirm()
                return
              }
              setTimeout(() => setTimeout(() => handleSend(), 0), 0)
            }}
            onKeyDown={(e: any) => {
              if (preFlight()?.active) {
                const input = e.input || e.name || e.key || ""
                const num = parseInt(input.replace(/^digit/, "").replace(/^num/, ""), 10)
                if (!isNaN(num) && num >= 1 && num <= 9) {
                  handlePreFlightSelect(num)
                  e.preventDefault()
                  return
                }
                if (e.name === "escape") {
                  handlePreFlightSkip()
                  e.preventDefault()
                  return
                }
                if (e.name === "return") {
                  handlePreFlightConfirm()
                  e.preventDefault()
                  return
                }
                e.preventDefault()
                return
              }
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
                  trace.emit("user.input_history", "debug", "Navigated up in input history", { index: newIdx, total: hist.length })
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
                  trace.emit("user.input_history", "debug", "Navigated down in input history", { index: newIdx, total: inputHistory().length })
                } else {
                  setHistoryIndex(-1)
                  if (textarea) {
                    try { textarea.setPlainText(draftInput()) } catch {}
                  }
                  trace.emit("user.input_history", "debug", "Restored draft input")
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
