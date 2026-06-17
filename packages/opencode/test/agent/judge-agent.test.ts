/**
 * JudgeAgent 单元测试
 */

import { test, expect, describe } from "bun:test"
import { make, type ReviewRequest } from "../../src/agent/judge-agent"

describe("JudgeAgent", () => {
  const createRequest = (overrides: Partial<ReviewRequest> = {}): ReviewRequest => ({
    actorID: "test-actor",
    requestType: "test_modification",
    originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
    suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
    reason: "测试失败",
    context: { error: "Expected 6, got 7" },
    ...overrides,
  })

  describe("quickReview", () => {
    test("批准保留所有断言的修改", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(7) // 修正预期值
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true)
    })

    test("驳回删除过多断言的修改", () => {
      const judge = make({ maxAssertionReduction: 0.3 })
      const request = createRequest({
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("断言数量减少")
    })

    test("驳回删除测试用例的修改", () => {
      const judge = make({ allowStructuralChanges: false, maxAssertionReduction: 1.0 }) // 允许断言删除，检查结构变更
      const request = createRequest({
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
})

test("subtraction", () => {
  expect(2 - 1).toBe(1)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("测试用例数量减少")
    })

    test("驳回将具体断言简化为 truthy 的修改", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBeTruthy()
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("truthy")
    })

    test("驳回将 toEqual 简化为 toBeDefined 的修改", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("object", () => {
  expect({ a: 1 }).toEqual({ a: 1 })
})`,
        suggestedChange: `test("object", () => {
  expect({ a: 1 }).toBeDefined()
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("defined")
    })

    test("允许在 maxAssertionReduction 范围内的删除", () => {
      const judge = make({ maxAssertionReduction: 0.5 })
      const request = createRequest({
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true)
    })
  })

  describe("generateReviewPrompt", () => {
    test("生成包含所有信息的提示", () => {
      const judge = make()
      const request = createRequest()

      const prompt = judge.generateReviewPrompt(request)

      expect(prompt).toContain("test_modification")
      expect(prompt).toContain("测试失败")
      expect(prompt).toContain("Expected 6, got 7")
      expect(prompt).toContain(request.originalTest)
      expect(prompt).toContain(request.suggestedChange)
    })

    test("不包含空的上下文信息", () => {
      const judge = make()
      const request = createRequest({
        context: {},
      })

      const prompt = judge.generateReviewPrompt(request)

      expect(prompt).not.toContain("**错误信息**")
      expect(prompt).not.toContain("**测试输出**")
      expect(prompt).not.toContain("**代码变更**")
    })
  })

  describe("parseReviewResponse", () => {
    test("解析有效的 JSON 响应", () => {
      const judge = make()
      const response = JSON.stringify({
        approved: true,
        rationale: "修改合理",
      })

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(true)
      expect(result.rationale).toBe("修改合理")
    })

    test("处理无效的 JSON 响应", () => {
      const judge = make()
      const response = "这不是 JSON"

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("无法解析")
    })

    test("从混合内容中提取 JSON", () => {
      const judge = make()
      const response = `这是分析结果：
{
  "approved": false,
  "rationale": "断言被删除",
  "suggestions": ["恢复断言"]
}
以上是结论。`

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(false)
      expect(result.rationale).toBe("断言被删除")
    })
  })

  describe("配置", () => {
    test("strictMode 配置生效", () => {
      const judge = make({ strictMode: true })
      expect(judge.config.strictMode).toBe(true)
    })

    test("maxAssertionReduction 配置生效", () => {
      const judge = make({ maxAssertionReduction: 0.5 })
      expect(judge.config.maxAssertionReduction).toBe(0.5)
    })

    test("allowStructuralChanges 配置生效", () => {
      const judge = make({ allowStructuralChanges: true })
      expect(judge.config.allowStructuralChanges).toBe(true)
    })
  })
})
