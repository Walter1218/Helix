
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

import { PluginRuntimeProvider, createPluginRuntime, usePluginRuntime } from "@tui/plugin/runtime"

function App() {
  const runtime = usePluginRuntime()
  const Slot = runtime.Slot
  return (
    <box width={80} height={10} flexDirection="column">
      <Slot name="test_slot">
        <text>SLOT_FALLBACK</text>
      </Slot>
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

render(() => (<PluginRuntimeProvider value={createPluginRuntime()}>
        <App />
      </PluginRuntimeProvider>), renderer)
setTimeout(() => renderer.destroy?.(), 1000)
await new Promise(r => setTimeout(r, 1500))
