import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { TextAttributes } from "@opentui/core"
import * as trace from "../trace"

export interface DialogSelectProps<T> {
  title: string
  placeholder?: string
  options: DialogSelectOption<T>[]
  flat?: boolean
  onSelect?: (option: DialogSelectOption<T>) => void
  onFilter?: (query: string) => void
  skipFilter?: boolean
  current?: T
}

export interface DialogSelectOption<T = any> {
  title: string
  value: T
  description?: string
  category?: string
  disabled?: boolean
  onSelect?: () => void
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const dialog = useDialog()
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    input: "keyboard" as "keyboard" | "mouse",
  })

  const filtered = createMemo(() => {
    if (props.skipFilter || !store.filter) return props.options
    const q = store.filter.toLowerCase()
    return props.options.filter((o) => o.title.toLowerCase().includes(q))
  })

  const flat = createMemo(() => {
    if (props.flat) return filtered()
    const groups = new Map<string, DialogSelectOption<T>[]>()
    for (const o of filtered()) {
      const cat = o.category ?? "Other"
      const arr = groups.get(cat) ?? []
      arr.push(o)
      groups.set(cat, arr)
    }
    const result: (DialogSelectOption<T> | { __category: string })[] = []
    for (const [cat, opts] of groups) {
      result.push({ __category: cat })
      for (const o of opts) result.push(o)
    }
    return result
  })

  const selectedIndex = createMemo(() => {
    const items = flat()
    if (items.length === 0) return -1
    if (store.selected < 0) return 0
    if (store.selected >= items.length) return items.length - 1
    return store.selected
  })

  const isCategory = (item: any): item is { __category: string } => item && "__category" in item

  const moveTo = (idx: number) => {
    const items = flat()
    if (items.length === 0) return
    let target = Math.max(0, Math.min(idx, items.length - 1))
    while (target < items.length && isCategory(items[target]!)) {
      target++
    }
    if (target >= items.length) {
      target = items.length - 1
      while (target >= 0 && isCategory(items[target]!)) {
        target--
      }
    }
    if (target >= 0) setStore("selected", target)
  }

  const confirm = () => {
    const items = flat()
    const idx = selectedIndex()
    if (idx < 0 || idx >= items.length) return
    const item = items[idx]
    if (isCategory(item)) return
    const opt = item as DialogSelectOption<T>
    if (opt.disabled) return
    if (opt.onSelect) {
      opt.onSelect()
    } else if (props.onSelect) {
      props.onSelect(opt)
    }
    dialog.clear()
  }

  useKeyboard((evt) => {
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
      moveTo(selectedIndex() - 1)
      setStore("input", "keyboard")
    }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
      moveTo(selectedIndex() + 1)
      setStore("input", "keyboard")
    }
    if (evt.name === "pageup") {
      moveTo(selectedIndex() - 10)
      setStore("input", "keyboard")
    }
    if (evt.name === "pagedown") {
      moveTo(selectedIndex() + 10)
      setStore("input", "keyboard")
    }
    if (evt.name === "home") {
      moveTo(0)
      setStore("input", "keyboard")
    }
    if (evt.name === "end") {
      moveTo(flat().length - 1)
      setStore("input", "keyboard")
    }
    if (evt.name === "return") {
      confirm()
    }
    if (evt.name === "escape") {
      dialog.clear()
    }
  })

  const dialogHeight = createMemo(() => Math.max(10, Math.min(30, dimensions().height - 8)))

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.getColor("text")}>
          {props.title}
        </text>
        <text fg={theme.getColor("textMuted")} onMouseUp={() => dialog.clear()}>
          [ESC]
        </text>
      </box>

      <Show when={!props.skipFilter}>
        <box height={1} flexDirection="row">
          <text fg={theme.getColor("primary")}>{" > "}</text>
          <textarea
            height={1}
            maxHeight={1}
            minHeight={1}
            textColor={theme.getColor("text")}
            placeholder={props.placeholder ?? "Filter..."}
            placeholderColor={theme.getColor("textMuted")}
            cursorColor={theme.getColor("text")}
            onContentChange={(val: any) => {
              setStore("filter", val.plainText)
              props.onFilter?.(val.plainText)
              moveTo(0)
            }}
          />
        </box>
      </Show>

      <box height={1} />

      <scrollbox height={dialogHeight()} flexGrow={1}>
        <For each={flat()}>
          {(item, i) => {
            const idx = i()
            if (isCategory(item)) {
              return (
                <box height={1} paddingLeft={1}>
                  <text fg={theme.getColor("accent")} attributes={TextAttributes.BOLD}>
                    {item.__category}
                  </text>
                </box>
              )
            }
            const opt = item as DialogSelectOption<T>
            const isSelected = idx === selectedIndex()
            const isDisabled = opt.disabled
            return (
              <box
                height={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={isSelected ? theme.getColor("primary") : undefined}
                onMouseOver={() => {
                  if (!isDisabled) {
                    setStore("selected", idx)
                    setStore("input", "mouse")
                  }
                }}
                onMouseUp={() => {
                  if (!isDisabled) {
                    setStore("selected", idx)
                    if (opt.onSelect) opt.onSelect()
                    else if (props.onSelect) props.onSelect(opt)
                    dialog.clear()
                  }
                }}
              >
                <text
                  fg={isSelected ? theme.getColor("textInverse") : isDisabled ? theme.getColor("textMuted") : theme.getColor("text")}
                  attributes={isSelected ? TextAttributes.BOLD : 0}
                >
                  {opt.title}
                </text>
                <Show when={opt.description}>
                  <text fg={theme.getColor("textMuted")}> {opt.description}</text>
                </Show>
              </box>
            )
          }}
        </For>
        <Show when={flat().length === 0}>
          <box height={1} paddingLeft={1}>
            <text fg={theme.getColor("textMuted")}>No results</text>
          </box>
        </Show>
      </scrollbox>
    </box>
  )
}

DialogSelect.show = <T,>(
  dialog: ReturnType<typeof useDialog>,
  title: string,
  options: DialogSelectOption<T>[],
  current?: T,
) => {
  trace.emit("session.dialog.open", "info", "Showing select dialog", { title, optionCount: options.length })
  return new Promise<DialogSelectOption<T> | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogSelect<T>
          title={title}
          options={options}
          current={current}
          onSelect={(opt) => resolve(opt)}
        />
      ),
      () => resolve(null),
    )
  })
}
