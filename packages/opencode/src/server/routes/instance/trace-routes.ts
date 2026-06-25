import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { TraceReporter, formatTree } from "@/observability/trace-reporter"
import { jsonRequest } from "./trace"
import z from "zod"

const TraceNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  type: z.enum(["node_start", "node_end", "action", "decision", "error"]),
  name: z.string(),
  status: z.enum(["pending", "success", "failed"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number(),
  duration: z.number().optional(),
})

export const TraceRoutes = () =>
  new Hono().get(
    "/",
    describeRoute({
        summary: "Get execution trace tree",
      description:
        "Returns the accumulated trace events as a flat list or a tree structure. " +
        "Use ?tree=true to get a parent-child tree. Use ?format=text for readable tree output (Feishu/VS Code). Use ?sessionID=xxx to filter by session.",
      operationId: "trace.list",
      responses: {
        200: {
          description: "Trace events",
          content: {
            "application/json": {
              schema: resolver(z.array(TraceNodeSchema)),
            },
          },
        },
      },
    }),
    (c) =>
      jsonRequest("trace.list", c, function* () {
        const treeMode = c.req.query("tree") === "true"
        const format = c.req.query("format") ?? "json"
        const sessionID = c.req.query("sessionID")

        const reporter = yield* TraceReporter.Service
        const events = yield* reporter.getTraces()

        const filtered = sessionID
          ? events.filter((e) => e.metadata?.sessionID === sessionID)
          : events

        if (format === "text") {
          return c.text(formatTree(filtered))
        }

        if (!treeMode) return filtered

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
          if (node.children?.length) {
            node.children = node.children.map(addDuration)
          }
          if (node.type === "node_end" || node.type === "error") {
            return node
          }
          if (node.children?.length) {
            const childEnds = node.children.map((c: any) =>
              (c.type === "node_end" || c.type === "error")
                ? c.timestamp
                : c.timestamp + (c.duration ?? 0)
            )
            node.duration = Math.max(...childEnds) - node.timestamp
          }
          return node
        }

        return roots.map(addDuration)
      }),
  )
