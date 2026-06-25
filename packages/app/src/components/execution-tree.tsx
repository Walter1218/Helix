import { createEffect, createSignal, For, Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"

interface TraceNode {
  id: string
  parentId?: string
  type: string
  name: string
  status: "pending" | "success" | "failed"
  metadata?: Record<string, unknown>
  timestamp: number
  children?: TraceNode[]
  duration?: number
}

function statusIcon(s: string) {
  return s === "success" ? "✅" : s === "failed" ? "❌" : "🔄"
}

function fmtDuration(ms?: number) {
  if (ms === undefined || ms === null) return ""
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function extractDetail(node: TraceNode): string | undefined {
  const meta = node.metadata
  if (!meta) return undefined
  if (typeof meta.error === "string") return `❌ ${meta.error.slice(0, 120)}`
  if (typeof meta.output === "string" && meta.output) return `→ ${meta.output.slice(0, 120)}`
  if (typeof meta.result === "string") return `result: ${meta.result}`
  if (typeof meta.finishReason === "string") {
    const tokens = meta.tokens as Record<string, number> | undefined
    const parts = [`finish: ${meta.finishReason}`]
    if (tokens?.input) parts.push(`in:${tokens.input}`)
    if (tokens?.output) parts.push(`out:${tokens.output}`)
    return parts.join(" · ")
  }
  if (typeof meta.input === "object" && meta.input) {
    const input = meta.input as Record<string, unknown>
    if (input.command) return `⌘ ${String(input.command).slice(0, 120)}`
    if (input.filePath) return `📄 ${String(input.filePath)}`
    if (input.pattern) return `🔍 ${String(input.pattern)}`
    if (input.description) return String(input.description).slice(0, 120)
    if (input.query) return `🔍 ${String(input.query).slice(0, 100)}`
    if (input.url) return `🌐 ${String(input.url).slice(0, 100)}`
  }
  if (typeof meta.agent === "string") return `agent: ${meta.agent}`
  return undefined
}

function TraceNodeItem(props: { node: TraceNode; depth: number }) {
  const [expanded, setExpanded] = createSignal(true)
  const hasChildren = () => (props.node.children?.length ?? 0) > 0

  return (
    <div style={{ "padding-left": `${props.depth * 16}px` }}>
      <div
        class="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-(--background-modifier-hover) rounded px-1"
        onClick={() => hasChildren() && setExpanded(!expanded())}
      >
        <Show when={hasChildren()}>
          <span class="text-xs text-(--foreground-muted) w-3">{expanded() ? "▼" : "▶"}</span>
        </Show>
        <Show when={!hasChildren()}>
          <span class="w-3" />
        </Show>
        <span class="text-xs">{statusIcon(props.node.status)}</span>
        <span class="text-sm font-medium text-(--foreground)">{props.node.name}</span>
        <Show when={props.node.duration !== undefined}>
          <span class="text-xs text-(--foreground-muted)">({fmtDuration(props.node.duration)})</span>
        </Show>
      </div>
      <Show when={extractDetail(props.node)}>
        <div
          class="text-xs text-(--foreground-muted) truncate pr-2"
          style={{ "padding-left": `${(props.depth + 1) * 16 + 4}px` }}
        >
          {extractDetail(props.node)}
        </div>
      </Show>
      <Show when={expanded() && hasChildren()}>
        <For each={props.node.children}>
          {(child) => <TraceNodeItem node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  )
}

export function ExecutionTree(props: { sessionID?: string }) {
  const globalSDK = useGlobalSDK()
  const [nodes, setNodes] = createStore<Record<string, TraceNode>>({})

  createEffect(() => {
    const unsub = globalSDK.event.listen((e) => {
      const event = e.details as { type: string; properties?: unknown }
      if (event.type !== "observability.trace_node") return
      const node = event.properties as TraceNode
      if (props.sessionID && node.metadata?.sessionID !== props.sessionID) return
      setNodes(node.id, (prev) => ({ ...prev, ...node }))
    })
    onCleanup(unsub)
  })

  const tree = () => {
    const all = Object.values(nodes)
    const map = new Map<string, TraceNode>()
    const roots: TraceNode[] = []

    for (const n of all) {
      map.set(n.id, { ...n, children: [] })
    }
    for (const n of all) {
      const node = map.get(n.id)!
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children!.push(node)
      } else {
        roots.push(node)
      }
    }

    const addDuration = (node: TraceNode): TraceNode => {
      if (node.children?.length) {
        node.children = node.children.map(addDuration)
      }
      if (node.type === "node_end" || node.type === "error") {
        return node
      }
      if (node.children?.length) {
        const childEnds = node.children.map((c) =>
          (c.type === "node_end" || c.type === "error")
            ? c.timestamp
            : c.timestamp + (c.duration ?? 0)
        )
        node.duration = Math.max(...childEnds) - node.timestamp
      }
      return node
    }

    return roots.map(addDuration)
  }

  const totalSteps = () => Object.keys(nodes).length
  const totalDuration = () => {
    const roots = tree()
    if (!roots.length) return 0
    return Math.max(...roots.map((r) => (r.timestamp ?? 0) + (r.duration ?? 0))) -
      Math.min(...roots.map((r) => r.timestamp ?? 0))
  }

  return (
    <Show when={totalSteps() > 0}>
      <div class="border border-(--border) rounded-md bg-(--background)">
        <div class="flex items-center justify-between px-3 py-2 border-b border-(--border)">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">📊 Agent 执行树</span>
            <span class="text-xs text-(--foreground-muted)">{totalSteps()} 步</span>
          </div>
          <Show when={totalDuration() > 0}>
            <span class="text-xs text-(--foreground-muted)">{fmtDuration(totalDuration())}</span>
          </Show>
        </div>
        <div class="py-1 max-h-96 overflow-y-auto">
          <For each={tree()}>
            {(node) => <TraceNodeItem node={node} depth={0} />}
          </For>
        </div>
      </div>
    </Show>
  )
}
