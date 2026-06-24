import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, Show } from "solid-js"

// ── Sidebar ──────────────────────────────────────────────

describe("Sidebar", () => {
  test("renders all navigation items", async () => {
    const { Sidebar } = await import("../src/component/sidebar")
    const { useRoute, RouteProvider } = await import("../src/context/route")
    const { ThemeProvider } = await import("../src/context/theme")

    const result = await testRender(() => (
      <ThemeProvider>
        <RouteProvider>
          <Sidebar />
        </RouteProvider>
      </ThemeProvider>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame).toContain("Home")
    expect(frame).toContain("Chat")
    expect(frame).toContain("Project")
    expect(frame).toContain("Monitor")
    expect(frame).toContain("Settings")
  })

  test("collapse button toggles sidebar width", async () => {
    const { Sidebar } = await import("../src/component/sidebar")
    const { RouteProvider } = await import("../src/context/route")
    const { ThemeProvider } = await import("../src/context/theme")

    const result = await testRender(() => (
      <ThemeProvider>
        <RouteProvider>
          <Sidebar />
        </RouteProvider>
      </ThemeProvider>
    ))

    await result.renderOnce()
    const frameBefore = result.captureCharFrame()
    expect(frameBefore).toContain("Collapse")

    // Click collapse button (bottom of sidebar)
    result.mockMouse.click(5, 23)
    await result.renderOnce()
    const frameAfter = result.captureCharFrame()
    expect(frameAfter).toContain(">")
  })
})

// ── Home ─────────────────────────────────────────────────

describe("Home", () => {
  test("renders logo and tagline", async () => {
    const { Home } = await import("../src/routes/home")
    const { ThemeProvider } = await import("../src/context/theme")

    const result = await testRender(() => (
      <ThemeProvider>
        <box width={80} height={30}>
          <Home />
        </box>
      </ThemeProvider>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame).toContain("AI-Powered Development Tool")
    expect(frame).toContain("Start Chat")
    expect(frame).toContain("Open Project")
  })
})

// ── Project ──────────────────────────────────────────────

describe("Project", () => {
  test("renders tab bar with Projects, Tasks, Files", async () => {
    const { Project } = await import("../src/routes/project")
    const { ThemeProvider } = await import("../src/context/theme")

    const result = await testRender(() => (
      <ThemeProvider>
        <box width={80} height={25}>
          <Project />
        </box>
      </ThemeProvider>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame).toContain("[Projects]")
    expect(frame).toContain("[Tasks]")
    expect(frame).toContain("[Files]")
  })
})

// ── Settings ─────────────────────────────────────────────

describe("Settings", () => {
  test("renders section tabs", async () => {
    const { Settings } = await import("../src/routes/settings")
    const { ThemeProvider } = await import("../src/context/theme")

    const result = await testRender(() => (
      <ThemeProvider>
        <box width={80} height={25}>
          <Settings />
        </box>
      </ThemeProvider>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame).toContain("[General]")
    expect(frame).toContain("[Theme]")
    expect(frame).toContain("[Network]")
    expect(frame).toContain("[Plugins]")
  })
})

// ── Monitor ──────────────────────────────────────────────

describe("Monitor", () => {
  test("renders metrics and system info", async () => {
    const { Monitor } = await import("../src/routes/monitor")
    const { ThemeProvider } = await import("../src/context/theme")

    const result = await testRender(() => (
      <ThemeProvider>
        <box width={80} height={30}>
          <Monitor />
        </box>
      </ThemeProvider>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame).toContain("Performance Metrics")
    expect(frame).toContain("CPU")
    expect(frame).toContain("Memory")
    expect(frame).toContain("Active Sessions")
  })
})

// ── App Navigation ───────────────────────────────────────

describe("App navigation", () => {
  test("sidebar click navigates between routes", async () => {
    const { App } = await import("../src/app")
    const { SDKProvider } = await import("../src/context/sdk")
    const { ThemeProvider } = await import("../src/context/theme")
    const { RouteProvider } = await import("../src/context/route")
    const { DialogProvider } = await import("../src/ui/dialog")

    const result = await testRender(() => (
      <SDKProvider url="http://localhost:9999">
        <ThemeProvider>
          <DialogProvider>
            <RouteProvider>
              <App />
            </RouteProvider>
          </DialogProvider>
        </ThemeProvider>
      </SDKProvider>
    ), { width: 100, height: 30 })

    await result.renderOnce()
    let frame = result.captureCharFrame()
    expect(frame).toContain("AI-Powered Development Tool")

    // Click Chat in sidebar (row 3, col ~7)
    result.mockMouse.click(7, 3)
    await result.renderOnce()
    frame = result.captureCharFrame()
    expect(frame).toContain("Welcome to Helix AI")

    // Click Project in sidebar
    result.mockMouse.click(7, 4)
    await result.renderOnce()
    frame = result.captureCharFrame()
    expect(frame).toContain("[Projects]")

    // Click Monitor in sidebar
    result.mockMouse.click(7, 5)
    await result.renderOnce()
    frame = result.captureCharFrame()
    expect(frame).toContain("Performance Metrics")

    // Click Settings in sidebar
    result.mockMouse.click(7, 6)
    await result.renderOnce()
    frame = result.captureCharFrame()
    expect(frame).toContain("[General]")

    // Click Home in sidebar
    result.mockMouse.click(7, 2)
    await result.renderOnce()
    frame = result.captureCharFrame()
    expect(frame).toContain("AI-Powered Development Tool")
  })
})

// ── SDK Context ──────────────────────────────────────────

describe("SDK context", () => {
  test("provides connected status", async () => {
    const { useSDK, SDKProvider } = await import("../src/context/sdk")
    let sdkRef: any

    const result = await testRender(() => (
      <SDKProvider url="http://localhost:9999">
        <Child />
      </SDKProvider>
    ))

    function Child() {
      const sdk = useSDK()
      sdkRef = sdk
      return <text>{sdk.connected() ? "connected" : "disconnected"}</text>
    }

    await result.renderOnce()
    expect(sdkRef).toBeDefined()
    expect(typeof sdkRef.client).toBe("object")
    expect(typeof sdkRef.subscribe).toBe("function")
  })
})

// ── Theme Context ────────────────────────────────────────

describe("Theme context", () => {
  test("provides color values", async () => {
    const { useTheme, ThemeProvider } = await import("../src/context/theme")
    let themeRef: any

    const result = await testRender(() => (
      <ThemeProvider>
        <Child />
      </ThemeProvider>
    ))

    function Child() {
      const theme = useTheme()
      themeRef = theme
      return <text>theme loaded</text>
    }

    await result.renderOnce()
    expect(themeRef).toBeDefined()
    expect(themeRef.getColor("primary")).toBeDefined()
    expect(themeRef.getColor("background")).toBeDefined()
  })
})

// ── Route Context ────────────────────────────────────────

describe("Route context", () => {
  test("navigates between routes", async () => {
    const { useRoute, RouteProvider } = await import("../src/context/route")
    let routeRef: any

    const result = await testRender(() => (
      <RouteProvider>
        <Child />
      </RouteProvider>
    ))

    function Child() {
      const route = useRoute()
      routeRef = route
      return <text>{route.data.type}</text>
    }

    await result.renderOnce()
    expect(routeRef.data.type).toBe("home")

    routeRef.navigate({ type: "chat" })
    await result.renderOnce()
    expect(routeRef.data.type).toBe("chat")

    routeRef.navigate({ type: "settings" })
    await result.renderOnce()
    expect(routeRef.data.type).toBe("settings")
  })
})
