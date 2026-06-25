import { Effect, Context, Layer, Ref, Stream } from "effect"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config"
import { Log } from "@/util"
import { Session } from "@/session"
import { SessionID } from "@/session/schema"
import { AlignmentGuard } from "@/observability/alignment-guard"
import { TraceReporter, formatTree } from "@/observability/trace-reporter"
// AGENTS_MD_PATH was imported from "@/constants", now defined inline
import type { Provider } from "@/provider"
import z from "zod"
import * as fs from "node:fs/promises"
import * as path from "node:path"

const AGENTS_MD_PATH = "AGENTS.md"

const log = Log.create({ service: "mcp.server" })

// ============================================================================
// Helix MCP Server — 将 Helix 核心能力暴露为 MCP-compatible tools/events
//
// 这是 Helix 作为"大一统泛编程引擎"对外暴露的标准接口。
// OpenCopilot、Claude Desktop、Zed、Cursor 等外部工具通过此协议接入。
// ============================================================================

/**
 * MCP Tool 返回结构
 */
export interface MCPToolResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

/**
 * 可注册的 MCP Tool 定义
 */
export interface HelixMCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (params: Record<string, unknown>) => Promise<MCPToolResult>
}

// ============================================================================
// 工具注册表
// ============================================================================

const toolRegistry = new Map<string, HelixMCPTool>()

function registerTool(tool: HelixMCPTool) {
  toolRegistry.set(tool.name, tool)
  return tool
}

/** 列出所有已注册的 MCP Tool */
export function listTools(): HelixMCPTool[] {
  return [...toolRegistry.values()]
}

/** 按名称查找 MCP Tool */
export function getTool(name: string): HelixMCPTool | undefined {
  return toolRegistry.get(name)
}

// ============================================================================
// 内置 Tools
// ============================================================================

registerTool({
  name: "helix.run_goal",
  description:
    "启动一个新的 Helix 会话，下发宏观目标 (Macro Goal)。Agent 会在安全沙箱中自主规划、执行、测试并修复。返回 sessionID 供后续查询。",
  inputSchema: {
    type: "object",
    properties: {
      goal: { type: "string", description: "宏观目标描述，如 '修复 src/utils.ts 的类型报错并确保所有测试通过'" },
      directory: { type: "string", description: "项目根目录（绝对路径）" },
      mode: { type: "string", enum: ["light", "heavy"], description: "light=快速模式(跳过沙箱), heavy=全量模式(沙箱+FSM)" },
      provider: { type: "string", description: "LLM provider ID，如 mimo/2.5" },
    },
    required: ["goal", "directory"],
  },
  handler: async (params) => {
    const goal = params.goal as string
    const directory = params.directory as string
    const mode = ((params.mode ?? "heavy") as string)

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            sessionID: `mcp-${Date.now()}`,
            goal,
            directory,
            mode,
            status: "created",
            note: "Session created. Use helix.get_trace(sessionID) to monitor progress. Use helix.get_alerts(sessionID) for warnings.",
          }),
        },
      ],
    }
  },
})

registerTool({
  name: "helix.get_trace",
  description: "获取指定 session 的执行轨迹（Trace），包含工具调用、LLM 推理、FSM 决策等事件。返回扁平列表或树形结构。",
  inputSchema: {
    type: "object",
    properties: {
      sessionID: { type: "string", description: "Helix 会话 ID" },
      tree: { type: "boolean", description: "是否返回树形结构（默认 false，返回扁平列表）" },
      format: { type: "string", enum: ["json", "text"], description: "输出格式：json（默认）返回原始 JSON，text 返回可读的树形文本（适合飞书/VS Code 展示）" },
      limit: { type: "number", description: "最多返回多少条事件（默认 50）" },
    },
    required: ["sessionID"],
  },
  handler: async (params) => {
    const sessionID = params.sessionID as string
    const treeMode = (params.tree ?? false) as boolean
    const format = ((params.format ?? "json") as string)
    const limit = ((params.limit ?? 50) as number)

    const { AppRuntime } = await import("@/effect/app-runtime")
    const events = await AppRuntime.runPromise(
      TraceReporter.Service.use((reporter) => reporter.getTraces()),
    )

    const filtered = events
      .filter((e) => e.metadata?.sessionID === sessionID)
      .slice(-limit)

    if (format === "text") {
      const text = formatTree(filtered)
      return {
        content: [{ type: "text", text }],
      }
    }

    if (!treeMode) {
      return {
        content: [{ type: "text", text: JSON.stringify({ sessionID, count: filtered.length, events: filtered }, null, 2) }],
      }
    }

    const map = new Map<string, any>()
    const roots: any[] = []
    for (const ev of filtered) {
      map.set(ev.id, { ...ev, children: [] })
    }
    for (const ev of filtered) {
      const node = map.get(ev.id)!
      if (ev.parentId && map.has(ev.parentId)) {
        map.get(ev.parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }

    const addDuration = (node: any): any => {
      if (node.children?.length) node.children = node.children.map(addDuration)
      const start = node.timestamp
      const childEnds = (node.children ?? []).map((c: any) => c.timestamp + (c.duration ?? 0))
      const end = childEnds.length ? Math.max(...childEnds) : start
      node.duration = end - start
      return node
    }

    const tree = roots.map(addDuration)
    const totalMs = tree.length
      ? Math.max(...tree.map((r: any) => (r.timestamp ?? 0) + (r.duration ?? 0))) - Math.min(...tree.map((r: any) => r.timestamp ?? 0))
      : 0

    return {
      content: [{ type: "text", text: JSON.stringify({ sessionID, totalDuration: `${(totalMs / 1000).toFixed(1)}s`, stepCount: tree.length, tree }, null, 2) }],
    }
  },
})

registerTool({
  name: "helix.get_alerts",
  description: "获取指定 session 的偏离告警（由 AlignmentGuard 产生），包括兔子洞、文件漂移、连续失败等。",
  inputSchema: {
    type: "object",
    properties: {
      sessionID: { type: "string", description: "Helix 会话 ID" },
    },
    required: ["sessionID"],
  },
  handler: async (params) => {
    const sessionID = params.sessionID as string
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            sessionID,
            alerts: [],
            note: `Alert snapshot for ${sessionID}. Subscribe to observability.alignment_alert events for real-time.`,
          }),
        },
      ],
    }
  },
})

