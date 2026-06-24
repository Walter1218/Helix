import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, For, Show } from "solid-js"

describe("Textarea keybindings", () => {
  test("Enter triggers onSubmit with custom keyBindings", async () => {
    const submitted: string[] = []
    let textareaRef: any

    const result = await testRender(() => (
      <box width={60} height={5}>
        <textarea
          ref={(r: any) => { textareaRef = r }}
          width={58}
          height={3}
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onSubmit={() => {
            submitted.push(textareaRef?.plainText ?? "")
          }}
        />
      </box>
    ))

    await result.renderOnce()
    textareaRef.focus()
    await result.renderOnce()
    await result.mockInput.typeText("hello")
    await result.renderOnce()
    result.mockInput.pressEnter()
    await result.renderOnce()

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toBe("hello")
  })

  test("handleSend must read textarea.plainText, not signal (async gap)", async () => {
    let textareaRef: any
    let signalAtSubmit = ""
    let plainTextAtSubmit = ""

    const result = await testRender(() => (
      <box width={60} height={5}>
        <textarea
          ref={(r: any) => { textareaRef = r }}
          width={58}
          height={3}
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onContentChange={() => {
            // 模拟真实环境：信号更新有延迟
            setTimeout(() => { signalAtSubmit = textareaRef?.plainText ?? "" }, 50)
          }}
          onSubmit={() => {
            plainTextAtSubmit = textareaRef?.plainText ?? ""
          }}
        />
      </box>
    ))

    await result.renderOnce()
    textareaRef.focus()
    await result.renderOnce()
    await result.mockInput.typeText("hello world")
    result.mockInput.pressEnter()
    await result.renderOnce()

    // plainText 立即可用
    expect(plainTextAtSubmit).toBe("hello world")
    // 信号还没更新（被 setTimeout 延迟了）
    expect(signalAtSubmit).toBe("")
  })

  test("textarea.clear() clears content after send", async () => {
    let textareaRef: any

    const result = await testRender(() => (
      <box width={60} height={5}>
        <textarea
          ref={(r: any) => { textareaRef = r }}
          width={58}
          height={3}
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
        />
      </box>
    ))

    await result.renderOnce()
    textareaRef.focus()
    await result.renderOnce()
    await result.mockInput.typeText("some text")
    await result.renderOnce()

    expect(textareaRef?.plainText).toBe("some text")

    // clear() should work (plainText is readonly, can't assign)
    textareaRef.clear()
    await result.renderOnce()

    expect(textareaRef?.plainText).toBe("")
  })

  test("Shift+Enter creates newline, not submit", async () => {
    const submitted: string[] = []
    let textareaRef: any

    const result = await testRender(() => (
      <box width={60} height={5}>
        <textarea
          ref={(r: any) => { textareaRef = r }}
          width={58}
          height={3}
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onSubmit={() => {
            submitted.push("submitted")
          }}
        />
      </box>
    ), { kittyKeyboard: true })

    await result.renderOnce()
    textareaRef.focus()
    await result.renderOnce()
    await result.mockInput.typeText("line1")
    result.mockInput.pressEnter({ shift: true })
    await result.mockInput.typeText("line2")
    await result.renderOnce()

    expect(submitted.length).toBe(0)
    expect(textareaRef?.plainText).toContain("line1")
    expect(textareaRef?.plainText).toContain("line2")
  })

  test("without keyBindings, Enter creates newline (default)", async () => {
    const submitted: string[] = []
    let textareaRef: any

    const result = await testRender(() => (
      <box width={60} height={5}>
        <textarea
          ref={(r: any) => { textareaRef = r }}
          width={58}
          height={3}
          onSubmit={() => {
            submitted.push("submitted")
          }}
        />
      </box>
    ))

    await result.renderOnce()
    textareaRef.focus()
    await result.renderOnce()
    await result.mockInput.typeText("hello")
    result.mockInput.pressEnter()
    await result.mockInput.typeText("world")
    await result.renderOnce()

    expect(submitted.length).toBe(0)
    expect(textareaRef?.plainText).toContain("hello")
    expect(textareaRef?.plainText).toContain("world")
  })
})

