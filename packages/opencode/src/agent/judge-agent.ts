/**
 * JudgeAgent — 裁判智能体
 *
 * 只读权限的对抗节点，用于：
 * 1. 审批并驳回执行智能体的"偷懒/破坏性"修改请求
 * 2. 接管测试用例修改权限（Request_Goal_Revision）
 * 3. 防止执行智能体通过删减断言来"骗过"测试
 *
 * @module agent/judge-agent
 */

// ── Types ────────────────────────────────────────────────────

/** 审查请求 */
export interface ReviewRequest {
  /** 请求来源（执行智能体 ID） */
  readonly actorID: string
  /** 请求类型 */
  readonly requestType: "goal_revision" | "test_modification" | "assertion_change"
  /** 原始测试用例 */
  readonly originalTest: string
  /** 修改建议 */
  readonly suggestedChange: string
  /** 修改理由 */
  readonly reason: string
  /** 上下文（错误信息、代码变更等） */
  readonly context: {
    readonly error?: string
    readonly codeDiff?: string
    readonly testOutput?: string
  }
}

/** 审查结果 */
export interface ReviewResult {
  /** 是否批准 */
  readonly approved: boolean
  /** 决策理由 */
  readonly rationale: string
  /** 如果批准，返回修改后的测试（可能与建议不同） */
  readonly modifiedTest?: string
  /** 如果驳回，给出具体改进建议 */
  readonly suggestions?: string[]
}

/** JudgeAgent 配置 */
export interface JudgeAgentConfig {
  /** 是否启用严格模式（禁止任何断言删除） */
  readonly strictMode: boolean
  /** 最大允许的断言变更比例（0-1） */
  readonly maxAssertionReduction: number
  /** 是否允许修改测试结构 */
  readonly allowStructuralChanges: boolean
}

// ── Heuristic Checks ────────────────────────────────────────

/** 检测断言删除 */
const checkAssertionReduction = (
  original: string,
  suggested: string,
  maxReduction: number,
): { valid: boolean; reason?: string } => {
  // 提取断言行（以 expect/assert 开头的行）
  const extractAssertions = (code: string) => {
    const lines = code.split("\n")
    return lines.filter((line) => {
      const trimmed = line.trim()
      return (
        trimmed.startsWith("expect(") ||
        trimmed.startsWith("assert.") ||
        trimmed.startsWith("assert(") ||
        trimmed.includes("expect(") ||
        trimmed.includes(".toBe(") ||
        trimmed.includes(".toEqual(") ||
        trimmed.includes(".toEqualWithRoundingTolerance(")
      )
    })
  }

  const originalAssertions = extractAssertions(original)
  const suggestedAssertions = extractAssertions(suggested)

  if (originalAssertions.length === 0) return { valid: true }

  const reduction = 1 - suggestedAssertions.length / originalAssertions.length

  if (reduction > maxReduction) {
    return {
      valid: false,
      reason: `断言数量减少了 ${Math.round(reduction * 100)}%（允许最大 ${Math.round(maxReduction * 100)}%）。这可能是"偷懒"行为。`,
    }
  }

  return { valid: true }
}

