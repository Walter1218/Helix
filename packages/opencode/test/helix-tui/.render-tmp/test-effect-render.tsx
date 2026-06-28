import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { Effect } from "effect"
import { appendFileSync } from "fs"

const LOG = "/tmp/test-effect-render.log"
appendFileSync(LOG, "=== START ===\n")

// Test 1: Direct render (no Effect)
appendFileSync(LOG, "Test 1: Direct render\n")
const r1 = await createCliRenderer({
  externalOutputMode: "passthrough", targetFps: 60,
  exitOnCtrlC: false, useKittyKeyboard: {}, autoFocus: false,
  openConsoleOnError: false,
})
appendFileSync(LOG, "  renderer created\n")

render(() => {
  appendFileSync(LOG, "  JSX CALLBACK CALLED (direct)\n")
  return <box width={80} height={10}><text>DIRECT_TEST</text></box>
}, r1)
appendFileSync(LOG, "  render() returned\n")

await new Promise(r => setTimeout(r, 500))
r1.destroy?.()
appendFileSync(LOG, "  destroyed\n")

// Test 2: Render inside Effect.runPromise
appendFileSync(LOG, "Test 2: Effect.runPromise\n")
const r2 = await createCliRenderer({
  externalOutputMode: "passthrough", targetFps: 60,
  exitOnCtrlC: false, useKittyKeyboard: {}, autoFocus: false,
  openConsoleOnError: false,
})
appendFileSync(LOG, "  renderer created\n")

try {
  await Effect.runPromise(
    Effect.gen(function* () {
      appendFileSync(LOG, "  Inside Effect.gen\n")
      yield* Effect.tryPromise(async () => {
        appendFileSync(LOG, "  Inside Effect.tryPromise\n")
        await new Promise(r2 => setTimeout(r2, 100))
        render(() => {
          appendFileSync(LOG, "  JSX CALLBACK CALLED (effect)\n")
          return <box width={80} height={10}><text>EFFECT_TEST</text></box>
        }, r2)
        appendFileSync(LOG, "  render() returned (effect)\n")
      })
      appendFileSync(LOG, "  After Effect.tryPromise\n")
    })
  )
  appendFileSync(LOG, "  Effect.runPromise completed\n")
} catch (e) {
  appendFileSync(LOG, `  ERROR: ${String((e as any)?.message ?? e)}\n`)
}

await new Promise(r => setTimeout(r, 500))
r2.destroy?.()
appendFileSync(LOG, "=== DONE ===\n")
process.exit(0)
