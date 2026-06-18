import { createSignal, createContext, useContext, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@mimo-ai/ui/context"
import { persisted } from "@/utils/persist"

export interface ModeUIConfig {
  id: string
  name: string
  color: string
  icon: string
  placeholder: string
  shortcut: string
  description: string
  experimental?: boolean
}

export const BUILTIN_MODES: ModeUIConfig[] = [
  {
    id: "ask",
    name: "Ask",
    color: "#4a9eff",
    icon: "💬",
    placeholder: "💬 Ask: 描述你的问题，我来解答...",
    shortcut: "mod+shift+a",
    description: "基础问答与咨询，不修改代码",
  },
  {
    id: "build",
    name: "Build",
    color: "#fb8147",
    icon: "🛠️",
    placeholder: "🛠️ Build: 描述你的需求，我生成代码...",
    shortcut: "mod+shift+b",
    description: "代码生成与文件编辑",
  },
  {
    id: "plan",
    name: "Plan",
    color: "#c7e2a8",
    icon: "📋",
    placeholder: "📋 Plan: 描述你的目标，我分解任务...",
    shortcut: "mod+shift+p",
    description: "任务分解与计划制定",
  },
  {
    id: "compose",
    name: "Compose",
    color: "#a7a3d8",
    icon: "🎼",
    placeholder: "🎼 Compose: 描述你的重构需求...",
    shortcut: "mod+shift+o",
    description: "多文件重构与组合",
  },
  {
    id: "loop",
    name: "Loop",
    color: "#007acc",
    icon: "🔄",
    placeholder: "🔄 Loop: 描述你的任务，我将迭代执行并自动反馈...",
    shortcut: "mod+shift+l",
    description: "迭代执行与自动反馈循环",
  },
  {
    id: "max",
    name: "Max",
    color: "#e85d75",
    icon: "⚡",
    placeholder: "⚡ Max: 描述你的任务，多路径推理选择最佳方案...",
    shortcut: "mod+shift+m",
    description: "最大能力模式，并行多 Agent 推理",
    experimental: true,
  },
]

export interface ModeRegistryState {
  modes: ModeUIConfig[]
  activeModeId: string
}

const defaultState: ModeRegistryState = {
  modes: BUILTIN_MODES,
  activeModeId: "build",
}

export type ModeRegistryContext = {
  modes: () => ModeUIConfig[]
  activeMode: () => ModeUIConfig
  activeModeId: () => string
  setActiveMode: (id: string) => void
  getModeById: (id: string) => ModeUIConfig | undefined
  isExperimental: (id: string) => boolean
}

export const { use: useModeRegistry, provider: ModeRegistryProvider } = createSimpleContext({
  name: "ModeRegistry",
  gate: false,
  init: () => {
    const [store, setStore] = createStore<ModeRegistryState>(defaultState)

    const activeMode = createMemo(() => {
      const mode = store.modes.find((m) => m.id === store.activeModeId)
      return mode ?? store.modes[0]
    })

    const getModeById = (id: string) => store.modes.find((m) => m.id === id)
    const isExperimental = (id: string) => getModeById(id)?.experimental ?? false

    const setActiveMode = (id: string) => {
      const mode = getModeById(id)
      if (!mode) return
      setStore("activeModeId", id)
    }

    return {
      modes: () => store.modes,
      activeMode,
      activeModeId: () => store.activeModeId,
      setActiveMode,
      getModeById,
      isExperimental,
    }
  },
})
