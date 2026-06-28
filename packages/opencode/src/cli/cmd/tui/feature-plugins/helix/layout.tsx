import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onMount } from "solid-js"

export function HelixHeader(_props: { api: TuiPluginApi; judgePass: number; judgeFail: number; cardinalBlock: number; cardinalPause: number; mode: string }) {
  const c = _props.api.theme.current
  const modeLabel = () => _props.mode.toUpperCase()
  const modeColor = () => {
    switch (_props.mode) {
      case "build": return c.primary
      case "plan": return c.info
      case "compose": return c.secondary
      case "max": return c.warning
      case "loop": return c.accent
      default: return c.textMuted
    }
  }

  return (
    <box flexDirection="row" height={1} paddingLeft={2} paddingRight={2} backgroundColor={c.backgroundPanel} flexShrink={0}>
      <text fg={c.primary}><b>HELIX</b></text>
      <text fg={c.textMuted}> TUI</text>
      <box width={2} />
      <text fg={modeColor()}>[{modeLabel()}]</text>
      <box flexGrow={1} />
      <box flexDirection="row" gap={2}>
        <text fg={c.success}>J:✓{_props.judgePass}</text>
        <text fg={c.error}>✗{_props.judgeFail}</text>
        <box width={1} />
        <text fg={c.error}>C:⊘{_props.cardinalBlock}</text>
        <text fg={c.warning}>⚠{_props.cardinalPause}</text>
      </box>
      <box width={2} />
      <text fg={c.primary} onMouseDown={() => _props.api.route.navigate("helix-monitor")}>/monitor</text>
      <text fg={c.textMuted}> </text>
      <text fg={c.primary} onMouseDown={() => _props.api.route.navigate("helix-project")}>/project</text>
      <text fg={c.textMuted}> </text>
      <text fg={c.primary} onMouseDown={() => _props.api.route.navigate("helix-evolution")}>/evolution</text>
    </box>
  )
}

export function HelixFooter(_props: { api: TuiPluginApi; routeType: string; mode: string }) {
  const c = _props.api.theme.current
  return (
    <box flexDirection="row" height={1} paddingLeft={2} paddingRight={2} backgroundColor={c.backgroundPanel} flexShrink={0}>
      <text fg={c.primary} onMouseDown={() => _props.api.route.navigate("helix-monitor")}>/monitor</text>
      <text fg={c.textMuted}>  </text>
      <text fg={c.primary} onMouseDown={() => _props.api.route.navigate("helix-project")}>/project</text>
      <text fg={c.textMuted}>  </text>
      <text fg={c.primary} onMouseDown={() => _props.api.route.navigate("helix-evolution")}>/evolution</text>
      <box flexGrow={1} />
      <text fg={c.textMuted}>{_props.routeType} </text>
      <text fg={c.primary}>| Helix AI v0.1</text>
    </box>
  )
}

export function HelixInfoPanel(_props: {
  api: TuiPluginApi
  sessionID?: string
  judgePass: number
  judgeFail: number
  cardinalBlock: number
  cardinalPause: number
  cardinalWarn: number
  alignmentDrifts: number
  mode: string
}) {
  const c = _props.api.theme.current
  const totalGuard = _props.judgePass + _props.judgeFail + _props.cardinalBlock + _props.cardinalPause + _props.cardinalWarn + _props.alignmentDrifts

  const [recentTraces, setRecentTraces] = createSignal<Array<{ time: string; type: string; msg: string }>>([])

  onMount(() => {
    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }
    const addTrace = (type: string, msg: string) => {
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      setRecentTraces((prev) => {
        const next = [{ time, type, msg }, ...prev]
        return next.slice(0, 4)
      })
    }
    events.on("judge.verdict", (p) => { const evt = (p as Record<string, unknown>)?.properties as Record<string, unknown> ?? {}; addTrace("judge.verdict", String(evt.status ?? "")) })
    events.on("cardinal.detected", (p) => { const evt = (p as Record<string, unknown>)?.properties as Record<string, unknown> ?? {}; addTrace("cardinal.detected", String(evt.severity ?? "")) })
    events.on("alignment.drift", () => addTrace("alignment.drift", ""))
    events.on("mode.applied", (p) => { const evt = (p as Record<string, unknown>)?.properties as Record<string, unknown> ?? {}; addTrace("mode.applied", String(evt.mode ?? "")) })
  })

  return (
    <box flexDirection="column" width={10} paddingLeft={1} paddingRight={0} paddingTop={1} backgroundColor={c.backgroundPanel} flexShrink={0} gap={0}>
      {_props.sessionID ? (
        <text fg={c.textMuted}>{_props.sessionID.slice(0, 10)}</text>
      ) : (
        <text fg={c.textMuted}>no session</text>
      )}
      <text fg={c.textMuted}>{_props.mode}</text>
      <box height={1} />

      {totalGuard > 0 && (
        <box flexDirection="column" gap={0}>
          <text fg={c.success}>J:✓{_props.judgePass}</text>
          <text fg={c.error}>  ✗{_props.judgeFail}</text>
          <text fg={c.error}>C:⊘{_props.cardinalBlock}</text>
          <text fg={c.warning}>  ⏸{_props.cardinalPause}</text>
          <text fg={c.textMuted}>  ⚠{_props.cardinalWarn}</text>
          <text fg={_props.alignmentDrifts > 0 ? c.warning : c.textMuted}>A: {_props.alignmentDrifts}</text>
          <box height={1} />
        </box>
      )}

      {recentTraces().length > 0 ? (
        recentTraces().map((t) => (
          <text fg={c.textMuted}>{t.time} {t.type.split(".")[0]}={t.msg}</text>
        ))
      ) : (
        <text fg={c.textMuted}>waiting...</text>
      )}

      <box flexGrow={1} />
      <text fg={c.primary}>🧬</text>
    </box>
  )
}
