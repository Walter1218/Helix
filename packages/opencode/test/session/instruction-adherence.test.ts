/**
 * 指令遵循度检测测试
 *
 * 测试 extractConstraints() 和 checkAdherence() 的预期行为、非预期行为、边界条件。
 */

import { describe, expect, test } from "bun:test"
import { extractConstraints, checkAdherence } from "../../src/session/instruction-adherence"

// ── 测试用例 ───────────────────────────────────────────────

describe("指令遵循度检测", () => {

  // ── 预期行为（应该检测到偏离） ──────────────────────────

  describe("预期行为: 正确检测偏离", () => {
    test("禁止修改被违反: 用户说'不要改 config.ts'，LLM 改了", () => {
      const result = checkAdherence(
        "修复 bug，不要修改 config.ts",
        ["src/login.ts", "src/config.ts"]
      )
      expect(result.adherent).toBe(false)
      expect(result.deviations.length).toBe(1)
      expect(result.deviations[0].type).toBe("forbidden_change")
      expect(result.deviations[0].files).toContain("src/config.ts")
    })

    test("限定范围被违反: 用户说'只改 login.ts'，LLM 改了多个文件", () => {
      const result = checkAdherence(
        "只修改 login.ts 的错误处理",
        ["src/login.ts", "src/utils.ts", "src/config.ts"]
      )
      expect(result.adherent).toBe(false)
      expect(result.deviations.length).toBe(1)
      expect(result.deviations[0].type).toBe("out_of_scope")
      expect(result.deviations[0].files).toContain("src/utils.ts")
      expect(result.deviations[0].files).toContain("src/config.ts")
    })

    test("多个禁止约束被违反", () => {
      const result = checkAdherence(
        "修复 bug，不要修改 config.ts，不要动 utils.ts",
        ["src/login.ts", "src/config.ts", "src/utils.ts"]
      )
      expect(result.adherent).toBe(false)
      expect(result.deviations.length).toBe(2)
    })

    test("多个限定范围约束被违反", () => {
      const result = checkAdherence(
        "只修改 login.ts 和 auth.ts",
        ["src/login.ts", "src/auth.ts", "src/utils.ts"]
      )
      expect(result.adherent).toBe(false)
      expect(result.deviations[0].files).toContain("src/utils.ts")
    })

    test("范围约束: 用户说'只改前端'，LLM 改了后端", () => {
      const result = checkAdherence(
        "这个 PR 只改前端",
        ["packages/app/src/index.tsx", "packages/opencode/src/session/prompt.ts"]
      )
      expect(result.adherent).toBe(false)
      expect(result.deviations[0].type).toBe("out_of_scope")
    })

    test("隐式约束: 用户说'不要重构'，LLM 改了文件", () => {
      const result = checkAdherence(
        "修复 bug，不要重构",
        ["src/login.ts"]
      )
      // 隐式约束目前不检测（保守策略）
      expect(result.adherent).toBe(true)
    })

    test("混合约束: 禁止修改 + 限定范围同时违反", () => {
      const result = checkAdherence(
        "只修改 login.ts，不要动 config.ts",
        ["src/login.ts", "src/config.ts", "src/utils.ts"]
      )
      expect(result.adherent).toBe(false)
      // 应检测到两个偏离：禁止修改 config.ts + 超出范围 utils.ts
      expect(result.deviations.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── 非预期行为（不应检测到偏离） ────────────────────────

  describe("非预期行为: 不应误报", () => {
    test("无约束时任何修改都应通过", () => {
      const result = checkAdherence(
        "修复 login 函数",
        ["src/login.ts", "src/utils.ts", "src/config.ts"]
      )
      expect(result.adherent).toBe(true)
      expect(result.deviations.length).toBe(0)
    })

    test("只修改允许范围内的文件应通过", () => {
      const result = checkAdherence(
        "只修改 login.ts",
        ["src/login.ts"]
      )
      expect(result.adherent).toBe(true)
    })

    test("模糊指令不应产生误报: '改一下登录'", () => {
      const result = checkAdherence(
        "改一下登录",
        ["src/login.ts", "src/auth.ts"]
      )
      expect(result.adherent).toBe(true)
    })

    test("空变更文件列表应通过", () => {
      const result = checkAdherence("修复 bug", [])
      expect(result.adherent).toBe(true)
    })

    test("空指令应通过", () => {
      const result = checkAdherence("", ["src/login.ts"])
      expect(result.adherent).toBe(true)
    })

    test("子目录匹配: 用户说'不要改 config'，LLM 改了 config/session.ts", () => {
      const result = checkAdherence(
        "不要修改 config",
        ["src/config/session.ts"]
      )
      // 应检测到（config 是父目录）
      expect(result.adherent).toBe(false)
    })

    test("文件名相似但不同: 用户说'不要改 config.ts'，LLM 改了 config.json", () => {
      const result = checkAdherence(
        "不要修改 config.ts",
        ["config.json"]
      )
      // config.ts 不是 config.json 的子串，不检测为违反
      expect(result.adherent).toBe(true)
    })
  })

  // ── 边界条件 ─────────────────────────────────────────────

  describe("边界条件", () => {
    test("约束提取: 中英文混合指令", () => {
      const constraints = extractConstraints("修复 login bug，不要修改 config.ts 文件")
      expect(constraints.length).toBe(1)
      expect(constraints[0].type).toBe("dont_modify")
      expect(constraints[0].targets).toContain("config.ts")
    })

    test("约束提取: 多个约束", () => {
      const constraints = extractConstraints(
        "只修改 login.ts，不要动 config.ts，用方案 A"
      )
      expect(constraints.length).toBe(3)
      // 提取顺序: dont_modify 先于 only_modify（正则执行顺序）
      expect(constraints[0].type).toBe("dont_modify")
      expect(constraints[1].type).toBe("only_modify")
      expect(constraints[2].type).toBe("use_approach")
    })

    test("约束提取: 无约束指令", () => {
      const constraints = extractConstraints("修复 login 函数的 bug")
      expect(constraints.length).toBe(0)
    })

    test("约束提取: 路径格式约束", () => {
      const constraints = extractConstraints(
        "不要修改 src/config/config.ts"
      )
      expect(constraints.length).toBe(1)
      expect(constraints[0].targets).toContain("src/config/config.ts")
    })

    test("遵循度检查: 变更文件路径包含特殊字符", () => {
      const result = checkAdherence(
        "只修改 login.ts",
        ["src/login.ts", "src/utils.ts"]
      )
      expect(result.adherent).toBe(false)
    })

    test("遵循度检查: 大量变更文件", () => {
      const files = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`)
      const result = checkAdherence("修复 bug", files)
      expect(result.adherent).toBe(true)
    })

    test("约束提取: 只有限定范围（只改）", () => {
      const constraints = extractConstraints("只改 login.ts")
      expect(constraints.length).toBe(1)
      expect(constraints[0].type).toBe("only_modify")
    })

    test("约束提取: 只有禁止修改（不要动）", () => {
      const constraints = extractConstraints("不要动 config.ts")
      expect(constraints.length).toBe(1)
      expect(constraints[0].type).toBe("dont_modify")
    })

    test("遵循度检查: 指令中包含标点符号", () => {
      const result = checkAdherence(
        "修复 bug！不要修改 config.ts。",
        ["src/login.ts", "src/config.ts"]
      )
      expect(result.adherent).toBe(false)
    })
  })
})
