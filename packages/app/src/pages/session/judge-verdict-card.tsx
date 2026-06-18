import { Show, createSignal } from "solid-js"
import { IconButton } from "@mimo-ai/ui/icon-button"

export type Verdict = "pass" | "questionable" | "reject" | "force_rollback"

export interface JudgeVerdict {
  id: string
  decompositionQuality: Verdict
  resultQuality: Verdict
  valueSuccess: Verdict
  timestamp: string
  message: string
}

export interface JudgeVerdictCardProps {
  verdict: () => JudgeVerdict
  onRollback?: () => void
  onDismiss?: () => void
}

const verdictConfig: Record<Verdict, { icon: string; color: string; label: string }> = {
  pass: { icon: "✅", color: "text-green-500", label: "通过" },
  questionable: { icon: "⚠️", color: "text-amber-500", label: "存疑" },
  reject: { icon: "❌", color: "text-red-500", label: "驳回" },
  force_rollback: { icon: "⏮️", color: "text-red-600", label: "强制回滚" },
}

export function JudgeVerdictCard(props: JudgeVerdictCardProps) {
  const [expanded, setExpanded] = createSignal(true)
  const v = props.verdict

  return (
    <div class="border border-purple-500/40 rounded-lg bg-purple-500/5 overflow-hidden">
      <div
        class="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-purple-500/10 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-2">
          <span class="text-[13px]">⚖️</span>
          <span class="text-13-medium text-purple-400">Judge 裁决</span>
          <span class="text-11-regular text-text-weak">{v().timestamp}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[10px]">{expanded() ? "▼" : "▶"}</span>
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
      </div>

      <Show when={expanded()}>
        <div class="px-3 pb-3 flex flex-col gap-2">
          <div class="flex flex-col gap-1.5">
            <VerdictRow label="分解质量" verdict={v().decompositionQuality} />
            <VerdictRow label="结果质量" verdict={v().resultQuality} />
            <VerdictRow label="价值成功" verdict={v().valueSuccess} />
          </div>

          <Show when={v().message}>
            <div class="text-12-regular text-text-weak mt-1">{v().message}</div>
          </Show>

          <Show when={v().valueSuccess === "reject" || v().valueSuccess === "force_rollback"}>
            <button
              class="self-start mt-1 px-3 py-1.5 rounded text-12-medium bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors"
              onClick={() => props.onRollback?.()}
            >
              强制回滚
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function VerdictRow(props: { label: string; verdict: Verdict }) {
  const config = verdictConfig[props.verdict]
  return (
    <div class="flex items-center justify-between">
      <span class="text-12-regular text-text-weak">{props.label}</span>
      <div class={`flex items-center gap-1 ${config.color}`}>
        <span class="text-[13px]">{config.icon}</span>
        <span class="text-12-medium">{config.label}</span>
      </div>
    </div>
  )
}
