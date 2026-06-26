import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Command,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  LspStatus,
  McpStatus,
} from "@mimo-ai/sdk/v2"
import { createStore, produce, reconcile } from "solid-js/store"
import { useSDK } from "./sdk"
import { createSimpleContext } from "./helper"
import { batch, onMount } from "solid-js"
import * as trace from "../trace"

type BinarySearchResult = { found: true; index: number } | { found: false; index: number }

function binarySearch<T>(arr: T[], key: string, getKey: (item: T) => string): BinarySearchResult {
  if (arr.length === 0) return { found: false, index: 0 }
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const item = arr[mid]!
    const cmp = getKey(item).localeCompare(key)
    if (cmp === 0) return { found: true, index: mid }
    if (cmp < 0) lo = mid + 1
    else hi = mid - 1
  }
  return { found: false, index: lo }
}

export type Task = {
  id: string
  sessionID: string
  summary: string
  status: string
  parentID?: string
}

export type ActorEntry = {
  actor_id: string
  session_id: string
  mode: "subagent" | "peer" | "main"
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "unknown"
  agent: string
  description: string
  parent_actor_id: string | null
  time_created: number
  time_updated: number
  turn_count: number
  last_turn_time: number | null
}

function actorStatusFromEvent(
  s: "pending" | "running" | "idle",
  outcome: "success" | "failure" | "cancelled" | undefined,
): ActorEntry["status"] {
  if (s === "pending") return "pending"
  if (s === "running") return "running"
  if (outcome === "success") return "completed"
  if (outcome === "failure") return "failed"
  if (outcome === "cancelled") return "cancelled"
  return "unknown"
}

export function bucketMessages<M extends { agentID?: string | null }>(msgs: M[]): Record<string, M[]> {
  const out: Record<string, M[]> = {}
  for (const m of msgs) {
    const k = m.agentID ?? "main"
    if (!out[k]) out[k] = []
    out[k].push(m)
  }
  return out
}

