
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

import { Show, createSignal } from "solid-js"
function App() {
  const [ready] = createSignal(true)
  return (
    <box width={80} height={10} flexDirection="column">
      <Show when={ready()}>
        <text>SHOULD_APPEAR</text>
      </Show>
    </box>
  )
}

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<App />), renderer)
setTimeout(() => renderer.destroy?.(), 1000)
await new Promise(r => setTimeout(r, 1500))
