import type { TuiPlugin, TuiPluginModule } from "@mimo-ai/plugin/tui"
import { createSignal } from "solid-js"
import { MonitorRoute } from "./routes/monitor"
import { ProjectRoute } from "./routes/project"
import { EvolutionRoute } from "./routes/evolution"
import { JudgeVerdictDialog, type JudgeVerdictData } from "./components/dialog-judge"
import { CardinalAlertDialog, type CardinalAlertData } from "./components/dialog-cardinal"
import { PreflightResultDialog, type PreflightResultData } from "./components/dialog-preflight"
import { HelixHeader, HelixFooter, HelixInfoPanel } from "./layout"
import * as trace from "./trace"

const id = "internal:helix-core"

const tui: TuiPlugin = async (api) => {
  trace.emit("ui.init", "info", "Helix plugin initializing")

  // Activate Helix theme — set via KV for persistence, store for immediate UI
  if (api.theme.has("helix-cyber")) {
    api.kv.set("theme", "helix-cyber")
    api.theme.set("helix-cyber") // may fail in plain mode, KV ensures next restart
  }

  // Force sidebar inline for Helix three-column layout
  api.kv.set("sidebar", "show")

  // ── Guard counters (reactive) ──────────────────────────────
  const [helixSessionId, setHelixSessionId] = createSignal("")
  let judgePass = 0
  let judgeFail = 0
  let cardinalBlock = 0
  let cardinalPause = 0
  let cardinalWarn = 0
  let alignmentDrifts = 0
  let currentMode = "build"

  api.route.register([
    {
      name: "helix-monitor",
      render: () => <MonitorRoute api={api} />,
    },
    {
      name: "helix-project",
      render: () => <ProjectRoute api={api} />,
    },
    {
      name: "helix-evolution",
      render: () => <EvolutionRoute api={api} />,
    },
  ])

  trace.emit("ui.render", "info", "Helix routes registered", { routes: ["monitor", "project", "evolution"] })

  api.command.register(() => [
    {
      title: "Helix Monitor", value: "helix.monitor", category: "Helix",
      slash: { name: "monitor" },
      onSelect: () => { trace.emit("user.navigate", "info", "Helix Monitor"); api.route.navigate("helix-monitor") },
    },
    {
      title: "Helix Project", value: "helix.project", category: "Helix",
      slash: { name: "project" },
      onSelect: () => { trace.emit("user.navigate", "info", "Helix Project"); api.route.navigate("helix-project") },
    },
    {
      title: "Helix Evolution", value: "helix.evolution", category: "Helix",
      slash: { name: "evolution" },
      onSelect: () => { trace.emit("user.navigate", "info", "Helix Evolution"); api.route.navigate("helix-evolution") },
    },
  ])

  // Force sidebar always visible — Helix info lives inside it
  api.kv.set("sidebar", "show")

  // Inject Helix stats at top of sidebar
  api.slots.register({
    order: 0, // highest priority — appears above all other sidebar content
    slots: {
      sidebar_content(_ctx, _props) {
        const totalGuard = judgePass + judgeFail + cardinalBlock + cardinalPause + cardinalWarn + alignmentDrifts
        const c = api.theme.current
        return (
          <box flexDirection="column" gap={0}>
            <text fg={c.primary}><b>🧬 Helix</b></text>
            <text fg={c.textMuted}>{currentMode}</text>
            {totalGuard > 0 ? (
              <box flexDirection="column" gap={0} paddingTop={1}>
                <text fg={c.success}>J:✓{judgePass}</text>
                <text fg={c.error}>  ✗{judgeFail}</text>
                <text fg={c.error}>C:⊘{cardinalBlock}</text>
                <text fg={c.warning}>  ⏸{cardinalPause}</text>
                <text fg={c.textMuted}>  ⚠{cardinalWarn}</text>
                <text fg={alignmentDrifts > 0 ? c.warning : c.textMuted}>A:{alignmentDrifts}</text>
              </box>
            ) : null}
            <box height={1} />
          </box>
        )
      },
    },
  })

  // ── All slots in a single registration ───────────────────
  api.slots.register({
    order: 10,
    slots: {
      // Home page: Helix logo + slogan
      home_logo() {
        const c = api.theme.current
        const logo = [
          "  ██╗  ██╗ ███████╗ ██╗     ██╗ ██╗  ██╗",
          "  ██║  ██║ ██╔════╝ ██║     ██║ ╚██╗██╔╝",
          "  ███████║ █████╗   ██║     ██║  ╚███╔╝ ",
          "  ██╔══██║ ██╔══╝   ██║     ██║  ██╔██╗ ",
          "  ██║  ██║ ███████╗ ███████╗██║ ██╔╝╚██╗",
          "  ╚═╝  ╚═╝ ╚══════╝ ╚══════╝╚═╝ ╚═╝  ╚═╝",
        ]
        return (
          <box flexDirection="column" flexShrink={0}>
            <text selectable={false} fg={c.primary}>
              {logo.join("\n")}
            </text>
            <box height={1} />
            <text selectable={false} fg={c.secondary}>
              One Thought, Three Thousand Words
            </text>
            <text selectable={false} fg={c.textMuted}>
              一念三千
            </text>
          </box>
        )
      },
      // Three-column layout slots
      helix_header() {
        return <HelixHeader api={api} judgePass={judgePass} judgeFail={judgeFail} cardinalBlock={cardinalBlock} cardinalPause={cardinalPause} mode={currentMode} />
      },
      helix_footer() {
        const routeType = api.route.current.name
        return <HelixFooter api={api} routeType={routeType} mode={currentMode} />
      },
      helix_panel_right() {
        // Replaced by sidebar_content injection
        return null
      },
    },
  })

  // ── Event listeners ────────────────────────────────────────
  const events = api.event as unknown as {
    on: (type: string, handler: (payload: unknown) => void) => () => void
  }

  events.on("judge.verdict", (payload) => {
    if (!payload || typeof payload !== "object") return
    const evt = payload as Record<string, unknown>
    const data: JudgeVerdictData = {
      sessionID: String(evt.sessionID ?? ""),
      id: String(evt.id ?? ""),
      status: (evt.status as JudgeVerdictData["status"]) ?? "fail",
      checks: Array.isArray(evt.checks) ? (evt.checks as string[]) : [],
      summary: String(evt.summary ?? ""),
    }
    if (data.sessionID) setHelixSessionId(data.sessionID)

    if (data.status === "pass") {
      judgePass++
    } else {
      judgeFail++
    }

    const level = data.status === "pass" ? "info" : "warn"
    trace.emit("judge.verdict", level, `Judge verdict: ${data.status}`, {
      sessionID: data.sessionID, status: data.status, checksCount: data.checks.length, summary: data.summary.slice(0, 200),
    }, data.sessionID)

    // Only show UI for failures — skip noisy PASS toasts
    if (data.status !== "pass") {
      trace.emit("judge.card", "warn", "Judge violation dialog shown", {
        sessionID: data.sessionID, checksCount: data.checks.length,
      }, data.sessionID)
      api.ui.toast({
        variant: "warning",
        title: `Judge: VIOLATION (${data.checks.length} checks)`,
        message: data.summary.slice(0, 100),
        duration: 3000,
      })
      api.ui.dialog.replace(() => <JudgeVerdictDialog api={api} data={data} />)
    }
  })

  events.on("cardinal.detected", (payload) => {
    if (!payload || typeof payload !== "object") return
    const evt = payload as Record<string, unknown>
    const data: CardinalAlertData = {
      sessionID: String(evt.sessionID ?? ""),
      id: String(evt.id ?? ""),
      cardinalType: String(evt.cardinalType ?? "unknown"),
      severity: (evt.severity as CardinalAlertData["severity"]) ?? "warn",
      message: String(evt.message ?? ""),
    }
    if (data.sessionID) setHelixSessionId(data.sessionID)

    if (data.severity === "block") cardinalBlock++
    else if (data.severity === "pause" || data.severity === "stop") cardinalPause++
    else cardinalWarn++

    const level = data.severity === "block" ? "error" : data.severity === "stop" ? "warn" : "info"
    trace.emit("cardinal.detected", level, `Cardinal: ${data.cardinalType}`, {
      sessionID: data.sessionID, cardinalType: data.cardinalType, severity: data.severity, message: data.message,
    }, data.sessionID)

    // Only block-level events show UI; warn/pause are silent (counters visible in header)
    if (data.severity === "block" || data.severity === "stop") {
      trace.emit("cardinal.card", "warn", `Cardinal dialog shown (${data.severity})`, {
        sessionID: data.sessionID, severity: data.severity,
      }, data.sessionID)
      api.ui.dialog.replace(() => <CardinalAlertDialog api={api} data={data} />)
    }
  })

  events.on("alignment.drift", (payload) => {
    if (!payload || typeof payload !== "object") return
    const evt = payload as Record<string, unknown>
    alignmentDrifts++
    const alertType = String(evt.alertType ?? evt.type ?? "")
    const sessionID = String(evt.sessionID ?? "")
    if (sessionID) setHelixSessionId(sessionID)
    trace.emit("alignment.drift", "warn", `Alignment drift: ${alertType}`, {
      sessionID, alertType, severity: String(evt.severity ?? ""), message: String(evt.message ?? ""),
    }, sessionID || undefined)
    // Alignment drifts are tracked silently — counters visible in header via totalGuard
  })

  events.on("preflight.result", (payload) => {
    if (!payload || typeof payload !== "object") return
    const evt = payload as Record<string, unknown>
    const data: PreflightResultData = {
      sessionID: String(evt.sessionID ?? ""), passed: Boolean(evt.passed), blocked: Boolean(evt.blocked), paused: Boolean(evt.paused),
      results: Array.isArray(evt.results)
        ? (evt.results as any[]).map((r: any) => ({
            id: String(r.id ?? ""), name: String(r.name ?? ""), passed: Boolean(r.passed), level: String(r.level ?? "info"), message: String(r.message ?? ""),
          })) : [],
    }
    if (data.sessionID) setHelixSessionId(data.sessionID)
    trace.emit("preflight.check", data.blocked ? "error" : data.paused ? "warn" : "info",
      `Pre-flight: ${data.blocked ? "BLOCKED" : data.paused ? "PAUSED" : "PASSED"}`, {
      sessionID: data.sessionID, passed: data.passed, blocked: data.blocked, paused: data.paused, checksCount: data.results.length,
    }, data.sessionID)
    // Only block-level preflight gets a dialog
    if (data.blocked) {
      trace.emit("preflight.card", "warn", "Pre-flight dialog shown", { sessionID: data.sessionID, blocked: data.blocked }, data.sessionID)
      api.ui.dialog.replace(() => <PreflightResultDialog api={api} data={data} />)
    }
  })

  events.on("mode.applied", (payload) => {
    if (!payload || typeof payload !== "object") return
    const evt = payload as Record<string, unknown>
    currentMode = String(evt.mode ?? currentMode)
    const sid = String(evt.sessionID ?? "")
    if (sid) setHelixSessionId(sid)
    trace.emit("mode.switch", "info", `Mode applied: ${currentMode}`, {
      sessionID: helixSessionId() || sid, mode: currentMode,
      judgeEnabled: Boolean(evt.judgeEnabled), specDriven: Boolean(evt.specDriven),
    }, helixSessionId() || sid || undefined)
    // Mode changes tracked silently — header already shows current mode
  })

  events.on("session.error", (payload: unknown) => {
    if (!payload || typeof payload !== "object") return
    const evt = payload as Record<string, unknown>
    const error = evt.error
    if (!error || typeof error !== "object") return
    const errObj = error as Record<string, unknown>
    const message = String(errObj.message ?? "")
    const sessionID = String(evt.sessionID ?? "")
    if (sessionID) setHelixSessionId(sessionID)

    if (message.includes("Cardinal block")) {
      trace.emit("session.error", "error", "Execution blocked by cardinal", { sessionID, blockedBy: "cardinal", message }, sessionID || undefined)
      api.ui.toast({ variant: "error", title: "Execution Blocked (Cardinal)", message, duration: 0 })
    } else if (message.includes("Judge blocked")) {
      trace.emit("session.error", "error", "Execution blocked by judge", { sessionID, blockedBy: "judge", message }, sessionID || undefined)
      api.ui.toast({ variant: "error", title: "Execution Blocked (Judge)", message, duration: 0 })
    } else if (message.includes("Pre-flight blocked")) {
      trace.emit("preflight.check", "error", "Pre-flight blocked execution", { sessionID, message }, sessionID || undefined)
      api.ui.toast({ variant: "error", title: "Pre-flight Blocked", message, duration: 0 })
    } else if (message.includes("Instruction violation")) {
      trace.emit("session.error", "warn", "Instruction adherence violation", { sessionID, message }, sessionID || undefined)
      api.ui.toast({ variant: "warning", title: "Instruction Violation", message, duration: 5000 })
    }
  })

  trace.emit("ui.init", "info", "Helix plugin initialized")
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
