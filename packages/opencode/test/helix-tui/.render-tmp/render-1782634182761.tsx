
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"


const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<box width={40} height={5}><text><b>BOLD_TEXT</b></text></box>), renderer)
setTimeout(() => renderer.destroy?.(), 1000)
await new Promise(r => setTimeout(r, 1500))
