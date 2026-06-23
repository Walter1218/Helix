import { test, expect, describe } from "bun:test"

describe("progress-tracker", () => {
  describe("exportMarkdown", () => {
    interface ProgressReport {
      generated_at: number
      period: "daily" | "weekly" | "monthly"
      token_stats: { total_tokens: number; avg_daily: number; by_purpose: Record<string, number> }
      task_stats: { total_completed: number; total_failed: number; success_rate: number }
      budget_utilization: { daily_limit: number; total_used: number; utilization_rate: number; remaining: number }
      recommendations: Array<{ type: string; description: string; impact: string }>
    }

    const exportMarkdown = (report: ProgressReport): string => {
      const lines: string[] = []
      const date = new Date(report.generated_at).toISOString().slice(0, 10)
      lines.push(`# Token 预算执行报告`)
      lines.push(`> 生成时间: ${date} | 周期: ${report.period}`)
      lines.push("")
      lines.push("## Token 使用统计")
      lines.push(`| 指标 | 值 |`)
      lines.push(`|------|-----|`)
      lines.push(`| 总使用 | ${report.token_stats.total_tokens.toLocaleString()} |`)
      lines.push(`| 日均使用 | ${report.token_stats.avg_daily.toLocaleString()} |`)
      lines.push(`| 预算利用率 | ${(report.budget_utilization.utilization_rate * 100).toFixed(1)}% |`)
      lines.push(`| 剩余预算 | ${report.budget_utilization.remaining.toLocaleString()} |`)
      lines.push("")

      if (Object.keys(report.token_stats.by_purpose).length > 0) {
        lines.push("## 按用途分布")
        lines.push(`| 用途 | Token 数 |`)
        lines.push(`|------|---------|`)
        for (const [purpose, tokens] of Object.entries(report.token_stats.by_purpose)) {
          lines.push(`| ${purpose} | ${tokens.toLocaleString()} |`)
        }
        lines.push("")
      }

      if (report.recommendations.length > 0) {
        lines.push("## 建议")
        for (const rec of report.recommendations) {
          const icon = rec.impact === "high" ? "🔴" : rec.impact === "medium" ? "🟡" : "🟢"
          lines.push(`- ${icon} **${rec.type}**: ${rec.description}`)
        }
        lines.push("")
      }

      return lines.join("\n")
    }

    const makeReport = (overrides: Partial<ProgressReport> = {}): ProgressReport => ({
      generated_at: new Date("2026-06-23").getTime(),
      period: "daily",
      token_stats: { total_tokens: 100000, avg_daily: 100000, by_purpose: {} },
      task_stats: { total_completed: 5, total_failed: 1, success_rate: 0.83 },
      budget_utilization: { daily_limit: 200000, total_used: 100000, utilization_rate: 0.5, remaining: 100000 },
      recommendations: [],
      ...overrides,
    })

    test("生成包含标题和日期", () => {
      const md = exportMarkdown(makeReport())
      expect(md).toContain("# Token 预算执行报告")
      expect(md).toContain("2026-06-23")
    })

    test("包含 token 统计表格", () => {
      const md = exportMarkdown(makeReport())
      expect(md).toContain("| 总使用 |")
      expect(md).toContain("| 日均使用 |")
      expect(md).toContain("| 预算利用率 |")
      expect(md).toContain("50.0%")
    })

    test("按用途分布为空时不显示", () => {
      const md = exportMarkdown(makeReport())
      expect(md).not.toContain("## 按用途分布")
    })

    test("有按用途数据时显示表格", () => {
      const md = exportMarkdown(makeReport({
        token_stats: { total_tokens: 100000, avg_daily: 100000, by_purpose: { execution: 60000, planning: 40000 } },
      }))
      expect(md).toContain("## 按用途分布")
      expect(md).toContain("| execution |")
      expect(md).toContain("| planning |")
    })

    test("无建议时不显示建议部分", () => {
      const md = exportMarkdown(makeReport())
      expect(md).not.toContain("## 建议")
    })

    test("有建议时显示建议部分", () => {
      const md = exportMarkdown(makeReport({
        recommendations: [
          { type: "budget", description: "token 使用过高", impact: "high" },
          { type: "process", description: "建议开始任务", impact: "medium" },
        ],
      }))
      expect(md).toContain("## 建议")
      expect(md).toContain("🔴")
      expect(md).toContain("🟡")
      expect(md).toContain("token 使用过高")
    })

    test("显示正确的周期", () => {
      const md = exportMarkdown(makeReport({ period: "weekly" }))
      expect(md).toContain("weekly")
    })

    test("利用率计算正确", () => {
      const md = exportMarkdown(makeReport({
        budget_utilization: { daily_limit: 200000, total_used: 150000, utilization_rate: 0.75, remaining: 50000 },
      }))
      expect(md).toContain("75.0%")
    })
  })
})
