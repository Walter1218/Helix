import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: true,
  useKittyKeyboard: {},
  autoFocus: false,
})

await render(() => (
  <box flexDirection="column" width={80} height={24}>
    <text>Hello Helix TUI!</text>
    <box height={1} />
    <text>Rendering works.</text>
  </box>
), renderer)

process.stderr.write("[TEST] Render OK\n")
setTimeout(() => process.exit(0), 500)