/** 检测结构变更 */
const checkStructuralChange = (
  original: string,
  suggested: string,
  allowStructuralChanges: boolean,
): { valid: boolean; reason?: string } => {
  if (!allowStructuralChanges) {
    // 检查是否删除了整个测试用例
    const testBlocks = (code: string) => {
      const matches = code.match(/(?:test|it|describe)\s*\(/g)
      return matches ? matches.length : 0
    }

    const originalTests = testBlocks(original)
    const suggestedTests = testBlocks(suggested)

    if (suggestedTests < originalTests) {
      return {
        valid: false,
        reason: `测试用例数量减少（${originalTests} → ${suggestedTests}）。删除测试用例是禁止的。`,
      }
    }
  }

  return { valid: true }
}

/** 检测是否仅简化了断言 */
const checkTrivialization = (original: string, suggested: string): { valid: boolean; reason?: string } => {
  // 检查是否将具体值替换为通用值（如 toBe(true) → toBeTruthy()）
  const trivialPatterns = [
    { from: /\.toBe\(.*\)/, to: /\.toBeTruthy\(\)/, desc: "将具体值断言替换为 truthy 断言" },
    { from: /\.toEqual\(.*\)/, to: /\.toBeDefined\(\)/, desc: "将具体值断言替换为 defined 断言" },
    { from: /\.toHaveLength\(.*\)/, to: /\.toBeDefined\(\)/, desc: "将长度断言替换为 defined 断言" },
  ]

  for (const pattern of trivialPatterns) {
    const originalMatches = original.match(pattern.from)
    const suggestedMatches = suggested.match(pattern.to)
    if (originalMatches && suggestedMatches) {
      return {
        valid: false,
        reason: pattern.desc + "。这是降低测试质量的行为。",
      }
    }
  }

  return { valid: true }
}

// ── Judge Agent Factory ─────────────────────────────────────

/**
 * 创建 JudgeAgent 实例
 *
 * JudgeAgent 是一个纯函数式的审查器，不依赖外部服务
 */
export const make = (config: Partial<JudgeAgentConfig> = {}) => {
  const cfg: JudgeAgentConfig = {
    strictMode: true,
    maxAssertionReduction: 0.3,
    allowStructuralChanges: false,
    ...config,
  }

  /** 快速审查（仅启发式） */
  const quickReview = (request: ReviewRequest): ReviewResult => {
    const assertionCheck = checkAssertionReduction(request.originalTest, request.suggestedChange, cfg.maxAssertionReduction)
    if (!assertionCheck.valid) {
      return {
        approved: false,
        rationale: assertionCheck.reason!,
        suggestions: ["恢复被删除的断言", "如果断言确实有误，请说明具体原因"],
      }
    }

    const structuralCheck = checkStructuralChange(request.originalTest, request.suggestedChange, cfg.allowStructuralChanges)
    if (!structuralCheck.valid) {
      return {
        approved: false,
        rationale: structuralCheck.reason!,
        suggestions: ["不得删除测试用例", "如果测试用例过时，请标记为 skipped 而非删除"],
      }
    }

    const trivialCheck = checkTrivialization(request.originalTest, request.suggestedChange)
    if (!trivialCheck.valid) {
      return {
        approved: false,
        rationale: trivialCheck.reason!,
        suggestions: ["保持原有的具体值断言", "如果预期值确实有变化，请使用新的正确值"],
      }
    }

    return {
      approved: true,
      rationale: "启发式检查通过，建议进行 LLM 深度审查以确认修改的必要性",
    }
  }

  /** 生成 LLM 审查提示 */
  const generateReviewPrompt = (request: ReviewRequest): string => `你是一个严格的代码审查专家。你的职责是保护测试用例的完整性。

## 审查请求

**请求类型**: ${request.requestType}
**修改理由**: ${request.reason}

## 原始测试用例
\`\`\`typescript
${request.originalTest}
\`\`\`

## 建议的修改
\`\`\`typescript
${request.suggestedChange}
\`\`\`

## 上下文信息
${request.context.error ? `**错误信息**:\n${request.context.error}` : ""}
${request.context.testOutput ? `**测试输出**:\n${request.context.testOutput}` : ""}
${request.context.codeDiff ? `**代码变更**:\n${request.context.codeDiff}` : ""}

## 审查要求

1. **禁止偷懒行为**：不得删减断言、简化测试、或降低测试覆盖
2. **保护测试意图**：测试用例的目的是验证代码行为，不是为了通过测试
3. **只允许必要修改**：只有当测试本身确实有错误时才允许修改

请以 JSON 格式返回审查结果：
{
  "approved": boolean,
  "rationale": "决策理由",
  "modifiedTest": "如果批准，返回修改后的测试代码（如果不需要修改则不返回）",
  "suggestions": ["如果驳回，给出具体改进建议"]
}`

  /** 解析 LLM 响应 */
  const parseReviewResponse = (response: string): ReviewResult => {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        approved: false,
        rationale: "无法解析审查结果",
        suggestions: ["请重新提交请求"],
      }
    }

    try {
      return JSON.parse(jsonMatch[0]) as ReviewResult
    } catch {
      return {
        approved: false,
        rationale: "JSON 解析失败",
        suggestions: ["请重新提交请求"],
      }
    }
  }

  return {
    quickReview,
    generateReviewPrompt,
    parseReviewResponse,
    config: cfg,
  } as const
}

// ── Types Export ─────────────────────────────────────────────

export type JudgeAgent = ReturnType<typeof make>
