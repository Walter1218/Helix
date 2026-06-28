#!/usr/bin/env bun --conditions=browser
/**
 * Headless TUI Controller
 *
 * 通过 testRender 无头渲染 TUI，模拟输入，捕获帧输出。
 * 用于 Agent 间接观察和控制 Helix TUI。
 */

import { testRender } from "@opentui/solid"
import { createMockServer, createMockFetch, type Scenario } from "./mock-server-lite"

export interface HeadlessTUI {
  /** 捕获当前帧为纯文本 */
  captureFrame(): string
  /** 模拟键盘输入文本 */
  typeText(text: string): Promise<void>
  /** 模拟按键 */
  pressKey(key: string): Promise<void>
  /** 模拟回车 */
  pressEnter(): Promise<void>
  /** 模拟 Escape */
  pressEscape(): Promise<void>
  /** 模拟 Tab */
  pressTab(): Promise<void>
  /** 触发一次渲染 */
  render(): Promise<void>
  /** 等待帧满足条件 */
  waitFor(predicate: (frame: string) => boolean, timeoutMs?: number): Promise<{ frame: string; found: boolean }>
  /** 调整终端大小 */
  resize(width: number, height: number): void
  /** 销毁 */
  destroy(): Promise<void>
  /** 获取 mock server（用于发送 SSE 事件） */
  server: ReturnType<typeof createMockServer>
}

export interface HeadlessTUICreateOptions {
  width?: number
  height?: number
  scenario?: Scenario
  /** 连接到真实 server 而非 mock */
  realServerUrl?: string
  /** 真实 server 的 auth header */
  authHeader?: Record<string, string>
}

/**
 * 创建一个无头 TUI 实例。
 *
 * @example
 * const tui = await createHeadlessTUI({ scenario: { type: "streaming", chunks: ["Hello"] } })
 * await tui.typeText("hi")
 * await tui.pressEnter()
 * await tui.render()
 * console.log(tui.captureFrame())
 * await tui.destroy()
 */
