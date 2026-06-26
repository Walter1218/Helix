import { createSignal, For, Show, createEffect, onCleanup } from "solid-js"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import * as trace from "../trace"

export interface AutocompleteOption {
  label: string
  value: string
  type: "file" | "command" | "slash"
  description?: string
}

interface AutocompleteProps {
  query: string
  onSelect: (option: AutocompleteOption) => void
  onClose: () => void
}

export function Autocomplete(props: AutocompleteProps) {
  const theme = useTheme()
  const sdk = useSDK()
  const [options, setOptions] = createSignal<AutocompleteOption[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [loading, setLoading] = createSignal(false)

  createEffect(() => {
    const query = props.query
    if (!query || query.length < 1) {
      setOptions([])
      return
    }

    const prefix = query[0]
    const searchTerm = query.slice(1)

    if (prefix === "@") {
      setLoading(true)
      trace.emit("ui.init", "debug", "Autocomplete: searching files", { query: searchTerm })
      sdk.client.find
        .files({ query: searchTerm || ".", limit: 10 })
        .then((res) => {
          const files = (res.data ?? []).map(
            (f): AutocompleteOption => ({
              label: f,
              value: f,
              type: "file",
            }),
          )
          setOptions(files)
          trace.emit("ui.init", "debug", "Autocomplete: files found", { count: files.length })
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    } else if (prefix === "/") {
      const slashCommands: AutocompleteOption[] = [
        { label: "/export", value: "/export", type: "slash", description: "Export session as Markdown" },
        { label: "/share", value: "/share", type: "slash", description: "Share session" },
        { label: "/compact", value: "/compact", type: "slash", description: "Compact/summarize session" },
        { label: "/undo", value: "/undo", type: "slash", description: "Undo last change" },
        { label: "/redo", value: "/redo", type: "slash", description: "Redo last change" },
        { label: "/clear", value: "/clear", type: "slash", description: "Clear messages" },
        { label: "/help", value: "/help", type: "slash", description: "Show help" },
      ]
      setOptions(
        slashCommands.filter(
          (c) =>
            c.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.description?.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      )
    }
  })

  const handleKeyDown = (e: any) => {
    const opts = options()
    if (opts.length === 0) return

    if (e.name === "down") {
      setSelectedIndex((prev) => Math.min(prev + 1, opts.length - 1))
      e.preventDefault?.()
    } else if (e.name === "up") {
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      e.preventDefault?.()
    } else if (e.name === "return" || e.name === "tab") {
      const selected = opts[selectedIndex()]
      if (selected) props.onSelect(selected)
      e.preventDefault?.()
    } else if (e.name === "escape") {
      props.onClose()
      e.preventDefault?.()
    }
  }

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme.getColor("border")}
      position="absolute"
      bottom={4}
      left={2}
      width={50}
      maxHeight={10}
    >
      <Show when={loading()}>
        <text fg={theme.getColor("textMuted")}> Loading...</text>
      </Show>
      <Show when={!loading() && options().length === 0 && props.query.length > 1}>
        <text fg={theme.getColor("textMuted")}> No results</text>
      </Show>
      <For each={options()}>
        {(option, i) => (
          <text
            fg={i() === selectedIndex() ? theme.getColor("primary") : theme.getColor("text")}
            attributes={i() === selectedIndex() ? 1 : 0}
            onMouseDown={() => props.onSelect(option)}
          >
            {i() === selectedIndex() ? "▸ " : "  "}
            {option.type === "file" ? "📄 " : option.type === "slash" ? "⚡ " : ""}
            {option.label}
            <Show when={option.description}>
              <text fg={theme.getColor("textMuted")}> — {option.description}</text>
            </Show>
          </text>
        )}
      </For>
    </box>
  )
}
