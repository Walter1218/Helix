import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { existsSync } from "fs"
import * as trace from "../trace"

export interface HelixConfig {
  version: string
  communication: {
    default: string
    adapters: Record<string, {
      endpoint: string
      timeout?: number
      reconnect?: boolean
    }>
  }
  plugins: {
    directory: string
    auto_load: boolean
  }
  theme: {
    id: string
    effects: {
      glow: boolean
      particles: boolean
      scanlines: boolean
    }
  }
  voice: {
    enabled: boolean
    language: string
  }
  logging: {
    level: string
    file: string
  }
}

const DEFAULT_CONFIG: HelixConfig = {
  version: "1.0",
  communication: {
    default: "http",
    adapters: {
      http: { endpoint: "http://localhost:3095" },
    },
  },
  plugins: {
    directory: "~/.config/helix-tui/plugins",
    auto_load: true,
  },
  theme: {
    id: "helix-cyber",
    effects: { glow: true, particles: true, scanlines: false },
  },
  voice: {
    enabled: false,
    language: "zh-CN",
  },
  logging: {
    level: "info",
    file: "~/.config/helix-tui/logs/app.log",
  },
}

export class ConfigManager {
  private config: HelixConfig
  private configPath: string
  private watchers: Map<string, Set<(value: unknown) => void>> = new Map()

  constructor(configPath?: string) {
    this.configPath = configPath || join(
      process.env.HOME || "~",
      ".config/helix-tui/config.json"
    )
    this.config = { ...DEFAULT_CONFIG }
  }

  async load(): Promise<void> {
    trace.emit("mode.config.apply", "info", "Config loading", { path: this.configPath })
    try {
      const data = await readFile(this.configPath, "utf-8")
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
      trace.emit("mode.config.apply", "info", "Config loaded")
    } catch {
      trace.emit("mode.config.apply", "warn", "Config not found, creating default")
      await this.save()
    }
  }

  async save(): Promise<void> {
    trace.emit("mode.config.apply", "info", "Config saving")
    const dir = dirname(this.configPath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2))
    trace.emit("mode.config.apply", "info", "Config saved")
  }

  get<T>(path: string): T {
    return path.split(".").reduce((obj: any, key) => obj?.[key], this.config) as T
  }

  async set(path: string, value: unknown): Promise<void> {
    const keys = path.split(".")
    let obj: any = this.config
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (key) obj = obj[key]
    }
    const lastKey = keys[keys.length - 1]
    if (lastKey) obj[lastKey] = value
    await this.save()
    this.notifyWatchers(path, value)
  }

  watch(path: string, callback: (value: unknown) => void): () => void {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set())
    }
    this.watchers.get(path)!.add(callback)
    return () => this.watchers.get(path)?.delete(callback)
  }

  private notifyWatchers(path: string, value: unknown): void {
    this.watchers.get(path)?.forEach((cb) => cb(value))
  }

  getAll(): HelixConfig {
    return { ...this.config }
  }
}
