/**
 * 指令遵循度检测
 *
 * 在每轮工具执行后，对比用户指令与实际变更，检测偏离。
 * 支持 4 类约束检测：禁止修改、限定范围、方案选择、隐式约束。
 *
 * @module session/instruction-adherence
 */

export interface InstructionConstraint {
  type: "dont_modify" | "only_modify" | "use_approach" | "scope"
  targets: string[]
  raw: string
}

export interface AdherenceDeviation {
  type: "out_of_scope" | "forbidden_change" | "approach_mismatch"
  description: string
  severity: "error" | "warning"
  files?: string[]
}

export interface AdherenceResult {
  adherent: boolean
  deviations: AdherenceDeviation[]
}

const SCOPE_MAP: Record<string, string[]> = {
  "前端": ["packages/app/", "packages/ui/", ".tsx", ".jsx", ".css", ".scss"],
  "后端": ["packages/opencode/src/", "packages/server/", ".ts"],
  "测试": ["test/", ".test.ts", ".spec.ts", "__tests__"],
  "文档": ["docs/", ".md", "README"],
  "配置": ["config", ".json", ".yaml", ".yml", ".env"],
  "脚本": ["script/", ".sh"],
}

/**
 * 从用户指令中提取约束条件
 */
export function extractConstraints(instruction: string): InstructionConstraint[] {
  const constraints: InstructionConstraint[] = []
  if (!instruction.trim()) return constraints

  // 1. 禁止修改类："不要修改 X"、"别动 X"、"禁止改动 X"
  const dontPatterns = instruction.match(
    /(?:不要|别|禁止|避免|不许)\s*(?:修改|改动|删除|重构|动|碰|改)\s*(?:了\s*)?([^\s,，。、]+)/g
  )
  if (dontPatterns) {
    for (const p of dontPatterns) {
      const target = p.replace(/(?:不要|别|禁止|避免|不许)\s*(?:修改|改动|删除|重构|动|碰|改)\s*(?:了\s*)?/, "")
      constraints.push({ type: "dont_modify", targets: [target], raw: p })
    }
  }

  // 2. 限定范围类："只修改 X"、"仅改 X"、"仅限 X"
  const onlyPatterns = instruction.match(
    /(?:只|仅|仅限|只改|只动|只修改|仅修改)\s*(?:修改|改动|改|动)?\s*([^\s,，。、]+)/g
  )
  if (onlyPatterns) {
    for (const p of onlyPatterns) {
      const target = p.replace(/(?:只|仅|仅限|只改|只动|只修改|仅修改)\s*(?:修改|改动|改|动)?\s*/, "")
      constraints.push({ type: "only_modify", targets: [target], raw: p })
    }
  }

  // 3. 方案选择类："用方案 A"、"采用方法 2"
  const approachPatterns = instruction.match(
    /(?:用|使用|采用|选择|按)\s*(方案\s*[A-Z]|方法\s*\d+|策略\s*\w+|方式\s*\d+|思路\s*\d+)/g
  )
  if (approachPatterns) {
    for (const p of approachPatterns) {
      const approach = p.replace(/(?:用|使用|采用|选择|按)\s*/, "")
      constraints.push({ type: "use_approach", targets: [approach], raw: p })
    }
  }

  // 4. 范围约束类："前端"、"后端"、"测试"、"文档"
  for (const [scope, patterns] of Object.entries(SCOPE_MAP)) {
    if (instruction.includes(scope)) {
      constraints.push({ type: "scope", targets: patterns, raw: scope })
    }
  }

  return constraints
}

/**
 * 检查指令遵循度
 */
export function checkAdherence(
  instruction: string,
  changedFiles: string[]
): AdherenceResult {
  const constraints = extractConstraints(instruction)
  const deviations: AdherenceDeviation[] = []

  for (const constraint of constraints) {
    switch (constraint.type) {
      case "dont_modify": {
        for (const target of constraint.targets) {
          const violated = changedFiles.filter(
            f => f.includes(target) || f.endsWith(target)
          )
          if (violated.length > 0) {
            deviations.push({
              type: "forbidden_change",
              description: `用户要求不要修改 ${target}，但实际修改了: ${violated.join(", ")}`,
              severity: "error",
              files: violated,
            })
          }
        }
        break
      }

      case "only_modify": {
        const outOfScope = changedFiles.filter(f =>
          !constraint.targets.some(t => f.includes(t) || f.endsWith(t))
        )
        if (outOfScope.length > 0) {
          deviations.push({
            type: "out_of_scope",
            description: `用户要求只修改 ${constraint.targets.join(", ")}，但额外修改了: ${outOfScope.join(", ")}`,
            severity: "error",
            files: outOfScope,
          })
        }
        break
      }

      case "scope": {
        const outOfScope = changedFiles.filter(f =>
          !constraint.targets.some(t => f.includes(t))
        )
        if (outOfScope.length > 0) {
          deviations.push({
            type: "out_of_scope",
            description: `用户要求只修改 ${constraint.raw} 相关文件，但额外修改了: ${outOfScope.join(", ")}`,
            severity: "warning",
            files: outOfScope,
          })
        }
        break
      }
    }
  }

  return {
    adherent: deviations.filter(d => d.severity === "error").length === 0,
    deviations,
  }
}

export * as InstructionAdherence from "./instruction-adherence"
