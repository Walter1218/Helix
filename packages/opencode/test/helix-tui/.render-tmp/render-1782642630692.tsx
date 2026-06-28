
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"


const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<box width={80} height={10} flexDirection="column">
      <text>RENDER_TEST_HELLO</text>
      <box height={1} />
      <text>RENDER_WORKS</text>
    </box>), renderer)
setTimeout(() => renderer.destroy?.(), 1000)
await new Promise(r => setTimeout(r, 1500))
