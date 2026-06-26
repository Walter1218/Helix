import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { batch, createMemo, createSignal } from "solid-js"
import { useSync } from "./sync"
import { useTheme, type ThemeColors } from "./theme"
import { RGBA } from "@opentui/core"

export function parseModel(model: string) {
  const [providerID, ...rest] = model.split("/")
  return {
    providerID: providerID,
    modelID: rest.join("/"),
  }
}

export const { use: useLocal, provider: LocalProvider } = createSimpleContext({
  name: "Local",
  init: () => {
    const sync = useSync()
    const [agentStore, setAgentStore] = createStore({
      current: undefined as string | undefined,
    })
    const themeCtx = useTheme()

    const agents = createMemo(() => sync.data.agent.filter((x) => x.mode !== "subagent" && !x.hidden))
    const visibleAgents = createMemo(() => sync.data.agent.filter((x) => !x.hidden))

    const colors = createMemo(() => [
      themeCtx.current.colors.secondary,
      themeCtx.current.colors.accent,
      themeCtx.current.colors.success,
      themeCtx.current.colors.warning,
      themeCtx.current.colors.primary,
      themeCtx.current.colors.error,
      themeCtx.current.colors.info,
    ])

    const agent = {
      list() {
        return agents()
      },
      current() {
        return agents().find((x) => x.name === agentStore.current) ?? agents().at(0)
      },
      set(name: string) {
        if (!agents().some((x) => x.name === name)) return
        setAgentStore("current", name)
      },
      move(direction: 1 | -1) {
        batch(() => {
          const current = agent.current()
          if (!current) return
          const list = agents()
          if (list.length === 0) return
          let next = list.findIndex((x) => x.name === current.name) + direction
          if (next < 0) next = list.length - 1
          if (next >= list.length) next = 0
          const value = list[next]
          if (value) setAgentStore("current", value.name)
        })
      },
      color(name: string) {
        const index = visibleAgents().findIndex((x) => x.name === name)
        if (index === -1) return colors()[0]
        const ag = visibleAgents()[index]
        if (ag?.color) {
          const color = ag.color
          if (color.startsWith("#")) return RGBA.fromHex(color)
          const themeColor = themeCtx.current.colors[color as keyof ThemeColors]
          if (themeColor) return themeColor
        }
        return colors()[index % colors().length]
      },
    }

    const [modelIndex, setModelIndex] = createSignal(0)

    const model = {
      get current() {
        const providers = sync.data.provider
        const providerModels: { providerID: string; modelID: string }[] = []
        for (const p of providers) {
          for (const m of Object.keys(p.models ?? {})) {
            providerModels.push({ providerID: p.id, modelID: m })
          }
        }
        if (providerModels.length === 0) return undefined
        const idx = modelIndex() % providerModels.length
        return providerModels[idx]
      },
      cycle(direction: 1 | -1 = 1) {
        const providers = sync.data.provider
        const total = providers.reduce((acc, p) => acc + Object.keys(p.models ?? {}).length, 0)
        if (total === 0) return
        setModelIndex((prev) => {
          let next = prev + direction
          if (next < 0) next = total - 1
          if (next >= total) next = 0
          return next
        })
      },
      parsed() {
        const m = model.current
        if (!m) return undefined
        return `${m.providerID}/${m.modelID}`
      },
    }

    return { agent, model }
  },
})
