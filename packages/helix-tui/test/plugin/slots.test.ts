import { describe, test, expect } from "bun:test"

describe("Plugin Slots", () => {
  test("exports slot functions", async () => {
    const mod = await import("../../src/plugin/slots")
    expect(mod.setupSlots).toBeDefined()
    expect(typeof mod.setupSlots).toBe("function")
    expect(mod.register).toBeDefined()
    expect(typeof mod.register).toBe("function")
    expect(mod.unregister).toBeDefined()
    expect(typeof mod.unregister).toBe("function")
    expect(mod.getEntries).toBeDefined()
    expect(typeof mod.getEntries).toBe("function")
  })

  test("setupSlots initializes registry", async () => {
    const mod = await import("../../src/plugin/slots")
    const context = { theme: {}, sdk: {}, sync: {} }
    const result = mod.setupSlots(context)
    expect(result).toBeDefined()
    expect(result.register).toBeDefined()
    expect(result.unregister).toBeDefined()
  })

  test("register and unregister plugin", async () => {
    const mod = await import("../../src/plugin/slots")
    mod.setupSlots({ theme: {}, sdk: {}, sync: {} })

    const plugin: mod.SlotPlugin = {
      id: "test-plugin",
      order: 1,
      slots: {
        sidebar_title: () => "Test Title",
      },
    }

    mod.register(plugin)
    const entries = mod.getEntries("sidebar_title")
    expect(entries.length).toBe(1)
    expect(entries[0].pluginId).toBe("test-plugin")

    mod.unregister("test-plugin")
    const afterUnregister = mod.getEntries("sidebar_title")
    expect(afterUnregister.length).toBe(0)
  })

  test("plugins sorted by order", async () => {
    const mod = await import("../../src/plugin/slots")
    mod.setupSlots({ theme: {}, sdk: {}, sync: {} })

    mod.register({ id: "b", order: 2, slots: { sidebar_content: () => "B" } })
    mod.register({ id: "a", order: 1, slots: { sidebar_content: () => "A" } })

    const entries = mod.getEntries("sidebar_content")
    expect(entries.length).toBe(2)
    expect(entries[0].pluginId).toBe("a")
    expect(entries[1].pluginId).toBe("b")
  })
})

describe("Plugin API", () => {
  test("exports createPluginApi", async () => {
    const mod = await import("../../src/plugin/api")
    expect(mod.createPluginApi).toBeDefined()
    expect(typeof mod.createPluginApi).toBe("function")
  })

  test("createPluginApi returns api object", async () => {
    const mod = await import("../../src/plugin/api")
    const api = mod.createPluginApi({
      sdk: {},
      sync: { data: { session: [], message: {}, provider: [], agent: [] } },
      theme: {},
      dialog: {},
      toast: {},
      kv: {},
      route: {},
      keybind: {},
    })

    expect(api.app.version).toBe("0.1.0")
    expect(api.command).toBeDefined()
    expect(api.route).toBeDefined()
    expect(api.ui).toBeDefined()
    expect(api.state).toBeDefined()
    expect(api.slots).toBeDefined()
    expect(api.lifecycle).toBeDefined()
  })

  test("disposePlugin calls disposes", async () => {
    const mod = await import("../../src/plugin/api")
    let disposed = false
    mod.disposePlugin([() => { disposed = true }])
    expect(disposed).toBe(true)
  })
})
