import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { App } from "./app"
import { RouteProvider } from "./context/route"
import { ThemeProvider } from "./context/theme"
import { SDKProvider } from "./context/sdk"
import { DialogProvider } from "./ui/dialog"
import { KVProvider } from "./context/kv"
import { SyncProvider } from "./context/sync"
import { LocalProvider } from "./context/local"
import * as trace from "./trace"

export async function bootstrap(config?: {
  url?: string
  directory?: string
}) {
  const url = config?.url ?? "http://localhost:3095"
  const password = process.env.MIMOCODE_SERVER_PASSWORD ?? ""
  const username = process.env.MIMOCODE_SERVER_USERNAME ?? "mimocode"
  const authHeader: Record<string, string> = password
    ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` }
    : {}

  // 启动时验证服务器可达性
  trace.emit("session.create", "info", "Checking server health", { url })
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${url}/global/health`, { signal: controller.signal, headers: authHeader })
    clearTimeout(timeout)
    if (!res.ok) {
      trace.emit("session.error", "warn", `Server health check failed: ${res.status}`, { status: res.status, url })
      console.error(`Warning: Server at ${url} returned ${res.status}. TUI may not work correctly.`)
    } else {
      trace.emit("session.created", "info", "Server health check passed", { url })
    }
  } catch (e: any) {
    trace.emit("session.error", "error", "Server unreachable", { url, error: e.message })
    console.error(`Error: Cannot reach server at ${url}. Is the Helix server running?`)
    console.error(`Start it with: mimo serve --port 3095`)
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  })

  await render(
    () => (
      <SDKProvider url={url} directory={config?.directory} headers={authHeader}>
        <KVProvider>
          <SyncProvider>
            <ThemeProvider>
              <LocalProvider>
                <DialogProvider>
                  <RouteProvider>
                    <App />
                  </RouteProvider>
                </DialogProvider>
              </LocalProvider>
            </ThemeProvider>
          </SyncProvider>
        </KVProvider>
      </SDKProvider>
    ),
    renderer,
  )
}