export async function createHeadlessTUI(options: HeadlessTUICreateOptions = {}): Promise<HeadlessTUI> {
  const width = options.width ?? 120
  const height = options.height ?? 35

  let server: ReturnType<typeof createMockServer> | null = null
  let fetchFn: typeof fetch
  let serverUrl: string
  let headers: Record<string, string> | undefined

  if (options.realServerUrl) {
    serverUrl = options.realServerUrl
    fetchFn = globalThis.fetch
    headers = options.authHeader
  } else {
    server = createMockServer()
    serverUrl = await server.start(options.scenario ?? { type: "direct", response: "Ready." })
    fetchFn = createMockFetch(server)
  }

  // Dynamic imports to avoid JSX issues at module level
  // From packages/helix-tui/test/utils/ -> packages/opencode/src/cli/cmd/tui/
  const TUI_BASE = "../../../opencode/src/cli/cmd/tui"
  const { SDKProvider } = await import(`${TUI_BASE}/context/sdk.tsx`)
  const { ThemeProvider } = await import(`${TUI_BASE}/context/theme.tsx`)
  const { DialogProvider } = await import(`${TUI_BASE}/ui/dialog.tsx`)
  const { RouteProvider } = await import(`${TUI_BASE}/context/route.tsx`)
  const { TuiConfigProvider, resolve } = await import(`${TUI_BASE}/config/index.tsx`)
  const { ArgsProvider } = await import(`${TUI_BASE}/context/args.tsx`)
  const { KVProvider } = await import(`${TUI_BASE}/context/kv.tsx`)
  const { ToastProvider } = await import(`${TUI_BASE}/ui/toast.tsx`)
  const { PromptHistoryProvider } = await import(`${TUI_BASE}/component/prompt/history.tsx`)
  const { FrecencyProvider } = await import(`${TUI_BASE}/component/prompt/frecency.tsx`)
  const { PromptStashProvider } = await import(`${TUI_BASE}/component/prompt/stash.tsx`)
  const { PromptRefProvider } = await import(`${TUI_BASE}/context/prompt.tsx`)
  const { LocalProvider } = await import(`${TUI_BASE}/context/local.tsx`)
  const { SyncProvider } = await import(`${TUI_BASE}/context/sync.tsx`)
  const { DataProvider } = await import(`${TUI_BASE}/context/data.tsx`)
  const { ProjectProvider } = await import(`${TUI_BASE}/context/project.tsx`)
  const { LocationProvider } = await import(`${TUI_BASE}/context/location.tsx`)
  const { EditorContextProvider } = await import(`${TUI_BASE}/context/editor.ts`)
  const { Home } = await import(`${TUI_BASE}/routes/home.tsx`)

  const tuiConfig = resolve({}, { terminalSuspend: true })

  const result = testRender(
    () => (
      <SDKProvider url={serverUrl} fetch={fetchFn} headers={headers}>
        <ProjectProvider>
          <SyncProvider>
            <DataProvider>
              <ThemeProvider>
                <LocalProvider>
                  <TuiConfigProvider config={tuiConfig}>
                    <ArgsProvider>
                      <KVProvider>
                        <ToastProvider>
                          <RouteProvider>
                            <PromptStashProvider>
                              <FrecencyProvider>
                                <PromptHistoryProvider>
                                  <PromptRefProvider>
                                    <EditorContextProvider>
                                      <LocationProvider>
                                        <DialogProvider>
                                          <Home />
                                        </DialogProvider>
                                      </LocationProvider>
                                    </EditorContextProvider>
                                  </PromptRefProvider>
                                </PromptHistoryProvider>
                              </FrecencyProvider>
                            </PromptStashProvider>
                          </RouteProvider>
                        </ToastProvider>
                      </KVProvider>
                    </ArgsProvider>
                  </TuiConfigProvider>
                </LocalProvider>
              </ThemeProvider>
            </DataProvider>
          </SyncProvider>
        </ProjectProvider>
      </SDKProvider>
    ),
    { width, height },
  )

  // Wait for initial render
  for (let i = 0; i < 5; i++) {
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 100))
  }

  return {
    captureFrame: () => result.captureCharFrame(),
    typeText: async (text: string) => {
      result.mockInput.typeText(text)
      await result.renderOnce()
    },
    pressKey: async (key: string) => {
      result.mockInput.pressKey(key)
      await result.renderOnce()
    },
    pressEnter: async () => {
      result.mockInput.pressEnter()
      await result.renderOnce()
    },
    pressEscape: async () => {
      result.mockInput.pressEscape()
      await result.renderOnce()
    },
    pressTab: async () => {
      result.mockInput.pressTab()
      await result.renderOnce()
    },
    render: async () => {
      await result.renderOnce()
    },
    waitFor: async (predicate, timeoutMs = 30000) => {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        await result.renderOnce()
        const frame = result.captureCharFrame()
        if (predicate(frame)) return { frame, found: true }
        await new Promise((r) => setTimeout(r, 100))
      }
      await result.renderOnce()
      return { frame: result.captureCharFrame(), found: false }
    },
    resize: (w: number, h: number) => result.resize(w, h),
    destroy: async () => {
      server?.stop()
      result.renderer.destroy()
    },
    server: server!,
  }
}

/**
 * 格式化帧为可读的行（去除尾部空格）
 */
export function formatFrame(frame: string, maxLines?: number): string {
  const lines = frame.split("\n").map((l) => l.trimEnd())
  const slice = maxLines ? lines.slice(0, maxLines) : lines
  return slice.join("\n")
}

/**
 * 在帧中搜索文本，返回匹配信息
 */
export function findInFrame(frame: string, pattern: string | RegExp): Array<{ line: number; col: number; match: string }> {
  const lines = frame.split("\n")
  const results: Array<{ line: number; col: number; match: string }> = []
  for (let i = 0; i < lines.length; i++) {
    if (typeof pattern === "string") {
      const idx = lines[i].indexOf(pattern)
      if (idx !== -1) results.push({ line: i, col: idx, match: pattern })
    } else {
      const m = lines[i].match(pattern)
      if (m) results.push({ line: i, col: m.index!, match: m[0] })
    }
  }
  return results
}
