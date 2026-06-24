import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { App } from "./app"
import { RouteProvider } from "./context/route"
import { ThemeProvider } from "./context/theme"
import { SDKProvider } from "./context/sdk"

export async function bootstrap(config?: {
  url?: string
  directory?: string
}) {
  const url = config?.url ?? "http://localhost:3000"

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  })

  await render(
    () => (
      <SDKProvider url={url} directory={config?.directory}>
        <ThemeProvider>
          <RouteProvider>
            <App />
          </RouteProvider>
        </ThemeProvider>
      </SDKProvider>
    ),
    renderer,
  )
}
