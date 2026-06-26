import { Effect, Layer, Context, Ref, Stream } from "effect"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Log } from "@/util"
import type { SessionID } from "@/session/schema"
import { Event as SessionEvent } from "@/session/session"
import { inboxServiceRef } from "@/inbox/inbox-ref"
import z from "zod"

const log = Log.create({ service: "alignment-guard" })

function publishAlignmentDrift(bus: Bus.Interface, payload: AlignmentAlertPayload, alertType: string) {
  return bus.publish(SessionEvent.AlignmentDrift, {
    sessionID: payload.sessionID,
    id: Math.random().toString(36).slice(2),
    alertType,
    severity: payload.level === "critical" ? "critical" : "warning",
    message: payload.reason,
    metrics: { files: payload.files, suggestion: payload.suggestion, timestamp: payload.timestamp },
  }).pipe(Effect.catch(() => Effect.void))
}

// ============================================================================
// 附加能力：AlignmentGuard 不仅向外部广播告警，也可以通过 Actor inbox
// 直接向主智能体发送纠正消息，实现"自我监测-自我纠偏"的元认知闭环。
// ============================================================================

/**
 * 尝试将纠正消息投递到主智能体的 inbox。
 * inbox 服务是可选的（部分测试夹具中未挂载），失败不影响主流程。
 */
function tryDeliverToInbox(sid: string, suggestion: string) {
  const inbox = inboxServiceRef.current
  if (!inbox) return
  Effect.runSync(
    inbox
      .send({
        receiverSessionID: sid as SessionID,
        receiverActorID: "" as SessionID,
        senderActorID: "alignment-guard",
        content: `<alignment-guard notification="true">${suggestion}</alignment-guard>`,
        type: "actor_notification",
      })
      .pipe(Effect.catch(() => Effect.void)),
  )
}

// ============================================================================
// AlignmentAlert — 当观测者发现主智能体偏离任务目标时，通过 Bus 向外部广播
// 外部程序（OpenCopilot、TUI、CI）可以订阅此事件来通知用户
// ============================================================================

export const AlignmentAlert = BusEvent.define(
  "observability.alignment_alert",
  z.object({
    sessionID: z.string(),
    /** 偏离级别 */
    level: z.enum(["warn", "critical"]),
    /** 偏离原因 */
    reason: z.string(),
    /** 相关的文件路径（如果适用） */
    files: z.array(z.string()).optional(),
    /** 建议给用户的提示文案 */
    suggestion: z.string(),
    timestamp: z.number(),
  }),
)

export type AlignmentAlertPayload = z.infer<typeof AlignmentAlert["properties"]>

// ============================================================================
// 偏离检测策略
// ============================================================================

/** 可疑的批量操作或远离目标的高频命令 */
const RABBIT_HOLE_PATTERNS = [
  /npm\s+install/,
  /bun\s+install/,
  /git\s+clone/,
  /pip\s+install/,
  /cargo\s+install/,
]

/** 与代码任务无关的"分心"操作 */
const DISTRACTION_PATTERNS = [
  /^curl\s/,
  /^wget\s/,
  /^open\s/,
  /^say\s/,
]

export interface AlertConfig {
  /** 连续执行失败命令数超过此阈值 → 触发警告 */
  failedCmdThreshold: number
  /** 修改不在 Goal 关键词内的文件数超过此阈值 → 触发警告 */
  fileDriftThreshold: number
}

const DEFAULT_CONFIG: AlertConfig = {
  failedCmdThreshold: 5,
  fileDriftThreshold: 5,
}

// ============================================================================
// Service
// ============================================================================

