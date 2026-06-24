import { createSignal, onMount, onCleanup, For } from "solid-js"
import { useTheme } from "../context/theme"

type Metric = {
  label: string
  value: number
  unit: string
  trend: "up" | "down" | "stable"
}

export function Monitor() {
  const theme = useTheme()
  const [metrics, setMetrics] = createSignal<Metric[]>([])
  const [uptime, setUptime] = createSignal(0)

  let interval: Timer | null = null

  onMount(() => {
    loadMetrics()
    interval = setInterval(() => {
      loadMetrics()
      setUptime((prev) => prev + 5)
    }, 5000)
  })

  onCleanup(() => {
    if (interval) clearInterval(interval)
  })

  const loadMetrics = () => {
    // Simulated metrics
    setMetrics([
      { label: "CPU", value: Math.random() * 100, unit: "%", trend: "stable" },
      { label: "Memory", value: 40 + Math.random() * 30, unit: "%", trend: "up" },
      { label: "Disk", value: 65 + Math.random() * 10, unit: "%", trend: "stable" },
      { label: "Network", value: Math.random() * 1000, unit: "KB/s", trend: "down" },
    ])
  }

  const bar = (value: number, width: number = 25) => {
    const filled = Math.round((value / 100) * width)
    return "█".repeat(filled) + "░".repeat(width - filled)
  }

  const metricColor = (value: number) => {
    if (value > 90) return theme.getColor("error")
    if (value > 70) return theme.getColor("warning")
    return theme.getColor("success")
  }

  const trendIcon = (trend: Metric["trend"]) => {
    switch (trend) {
      case "up": return "↑"
      case "down": return "↓"
      case "stable": return "→"
    }
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <box
        height={1}
        backgroundColor={theme.getColor("backgroundSecondary")}
        paddingLeft={1}
      >
        <text fg={theme.getColor("primary")} attributes={1}>
          System Monitor
        </text>
        <text fg={theme.getColor("textMuted")}>
          {" "} Auto-refresh: 5s
        </text>
      </box>

      <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
        <text fg={theme.getColor("primary")} attributes={1}>
          Performance Metrics
        </text>
        <box height={1} />

        <For each={metrics()}>
          {(metric) => (
            <box flexDirection="row" marginBottom={1}>
              <text fg={theme.getColor("text")} width={10}>
                {metric.label}:
              </text>
              <text fg={metricColor(metric.value)}>
                {bar(metric.value)}
              </text>
              <text fg={metricColor(metric.value)}>
                {" "}{metric.value.toFixed(1)}{metric.unit}
              </text>
              <text fg={theme.getColor("textMuted")}>
                {" "}{trendIcon(metric.trend)}
              </text>
            </box>
          )}
        </For>

        <box height={1} />
        <text fg={theme.getColor("primary")} attributes={1}>
          System Info
        </text>
        <box height={1} />

        <box flexDirection="column" border borderColor={theme.getColor("border")} padding={1}>
          <text fg={theme.getColor("text")}>
            Active Sessions: 3
          </text>
          <text fg={theme.getColor("text")}>
            Pending Tasks: 7
          </text>
          <text fg={theme.getColor("text")}>
            Completed Today: 24
          </text>
          <text fg={theme.getColor("text")}>
            Uptime: {Math.floor(uptime() / 60)}m {uptime() % 60}s
          </text>
        </box>
      </box>
    </box>
  )
}
