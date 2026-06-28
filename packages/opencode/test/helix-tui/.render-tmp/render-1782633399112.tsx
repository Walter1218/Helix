
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<box width={10} height={3}><text>X</text></box>), renderer)
setTimeout(() => renderer.destroy?.(), 300)
await new Promise(r => setTimeout(r, 800))
