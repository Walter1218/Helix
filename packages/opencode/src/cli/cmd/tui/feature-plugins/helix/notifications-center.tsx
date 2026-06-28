import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import * as trace from "./trace"

interface Notification {
  id: string
  type: "judge" | "cardinal" | "preflight" | "mode" | "error"
  time: string
  title: string
  message: string
  sessionID: string
  read: boolean
}

const MAX_NOTIFICATIONS = 100

export function NotificationsCenterRoute(_props: { api: TuiPluginApi }) {
  const c = _props.api.theme.current
  const [notifications, setNotifications] = createSignal<Notification[]>([])
  const [filter, setFilter] = createSignal("all")
  const [selectedIdx, setSelectedIdx] = createSignal(0)

  const addNotification = (n: Omit<Notification, "id" | "read">) => {
    setNotifications((prev) => {
      const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...n, read: false }, ...prev]
      return next.slice(0, MAX_NOTIFICATIONS)
    })
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const toggleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)),
    )
  }

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  onMount(() => {
    trace.emit("notifications.view", "info", "Notifications center route mounted")

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }
    const cleanups: (() => void)[] = []

    const addFromEvent = (type: Notification["type"]) => (payload: unknown) => {
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      addNotification({
        type,
        time: new Date().toLocaleTimeString(),
        title: String(evt.title ?? evt.status ?? evt.severity ?? type),
        message: String(evt.message ?? evt.summary ?? JSON.stringify(evt)),
        sessionID: String(evt.sessionID ?? evt.session_id ?? ""),
      })
    }

    cleanups.push(events.on("judge.verdict", addFromEvent("judge")))
    cleanups.push(events.on("cardinal.detected", addFromEvent("cardinal")))
    cleanups.push(events.on("preflight.result", addFromEvent("preflight")))
    cleanups.push(events.on("mode.applied", addFromEvent("mode")))
    cleanups.push(events.on("session.error", addFromEvent("error")))

    onCleanup(() => cleanups.forEach((fn) => fn()))
  })

  const filtered = () => {
    const all = notifications()
    if (filter() === "all") return all
    return all.filter((n) => n.type === filter())
  }

  const unreadCount = () => notifications().filter((n) => !n.read).length
  const list = filtered()

  const typeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "judge": return "J:"
      case "cardinal": return "C:"
      case "preflight": return "P:"
      case "mode": return "M:"
      case "error": return "E:"
    }
  }

  const typeColor = (type: Notification["type"]) => {
    switch (type) {
      case "judge": return c.success
      case "cardinal": return c.error
      case "preflight": return c.warning
      case "mode": return c.primary
      case "error": return c.error
    }
  }

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Notifications ({unreadCount()} unread)</b>
        </text>
        <text fg={c.primary} onMouseDown={markAllRead}>
          [Mark all read]
        </text>
      </box>
      <box height={1} />

      <box flexDirection="row" gap={2}>
        {(["all", "judge", "cardinal", "preflight", "error"] as const).map((f) => (
          <text
            fg={filter() === f ? c.primary : c.textMuted}
            onMouseDown={() => setFilter(f)}
          >
            [{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}]
          </text>
        ))}
      </box>
      <box height={1} />

      <text fg={c.textMuted}>──────────────────────────────────────────────────</text>

      {list.length > 0 ? (
        list.map((n) => (
          <box flexDirection="column" gap={0}>
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <text fg={n.read ? c.textMuted : c.primary}>{n.read ? "○" : "●"}</text>
                <text fg={c.textMuted}>{n.time}</text>
                <text fg={typeColor(n.type)}><b>{typeIcon(n.type)}</b></text>
                <text fg={c.text}>{n.title}</text>
                <text fg={c.textMuted}>session {n.sessionID.slice(0, 8)}</text>
              </box>
              <box flexDirection="row" gap={1}>
                <text fg={c.textMuted} onMouseDown={() => toggleRead(n.id)}>
                  [{n.read ? "unread" : "read"}]
                </text>
                <text fg={c.textMuted} onMouseDown={() => dismiss(n.id)}>
                  [dismiss]
                </text>
              </box>
            </box>
            {n.message ? (
              <text fg={c.textMuted} wrapMode="word" paddingLeft={3}>
                {n.message}
              </text>
            ) : null}
          </box>
        ))
      ) : (
        <text fg={c.textMuted}>No notifications yet. Guard events will appear here in real-time.</text>
      )}
      <box height={1} />

      <text fg={c.textMuted}>──────────────────────────────────────────────────</text>
      <text fg={c.textMuted}>● = unread  ○ = read | Filter: [All] [Judge] [Cardinal] [Preflight] [Error]</text>
      <text fg={c.textMuted}>Navigate: j/k | Toggle read: Enter | Dismiss: d | Back: Esc</text>
    </box>
  )
}
