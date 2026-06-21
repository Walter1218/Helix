import { Context, Effect, Layer } from "effect"
import { Config } from "@/config"
import { TokenTracker, type UsageStats } from "@/token/tracker"
import { Log } from "@/util"

const log = Log.create({ service: "progress-tracker" })

export interface ProgressReport {
  generated_at: number
  period: "daily" | "weekly" | "monthly"
  token_stats: UsageStats
  task_stats: {
    total_completed: number
    total_failed: number
    success_rate: number
  }
  budget_utilization: {
    daily_limit: number
    total_used: number
    utilization_rate: number
    remaining: number
  }
  recommendations: Array<{
    type: "budget" | "priority" | "focus" | "process"
    description: string
    impact: "high" | "medium" | "low"
  }>
}

export interface Interface {
  readonly generateReport: (period?: "daily" | "weekly" | "monthly") => Effect.Effect<ProgressReport>
  readonly exportMarkdown: (report: ProgressReport) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProgressTracker") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const tokenTracker = yield* TokenTracker.Service

    const generateReport = Effect.fn("ProgressTracker.generateReport")(function* (
      period: "daily" | "weekly" | "monthly" = "daily",
    ) {
      const cfg = yield* config.get()
      const dailyLimit = cfg.token_budget?.daily_limit ?? 0
      const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30

      const stats = yield* tokenTracker.getUsageStats(days)
      const budgetInfo = yield* tokenTracker.getDailyBudget()

      const recommendations: ProgressReport["recommendations"] = []

      if (dailyLimit > 0 && budgetInfo.used > dailyLimit * 0.8) {
        recommendations.push({
          type: "budget",
          description: "今日 token 使用已超过预算 80%，建议暂停非关键任务",
          impact: "high",
        })
      }

      if (stats.avg_daily > 0 && dailyLimit > 0 && stats.avg_daily > dailyLimit * 0.9) {
        recommendations.push({
          type: "budget",
          description: `日均 token 使用 (${stats.avg_daily}) 接近预算上限，建议增加预算或优化任务`,
          impact: "medium",
        })
      }

      if (stats.total_tokens === 0) {
        recommendations.push({
          type: "process",
          description: "尚未有 token 使用记录，建议开始执行自动开发任务",
          impact: "medium",
        })
      }

      const report: ProgressReport = {
        generated_at: Date.now(),
        period,
        token_stats: stats,
        task_stats: {
          total_completed: 0,
          total_failed: 0,
          success_rate: 0,
        },
        budget_utilization: {
          daily_limit: dailyLimit,
          total_used: stats.total_tokens,
          utilization_rate: dailyLimit > 0 ? stats.total_tokens / (dailyLimit * days) : 0,
          remaining: Math.max(0, dailyLimit * days - stats.total_tokens),
        },
        recommendations,
      }

      log.info("progress report generated", {
        period,
        totalTokens: stats.total_tokens,
        utilization: report.budget_utilization.utilization_rate,
        recommendations: recommendations.length,
      })

      return report
    })

    const exportMarkdown = Effect.fn("ProgressTracker.exportMarkdown")(function* (report: ProgressReport) {
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
    })

    return Service.of({
      generateReport,
      exportMarkdown,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(TokenTracker.defaultLayer),
  ),
)

export * as ProgressTracker from "./progress-tracker"
