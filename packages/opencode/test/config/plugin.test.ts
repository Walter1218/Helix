import { describe, expect, test } from "bun:test"
import { ConfigPlugin } from "../../src/config/plugin"

describe("config.plugin", () => {
  describe("pluginSpecifier", () => {
    test("returns string spec as-is", () => {
      expect(ConfigPlugin.pluginSpecifier("@mimo-ai/plugin")).toBe("@mimo-ai/plugin")
    })

    test("returns first element of tuple spec", () => {
      expect(ConfigPlugin.pluginSpecifier(["@mimo-ai/plugin", { debug: true }])).toBe("@mimo-ai/plugin")
    })
  })

  describe("pluginOptions", () => {
    test("returns undefined for string spec", () => {
      expect(ConfigPlugin.pluginOptions("@mimo-ai/plugin")).toBeUndefined()
    })

    test("returns options from tuple spec", () => {
      const opts = { debug: true, port: 3000 }
      expect(ConfigPlugin.pluginOptions(["@mimo-ai/plugin", opts])).toEqual(opts)
    })
  })

  describe("deduplicatePluginOrigins", () => {
    test("deduplicates by package name", () => {
      const plugins: ConfigPlugin.Origin[] = [
        { spec: "@mimo-ai/plugin", source: "/global/mimocode.json", scope: "global" },
        { spec: "@mimo-ai/plugin", source: "/project/mimocode.json", scope: "local" },
      ]
      const result = ConfigPlugin.deduplicatePluginOrigins(plugins)
      expect(result).toHaveLength(1)
      expect(result[0].source).toBe("/project/mimocode.json")
    })

    test("keeps different plugins", () => {
      const plugins: ConfigPlugin.Origin[] = [
        { spec: "@mimo-ai/plugin-a", source: "/global/mimocode.json", scope: "global" },
        { spec: "@mimo-ai/plugin-b", source: "/project/mimocode.json", scope: "local" },
      ]
      const result = ConfigPlugin.deduplicatePluginOrigins(plugins)
      expect(result).toHaveLength(2)
    })

    test("deduplicates file:// specs by exact URL", () => {
      const plugins: ConfigPlugin.Origin[] = [
        { spec: "file:///path/to/plugin.ts", source: "/global/mimocode.json", scope: "global" },
        { spec: "file:///path/to/plugin.ts", source: "/project/mimocode.json", scope: "local" },
      ]
      const result = ConfigPlugin.deduplicatePluginOrigins(plugins)
      expect(result).toHaveLength(1)
    })

    test("keeps last occurrence (local wins over global)", () => {
      const plugins: ConfigPlugin.Origin[] = [
        { spec: "@mimo-ai/plugin", source: "/global/mimocode.json", scope: "global" },
        { spec: "@mimo-ai/plugin", source: "/project/mimocode.json", scope: "local" },
      ]
      const result = ConfigPlugin.deduplicatePluginOrigins(plugins)
      expect(result[0].scope).toBe("local")
    })
  })
})
