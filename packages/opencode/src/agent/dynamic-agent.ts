/**
 * DynamicAgent — 动态Persona生成
 *
 * 功能：
 * - 根据任务和spec生成Persona（含system prompt）
 * - 注入内存
 *
 * Persona内容：
 * - system prompt：任务特定的系统提示
 * - 工具白名单：允许使用的工具（可选）
 * - 约束条件：任务特定的约束
 */

import { Effect, Context, Layer } from "effect"
import { Log } from "@/util"

const log = Log.create({ service: "dynamic-agent" })

// ============================================================================
// 类型定义
// ============================================================================

export interface TaskInfo {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly spec?: string
}

export interface Persona {
  readonly id: string
  readonly name: string
  readonly systemPrompt: string
  readonly toolAllowlist?: string[]
  readonly constraints?: string[]
  readonly metadata?: Record<string, unknown>
}

export interface DynamicAgentConfig {
  /** 是否启用动态Persona */
  enabled: boolean
  /** system prompt最大长度 */
  maxPromptLength: number
  /** 是否自动注入内存 */
  autoInjectMemory: boolean
}

const DEFAULT_CONFIG: DynamicAgentConfig = {
  enabled: true,
  maxPromptLength: 4000,
  autoInjectMemory: true,
}

// ============================================================================
// Service 接口
// ============================================================================

export interface Interface {
  /** 根据任务生成Persona */
  readonly generate: (task: TaskInfo) => Effect.Effect<Persona>

  /** 注入内存 */
  readonly injectMemory: (persona: Persona) => Effect.Effect<void>

  /** 获取配置 */
  readonly getConfig: () => Effect.Effect<DynamicAgentConfig>

  /** 更新配置 */
  readonly updateConfig: (config: Partial<DynamicAgentConfig>) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/DynamicAgent") {}

// ============================================================================
// 实现
// ============================================================================

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const configRef = yield* Effect.sync(() => ({ ...DEFAULT_CONFIG }))

    const generate = Effect.fn("DynamicAgent.generate")(function* (task: TaskInfo) {
      log.info("dynamic-agent.generate", { taskId: task.id })

      const config = { ...configRef }

      if (!config.enabled) {
        log.info("dynamic-agent.disabled", { taskId: task.id })
        return createDefaultPersona(task)
      }

      // 基于任务生成system prompt
      const systemPrompt = generateSystemPrompt(task, config.maxPromptLength)

      // 基于spec提取约束
      const constraints = extractConstraints(task.spec)

      const persona: Persona = {
        id: `persona-${task.id}-${Date.now()}`,
        name: `Agent for ${task.title}`,
        systemPrompt,
        constraints,
        metadata: {
          taskId: task.id,
          generatedAt: Date.now(),
        },
      }

      log.info("dynamic-agent.generated", {
        taskId: task.id,
        personaId: persona.id,
        promptLength: systemPrompt.length,
      })

      return persona
    })

    const injectMemory = Effect.fn("DynamicAgent.injectMemory")(function* (persona: Persona) {
      log.info("dynamic-agent.inject-memory", { personaId: persona.id })

      // 简化版：记录到日志
      // 实际应注入到记忆系统
      log.info("dynamic-agent.memory.injected", {
        personaId: persona.id,
        promptLength: persona.systemPrompt.length,
        constraintCount: persona.constraints?.length ?? 0,
      })
    })

    const getConfig = Effect.fn("DynamicAgent.getConfig")(function* () {
      return { ...configRef }
    })

    const updateConfig = Effect.fn("DynamicAgent.updateConfig")(function* (newConfig: Partial<DynamicAgentConfig>) {
      Object.assign(configRef, newConfig)
      log.info("dynamic-agent.config.updated", newConfig)
    })

    return { generate, injectMemory, getConfig, updateConfig }
  })
)

export const defaultLayer = layer

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建默认Persona
 */
function createDefaultPersona(task: TaskInfo): Persona {
  return {
    id: `persona-default-${task.id}`,
    name: `Default Agent`,
    systemPrompt: "You are a helpful coding assistant.",
    metadata: {
      taskId: task.id,
      isDefault: true,
    },
  }
}

/**
 * 基于任务生成system prompt
 */
function generateSystemPrompt(task: TaskInfo, maxLength: number): string {
  const sections: string[] = []

  // 角色定义
  sections.push(`You are an expert software engineer working on the following task:`)

  // 任务描述
  sections.push(`## Task\n${task.title}\n${task.description}`)

  // Spec内容（如果有）
  if (task.spec) {
    const specSummary = task.spec.slice(0, 500)
    sections.push(`## Requirements\n${specSummary}`)
  }

  // 约束
  sections.push(`## Constraints\n- Follow existing code patterns\n- Write tests for new code\n- Ensure type safety`)

  const fullPrompt = sections.join("\n\n")

  // 截断到最大长度
  if (fullPrompt.length > maxLength) {
    return fullPrompt.slice(0, maxLength - 3) + "..."
  }

  return fullPrompt
}

/**
 * 从spec中提取约束
 */
function extractConstraints(spec?: string): string[] {
  if (!spec) return []

  const constraints: string[] = []

  // 提取 "SHALL" 或 "MUST" 要求
  const shallMatches = spec.match(/.*SHALL.*/g) ?? []
  const mustMatches = spec.match(/.*MUST.*/g) ?? []

  constraints.push(...shallMatches.slice(0, 3).map(m => m.trim()))
  constraints.push(...mustMatches.slice(0, 3).map(m => m.trim()))

  return constraints
}

export * as DynamicAgent from "./dynamic-agent"
