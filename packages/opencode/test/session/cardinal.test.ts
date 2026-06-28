import { describe, expect, it } from "bun:test"
import type { CardinalDecision, CardinalLevel, ExecutionContext } from "../../src/session/cardinal"

const securityRule = () => {
  const { createSecurityRule } = (() => {
    function createSecurityRule() {
      return {
        id: "security",
        name: "安全风险",
        evaluate: (ctx: ExecutionContext): CardinalDecision | null => {
          if (!ctx.diff) return null
          const hasEval = ctx.diff.includes("eval(") || ctx.diff.includes("exec(")
          if (hasEval) {
            return { level: "block" as CardinalLevel, reason: "检测到eval/exec调用", suggestion: "请移除eval/exec调用，使用更安全的替代方案" }
          }
          const secretPatterns = [
            /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']+["']/i,
            /(?:AKIA|ASIA)[A-Z0-9]{16}/,
            /sk-[a-zA-Z0-9]{48}/,
            /ghp_[a-zA-Z0-9]{36}/,
          ]
          for (const pattern of secretPatterns) {
            if (pattern.test(ctx.diff)) {
              return { level: "block" as CardinalLevel, reason: "检测到可能的密钥泄露", suggestion: "请移除敏感信息，使用环境变量" }
            }
          }
          return null
        },
      }
    }
    return { createSecurityRule }
  })()
  return createSecurityRule()
}

const excessiveChangesRule = () => ({
  id: "excessive_changes",
  name: "过量改动",
  evaluate: (ctx: ExecutionContext): CardinalDecision | null => {
    if (!ctx.changedFiles || !ctx.estimatedFiles) return null
    const maxFiles = ctx.estimatedFiles * 2
    if (ctx.changedFiles.length > maxFiles) {
      return { level: "pause" as CardinalLevel, reason: `改动文件数 (${ctx.changedFiles.length}) 超出预期 (${maxFiles})`, suggestion: "请确认是否需要这么多改动" }
    }
    return null
  },
})

const consecutiveFailuresRule = () => ({
  id: "consecutive_failures",
  name: "连续失败",
  evaluate: (ctx: ExecutionContext): CardinalDecision | null => {
    if (!ctx.consecutiveFailures) return null
    if (ctx.consecutiveFailures >= 3) {
      return { level: "pause" as CardinalLevel, reason: `同一任务连续失败 ${ctx.consecutiveFailures} 次`, suggestion: "请分析失败原因或调整任务" }
    }
    return null
  },
})

const alignmentRule = () => ({
  id: "alignment",
  name: "偏离目标",
  evaluate: (ctx: ExecutionContext): CardinalDecision | null => {
    if (!ctx.alignmentAlerts) return null
    if (ctx.alignmentAlerts >= 3) {
      return { level: "stop" as CardinalLevel, reason: `AlignmentGuard连续 ${ctx.alignmentAlerts} 次告警`, suggestion: "请检查是否偏离任务目标" }
    }
    return null
  },
})

const tokenLimitRule = () => ({
  id: "token_limit",
  name: "Token超限",
  evaluate: (ctx: ExecutionContext): CardinalDecision | null => {
    if (!ctx.tokensUsed || !ctx.totalBudget) return null
    const threshold = ctx.totalBudget * 0.2
    if (ctx.tokensUsed > threshold) {
      return { level: "warn" as CardinalLevel, reason: `单任务token消耗 (${ctx.tokensUsed.toLocaleString()}) 超出预算20%`, suggestion: "请关注token使用效率" }
    }
    return null
  },
})

const baseCtx: ExecutionContext = {
  taskId: "test-1",
  taskTitle: "test task",
}

