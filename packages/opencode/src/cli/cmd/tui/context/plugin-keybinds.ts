import { createContext } from "solid-js"
export const PluginKeybindContext = createContext<any>(null)
export function usePluginKeybinds() { return [] }
export function createPluginKeybind(_name: string, _cb: () => void) { return { key: "", handler: () => {} } }
