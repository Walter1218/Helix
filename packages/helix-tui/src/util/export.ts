import type { DisplayMessage } from "../routes/chat"
import * as trace from "../trace"

export interface ExportOptions {
  format: "markdown" | "text"
  includeTimestamps: boolean
  includeToolCalls: boolean
  includeSystem: boolean
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: "markdown",
  includeTimestamps: true,
  includeToolCalls: true,
  includeSystem: false,
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return d.toISOString().replace("T", " ").slice(0, 19)
}

function roleLabel(role: string): string {
  switch (role) {
    case "user":
      return "User"
    case "assistant":
      return "Assistant"
    case "system":
      return "System"
    default:
      return role
  }
}

export function exportSessionToMarkdown(messages: DisplayMessage[], options: Partial<ExportOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const lines: string[] = []

  lines.push(`# Session Export`)
  lines.push("")
  lines.push(`Exported: ${formatTimestamp(Date.now())}`)
  lines.push(`Messages: ${messages.filter((m) => opts.includeSystem || m.role !== "system").length}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const msg of messages) {
    if (!opts.includeSystem && msg.role === "system") continue

    const role = roleLabel(msg.role)
    const agent = msg.agent ? ` (${msg.agent})` : ""
    const model = msg.model ? ` [${msg.model}]` : ""

    if (opts.includeTimestamps) {
      lines.push(`> *${formatTimestamp(msg.timestamp)}*`)
    }

    lines.push(`### ${role}${agent}${model}`)
    lines.push("")

    if (msg.content) {
      lines.push(msg.content)
      lines.push("")
    }

    if (opts.includeToolCalls && msg.toolCalls?.length) {
      for (const tool of msg.toolCalls) {
        lines.push(`\`${tool.name}\` ${tool.status === "done" ? "✓" : tool.status === "error" ? "✗" : "⟳"}`)
        if (tool.input) {
          lines.push("```")
          lines.push(tool.input.slice(0, 500))
          lines.push("```")
        }
        if (tool.output && tool.status === "done") {
          lines.push("<details>")
          lines.push("<summary>Output</summary>")
          lines.push("")
          lines.push("```")
          lines.push(tool.output.slice(0, 1000))
          lines.push("```")
          lines.push("</details>")
        }
        lines.push("")
      }
    }

    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

export function exportSessionToFile(messages: DisplayMessage[], filePath: string, options?: Partial<ExportOptions>): void {
  trace.emit("user.send", "info", "Exporting session to file", { messageCount: messages.length, filePath })
  const content = exportSessionToMarkdown(messages, options)
  Bun.write(filePath, content)
  trace.emit("user.send", "info", "Session exported successfully", { filePath })
}