export const { use: useSync, provider: SyncProvider } = createSimpleContext({
  name: "Sync",
  init: () => {
    const sdk = useSDK()

    const [store, setStore] = createStore<{
      status: "loading" | "partial" | "complete"
      provider: Provider[]
      agent: Agent[]
      command: Command[]
      config: Config
      session: Session[]
      session_status: { [sessionID: string]: SessionStatus }
      session_goal: {
        [sessionID: string]: {
          condition?: string
          verdicts: Record<string, { ok: boolean; impossible?: boolean; reason: string; attempt: number; error?: boolean }>
          lastMessageID?: string
        }
      }
      session_diff: { [sessionID: string]: any[] }
      session_cwd: { [sessionID: string]: string }
      todo: { [sessionID: string]: Todo[] }
      task: { [sessionID: string]: Task[] }
      message: { [sessionID: string]: { [agentID: string]: Message[] } }
      part: { [messageID: string]: Part[] }
      permission: { [sessionID: string]: PermissionRequest[] }
      question: { [sessionID: string]: QuestionRequest[] }
      lsp: LspStatus[]
      mcp: { [key: string]: McpStatus }
      instructions: string[]
      vcs: { branch: string | undefined } | undefined
      actor: { [sessionID: string]: ActorEntry[] }
      workflow: { [runID: string]: any }
    }>({
      status: "loading",
      agent: [],
      command: [],
      config: {},
      session: [],
      session_status: {},
      session_goal: {},
      session_diff: {},
      session_cwd: {},
      todo: {},
      task: {},
      message: {},
      part: {},
      permission: {},
      question: {},
      provider: [],
      lsp: [],
      mcp: {},
      instructions: [],
      vcs: undefined,
      actor: {},
      workflow: {},
    })

    const fullSyncedSessions = new Set<string>()

    sdk.subscribe((event) => {
      const { type, properties } = event.payload as any
      switch (type) {
        case "permission.replied": {
          const requests = store.permission[properties.sessionID]
          if (!requests) break
          const match = binarySearch(requests, properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "permission",
            properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "permission.asked": {
          const request = properties
          const requests = store.permission[request.sessionID]
          if (!requests) {
            setStore("permission", request.sessionID, [request])
            break
          }
          const match = binarySearch(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("permission", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "permission",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "question.replied":
        case "question.rejected": {
          const requests = store.question[properties.sessionID]
          if (!requests) break
          const match = binarySearch(requests, properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "question",
            properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "question.asked": {
          const request = properties
          const requests = store.question[request.sessionID]
          if (!requests) {
            setStore("question", request.sessionID, [request])
            break
          }
          const match = binarySearch(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("question", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "question",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "todo.updated":
          setStore("todo", properties.sessionID, properties.todos)
          break

        case "task.created": {
          const { sessionID, task } = properties
          const list = store.task[sessionID]
          if (!list) {
            setStore("task", sessionID, [task])
            break
          }
          const idx = list.findIndex((t) => t.id === task.id)
          setStore(
            "task",
            sessionID,
            produce((draft) => {
              if (idx >= 0) draft[idx] = task
              else draft.push(task)
            }),
          )
          break
        }

        case "task.updated": {
          const { sessionID, task } = properties
          const list = store.task[sessionID]
          if (!list) {
            setStore("task", sessionID, [task])
            break
          }
          const idx = list.findIndex((t) => t.id === task.id)
          if (idx < 0) {
            setStore(
              "task",
              sessionID,
              produce((draft) => {
                draft.push(task)
              }),
            )
            break
          }
          setStore("task", sessionID, idx, reconcile(task))
          break
        }

        case "session.diff":
          setStore("session_diff", properties.sessionID, properties.diff)
          break

        case "session.cwd":
          setStore("session_cwd", properties.sessionID, properties.cwd)
          break

        case "session.deleted": {
          const result = binarySearch(store.session, properties.info.id, (s) => s.id)
          if (result.found) {
            setStore(
              "session",
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }

        case "session.updated": {
          const result = binarySearch(store.session, properties.info.id, (s) => s.id)
          if (result.found) {
            setStore("session", result.index, reconcile(properties.info))
            break
          }
          setStore(
            "session",
            produce((draft) => {
              draft.splice(result.index, 0, properties.info)
            }),
          )
          break
        }

        case "session.status":
          setStore("session_status", properties.sessionID, properties.status)
          break

        case "session.goal": {
          setStore("session_goal", properties.sessionID, (prev) => {
            const verdicts = { ...(prev?.verdicts ?? {}) }
            const v = properties.lastVerdict
            let lastMessageID = prev?.lastMessageID
            if (v?.messageID) {
              verdicts[v.messageID] = {
                ok: v.ok,
                impossible: v.impossible,
                reason: v.reason,
                attempt: v.attempt,
                error: v.error,
              }
              lastMessageID = v.messageID
            }
            return {
              condition: properties.goal?.condition,
              verdicts,
              lastMessageID,
            }
          })
          break
        }

        case "message.updated": {
          const sid = properties.info.sessionID
          const aid = properties.info.agentID ?? "main"
          if (!store.message[sid]) {
            setStore("message", sid, { [aid]: [properties.info] })
            break
          }
          if (!store.message[sid][aid]) {
            setStore("message", sid, aid, [properties.info])
            break
          }
          const messages = store.message[sid][aid]
          const result = binarySearch(messages, properties.info.id, (m) => m.id)
          if (result.found) {
            setStore("message", sid, aid, result.index, reconcile(properties.info))
            break
          }
          setStore(
            "message",
            sid,
            aid,
            produce((draft) => {
              draft.splice(result.index, 0, properties.info)
            }),
          )
          const updated = store.message[sid][aid]
          if (updated.length > 100) {
            const oldest = updated[0]
            if (oldest) {
              batch(() => {
                setStore(
                  "message",
                  sid,
                  aid,
                  produce((draft) => {
                    draft.shift()
                  }),
                )
                setStore(
                  "part",
                  produce((draft) => {
                    delete draft[oldest.id]
                  }),
                )
              })
            }
          }
          break
        }

        case "message.removed": {
          const sid = properties.sessionID
          const buckets = store.message[sid]
          if (!buckets) break
          for (const aid of Object.keys(buckets)) {
            const messages = buckets[aid]
            if (!messages) continue
            const result = binarySearch(messages, properties.messageID, (m) => m.id)
            if (result.found) {
              setStore(
                "message",
                sid,
                aid,
                produce((draft) => {
                  draft.splice(result.index, 1)
                }),
              )
              break
            }
          }
          break
        }

        case "message.part.updated": {
          const parts = store.part[properties.part.messageID]
          if (!parts) {
            setStore("part", properties.part.messageID, [properties.part])
            break
          }
          const result = binarySearch(parts, properties.part.id, (p) => p.id)
          if (result.found) {
            setStore("part", properties.part.messageID, result.index, reconcile(properties.part))
            break
          }
          setStore(
            "part",
            properties.part.messageID,
            produce((draft) => {
              draft.splice(result.index, 0, properties.part)
            }),
          )
          break
        }

        case "message.part.delta": {
          const parts = store.part[properties.messageID]
          if (!parts) break
          const result = binarySearch(parts, properties.partID, (p) => p.id)
          if (!result.found) break
          setStore(
            "part",
            properties.messageID,
            produce((draft) => {
              const part = draft[result.index]
              if (!part) return
              const field = properties.field as keyof typeof part
              const existing = part[field] as string | undefined
              ;(part[field] as string) = (existing ?? "") + properties.delta
            }),
          )
          break
        }

        case "message.part.removed": {
          const parts = store.part[properties.messageID]
          if (!parts) break
          const result = binarySearch(parts, properties.partID, (p) => p.id)
          if (result.found)
            setStore(
              "part",
              properties.messageID,
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          break
        }

        case "tui.instructions.loaded":
          setStore("instructions", reconcile(properties.files))
          break

        case "lsp.updated":
          void sdk.client.lsp.status().then((x) => setStore("lsp", x.data ?? []))
          break

        case "vcs.branch.updated":
          setStore("vcs", { branch: (properties as any).branch })
          break

        case "actor.registered": {
          const sid = properties.sessionID
          const list = store.actor[sid] ?? []
          if (list.find((a) => a.actor_id === properties.actorID)) break
          const entry: ActorEntry = {
            actor_id: properties.actorID,
            session_id: properties.sessionID,
            mode: properties.mode as ActorEntry["mode"],
            status: "pending",
            agent: properties.agent,
            description: properties.description,
            parent_actor_id: properties.parentActorID ?? null,
            time_created: Date.now(),
            time_updated: Date.now(),
            turn_count: 0,
            last_turn_time: null,
          }
          setStore("actor", sid, [...list, entry].toSorted((a, b) => a.time_created - b.time_created))
          break
        }

        case "actor.status": {
          const sid = properties.sessionID
          const list = store.actor[sid] ?? []
          const idx = list.findIndex((a) => a.actor_id === properties.actorID)
          if (idx === -1) break
          setStore("actor", sid, idx, {
            status: actorStatusFromEvent(properties.status, properties.lastOutcome),
            turn_count: properties.turnCount,
            last_turn_time: properties.lastTurnTime,
            time_updated: Date.now(),
          })
          break
        }

        case "workflow.started":
          setStore("workflow", properties.runID, {
            runID: properties.runID,
            sessionID: properties.sessionID,
            name: properties.name,
            status: "running",
            running: 0,
            succeeded: 0,
            failed: 0,
          })
          break

        case "workflow.phase":
          if (!store.workflow[properties.runID]) break
          setStore("workflow", properties.runID, "currentPhase", properties.title)
          break

        case "workflow.finished":
          if (!store.workflow[properties.runID]) break
          setStore("workflow", properties.runID, "status", properties.status)
          break
      }
    })

    async function bootstrap() {
      trace.emit("session.create", "info", "Sync bootstrap starting")
      const start = Date.now() - 30 * 24 * 60 * 60 * 1000

      const blockingRequests = Promise.all([
        sdk.client.provider.list().then((x) => x.data ?? []),
        sdk.client.app.agents().then((x) => x.data ?? []),
        sdk.client.config.get().then((x) => x.data ?? {}),
        sdk.client.session.list({ start }).then((x) =>
          (x.data ?? []).toSorted((a: Session, b: Session) => a.id.localeCompare(b.id)),
        ),
      ])

      await blockingRequests
        .then(([providers, agents, config, sessions]) => {
          batch(() => {
            setStore("provider", reconcile(providers as Provider[]))
            setStore("agent", reconcile(agents))
            setStore("config", reconcile(config as Config))
            setStore("session", reconcile(sessions))
          })
        })
        .then(() => {
          setStore("status", "partial")
          trace.emit("session.created", "info", "Sync bootstrap partial", { providers: store.provider.length, sessions: store.session.length })
          void Promise.all([
            sdk.client.command.list().then((x) => setStore("command", reconcile(x.data ?? []))),
            sdk.client.lsp.status().then((x) => setStore("lsp", reconcile(x.data ?? []))),
            sdk.client.mcp.status().then((x) => setStore("mcp", reconcile(x.data ?? {}))),
            sdk.client.session.status().then((x) => setStore("session_status", reconcile(x.data ?? {}))),
            sdk.client.vcs.get().then((x) => setStore("vcs", reconcile(x.data as any))),
          ]).then(() => {
            setStore("status", "complete")
            trace.emit("session.created", "info", "Sync bootstrap complete")
          })
        })
        .catch((e) => {
          trace.emit("session.error", "error", "Sync bootstrap failed", { error: String(e) })
          console.error("Sync bootstrap failed", e)
        })
    }

    onMount(() => {
      void bootstrap()
    })

    return {
      data: store,
      set: setStore,
      get status() {
        return store.status
      },
      get ready() {
        return store.status !== "loading"
      },
      session: {
        get(sessionID: string) {
          const match = binarySearch(store.session, sessionID, (s) => s.id)
          if (match.found) return store.session[match.index]
          return undefined
        },
        async refresh() {
          const start = Date.now() - 30 * 24 * 60 * 60 * 1000
          const list = await sdk.client.session
            .list({ start })
            .then((x) => (x.data ?? []).toSorted((a: Session, b: Session) => a.id.localeCompare(b.id)))
          setStore("session", reconcile(list))
        },
        status(sessionID: string) {
          const session = store.session_status[sessionID]
          if (session) return session.type
          return "idle"
        },
        async sync(sessionID: string) {
          if (fullSyncedSessions.has(sessionID)) return
          const [session, messages, todo, diff, actors, task] = await Promise.all([
            sdk.client.session.get({ sessionID }),
            sdk.client.session.messages({ sessionID, limit: 100, agent_id: "*" }),
            sdk.client.session.todo({ sessionID }),
            sdk.client.session.diff({ sessionID }),
            sdk.client.session.actors({ sessionID }),
            sdk.client.session.task({ sessionID }),
          ])
          setStore(
            produce((draft) => {
              const match = binarySearch(draft.session, sessionID, (s) => s.id)
              if (match.found) draft.session[match.index] = session.data!
              if (!match.found) draft.session.splice(match.index, 0, session.data!)
              draft.todo[sessionID] = todo.data ?? []
              draft.task[sessionID] = ((task.data ?? []) as unknown as Task[])
              const msgData = (messages.data ?? []) as any[]
              const flat = msgData.map((x) => x.info)
              draft.message[sessionID] = bucketMessages(flat)
              for (const message of msgData) {
                draft.part[message.info.id] = message.parts
              }
              draft.session_diff[sessionID] = (diff.data ?? []) as any[]
              draft.actor[sessionID] = ((actors.data ?? []) as any[]).map(
                (row): ActorEntry => ({
                  actor_id: row.actorID,
                  session_id: row.sessionID,
                  mode: row.mode,
                  status: actorStatusFromEvent(row.status, row.lastOutcome),
                  agent: row.agent,
                  description: row.description,
                  parent_actor_id: row.parentActorID ?? null,
                  time_created: row.time?.created ?? Date.now(),
                  time_updated: row.time?.updated ?? Date.now(),
                  turn_count: row.turnCount ?? 0,
                  last_turn_time: row.lastTurnTime ?? null,
                }),
              )
            }),
          )
          fullSyncedSessions.add(sessionID)
        },
      },
      bootstrap,
    }
  },
})
