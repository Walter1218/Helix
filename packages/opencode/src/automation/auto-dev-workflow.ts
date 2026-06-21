import { Context, Effect, Layer } from "effect"
import { Config } from "@/config"
import { TokenTracker } from "@/token/tracker"
import { RequirementAnalyzer, type Requirement, type ProjectGoal, type ProjectState } from "./requirement-analyzer"
import { ComplexityEstimator } from "./complexity-estimator"
import { TokenScheduler, type ScheduleOutput, type ScheduleStrategy } from "./token-scheduler"
import { Log } from "@/util"
import { Bus } from "@/bus"

const log = Log.create({ service: "auto-dev-workflow" })

export type SessionStatus = "idle" | "analyzing" | "scheduling" | "executing" | "paused" | "completed" | "failed"

export interface AutoDevSession {
  session_id: string
  date: string
  start_time: number
  status: SessionStatus
  budget: {
    total: number
    used: number
    remaining: number
  }
  project_state: ProjectState | null
  goals: ProjectGoal | null
  schedule: ScheduleOutput | null
  tasks_planned: number
  tasks_completed: number
  tasks_failed: number
  current_task_id: string | null
  error: string | null
}

export interface AutoDevConfig {
  enabled: boolean
  daily_budget: number
  strategy: ScheduleStrategy
  max_concurrent_tasks: number
  auto_commit: boolean
  require_approval: boolean
}

export interface Interface {
  readonly analyzeAndPlan: (projectPath?: string) => Effect.Effect<AutoDevSession>
  readonly executePlan: () => Effect.Effect<AutoDevSession>
  readonly pause: () => Effect.Effect<void>
  readonly resume: () => Effect.Effect<void>
  readonly stop: () => Effect.Effect<void>
  readonly getStatus: () => Effect.Effect<AutoDevSession | null>
  readonly getHistory: (days?: number) => Effect.Effect<AutoDevSession[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AutoDevWorkflow") {}

let currentSession: AutoDevSession | null = null

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const tokenTracker = yield* TokenTracker.Service
    const requirementAnalyzer = yield* RequirementAnalyzer.Service
    const complexityEstimator = yield* ComplexityEstimator.Service
    const tokenScheduler = yield* TokenScheduler.Service
    const bus = yield* Bus.Service

    const analyzeAndPlan = Effect.fn("AutoDevWorkflow.analyzeAndPlan")(function* (projectPath?: string) {
      const cfg = yield* config.get()
      const dailyLimit = cfg.token_budget?.daily_limit ?? 0
      const strategy = "priority_first" as ScheduleStrategy

      const sessionId = `autodev_${Date.now()}`
      const today = new Date().toISOString().slice(0, 10)

      log.info("starting analysis and planning", { sessionId, projectPath })

      currentSession = {
        session_id: sessionId,
        date: today,
        start_time: Date.now(),
        status: "analyzing",
        budget: { total: dailyLimit, used: 0, remaining: dailyLimit },
        project_state: null,
        goals: null,
        schedule: null,
        tasks_planned: 0,
        tasks_completed: 0,
        tasks_failed: 0,
        current_task_id: null,
        error: null,
      }

      try {
        const projectState = yield* requirementAnalyzer.analyzeProject(projectPath)
        currentSession.project_state = projectState
        currentSession.status = "analyzing"

        const goals = yield* requirementAnalyzer.loadGoals(projectPath)
        currentSession.goals = goals

        const requirements = yield* requirementAnalyzer.identifyRequirements(projectState, goals)
        const prioritized = yield* requirementAnalyzer.prioritizeRequirements(requirements)

        currentSession.status = "scheduling"

        const budgetInfo = yield* tokenTracker.getDailyBudget()
        const remaining = dailyLimit > 0 ? Math.max(0, dailyLimit - budgetInfo.used) : 0

        const schedule = yield* tokenScheduler.schedule({
          requirements: prioritized,
          daily_budget: remaining > 0 ? remaining : dailyLimit,
          strategy,
        })

        currentSession.schedule = schedule
        currentSession.tasks_planned = schedule.stats.tasks_selected
        currentSession.budget = {
          total: dailyLimit,
          used: budgetInfo.used,
          remaining: schedule.stats.remaining_budget,
        }
        currentSession.status = "idle"

        log.info("analysis and planning complete", {
          sessionId,
          tasksPlanned: schedule.stats.tasks_selected,
          tasksDeferred: schedule.stats.tasks_deferred,
          budgetAllocated: schedule.stats.total_allocated,
        })
      } catch (e) {
        currentSession.status = "failed"
        currentSession.error = String(e)
        log.error("analysis failed", { error: String(e) })
      }

      return currentSession
    })

    const executePlan = Effect.fn("AutoDevWorkflow.executePlan")(function* () {
      if (!currentSession || !currentSession.schedule) {
        log.warn("no active session or schedule")
        return currentSession!
      }

      currentSession.status = "executing" as SessionStatus

      const tasks = currentSession.schedule.selected_tasks
      log.info("executing plan", { tasks: tasks.length })

      for (const task of tasks) {
        const status = currentSession.status as SessionStatus
        if (status === "paused" || status === "failed") break

        currentSession.current_task_id = task.requirement.id

        try {
          log.info("executing task", {
            id: task.requirement.id,
            title: task.requirement.title,
            allocated: task.allocated_tokens,
          })

          yield* tokenTracker.recordUsage({
            session_id: currentSession.session_id,
            task_id: task.requirement.id,
            model_id: "planning",
            provider_id: "internal",
            input_tokens: Math.round(task.token_estimate.planning * 0.7),
            output_tokens: Math.round(task.token_estimate.planning * 0.3),
            purpose: "planning",
          })

          currentSession.tasks_completed++
          currentSession.budget.used += task.allocated_tokens
        } catch (e) {
          currentSession.tasks_failed++
          log.error("task execution failed", { taskId: task.requirement.id, error: String(e) })
        }
      }

      currentSession.status = currentSession.tasks_failed > 0 ? "failed" : "completed"
      currentSession.current_task_id = null

      log.info("plan execution complete", {
        completed: currentSession.tasks_completed,
        failed: currentSession.tasks_failed,
      })

      return currentSession
    })

    const pause = Effect.fn("AutoDevWorkflow.pause")(function* () {
      if (currentSession && (currentSession.status as SessionStatus) === "executing") {
        currentSession.status = "paused" as SessionStatus
        log.info("workflow paused")
      }
    })

    const resume = Effect.fn("AutoDevWorkflow.resume")(function* () {
      if (currentSession && (currentSession.status as SessionStatus) === "paused") {
        currentSession.status = "executing" as SessionStatus
        log.info("workflow resumed")
      }
    })

    const stop = Effect.fn("AutoDevWorkflow.stop")(function* () {
      if (currentSession) {
        currentSession.status = "failed" as SessionStatus
        currentSession.error = "stopped by user"
        log.info("workflow stopped")
      }
    })

    const getStatus = Effect.fn("AutoDevWorkflow.getStatus")(function* () {
      return currentSession
    })

    const getHistory = Effect.fn("AutoDevWorkflow.getHistory")(function* (days?: number) {
      return currentSession ? [currentSession] : []
    })

    return Service.of({
      analyzeAndPlan,
      executePlan,
      pause,
      resume,
      stop,
      getStatus,
      getHistory,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(TokenTracker.defaultLayer),
    Layer.provide(RequirementAnalyzer.defaultLayer),
    Layer.provide(ComplexityEstimator.defaultLayer),
    Layer.provide(TokenScheduler.defaultLayer),
  ),
)

export * as AutoDevWorkflow from "./auto-dev-workflow"
