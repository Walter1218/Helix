/**
 * 飞书交互式卡片生成器。
 * 三种卡片：偏离告警 / Agent 追问 / 任务完成。
 */
export class CardBuilder {
  buildAlertCard(reason: string, suggestion: string, sessionID: string) {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: "⚠️ Agent 可能偏离目标" },
        template: "red",
      },
      elements: [
        { tag: "div", text: { tag: "plain_text", content: reason } },
        { tag: "div", text: { tag: "plain_text", content: suggestion } },
        { tag: "hr" },
        { tag: "div", text: { tag: "plain_text", content: "需要暂停任务进行干预吗？" } },
      ],
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "⏸ 暂停任务" },
          type: "default",
          value: { action: "suspend", sessionID },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "忽略继续" },
          type: "default",
          value: { action: "ignore" },
        },
      ],
    }
  }

  buildAlignmentAlertCard(params: {
    level: "warn" | "critical"
    reason: string
    suggestion: string
    sessionID: string
    files?: string[]
  }) {
    const { level, reason, suggestion, sessionID, files } = params
    const isCritical = level === "critical"

    const headerTitle = isCritical
      ? "🚨 Agent 严重偏离目标"
      : "⚠️ Agent 可能偏离目标"
    const template = isCritical ? "red" : "orange"

    const elements: unknown[] = [
      { tag: "div", text: { tag: "plain_text", content: reason } },
    ]

    if (files && files.length > 0) {
      const fileList = files.slice(0, 5).join("\n")
      elements.push({
        tag: "div",
        text: { tag: "plain_text", content: `涉及文件:\n${fileList}` },
      })
    }

    elements.push({ tag: "hr" })
    elements.push({ tag: "div", text: { tag: "plain_text", content: suggestion } })
    elements.push({ tag: "hr" })
    elements.push({
      tag: "div",
      text: { tag: "plain_text", content: isCritical ? "建议立即暂停任务并干预" : "需要暂停任务进行干预吗？" },
    })

    const actions = [
      {
        tag: "button",
        text: { tag: "plain_text", content: "⏸ 暂停任务" },
        type: isCritical ? "danger" : "default",
        value: { action: "suspend", sessionID },
      },
      {
        tag: "button",
        text: { tag: "plain_text", content: "忽略继续" },
        type: "default",
        value: { action: "ignore", sessionID },
      },
    ]

    return {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: headerTitle }, template },
      elements,
      actions,
    }
  }

  buildQuestionCard(question: string, options: Array<{ label: string; description: string }>, sessionID: string) {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: "🤔 Agent 需要你的决定" },
        template: "blue",
      },
      elements: [
        { tag: "div", text: { tag: "plain_text", content: question } },
        { tag: "hr" },
        { tag: "div", text: { tag: "plain_text", content: "请选择一个选项:" } },
      ],
      actions: options.map((opt) => ({
        tag: "button",
        text: { tag: "plain_text", content: opt.label },
        type: "default",
        value: { action: "resume", sessionID, selected: opt.label },
      })),
    }
  }

  buildResultCard(title: string, summary: string, sessionID: string) {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: "✅ 任务完成" },
        template: "green",
      },
      elements: [
        { tag: "div", text: { tag: "plain_text", content: title } },
        { tag: "div", text: { tag: "plain_text", content: summary } },
      ],
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "🔄 不满意，重做" },
          type: "danger",
          value: { action: "retry", sessionID },
        },
      ],
    }
  }

  /** 构建 Agent 执行树卡片（支持增量更新） */
  buildExecutionTreeCard(params: {
    sessionID: string
    steps: Array<{
      name: string
      status: "pending" | "success" | "failed"
      duration?: number
      detail?: string
      children?: Array<{
        name: string
        status: "pending" | "success" | "failed"
        duration?: number
        detail?: string
      }>
    }>
    totalDuration?: number
    isFinal?: boolean
  }) {
    const { sessionID, steps, totalDuration, isFinal } = params

    const statusIcon = (s: string) => s === "success" ? "✅" : s === "failed" ? "❌" : "🔄"
    const fmtDuration = (ms?: number) => {
      if (ms === undefined || ms === null) return ""
      if (ms < 1000) return `${ms}ms`
      return `${(ms / 1000).toFixed(1)}s`
    }

    const doneCount = steps.filter((s) => s.status !== "pending").length
    const totalCount = steps.length
    const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
    const progressBar = this.renderProgressBar(progressPct, 10)

    const stepLines = steps.map((step, i) => {
      const icon = statusIcon(step.status)
      const dur = fmtDuration(step.duration)
      let line = `${icon} **${i + 1}. ${step.name}**${dur ? ` (${dur})` : ""}`
      if (step.detail) line += `\n   ${step.detail.slice(0, 150)}`
      if (step.children?.length) {
        for (const child of step.children) {
          const ci = statusIcon(child.status)
          const cd = fmtDuration(child.duration)
          line += `\n   ${ci} ${child.name}${cd ? ` (${cd})` : ""}`
          if (child.detail) line += ` — ${child.detail.slice(0, 100)}`
        }
      }
      return line
    })

    const totalTime = totalDuration ? fmtDuration(totalDuration) : ""
    const headerSuffix = isFinal ? (totalTime ? ` · 完成 · ${totalTime}` : " · 完成") : (totalTime ? ` · 进行中 · ${totalTime}` : " · 进行中")
    const headerTemplate = isFinal ? (steps.some((s) => s.status === "failed") ? "red" : "green") : "turquoise"

    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: `📊 Agent 执行树${headerSuffix}` },
        template: headerTemplate,
      },
      elements: [
        {
          tag: "div",
          text: { tag: "lark_md", content: `${progressBar}  ${doneCount}/${totalCount} 步骤完成` },
        },
        { tag: "hr" },
        {
          tag: "div",
          text: { tag: "lark_md", content: stepLines.join("\n") },
        },
        { tag: "hr" },
        {
          tag: "note",
          elements: [
            { tag: "plain_text", content: `Session: ${sessionID.slice(0, 12)}… · ${steps.filter(s => s.status === "success").length}✅ ${steps.filter(s => s.status === "failed").length}❌ ${steps.filter(s => s.status === "pending").length}🔄` },
          ],
        },
      ],
    }
  }

  /** 构建流式更新卡片（文本 + 工具调用实时状态） */
  buildStreamingUpdateCard(params: {
    sessionID: string
    text: string
    toolCalls: Array<{
      id: string
      name: string
      input: string
      status: "running" | "done" | "error"
      output?: string
    }>
  }) {
    const { sessionID, text, toolCalls } = params

    const elements: unknown[] = []

    if (text) {
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: text.length > 2000 ? text.slice(-2000) : text },
      })
    }

    if (toolCalls.length > 0) {
      if (text) elements.push({ tag: "hr" })

      const toolLines = toolCalls.map((t) => {
        const icon = t.status === "running" ? "🔄" : t.status === "error" ? "❌" : "✅"
        let line = `${icon} **${t.name}**`
        if (t.input) line += `\n   ${t.input.slice(0, 150)}`
        if (t.output && t.status === "done") line += `\n   → ${t.output.slice(0, 150)}`
        if (t.output && t.status === "error") line += `\n   ❌ ${t.output.slice(0, 150)}`
        return line
      })

      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: toolLines.join("\n") },
      })
    }

    elements.push({
      tag: "note",
      elements: [
        { tag: "plain_text", content: `Session: ${sessionID.slice(0, 12)}… · 实时更新` },
      ],
    })

    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: "📡 Agent 实时执行" },
        template: "turquoise",
      },
      elements,
    }
  }

  /** 构建错误卡片 */
  buildErrorCard(params: { sessionID: string; error: string }) {
    const { sessionID, error } = params
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: "❌ Agent 执行错误" },
        template: "red",
      },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: error } },
        { tag: "hr" },
        {
          tag: "note",
          elements: [
            { tag: "plain_text", content: `Session: ${sessionID.slice(0, 12)}…` },
          ],
        },
      ],
    }
  }

  /** 构建工作流结果卡片 */
  buildWorkflowResultCard(params: { runID: string; status: string; error?: string }) {
    const { runID, status, error } = params
    const isFailed = status === "failed" || status === "cancelled"
    const headerTitle = isFailed ? "❌ 工作流执行失败" : "✅ 工作流执行完成"
    const template = isFailed ? "red" : "green"

    const elements: unknown[] = [
      { tag: "div", text: { tag: "lark_md", content: `状态: **${status}**` } },
    ]

    if (error) {
      elements.push({ tag: "div", text: { tag: "lark_md", content: `错误: ${error}` } })
    }

    elements.push({ tag: "hr" })
    elements.push({
      tag: "note",
      elements: [
        { tag: "plain_text", content: `RunID: ${runID.slice(0, 12)}…` },
      ],
    })

    return {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: headerTitle }, template },
      elements,
    }
  }

  private renderProgressBar(pct: number, width: number): string {
    const filled = Math.round((pct / 100) * width)
    const empty = width - filled
    return "█".repeat(filled) + "░".repeat(empty)
  }

}