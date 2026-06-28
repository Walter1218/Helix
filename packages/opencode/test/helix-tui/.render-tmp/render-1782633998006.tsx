
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"


const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<box width={30} height={8} flexDirection="column">
      <text>TOP</text>
      <box flexGrow={1} />
      <text>BOTTOM</text>
    </box>), renderer)
setTimeout(() => renderer.destroy?.(), 1000)
await new Promise(r => setTimeout(r, 1500))
