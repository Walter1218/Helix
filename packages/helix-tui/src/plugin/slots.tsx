import type { JSX } from "solid-js"

export interface HelixSlotMap {
  sidebar_title: object
  sidebar_content: object
  sidebar_footer: object
  home_header: object
  home_content: object
  home_footer: object
  chat_header: object
  chat_footer: object
  app: object
}

export type SlotName = keyof HelixSlotMap

export interface SlotContext {
  theme: any
  sdk: any
  sync: any
}

export interface SlotPlugin {
  id: string
  order: number
  slots: Partial<{
    [K in SlotName]: (ctx: SlotContext, props: HelixSlotMap[K]) => JSX.Element
  }>
}

type SlotEntry = {
  pluginId: string
  order: number
  renderer: (ctx: SlotContext, props: any) => JSX.Element
}

const slotRegistry = new Map<SlotName, SlotEntry[]>()
let globalContext: SlotContext | null = null

export function setupSlots(context: SlotContext) {
  globalContext = context
  slotRegistry.clear()
  return { register, unregister, getEntries, getContext }
}

export function register(plugin: SlotPlugin) {
  for (const [slotName, renderer] of Object.entries(plugin.slots)) {
    if (!renderer) continue
    const entries = slotRegistry.get(slotName as SlotName) ?? []
    const existing = entries.findIndex((e) => e.pluginId === plugin.id)
    const entry: SlotEntry = { pluginId: plugin.id, order: plugin.order, renderer }
    if (existing >= 0) entries[existing] = entry
    else entries.push(entry)
    entries.sort((a, b) => a.order - b.order)
    slotRegistry.set(slotName as SlotName, entries)
  }
}

export function unregister(pluginId: string) {
  for (const [slotName, entries] of slotRegistry) {
    slotRegistry.set(
      slotName,
      entries.filter((e) => e.pluginId !== pluginId),
    )
  }
}

export function getEntries(slotName: SlotName): SlotEntry[] {
  return slotRegistry.get(slotName) ?? []
}

export function getContext(): SlotContext | null {
  return globalContext
}

export function registerPlugin(plugin: SlotPlugin) {
  register(plugin)
}

export function unregisterPlugin(pluginId: string) {
  unregister(pluginId)
}
