/**
 * Max 模式候选评分测试
 *
 * 测试 scoreCandidate() 的预期行为、非预期行为、边界条件。
 */

import { describe, expect, test } from "bun:test"
import { scoreCandidate, selectBestCandidate, WEIGHTS } from "../../src/session/candidate-scorer"
import type { MaxCandidate, CandidateScore } from "../../src/session/candidate-scorer"

function createCandidate(overrides: Partial<MaxCandidate> = {}): MaxCandidate {
  return {
    diff: "const x = 1",
    changedFiles: ["src/test.ts"],
    ...overrides,
  }
}

const defaultStyle = {}

// ── 测试用例 ───────────────────────────────────────────────

describe("Max 模式候选评分", () => {

  // ── 预期行为（正确评分） ────────────────────────────────

  describe("预期行为: 正确评分", () => {
    test("Judge 通过的候选应得高分", () => {
      const score = scoreCandidate(
        createCandidate({ diff: "const x = 1" }),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      expect(score.dimensions.judgeApproved).toBe(true)
      expect(score.dimensions.judgeScore).toBe(1.0)
    })

    test("Judge 拒绝的候选应得低分", () => {
      const score = scoreCandidate(
        createCandidate({ diff: "eval('test')" }),
        { approved: false, rationale: "安全问题", suggestions: ["移除 eval"] },
        [],
        defaultStyle
      )
      expect(score.dimensions.judgeApproved).toBe(false)
      expect(score.dimensions.judgeScore).toBeLessThan(1.0)
    })

    test("变更文件数少的候选应得高分", () => {
      const score1 = scoreCandidate(
        createCandidate({ changedFiles: ["a.ts"] }),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      const score2 = scoreCandidate(
        createCandidate({ changedFiles: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"] }),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      expect(score1.dimensions.fileScore).toBeGreaterThan(score2.dimensions.fileScore)
    })

    test("测试通过率高的候选应得高分", () => {
      const score1 = scoreCandidate(
        createCandidate({}),
        { approved: true, rationale: "", suggestions: [] },
        [{ passed: true }, { passed: true }, { passed: true }],
        defaultStyle
      )
      const score2 = scoreCandidate(
        createCandidate({}),
        { approved: true, rationale: "", suggestions: [] },
        [{ passed: true }, { passed: false }, { passed: false }],
        defaultStyle
      )
      expect(score1.dimensions.testPassRate).toBeGreaterThan(score2.dimensions.testPassRate)
    })

    test("多个候选中应选择总分最高的", () => {
      const candidates = [
        createCandidate({ diff: "eval('test')" }),  // Judge 拒绝
        createCandidate({ diff: "const x = 1" }),   // Judge 通过，1 文件
        createCandidate({ diff: "const y = 2" }),   // Judge 通过，3 文件
      ]
      const reviews = [
        { approved: false, rationale: "安全问题", suggestions: [] },
        { approved: true, rationale: "", suggestions: [] },
        { approved: true, rationale: "", suggestions: [] },
      ]

      const scores = candidates.map((c, i) =>
        scoreCandidate(c, reviews[i], [{ passed: true }], defaultStyle)
      )
      const best = scores.sort((a, b) => b.totalScore - a.totalScore)[0]

      // 应选择第 2 个候选（Judge 通过 + 文件数少）
      expect(best.candidate).toBe(candidates[1])
    })

    test("Judge 有多个建议时得分应递减", () => {
      const score1 = scoreCandidate(
        createCandidate({}),
        { approved: false, rationale: "", suggestions: ["建议1"] },
        [],
        defaultStyle
      )
      const score2 = scoreCandidate(
        createCandidate({}),
        { approved: false, rationale: "", suggestions: ["建议1", "建议2", "建议3"] },
        [],
        defaultStyle
      )
      expect(score1.dimensions.judgeScore).toBeGreaterThan(score2.dimensions.judgeScore)
    })
  })

  // ── 非预期行为（不应发生的评分） ────────────────────────

  describe("非预期行为: 不应误判", () => {
    test("空候选列表不应崩溃", () => {
      const scores: CandidateScore[] = []
      const best = scores.sort((a, b) => b.totalScore - a.totalScore)[0]
      expect(best).toBeUndefined()
    })

    test("所有候选都被 Judge 拒绝时应选择拒绝理由最少的", () => {
      const candidates = [
        createCandidate({ diff: "eval('test'); exec('test')" }),
        createCandidate({ diff: "eval('test')" }),
      ]
      const reviews = [
        { approved: false, rationale: "两个安全问题", suggestions: ["移除 eval", "移除 exec"] },
        { approved: false, rationale: "一个安全问题", suggestions: ["移除 eval"] },
      ]

      const scores = candidates.map((c, i) =>
        scoreCandidate(c, reviews[i], [], defaultStyle)
      )
      const best = scores.sort((a, b) => b.totalScore - a.totalScore)[0]

      // 应选择问题较少的候选
      expect(best.candidate).toBe(candidates[1])
    })

    test("总分应在 [0, 1] 范围内", () => {
      const score = scoreCandidate(
        createCandidate({}),
        { approved: true, rationale: "", suggestions: [] },
        [{ passed: true }],
        defaultStyle
      )
      expect(score.totalScore).toBeGreaterThanOrEqual(0)
      expect(score.totalScore).toBeLessThanOrEqual(1)
    })

    test("Judge 通过时 judgeScore 应为 1.0", () => {
      const score = scoreCandidate(
        createCandidate({}),
        { approved: true, rationale: "", suggestions: ["建议1", "建议2"] },
        [],
        defaultStyle
      )
      // 即使有建议，approved=true 时 judgeScore 应为 1.0
      expect(score.dimensions.judgeScore).toBe(1.0)
    })
  })

  // ── 边界条件 ─────────────────────────────────────────────

  describe("边界条件", () => {
    test("无测试结果时 testPassRate 应为 0.5（默认值）", () => {
      const score = scoreCandidate(
        createCandidate({}),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      expect(score.dimensions.testPassRate).toBe(0.5)
    })

    test("单文件变更时 fileScore 应为 1.0", () => {
      const score = scoreCandidate(
        createCandidate({ changedFiles: ["a.ts"] }),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      expect(score.dimensions.fileScore).toBe(1.0)
    })

    test("大量文件变更时 fileScore 应接近 0", () => {
      const files = Array.from({ length: 20 }, (_, i) => `file${i}.ts`)
      const score = scoreCandidate(
        createCandidate({ changedFiles: files }),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      expect(score.dimensions.fileScore).toBeLessThan(0.1)
    })

    test("Judge 有多个建议时 judgeScore 应递减", () => {
      const score1 = scoreCandidate(
        createCandidate({}),
        { approved: false, rationale: "", suggestions: ["建议1"] },
        [],
        defaultStyle
      )
      const score2 = scoreCandidate(
        createCandidate({}),
        { approved: false, rationale: "", suggestions: ["建议1", "建议2", "建议3"] },
        [],
        defaultStyle
      )
      expect(score1.dimensions.judgeScore).toBeGreaterThan(score2.dimensions.judgeScore)
    })

    test("所有测试都失败时 testPassRate 应为 0", () => {
      const score = scoreCandidate(
        createCandidate({}),
        { approved: true, rationale: "", suggestions: [] },
        [{ passed: false }, { passed: false }, { passed: false }],
        defaultStyle
      )
      expect(score.dimensions.testPassRate).toBe(0)
    })

    test("文件数为 0 时 fileScore 应为 1.0", () => {
      const score = scoreCandidate(
        createCandidate({ changedFiles: [] }),
        { approved: true, rationale: "", suggestions: [] },
        [],
        defaultStyle
      )
      expect(score.dimensions.fileScore).toBe(1.0)
    })
  })
})