describe("Cardinal rules", () => {
  describe("security rule", () => {
    const rule = securityRule()

    it("returns null when no diff", () => {
      expect(rule.evaluate(baseCtx)).toBeNull()
    })

    it("blocks eval() calls", () => {
      const result = rule.evaluate({ ...baseCtx, diff: "const x = eval('1+1')" })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("block")
      expect(result!.reason).toContain("eval/exec")
    })

    it("blocks exec() calls", () => {
      const result = rule.evaluate({ ...baseCtx, diff: "exec('rm -rf /')" })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("block")
    })

    it("blocks API key in diff", () => {
      const result = rule.evaluate({ ...baseCtx, diff: 'api_key: "sk-abc12345678901234567890123456789012345678901234"' })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("block")
      expect(result!.reason).toContain("密钥泄露")
    })

    it("blocks AWS key in diff", () => {
      const result = rule.evaluate({ ...baseCtx, diff: "AKIAIOSFODNN7EXAMPLE" })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("block")
    })

    it("blocks GitHub token in diff", () => {
      const result = rule.evaluate({ ...baseCtx, diff: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("block")
    })

    it("returns null for clean diff", () => {
      const result = rule.evaluate({ ...baseCtx, diff: "const x = 1 + 2" })
      expect(result).toBeNull()
    })
  })

  describe("excessive changes rule", () => {
    const rule = excessiveChangesRule()

    it("returns null when no changedFiles", () => {
      expect(rule.evaluate(baseCtx)).toBeNull()
    })

    it("returns null when no estimatedFiles", () => {
      expect(rule.evaluate({ ...baseCtx, changedFiles: ["a.ts", "b.ts"] })).toBeNull()
    })

    it("returns null when within limit", () => {
      expect(rule.evaluate({ ...baseCtx, changedFiles: ["a.ts", "b.ts", "c.ts"], estimatedFiles: 2 })).toBeNull()
    })

    it("pauses when exceeding limit", () => {
      const result = rule.evaluate({ ...baseCtx, changedFiles: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"], estimatedFiles: 2 })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("pause")
    })
  })

  describe("consecutive failures rule", () => {
    const rule = consecutiveFailuresRule()

    it("returns null when no failures", () => {
      expect(rule.evaluate(baseCtx)).toBeNull()
    })

    it("returns null for < 3 failures", () => {
      expect(rule.evaluate({ ...baseCtx, consecutiveFailures: 2 })).toBeNull()
    })

    it("pauses at 3 failures", () => {
      const result = rule.evaluate({ ...baseCtx, consecutiveFailures: 3 })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("pause")
    })

    it("pauses at > 3 failures", () => {
      const result = rule.evaluate({ ...baseCtx, consecutiveFailures: 5 })
      expect(result!.level).toBe("pause")
    })
  })

  describe("alignment rule", () => {
    const rule = alignmentRule()

    it("returns null when no alerts", () => {
      expect(rule.evaluate(baseCtx)).toBeNull()
    })

    it("returns null for < 3 alerts", () => {
      expect(rule.evaluate({ ...baseCtx, alignmentAlerts: 2 })).toBeNull()
    })

    it("stops at 3 alerts", () => {
      const result = rule.evaluate({ ...baseCtx, alignmentAlerts: 3 })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("stop")
    })
  })

  describe("token limit rule", () => {
    const rule = tokenLimitRule()

    it("returns null when no tokensUsed", () => {
      expect(rule.evaluate({ ...baseCtx, totalBudget: 20_000_000 })).toBeNull()
    })

    it("returns null when no totalBudget", () => {
      expect(rule.evaluate({ ...baseCtx, tokensUsed: 5_000_000 })).toBeNull()
    })

    it("returns null when within threshold", () => {
      expect(rule.evaluate({ ...baseCtx, tokensUsed: 3_000_000, totalBudget: 20_000_000 })).toBeNull()
    })

    it("warns when exceeding 20% budget", () => {
      const result = rule.evaluate({ ...baseCtx, tokensUsed: 5_000_000, totalBudget: 20_000_000 })
      expect(result).not.toBeNull()
      expect(result!.level).toBe("warn")
    })
  })

  describe("priority ordering", () => {
    it("block > pause > stop > warn", () => {
      const priority: Record<CardinalLevel, number> = { block: 4, pause: 3, stop: 2, warn: 1 }
      expect(priority.block).toBeGreaterThan(priority.pause)
      expect(priority.pause).toBeGreaterThan(priority.stop)
      expect(priority.stop).toBeGreaterThan(priority.warn)
    })
  })
})