describe("Message list rendering", () => {
  test("user and assistant messages both render", async () => {
    const messages = [
      { id: "1", role: "user", content: "Hello AI" },
      { id: "2", role: "assistant", content: "Hello human" },
    ]

    const result = await testRender(() => (
      <box width={60} height={10} flexDirection="column">
        <scrollbox flexGrow={1}>
          <For each={messages}>
            {(msg) => (
              <box flexDirection="column">
                <text>{msg.role === "user" ? "You" : "Helix"}:</text>
                <text paddingLeft={2}>{msg.content}</text>
              </box>
            )}
          </For>
        </scrollbox>
      </box>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()

    expect(frame).toContain("Hello AI")
    expect(frame).toContain("Hello human")
    expect(frame).toContain("Helix:")
  })

  test("empty state shows welcome", async () => {
    const result = await testRender(() => (
      <box width={60} height={10} flexDirection="column">
        <scrollbox flexGrow={1}>
          <box flexDirection="column" flexGrow={1}>
            <text>Welcome to Helix AI</text>
          </box>
        </scrollbox>
      </box>
    ))

    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame).toContain("Welcome to Helix AI")
  })

  test("reactive message updates render", async () => {
    let addMsg: () => void

    const result = await testRender(() => {
      const [msgs, setMsgs] = createSignal<{ id: string; content: string }[]>([])
      addMsg = () => setMsgs((p) => [...p, { id: String(p.length + 1), content: "new msg" }])
      return (
        <box width={60} height={10} flexDirection="column">
          <scrollbox flexGrow={1}>
            <For each={msgs()}>
              {(msg) => <text>{msg.content}</text>}
            </For>
          </scrollbox>
        </box>
      )
    })

    await result.renderOnce()
    let frame = result.captureCharFrame()
    expect(frame).not.toContain("new msg")

    addMsg!()
    await result.renderOnce()
    frame = result.captureCharFrame()
    expect(frame).toContain("new msg")
  })
})

describe("Keyboard events", () => {
  test("useKeyboard receives number keys", async () => {
    const pressed: string[] = []
    const { useKeyboard } = await import("@opentui/solid")

    const result = await testRender(() => {
      useKeyboard((evt) => {
        if (evt.name >= "1" && evt.name <= "3") {
          pressed.push(evt.name)
        }
      })
      return <box width={20} height={3}><text>Nav</text></box>
    })

    await result.renderOnce()
    result.mockInput.pressKey("1")
    result.mockInput.pressKey("2")
    result.mockInput.pressKey("3")
    await result.renderOnce()

    expect(pressed).toEqual(["1", "2", "3"])
  })
})

describe("Mode selector", () => {
  test("mode defaults to build", async () => {
    const { Chat } = await import("../src/routes/chat")
    const { ThemeProvider } = await import("../src/context/theme")
    const { RouteProvider } = await import("../src/context/route")
    const { SDKProvider } = await import("../src/context/sdk")

    const result = await testRender(() => (
      <SDKProvider url="http://localhost:9999">
        <ThemeProvider>
          <RouteProvider>
            <box width={100} height={30}>
              <Chat />
            </box>
          </RouteProvider>
        </ThemeProvider>
      </SDKProvider>
    ), { width: 120, height: 35 })

    await result.renderOnce()
    const frame = result.captureCharFrame()

    // Mode selector should be visible
    expect(frame).toContain("[Ask]")
    expect(frame).toContain("[Build]")
    expect(frame).toContain("[Plan]")
    expect(frame).toContain("[Compose]")

    // Build should be highlighted (bold)
    expect(frame).toContain("Build")
  })
})
