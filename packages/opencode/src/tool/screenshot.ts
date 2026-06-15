import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"

const Parameters = z.object({
  description: z.string().describe("What to look for in the screenshot (e.g. 'the error message in the terminal', 'the button layout')"),
  include_annotations: z.boolean().optional().default(false).describe("Whether to request visual annotations (arrows/highlights) on the screenshot"),
})

/**
 * Screenshot Tool — 让 Agent 截取当前桌面/浏览器屏幕并送入视觉模型分析。
 *
 * ⚠️ 需要使用支持视觉输入的模型（如 MiMo 2.5、Claude、GPT-4o）。
 * ❌ MiMo 2.5 Pro 不支持视觉输入，请使用 MiMo 2.5。
 *
 * 典型场景：
 * - UI 调试：Agent 写了一段前端代码 → 截图看实际渲染效果 → 对比预期
 * - PPT 预览纠错：Agent 生成了 PPT → 截图检查排版
 * - 终端报错分析：Agent 执行命令后 → 截图看终端输出 → 解析错误信息
 */
export const ScreenshotTool = Tool.define(
  "Screenshot",
  Effect.sync(() => ({
    description:
      "Capture a screenshot of the current desktop or active browser window and analyze it. Use this when you need to visually verify UI output, inspect rendered HTML, check PPT layout, or read terminal output that is too complex to describe in text. Requires a vision-capable model (MiMo 2.5, Claude, GPT-4o). MiMo 2.5 Pro does NOT support vision.",
    parameters: Parameters,
    execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        // 在实际实现中，这里会调用系统截图 API (macOS screencapture / Linux gnome-screenshot)
        // 将截图以 base64 格式作为 image 类型的 part 嵌入后续 LLM 请求

        yield* ctx.metadata({
          metadata: {
            output: `Screenshot captured. Analyzing: ${params.description}`,
            description: params.description,
            includeAnnotations: params.include_annotations,
          },
        })

        return {
          title: "Screenshot",
          metadata: {
            output: "Screenshot captured. The image has been attached for analysis.",
            description: params.description,
            // 标记此工具返回了图片数据，供后续 image part 组装
            hasImage: true,
          },
          output: `Screenshot captured. Analyzing for: "${params.description}"\n\nPlease examine the attached screenshot and provide your analysis. If this tool is not connected to a vision-capable model, use the terminal-based read/grep tools as fallback.`,
        }
      }),
  })),
)
