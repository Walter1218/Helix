
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

import { ErrorBoundary } from "solid-js"

function Broken() {
  throw new Error("TEST_ERR_BOUNDARY_WORKS")
  return null
}

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<ErrorBoundary fallback={(e: Error) => <text>{'CAUGHT:' + e.message}</text>}>
        <Broken />
      </ErrorBoundary>), renderer)
setTimeout(() => renderer.destroy?.(), 1000)
await new Promise(r => setTimeout(r, 1500))
