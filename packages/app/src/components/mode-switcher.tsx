import { createSignal, createMemo, onCleanup, For, Show, createEffect } from "solid-js"
import { useModeRegistry } from "@/context/mode-registry"
import { useCommand } from "@/context/command"
import { Tooltip, TooltipKeybind } from "@mimo-ai/ui/tooltip"
import { IconButton } from "@mimo-ai/ui/icon-button"
import { useSpring } from "@mimo-ai/ui/motion-spring"

export function ModeSwitcher() {
  const registry = useModeRegistry()
  const command = useCommand()

  const [hoveredId, setHoveredId] = createSignal<string | null>(null)

  const activeId = createMemo(() => registry.activeModeId())

  const handleSwitch = (id: string) => {
    registry.setActiveMode(id)
  }

  const [animatingId, setAnimatingId] = createSignal<string | null>(null)

  const handleClick = (id: string) => {
    if (id === activeId()) return
    setAnimatingId(id)
    handleSwitch(id)
    setTimeout(() => setAnimatingId(null), 300)
  }

  // Register keyboard shortcuts
  createEffect(() => {
    registry.modes().forEach((mode) => {
      command.register(() => [{
        id: `mode.switch.${mode.id}`,
        title: `Switch to ${mode.name} mode`,
        keybind: mode.shortcut,
        onSelect: () => handleClick(mode.id),
      }])
    })
  })

  return (
    <div class="flex items-center gap-0.5 px-2 py-1">
      <For each={registry.modes()}>
        {(mode) => {
          const isActive = () => activeId() === mode.id
          const isHovered = () => hoveredId() === mode.id
          const isAnimating = () => animatingId() === mode.id

          const buttonSpring = useSpring(() => (isAnimating() ? 1.05 : 1), {
            visualDuration: 0.3,
            bounce: 0.2,
          })

          const tooltipValue = createMemo(() => {
            let text = `${mode.icon} ${mode.name}\n${mode.description}`
            if (mode.experimental) text += "\n实验性功能"
            return text
          })

          return (
            <Tooltip
              placement="bottom"
              gutter={8}
              value={tooltipValue()}
            >
              <button
                class="relative flex items-center gap-1 h-[22px] px-2 rounded text-[11px] font-medium transition-all duration-200"
                classList={{
                  "bg-background-tertiary-base": isActive(),
                  "text-text-strong": isActive(),
                  "text-text-weak": !isActive(),
                  "hover:bg-background-tertiary-base/50": !isActive(),
                }}
                style={{
                  "border-left": isActive() ? `3px solid ${mode.color}` : "3px solid transparent",
                  transform: `scale(${buttonSpring()})`,
                }}
                onMouseEnter={() => setHoveredId(mode.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleClick(mode.id)}
                aria-pressed={isActive()}
                aria-label={`Switch to ${mode.name} mode`}
              >
                <span class="text-[13px] leading-none">{mode.icon}</span>
                <span class="truncate max-w-[60px]">{mode.name}</span>
              </button>
            </Tooltip>
          )
        }}
      </For>
    </div>
  )
}
