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
