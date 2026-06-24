import { readdir, readFile } from "fs/promises"
import { join } from "path"
import type { HelixPlugin, LoadedPlugin, PluginContext, PluginMetadata } from "./types"

export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private context: PluginContext
  private pluginDir: string

  constructor(config: { directory: string; context: PluginContext }) {
    this.pluginDir = config.directory
    this.context = config.context
  }

  async loadPlugins(): Promise<void> {
    try {
      const entries = await readdir(this.pluginDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadPlugin(join(this.pluginDir, entry.name))
        }
      }
    } catch (error) {
      console.warn("Failed to load plugins directory:", error)
    }
  }

  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      const configPath = join(pluginPath, "plugin.json")
      const configData = await readFile(configPath, "utf-8")
      const metadata: PluginMetadata = JSON.parse(configData)

      const plugin = await this.loadPluginCode(pluginPath, metadata)

      this.plugins.set(metadata.id, {
        plugin,
        context: this.context,
        active: false,
        path: pluginPath,
      })

      await plugin.onInit?.(this.context)
    } catch (error) {
      console.error(`Failed to load plugin at ${pluginPath}:`, error)
    }
  }

  private async loadPluginCode(pluginPath: string, metadata: PluginMetadata): Promise<HelixPlugin> {
    const entryPath = join(pluginPath, "index.ts")
    const mod = await import(entryPath)
    return mod.default || mod.plugin
  }

  async activatePlugin(pluginId: string): Promise<void> {
    const loaded = this.plugins.get(pluginId)
    if (!loaded) throw new Error(`Plugin ${pluginId} not found`)

    await loaded.plugin.onActivate?.()
    loaded.active = true
  }

  async deactivatePlugin(pluginId: string): Promise<void> {
    const loaded = this.plugins.get(pluginId)
    if (!loaded) return

    await loaded.plugin.onDeactivate?.()
    loaded.active = false
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const loaded = this.plugins.get(pluginId)
    if (!loaded) return

    await loaded.plugin.onDestroy?.()
    this.plugins.delete(pluginId)
  }

  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getActivePlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.active)
  }

  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values())
  }
}
