import { createSignal, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"

const STASH_KEY = "prompt-stash"

export function usePromptStash() {
  const kv = useKV()

  function save(text: string) {
    const existing: string[] = kv.get(STASH_KEY, [])
    const updated = [text, ...existing.filter((t) => t !== text)].slice(0, 10)
    kv.set(STASH_KEY, updated)
  }

  function getAll(): string[] {
    return kv.get(STASH_KEY, [])
  }

  function getLatest(): string | undefined {
    const stash = getAll()
    return stash[0]
  }

  function remove(text: string) {
    const existing: string[] = kv.get(STASH_KEY, [])
    kv.set(
      STASH_KEY,
      existing.filter((t) => t !== text),
    )
  }

  function clear() {
    kv.set(STASH_KEY, [])
  }

  return { save, getAll, getLatest, remove, clear }
}

export function PromptStashIndicator() {
  const theme = useTheme()
  const stash = usePromptStash()

  return (
    <Show when={stash.getAll().length > 0}>
      <text fg={theme.getColor("textMuted")}> 📋 {stash.getAll().length} stashed</text>
    </Show>
  )
}
