import { createSignal, For, Show, onMount, onCleanup, createEffect, batch } from "solid-js"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useRenderer } from "@opentui/solid"

type DisplayMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  status?: "pending" | "streaming" | "done" | "error"
  error?: string
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
  const renderer = useRenderer()
  const [messages, setMessages] = createSignal<DisplayMessage[]>([])
  const [input, setInput] = createSignal("")
  const [isLoading, setIsLoading] = createSignal(false)
  const [sessionID, setSessionID] = createSignal<string | null>(null)
  const [sessionTitle, setSessionTitle] = createSignal("New Chat")
  const [error, setError] = createSignal<string | null>(null)
  const [permission, setPermission] = createSignal<PermissionRequest | null>(null)
  const [question, setQuestion] = createSignal<QuestionRequest | null>(null)
  let textarea: any
  let scroll: any

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

    const { data, error: err } = await sdk.client.session.create({ title: "Helix TUI Chat" })
    if (err || !data) throw new Error("Failed to create session")
    setSessionID(data.id)
    setSessionTitle(data.title)
    return data.id
  }

  async function loadMessages(sid: string) {
    const { data, error: err } = await sdk.client.session.messages({ sessionID: sid, limit: 100 })
    if (err || !data) return

    const display: DisplayMessage[] = []
    for (const msg of data) {
      const info = msg.info
      const textParts = msg.parts.filter((p: any) => p.type === "text")
      const content = textParts.map((p: any) => p.text).join("\n")
      if (!content && info.role === "user") continue
      display.push({
        id: info.id,
        role: info.role as DisplayMessage["role"],
        content: content || "(no text content)",
        timestamp: (info as any).time?.created ?? Date.now(),
        status: "done",
      })
    }
    setMessages(display)
  }

  async function handleSend() {
    const text = input().trim()
    if (!text || isLoading()) return

    batch(() => {
      addMessage("user", text)
      addMessage("assistant", "", "pending")
      setInput("")
      setIsLoading(true)
      setError(null)
    })

    if (textarea) textarea.plainText = ""

    try {
      const sid = await ensureSession()
      const { data, error: err } = await sdk.client.session.prompt({
        sessionID: sid,
        parts: [{ type: "text", text }],
      })

      if (err || !data) {
        const errMsg = err ? JSON.stringify(err) : "No response from server"
        updateLastAssistant("", "error", errMsg)
        setError(errMsg)
        return
      }

      const textParts = data.parts.filter((p: any) => p.type === "text")
      const content = textParts.map((p: any) => p.text).join("\n")
      updateLastAssistant(content || "(no text response)", "done")
    } catch (e: any) {
      updateLastAssistant("", "error", e.message)
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAbort() {
    const sid = sessionID()
    if (!sid) return
    try {
      await sdk.client.session.abort({ sessionID: sid })
    } catch {}
  }

  async function handlePermissionReply(reply: "once" | "always" | "reject") {
    const perm = permission()
    if (!perm) return
    try {
      await sdk.client.permission.reply({ requestID: perm.id, reply })
      setPermission(null)
    } catch {}
  }

  async function handleQuestionReply(answer: string) {
    const q = question()
    if (!q) return
    try {
      await sdk.client.question.reply({ requestID: q.id, answers: [[answer]] })
      setQuestion(null)
    } catch {}
  }

  const unsub = sdk.subscribe((event) => {
    const payload = (event as any).payload ?? event
    const type = payload?.type
    const props = payload?.properties
    if (!type || !props) return

    const sid = sessionID()
    if (props.sessionID && sid && props.sessionID !== sid) return

    if (type === "message.part.delta" && props.field === "text") {
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

    if (type === "session.idle") {
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
      setError(errMsg)
      updateLastAssistant("", "error", errMsg)
    }

    if (type === "permission.asked") {
      setPermission({
        id: props.id,
        permission: props.permission,
        patterns: props.patterns ?? [],
        message: `Permission required: ${props.permission} on ${(props.patterns ?? []).join(", ")}`,
      })
    }

    if (type === "question.asked") {
      setQuestion({
        id: props.id,
        question: props.question ?? "Agent needs your input",
        options: props.options,
      })
    }
  })

  onCleanup(() => unsub())

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <box height={1} backgroundColor={theme.getColor("backgroundSecondary")} paddingLeft={1}>
        <text fg={theme.getColor("primary")} attributes={1}>AI Chat</text>
        <text fg={theme.getColor("textMuted")}> {sessionTitle()}</text>
        <text fg={sdk.connected() ? theme.getColor("success") : theme.getColor("error")}>
          {" "}{sdk.connected() ? "●" : "○"}
        </text>
      </box>

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

      <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
        <scrollbox ref={(r: any) => (scroll = r)} stickyScroll={true} stickyStart="bottom" flexGrow={1}>
          <Show when={messages().length === 0}>
            <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} height={10}>
              <text fg={theme.getColor("primary")} attributes={1}>Welcome to Helix AI</text>
              <box height={1} />
              <text fg={theme.getColor("textMuted")}>Connected to Helix server. Start a conversation below.</text>
            </box>
          </Show>

          <For each={messages()}>
            {(msg) => (
              <box flexDirection="column" marginBottom={1}>
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
                </box>
                <Show when={msg.content}>
                  <text fg={theme.getColor("text")} paddingLeft={2}>
                    {msg.content}
                  </text>
                </Show>
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

      <Show when={error()}>
        <box paddingLeft={1}>
          <text fg={theme.getColor("error")}>{error()}</text>
        </box>
      </Show>

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
          placeholder="Type your message... (Enter to send)"
          placeholderColor={theme.getColor("textMuted")}
          textColor={theme.getColor("text")}
          focusedTextColor={theme.getColor("text")}
          onContentChange={() => {
            if (textarea) setInput(textarea.plainText)
          }}
          onKeyDown={(e: any) => {
            if (e.key === "return" && !e.shift) {
              e.preventDefault()
              handleSend()
            }
            if (e.key === "escape") {
              handleAbort()
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
  )
}