export interface Interface {
  /**
   * 注册一个会话的宏观目标，供观测者用作偏离判断的锚点。
   * 调用时机：当 Goal 被设置或更新时。
   */
  readonly registerGoal: (sessionID: SessionID, condition: string) => Effect.Effect<void>
  /**
   * 获取最近一次触发的告警（供外部程序轮询或主动查询）
   */
  readonly getAlerts: (sessionID: SessionID) => Effect.Effect<AlignmentAlertPayload[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AlignmentGuard") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    // 每个活跃会话的宏观目标
    const goals = yield* Ref.make(new Map<string, string>())
    // 最近触发的告警
    const alerts = yield* Ref.make<AlignmentAlertPayload[]>([])

    // 每个会话的统计计数器
    const sessions = new Map<
    string,
    {
      failedCmdCount: number
      modifiedFiles: Set<string>
      consecutiveFailedCmd: number
    }
    >()

    const getOrCreate = (sid: string) => {
      let s = sessions.get(sid)
      if (!s) {
        s = { failedCmdCount: 0, modifiedFiles: new Set(), consecutiveFailedCmd: 0 }
        sessions.set(sid, s)
      }
      return s
    }

    // 检测文件路径是否偏离了 Goal 关键词
    const fileDriftsFromGoal = (goal: string | undefined, files: Set<string>): string[] => {
      if (!goal) return []
      const drifts: string[] = []
      const keywords = goal.toLowerCase().split(/[\s,;]+/).filter(Boolean)
      if (keywords.length === 0) return []

      for (const f of files) {
        const lower = f.toLowerCase()
        const matched = keywords.some((kw) => lower.includes(kw))
        if (!matched) drifts.push(f)
      }
      return drifts
    }

    // ---- 订阅：消息部件变更（工具调用 + 执行结果） ----
    yield* Effect.forkScoped(
      Stream.runForEach(bus.subscribeAll(), (event) => {
        const props = (event as any)?.properties as Record<string, any> | undefined
        const sid = props?.sessionID as string | undefined
        if (!sid) return Effect.void

        const stat = getOrCreate(sid)

        // PartDelta 事件：大模型产出了一段新输出（可能是工具调用开始）
        if ((event as any).type === "message.part.delta") {
          const delta = props?.delta as string | undefined
          if (!delta) return Effect.void

          // 检测"分心"操作（如突然去 curl 了外部 URL）
          for (const pattern of DISTRACTION_PATTERNS) {
            if (pattern.test(delta.trim())) {
              const payload: AlignmentAlertPayload = {
                sessionID: sid,
                level: "warn",
                reason: `Agent 执行了可疑的分心操作: "${delta.trim().slice(0, 100)}"`,
                suggestion: `用户请确认此操作是否符合预期。如果不相关，建议暂停并干预。`,
                timestamp: Date.now(),
              }
              tryDeliverToInbox(sid, payload.suggestion)
              Effect.runSync(
                Effect.all([
                  Ref.update(alerts, (a) => [...a, payload]),
                  bus.publish(AlignmentAlert, payload).pipe(Effect.catch(() => Effect.void)),
                  publishAlignmentDrift(bus, payload, "distraction"),
                ]),
              )
            }
          }

          // 检测重复安装依赖（兔子洞模式）
          for (const pattern of RABBIT_HOLE_PATTERNS) {
            if (pattern.test(delta.trim())) {
              stat.failedCmdCount++
              if (stat.failedCmdCount >= DEFAULT_CONFIG.failedCmdThreshold) {
                const payload: AlignmentAlertPayload = {
                  sessionID: sid,
                  level: "warn",
                  reason: `Agent 连续执行了 ${stat.failedCmdCount} 次包安装/克隆操作，可能陷入兔子洞`,
                  suggestion: `建议用户检查 Agent 是否在盲目尝试下载不存在的依赖。`,
                  timestamp: Date.now(),
                }
                tryDeliverToInbox(sid, payload.suggestion)
                Effect.runSync(
                  Effect.all([
                    Ref.update(alerts, (a) => [...a, payload]),
                    bus.publish(AlignmentAlert, payload).pipe(Effect.catch(() => Effect.void)),
                    publishAlignmentDrift(bus, payload, "rabbit-hole"),
                  ]),
                )
              }
            }
          }
        }

        // 工具执行结果（failed） → 统计连续失败次数
        if ((event as any).type === "observability.trace_node") {
          const nodeType = props?.type as string | undefined
          const nodeStatus = props?.status as string | undefined
          if (nodeType === "action" && nodeStatus === "failed") {
            stat.consecutiveFailedCmd++
            if (stat.consecutiveFailedCmd >= DEFAULT_CONFIG.failedCmdThreshold) {
              const payload: AlignmentAlertPayload = {
                sessionID: sid,
                level: "critical",
                reason: `Agent 连续执行了 ${stat.consecutiveFailedCmd} 个失败的工具操作`,
                suggestion: `建议用户检查 Agent 是否陷入了死循环。可考虑暂停任务并指明正确方向。`,
                timestamp: Date.now(),
              }
              stat.consecutiveFailedCmd = 0 // 重置，防止洪水
              tryDeliverToInbox(sid, payload.suggestion)
              Effect.runSync(
                Effect.all([
                  Ref.update(alerts, (a) => [...a, payload]),
                  bus.publish(AlignmentAlert, payload).pipe(Effect.catch(() => Effect.void)),
                  publishAlignmentDrift(bus, payload, "failed-cmd"),
                ]),
              )
            }
          } else if (nodeType === "action" && nodeStatus === "success") {
            stat.consecutiveFailedCmd = 0 // 成功一次就重置
          }
        }

        // 文件编辑/写入操作 → 检测偏离
        if ((event as any).type === "observability.trace_node") {
          const metadata = props?.metadata as Record<string, any> | undefined
          const filePath = metadata?.file as string | undefined
          const nodeName = props?.name as string | undefined
          if (filePath && (nodeName?.includes("write") || nodeName?.includes("edit"))) {
            stat.modifiedFiles.add(filePath)
            const goalMap = Effect.runSync(Ref.get(goals))
            const goal = goalMap.get(sid)
            const drifts = fileDriftsFromGoal(goal, stat.modifiedFiles)
            if (drifts.length >= DEFAULT_CONFIG.fileDriftThreshold) {
              const payload: AlignmentAlertPayload = {
                sessionID: sid,
                level: "warn",
                reason: `Agent 修改了 ${drifts.length} 个不在目标关键词范围内的文件`,
                files: drifts.slice(0, 10),
                suggestion: `修改可能偏离了原始目标。建议用户检查这些文件：${drifts.slice(0, 5).join(", ")}`,
                timestamp: Date.now(),
              }
              // 重置防止重复报警
              stat.modifiedFiles.clear()
              tryDeliverToInbox(sid, payload.suggestion)
              Effect.runSync(
                Effect.all([
                  Ref.update(alerts, (a) => [...a, payload]),
                  bus.publish(AlignmentAlert, payload).pipe(Effect.catch(() => Effect.void)),
                  publishAlignmentDrift(bus, payload, "file-drift"),
                ]),
              )
            }
          }
        }

        return Effect.void
      }),
    )

    // ---- API ----
    const registerGoal = (sessionID: string, condition: string) =>
      Ref.update(goals, (m) => {
        m.set(sessionID, condition)
        return m
      })

    const getAlerts = (_sessionID: string) => Ref.get(alerts)

    return { registerGoal, getAlerts } as Interface
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Bus.defaultLayer))

export * as AlignmentGuard from "./alignment-guard"
