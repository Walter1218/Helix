import { createSignal, createMemo, For, Show } from "solid-js"

export type AttentionLevel = 1 | 2 | 3 | 4

export interface ZenModeToggleProps {
  level: () => AttentionLevel
  onChange?: (level: AttentionLevel) => void
}

export const levelConfig: Record<AttentionLevel, { label: string; color: string; description: string }> = {
  1: { label: "Alert", color: "#ef4444", description: "所有通知开启" },
  2: { label: "Normal", color: "#eab308", description: "减少非必要中断" },
  3: { label: "Focused", color: "#22c55e", description: "仅关键警报" },
  4: { label: "Zen Mode", color: "#3b82f6", description: "极简 UI，无干扰" },
}

export function ZenModeToggle(props: ZenModeToggleProps) {
  const current = props.level

  return (
    <div class="flex flex-col gap-2">
      <div class="text-13-medium text-text-strong">注意力等级</div>
      <div class="flex flex-col gap-1">
        <For each={([1, 2, 3, 4] as AttentionLevel[])}>
          {(level) => {
            const config = levelConfig[level]
            const isActive = () => current() === level
            return (
              <button
                class="flex items-center gap-2 px-2 py-1.5 rounded transition-all"
                classList={{
                  "bg-background-tertiary-base": isActive(),
                  "hover:bg-background-tertiary-base/50": !isActive(),
                }}
                onClick={() => props.onChange?.(level)}
              >
                <div
                  class="w-3 h-3 rounded-full shrink-0"
                  style={{
                    background: config.color,
                    opacity: isActive() ? 1 : 0.4,
                  }}
                />
                <div class="flex flex-col items-start">
                  <span class={`text-12-medium ${isActive() ? "text-text-strong" : "text-text-weak"}`}>
                    {config.label}
                  </span>
                  <span class="text-11-regular text-text-weak">{config.description}</span>
                </div>
                <Show when={isActive()}>
                  <span class="text-11-medium ml-auto" style={{ color: config.color }}>
                    Active
                  </span>
                </Show>
              </button>
            )
          }}
        </For>
      </div>
    </div>
  )
}
