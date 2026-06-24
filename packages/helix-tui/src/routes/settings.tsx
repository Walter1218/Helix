import { createSignal, For, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { ConfigManager, type HelixConfig } from "../config"

type SettingSection = "general" | "theme" | "communication" | "plugins" | "voice"

type SettingItem = {
  key: string
  label: string
  value: string
  description?: string
}

export function Settings() {
  const theme = useTheme()
  const [section, setSection] = createSignal<SettingSection>("general")
  const [selected, setSelected] = createSignal(0)
  const [config, setConfig] = createSignal<HelixConfig | null>(null)

  const sections: { id: SettingSection; label: string }[] = [
    { id: "general", label: "General" },
    { id: "theme", label: "Theme" },
    { id: "communication", label: "Network" },
    { id: "plugins", label: "Plugins" },
    { id: "voice", label: "Voice" },
  ]

  onMount(async () => {
    const manager = new ConfigManager()
    await manager.load()
    setConfig(manager.getAll())
  })

  const getSettings = (): SettingItem[] => {
    const cfg = config()
    if (!cfg) return []

    switch (section()) {
      case "general":
        return [
          { key: "version", label: "Version", value: cfg.version },
          { key: "logging.level", label: "Log Level", value: cfg.logging.level },
          { key: "logging.file", label: "Log File", value: cfg.logging.file },
        ]
      case "theme":
        return [
          { key: "theme.id", label: "Theme", value: cfg.theme.id },
          { key: "theme.effects.glow", label: "Glow Effect", value: cfg.theme.effects.glow ? "enabled" : "disabled" },
          { key: "theme.effects.particles", label: "Particles", value: cfg.theme.effects.particles ? "enabled" : "disabled" },
          { key: "theme.effects.scanlines", label: "Scanlines", value: cfg.theme.effects.scanlines ? "enabled" : "disabled" },
        ]
      case "communication":
        return [
          { key: "communication.default", label: "Default", value: cfg.communication.default },
          ...Object.entries(cfg.communication.adapters).map(([name, adapter]) => ({
            key: `communication.adapters.${name}`,
            label: name,
            value: adapter.endpoint,
          })),
        ]
      case "plugins":
        return [
          { key: "plugins.directory", label: "Directory", value: cfg.plugins.directory },
          { key: "plugins.auto_load", label: "Auto Load", value: cfg.plugins.auto_load ? "enabled" : "disabled" },
        ]
      case "voice":
        return [
          { key: "voice.enabled", label: "Enabled", value: cfg.voice.enabled ? "yes" : "no" },
          { key: "voice.language", label: "Language", value: cfg.voice.language },
        ]
      default:
        return []
    }
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <box
        height={1}
        backgroundColor={theme.getColor("backgroundSecondary")}
        flexDirection="row"
        paddingLeft={1}
      >
        <For each={sections}>
          {(s) => (
            <box
              flexDirection="row"
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={() => {
                setSection(s.id)
                setSelected(0)
              }}
            >
              <text
                fg={section() === s.id ? theme.getColor("primary") : theme.getColor("textMuted")}
                attributes={section() === s.id ? 1 : 0}
              >
                [{s.label}]
              </text>
            </box>
          )}
        </For>
      </box>

      <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
        <text fg={theme.getColor("primary")} attributes={1}>
          {sections.find((s) => s.id === section())?.label} Settings
        </text>
        <box height={1} />

        <box flexDirection="column" border borderColor={theme.getColor("border")} padding={1} flexGrow={1}>
          <For each={getSettings()}>
            {(item, index) => (
              <box
                flexDirection="row"
                height={1}
                backgroundColor={index() === selected() ? theme.getColor("backgroundTertiary") : undefined}
                onMouseDown={() => setSelected(index())}
              >
                <text fg={theme.getColor("textMuted")} width={15}>
                  {item.label}:
                </text>
                <text fg={theme.getColor("text")}>{item.value}</text>
              </box>
            )}
          </For>
        </box>

        <box height={1} />
        <text fg={theme.getColor("textMuted")}>
          Config: ~/.config/helix-tui/config.json
        </text>
      </box>

      <box
        height={1}
        backgroundColor={theme.getColor("backgroundSecondary")}
        paddingLeft={1}
      >
        <text fg={theme.getColor("textMuted")}>
          ↑↓ Navigate  Enter Edit  Esc Back
        </text>
      </box>
    </box>
  )
}
