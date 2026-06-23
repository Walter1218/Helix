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
}
