import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (
  <box width={80} height={10} flexDirection="column">
    <text HELLO="true">Hello Render Test</text>
    <box height={1} />
    <text WORLD="true">World</text>
  </box>
) as any, renderer)

// Let render complete
await new Promise(r => setTimeout(r, 500))
;renderer as any).destroy?.()
