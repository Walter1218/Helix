import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { Show, createEffect, onMount, type JSX } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import * as trace from "../trace"

export type DialogPromptProps = {
  title: string
  description?: () => JSX.Element
  placeholder?: string
  value?: string
  busy?: boolean
  busyText?: string
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const dialog = useDialog()
  const theme = useTheme()
  let textarea: any

  useKeyboard((evt) => {
    if (props.busy) {
      if (evt.name === "escape") return
      evt.preventDefault()
      evt.stopPropagation()
      return
    }
    if (evt.name === "return") {
      props.onConfirm?.(textarea.plainText)
    }
  })

  onMount(() => {
    dialog.setSize("medium")
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      if (props.busy) return
      textarea.focus()
    }, 1)
    if (textarea && !textarea.isDestroyed) textarea.gotoLineEnd()
  })

  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return
    if (props.busy) {
      textarea.blur()
      return
    }
    textarea.focus()
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.getColor("text")}>
          {props.title}
        </text>
        <text fg={theme.getColor("textMuted")} onMouseUp={() => dialog.clear()}>
          [ESC]
        </text>
      </box>
      <box gap={1}>
        {props.description}
        <textarea
          onSubmit={() => {
            if (props.busy) return
            props.onConfirm?.(textarea.plainText)
          }}
          height={3}
          keyBindings={props.busy ? [] : [{ name: "return", action: "submit" }]}
          ref={(val: any) => {
            textarea = val
          }}
          initialValue={props.value}
          placeholder={props.placeholder ?? "Type here..."}
          placeholderColor={theme.getColor("textMuted")}
          textColor={props.busy ? theme.getColor("textMuted") : theme.getColor("text")}
          focusedTextColor={props.busy ? theme.getColor("textMuted") : theme.getColor("text")}
          cursorColor={props.busy ? theme.getColor("backgroundTertiary") : theme.getColor("text")}
        />
        <Show when={props.busy}>
          <text fg={theme.getColor("textMuted")}>{props.busyText ?? "Processing..."}</text>
        </Show>
      </box>
      <box paddingBottom={1} gap={1} flexDirection="row">
        <Show when={!props.busy} fallback={<text fg={theme.getColor("textMuted")}>Processing...</text>}>
          <text
            fg={theme.getColor("text")}
            onMouseUp={() => {
              props.onConfirm?.(textarea.plainText)
            }}
          >
            Enter <span style={{ fg: theme.getColor("textMuted") }}>to submit</span>
          </text>
        </Show>
      </box>
    </box>
  )
}

DialogPrompt.show = (dialog: DialogContext, title: string, options?: Omit<DialogPromptProps, "title">) => {
  trace.emit("session.dialog.open", "info", "Showing prompt dialog", { title })
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt
          title={title}
          {...options}
          onConfirm={(value) => {
            resolve(value)
            dialog.clear()
          }}
          onCancel={() => {
            resolve(null)
            dialog.clear()
          }}
        />
      ),
      () => resolve(null),
    )
  })
}
