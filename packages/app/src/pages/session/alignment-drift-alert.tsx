import { Show, createSignal, For } from "solid-js"

export type DriftType = "file_drift" | "rabbit_hole" | "distraction"

export interface DriftMetric {
  type: DriftType
  severity: "high" | "medium" | "low"
  description: string
  value?: string
}

export interface AlignmentDriftAlertProps {
  metrics: () => DriftMetric[]
  onRecalibrate?: () => void
  onDismiss?: () => void
}

export const driftConfig: Record<DriftType, { icon: string; label: string }> = {
  file_drift: { icon: "📁", label: "文件漂移" },
  rabbit_hole: { icon: "🐰", label: "兔子洞" },
  distraction: { icon: "🎯", label: "分心操作" },
}

const severityColor: Record<string, string> = {
  high: "text-red-500",
  medium: "text-orange-400",
  low: "text-yellow-400",
}

export function AlignmentDriftAlert(props: AlignmentDriftAlertProps) {
  const [expanded, setExpanded] = createSignal(true)

  return (
    <div class="border border-orange-500/30 rounded-lg bg-orange-500/5 overflow-hidden">
      <div
        class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-orange-500/10 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <span class="animate-pulse text-amber-500 text-[13px]">🚨</span>
        <span class="text-13-medium text-amber-500">Alignment Drift Detected</span>
        <span class="text-[10px] text-text-weak ml-auto">{expanded() ? "▼" : "▶"}</span>
        <button
          class="text-text-weak hover:text-text-base transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            props.onDismiss?.()
          }}
        >
          ✕
        </button>
      </div>

      <Show when={expanded()}>
        <div class="px-3 pb-3 flex flex-col gap-2">
          <For each={props.metrics()}>
            {(metric) => (
              <div class="flex items-start gap-2">
                <span class={`text-[13px] mt-0.5 ${severityColor[metric.severity]}`}>
                  {driftConfig[metric.type].icon}
                </span>
                <div class="flex flex-col">
                  <span class="text-12-medium text-text-base">
                    {driftConfig[metric.type].label}
                  </span>
                  <span class="text-11-regular text-text-weak">{metric.description}</span>
                  <Show when={metric.value}>
                    <span class="text-11-regular text-text-weak">{metric.value}</span>
                  </Show>
                </div>
                <div class={`ml-auto w-2 h-2 rounded-full mt-1.5 ${severityColor[metric.severity].replace("text-", "bg-")}`} />
              </div>
            )}
          </For>

          <button
            class="self-start mt-1 px-3 py-1.5 rounded text-12-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            onClick={() => props.onRecalibrate?.()}
          >
            Recalibrate
          </button>
        </div>
      </Show>
    </div>
  )
}
