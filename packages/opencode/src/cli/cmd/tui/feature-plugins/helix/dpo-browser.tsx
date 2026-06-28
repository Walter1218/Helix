import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onMount } from "solid-js"
import * as trace from "./trace"

interface DPODataset {
  name: string
  size: string
  pairs: number
  date: string
  path: string
}

export function DPOBrowserRoute(_props: { api: TuiPluginApi }) {
  const c = _props.api.theme.current
  const [datasets, setDatasets] = createSignal<DPODataset[]>([])
  const [exporting, setExporting] = createSignal(false)
  const [totalPairs, setTotalPairs] = createSignal(0)

  const triggerExport = async () => {
    setExporting(true)
    trace.emit("dpo.export", "info", "DPO export triggered from browser")
    try {
      await _props.api.ui.toast({ variant: "info", title: "DPO Export", message: "Starting DPO dataset export...", duration: 3000 })
    } finally {
      setTimeout(() => setExporting(false), 2000)
    }
  }

  onMount(() => {
    trace.emit("dpo.browse", "info", "DPO browser route mounted")
    // Load dataset list from backend
    _props.api.ui.toast({ variant: "info", message: "DPO browser ready. Connect server to load datasets.", duration: 3000 })
  })

  const ds = datasets()
  const total = totalPairs()

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>DPO Dataset Browser</b>
        </text>
        <text fg={c.primary} onMouseDown={triggerExport}>
          {exporting() ? "[Exporting...]" : "[Export New Dataset]"}
        </text>
      </box>
      <box height={1} />

      <box flexDirection="row" gap={3}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Total Pairs:</text>
          <text fg={c.primary}><b>{total}</b></text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Datasets:</text>
          <text fg={c.primary}><b>{ds.length}</b></text>
        </box>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Export History</b>
      </text>
      <box height={1} />

      {ds.length > 0 ? (
        ds.map((d) => (
          <box flexDirection="row" gap={2}>
            <text fg={c.text}>{d.date}</text>
            <text fg={c.primary}>{d.name}</text>
            <text fg={c.textMuted}>{d.size}</text>
            <text fg={c.success}>{d.pairs} pairs</text>
          </box>
        ))
      ) : (
        <text fg={c.textMuted}>No datasets exported yet. Run DPO export to generate training data.</text>
      )}
      <box height={1} />

      <text fg={c.text}>
        <b>Judge Gate Rules</b>
      </text>
      <box height={1} />
      <text fg={c.textMuted}>1. Assertion count regression detection (DCE prevention)</text>
      <text fg={c.textMuted}>2. Code mass shrinkage &gt; 70% detection</text>
      <text fg={c.textMuted}>3. Diff too small (&lt; 5 chars) detection</text>
      <text fg={c.textMuted}>4. Empty content check</text>
      <box height={1} />

      <text fg={c.textMuted}>Format: JSONL (prompt, chosen, rejected) — compatible with HuggingFace TRL</text>
      <text fg={c.textMuted}>Storage: .dogfooding/ | Use /evolution to trigger exports</text>
    </box>
  )
}