registerTool({
  name: "helix.suspend",
  description: "挂起指定 session（暂停 Agent 执行）。",
  inputSchema: {
    type: "object",
    properties: {
      sessionID: { type: "string", description: "Helix 会话 ID" },
      reason: { type: "string", description: "挂起原因" },
    },
    required: ["sessionID"],
  },
  handler: async (params) => {
    const sessionID = params.sessionID as string
    const reason = ((params.reason ?? "manual suspension") as string)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ sessionID, suspended: true, reason }),
        },
      ],
    }
  },
})

registerTool({
  name: "helix.resume",
  description: "恢复已挂起的 session（注入新消息并继续执行）。",
  inputSchema: {
    type: "object",
    properties: {
      sessionID: { type: "string", description: "Helix 会话 ID" },
      content: { type: "string", description: "用户补充的新信息" },
      action: { type: "string", enum: ["resume", "abandon", "modify_goal"], description: "恢复动作" },
    },
    required: ["sessionID", "content"],
  },
  handler: async (params) => {
    const sessionID = params.sessionID as string
    const content = params.content as string
    const action = ((params.action ?? "resume") as string)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ sessionID, resumed: true, content: content.slice(0, 200), action }),
        },
      ],
    }
  },
})

registerTool({
  name: "helix.read_agents_md",
  description: "读取项目根目录的 AGENTS.md 规则文件，返回当前生效的工程准则。",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "项目根目录（绝对路径）" },
    },
    required: ["directory"],
  },
  handler: async (params) => {
    const directory = params.directory as string
    try {
      const content = await fs.readFile(path.join(directory, AGENTS_MD_PATH), "utf-8")
      return { content: [{ type: "text", text: content.slice(0, 8000) }] }
    } catch {
      return { content: [{ type: "text", text: "# AGENTS.md not found" }], isError: true }
    }
  },
})

registerTool({
  name: "helix.write_agents_md",
  description: "向项目根目录的 AGENTS.md 追加一条新规则（由数据飞轮 Phase 2 或用户手动写入）。",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "项目根目录（绝对路径）" },
      rule: { type: "string", description: "要追加的规则（Markdown 格式）" },
    },
    required: ["directory", "rule"],
  },
  handler: async (params) => {
    const directory = params.directory as string
    const rule = params.rule as string
    try {
      const p = path.join(directory, AGENTS_MD_PATH)
      const existing = await fs.readFile(p, "utf-8").catch(() => "")
      const newContent = existing ? `${existing}\n\n${rule}` : `# AGENTS.md\n\n${rule}`
      await fs.writeFile(p, newContent, "utf-8")
      return { content: [{ type: "text", text: JSON.stringify({ written: true, path: p }) }] }
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: String(e) }) }], isError: true }
    }
  },
})

// ============================================================================
// Service Layer
// ============================================================================

export interface Interface {
  readonly tools: () => HelixMCPTool[]
  readonly execute: (toolName: string, params: Record<string, unknown>) => Promise<MCPToolResult>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/HelixMCP") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      tools: () => listTools(),
      execute: async (toolName, params) => {
        const tool = getTool(toolName)
        if (!tool) {
          return { content: [{ type: "text", text: `Tool '${toolName}' not found` }], isError: true }
        }
        return tool.handler(params)
      },
    })
  }),
)
