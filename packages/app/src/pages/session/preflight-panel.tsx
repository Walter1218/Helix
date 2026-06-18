import { For, Show, createSignal } from "solid-js"

export type CheckItem = {
  id: string
  label: string
  status: "pending" | "running" | "completed" | "warning" | "failed"
  details?: string
  subItems?: CheckItem[]
}

export type TrustLevel = "high" | "medium" | "low"

export interface PreFlightCheck {
  id: string
  items: CheckItem[]
  trustLevel: TrustLevel
  autoLearnEnabled: boolean
  cooldownRemaining?: number
  decision: "proceed" | "pause" | "block"
}

export interface PreFlightPanelProps {
  check: () => PreFlightCheck
  onProceed?: () => void
  onPause?: () => void
  onBlock?: () => void
}

const statusConfig: Record<CheckItem["status"], { icon: string; color: string }> = {
  pending: { icon: "⏳", color: "text-text-weak" },
  running: { icon: "🔄", color: "text-blue-400" },
  completed: { icon: "✅", color: "text-green-500" },
  warning: { icon: "⚠️", color: "text-amber-500" },
  failed: { icon: "❌", color: "text-red-500" },
}

const trustConfig: Record<TrustLevel, { color: string; bg: string; label: string }> = {
  high: { color: "text-green-500", bg: "bg-green-500/20", label: "高信任" },
  medium: { color: "text-amber-500", bg: "bg-amber-500/20", label: "中等信任" },
  low: { color: "text-red-500", bg: "bg-red-500/20", label: "低信任" },
}

export function PreFlightPanel(props: PreFlightPanelProps) {
  const [expandedItems, setExpandedItems] = createSignal<Set<string>>(new Set())
  const c = props.check

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div class="h-full flex flex-col overflow-hidden bg-background-base">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
              <span class="text-[13px]">🔍</span>
              <span class="text-13-medium text-text-strong">Pre-flight 检查</span>
          </div>
          <div class={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${trustConfig[c().trustLevel].bg} ${trustConfig[c().trustLevel].color}`}>
            {trustConfig[c().trustLevel].label}
          </div>
        </div>
        <Show when={c().autoLearnEnabled}>
          <div class="text-11-regular text-amber-500 mt-1">
            ⚡ auto-learn 已启用
            <Show when={c().cooldownRemaining}>
              <span> · 冷却 {c().cooldownRemaining}s</span>
            </Show>
          </div>
        </Show>
      </div>

      <div class="flex-1 min-h-0 overflow-auto px-3 py-2">
        <div class="flex flex-col gap-1">
          <For each={c().items}>
            {(item) => {
              const isExpanded = () => expandedItems().has(item.id)
              const config = statusConfig[item.status]
              return (
                <div class="flex flex-col">
                  <div
                    class="flex items-center gap-2 py-1 rounded cursor-pointer hover:bg-background-tertiary-base/50 transition-colors"
                    onClick={() => item.subItems?.length && toggleExpanded(item.id)}
                  >
                    <Show when={item.subItems?.length}>
                      <span class="text-[10px] text-text-weak w-3">{isExpanded() ? "▼" : "▶"}</span>
                    </Show>
                    <Show when={!item.subItems?.length}>
                      <span class="w-3" />
                    </Show>
                    <span class={`text-[13px] ${config.color}`}>{config.icon}</span>
                    <span class="text-12-regular text-text-base flex-1">{item.label}</span>
                  </div>

                  <Show when={isExpanded() && item.subItems}>
                    <div class="flex flex-col pl-6">
                      <For each={item.subItems}>
                        {(sub) => {
                          const subConfig = statusConfig[sub.status]
                          return (
                            <div class="flex items-center gap-2 py-0.5">
                              <span class={`text-[11px] ${subConfig.color}`}>{subConfig.icon}</span>
                              <span class="text-11-regular text-text-weak">{sub.label}</span>
                              <Show when={sub.details}>
                                <span class="text-11-regular text-text-weaker">{sub.details}</span>
                              </Show>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </Show>

                  <Show when={item.details && !item.subItems}>
                    <div class="text-11-regular text-text-weak pl-8">{item.details}</div>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2">
        <div class="flex items-center gap-2">
          <Show when={c().decision === "proceed"}>
            <button
              class="flex-1 px-3 py-1.5 rounded text-12-medium bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors"
              onClick={() => props.onProceed?.()}
            >
              ✅ 继续执行
            </button>
          </Show>
          <Show when={c().decision === "pause"}>
            <button
              class="flex-1 px-3 py-1.5 rounded text-12-medium bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 transition-colors"
              onClick={() => props.onPause?.()}
            >
              ⏸ 暂停 (30s)
            </button>
          </Show>
          <Show when={c().decision === "block"}>
            <button
              class="flex-1 px-3 py-1.5 rounded text-12-medium bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors"
              onClick={() => props.onBlock?.()}
            >
              ⛔ 阻塞执行
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}