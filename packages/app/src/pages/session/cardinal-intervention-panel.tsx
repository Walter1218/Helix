import { For, Show, createSignal } from "solid-js"

export type CardinalLevel = "block" | "pause" | "stop" | "warn"

export interface CardinalIntervention {
  id: string
  level: CardinalLevel
  trigger: string
  reason: string
  recommendation: string
  canDegrade: boolean
  degraded?: boolean
}

export interface CardinalInterventionPanelProps {
  interventions: () => CardinalIntervention[]
  onResume?: (id: string) => void
  onDegrade?: (id: string) => void
  onDismiss?: (id: string) => void
}

const levelConfig: Record<CardinalLevel, { icon: string; color: string; bg: string; label: string }> = {
  block: { icon: "🚫", color: "text-red-500", bg: "bg-red-500/10", label: "Block" },
  pause: { icon: "⏸", color: "text-orange-500", bg: "bg-orange-500/10", label: "Pause" },
  stop: { icon: "🛑", color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Stop" },
  warn: { icon: "⚠️", color: "text-blue-400", bg: "bg-blue-500/10", label: "Warn" },
}

export function CardinalInterventionPanel(props: CardinalInterventionPanelProps) {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div class="h-full flex flex-col overflow-hidden bg-background-base">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base">
        <div class="flex items-center gap-2">
          <span class="text-[13px]">🛡️</span>
          <span class="text-13-medium text-text-strong">Cardinal 干预</span>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-auto px-3 py-2">
        <div class="flex flex-col gap-2">
          <For each={props.interventions()}>
            {(intervention) => {
              const config = levelConfig[intervention.level]
              const isExpanded = () => expanded().has(intervention.id)
              return (
                <div class={`border rounded-lg overflow-hidden ${config.bg}`}>
                  <div
                    class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => toggle(intervention.id)}
                  >
                    <span class="text-[13px]">{config.icon}</span>
                    <span class={`text-12-medium ${config.color}`}>{config.label}</span>
                    <span class="text-12-regular text-text-base truncate flex-1">{intervention.trigger}</span>
                    <span class="text-[10px] text-text-weak">{isExpanded() ? "▼" : "▶"}</span>
                  </div>

                  <Show when={isExpanded()}>
                    <div class="px-3 pb-3 flex flex-col gap-1.5">
                      <div class="text-12-regular text-text-weak">{intervention.reason}</div>
                      <div class="text-11-regular text-text-weaker">{intervention.recommendation}</div>

                      <div class="flex items-center gap-2 mt-1">
                        <Show when={intervention.level === "pause" || intervention.level === "stop"}>
                          <button
                            class="px-2 py-1 rounded text-11-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                            onClick={() => props.onResume?.(intervention.id)}
                          >
                            继续
                          </button>
                        </Show>
                        <Show when={intervention.canDegrade && !intervention.degraded}>
                          <button
                            class="px-2 py-1 rounded text-11-medium bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 transition-colors"
                            onClick={() => props.onDegrade?.(intervention.id)}
                          >
                            降级
                          </button>
                        </Show>
                        <Show when={intervention.level === "warn"}>
                          <button
                            class="px-2 py-1 rounded text-11-medium text-text-weak hover:text-text-base transition-colors"
                            onClick={() => props.onDismiss?.(intervention.id)}
                          >
                            忽略
                          </button>
                        </Show>
                      </div>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
