/**
 * Mode Registry — 可插拔模式注册表
 *
 * 支持的模式：
 * - ask: 纯对话，无代码变更
 * - build: 标准开发模式
 * - plan: 规划模式，只读不写
 * - compose: 组合模式，技能注入
 * - max: 多候选模式
 * - loop: 循环执行模式
 */

import { Effect, Context, Layer } from "effect"
import { Log } from "@/util"

const log = Log.create({ service: "mode-registry" })

// ============================================================================
// 类型定义
// ============================================================================

export interface EvolutionConfig {
  /** 是否接入Judge审查 */
  judgeEnabled: boolean
  /** Judge检查项（为空则使用默认全量） */
  judgeChecks?: string[]
  /** 是否记录trace到DPO数据目录 */
  traceExportEnabled: boolean
  /** 是否触发进化学习 */
  evolutionEnabled: boolean
  /** 是否启用规范驱动开发 */
  specDrivenEnabled: boolean
  /** 规范注入策略：always=始终注入, on-match=匹配到规范时注入, manual=手动 */
  specInjection?: "always" | "on-match" | "manual"
}

export interface BuildContext {
  agent: { name: string }
  session: { id: string }
  messages: unknown[]
}

export interface ProcessContext {
  messages: unknown[]
  agent: { name: string }
  session: { id: string }
  [key: string]: unknown
}

export interface ExecuteContext {
  handle: unknown
  llm: unknown
  [key: string]: unknown
}

export interface ExecuteResult {
  continue: boolean
  output?: unknown
}

export interface ModeHandler {
  /** 模式标识符 */
  readonly id: string

  /** 是否启用 */
  readonly enabled?: boolean

  /** 系统提示注入（Compose/Plan用） */
  readonly buildSystemPrompt?: (ctx: BuildContext) => Effect.Effect<string>

  /** 预处理：修改消息/注入额外内容（Compose/Plan用） */
  readonly preprocess?: (ctx: ProcessContext) => Effect.Effect<ProcessContext>

  /** 核心执行（Max用，其他模式用默认handle.process） */
  readonly execute?: (ctx: ExecuteContext) => Effect.Effect<ExecuteResult>

  /** 数据流闭环配置 */
  readonly evolutionConfig?: EvolutionConfig
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_EVOLUTION_CONFIG: Record<string, EvolutionConfig> = {
  ask: {
    judgeEnabled: false,
    traceExportEnabled: false,
    evolutionEnabled: false,
    specDrivenEnabled: false,
  },
  build: {
    judgeEnabled: true,
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  plan: {
    judgeEnabled: true,
    judgeChecks: ["security", "relevance"],
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  compose: {
    judgeEnabled: true,
    judgeChecks: ["security", "completeness"],
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  max: {
    judgeEnabled: true,
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  loop: {
    judgeEnabled: true,
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
}

// ============================================================================
// Service 接口
// ============================================================================

export interface Interface {
  /** 注册模式处理器 */
  readonly register: (handler: ModeHandler) => Effect.Effect<void>

  /** 获取模式处理器 */
  readonly get: (modeId: string) => Effect.Effect<ModeHandler | undefined>

  /** 获取所有模式处理器 */
  readonly getAll: () => Effect.Effect<ModeHandler[]>

  /** 获取模式的EvolutionConfig */
  readonly getEvolutionConfig: (modeId: string) => Effect.Effect<EvolutionConfig>

  /** 检查模式是否启用Judge */
  readonly isJudgeEnabled: (modeId: string) => Effect.Effect<boolean>

  /** 检查模式是否启用Trace导出 */
  readonly isTraceExportEnabled: (modeId: string) => Effect.Effect<boolean>

  /** 检查模式是否启用规范驱动 */
  readonly isSpecDrivenEnabled: (modeId: string) => Effect.Effect<boolean>

  /** 获取模式的规范注入策略 */
  readonly getSpecInjectionStrategy: (modeId: string) => Effect.Effect<"always" | "on-match" | "manual">
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ModeRegistry") {}

// ============================================================================
// 实现
// ============================================================================

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const handlers = new Map<string, ModeHandler>()

    // 注册默认模式
    const defaultModes: ModeHandler[] = [
      { id: "ask", enabled: true },
      { id: "build", enabled: true },
      { id: "plan", enabled: true },
      { id: "compose", enabled: true },
      { id: "max", enabled: true },
      { id: "loop", enabled: true },
    ]

    for (const mode of defaultModes) {
      handlers.set(mode.id, mode)
    }

    const register = Effect.fn("ModeRegistry.register")(function* (handler: ModeHandler) {
      log.info("mode.registered", { id: handler.id })
      handlers.set(handler.id, handler)
    })

    const get = Effect.fn("ModeRegistry.get")(function* (modeId: string) {
      return handlers.get(modeId)
    })

    const getAll = Effect.fn("ModeRegistry.getAll")(function* () {
      return Array.from(handlers.values())
    })

    const getEvolutionConfig = Effect.fn("ModeRegistry.getEvolutionConfig")(function* (modeId: string) {
      const handler = handlers.get(modeId)
      return handler?.evolutionConfig ?? DEFAULT_EVOLUTION_CONFIG[modeId] ?? DEFAULT_EVOLUTION_CONFIG.build!
    })

    const isJudgeEnabled = Effect.fn("ModeRegistry.isJudgeEnabled")(function* (modeId: string) {
      const config = yield* getEvolutionConfig(modeId)
      return config.judgeEnabled
    })

    const isTraceExportEnabled = Effect.fn("ModeRegistry.isTraceExportEnabled")(function* (modeId: string) {
      const config = yield* getEvolutionConfig(modeId)
      return config.traceExportEnabled
    })

    const isSpecDrivenEnabled = Effect.fn("ModeRegistry.isSpecDrivenEnabled")(function* (modeId: string) {
      const config = yield* getEvolutionConfig(modeId)
      return config.specDrivenEnabled
    })

    const getSpecInjectionStrategy = Effect.fn("ModeRegistry.getSpecInjectionStrategy")(function* (modeId: string) {
      const config = yield* getEvolutionConfig(modeId)
      return config.specInjection ?? "on-match"
    })

    return { register, get, getAll, getEvolutionConfig, isJudgeEnabled, isTraceExportEnabled, isSpecDrivenEnabled, getSpecInjectionStrategy }
  })
)

export const defaultLayer = layer

export * as ModeRegistry from "./mode-registry"
