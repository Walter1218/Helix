/**
 * JudgeAgent 边界条件测试
 *
 * 测试预期以外的行为：
 * - 恶意输入
 * - 边界条件
 * - 防御性测试
 */

import { test, expect, describe } from "bun:test"
import { make, type ReviewRequest } from "../../src/agent/judge-agent"

describe("JudgeAgent Boundary Tests", () => {
  const createRequest = (overrides: Partial<ReviewRequest> = {}): ReviewRequest => ({
    actorID: "test-actor",
    requestType: "test_modification",
    originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
    suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
    reason: "添加更多断言",
    context: {},
    ...overrides,
  })

  describe("Malicious Input Detection", () => {
    test("检测删除所有断言的行为", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
        suggestedChange: `test("example", () => {
  // 测试通过了
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("断言数量减少")
    })

    test("检测将所有断言替换为 truthy 的行为", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBeTruthy()
  expect(2 + 2).toBeTruthy()
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("truthy")
    })

    test("检测删除整个测试用例的行为", () => {
      const judge = make({ maxAssertionReduction: 1.0 }) // 允许断言删除
      const request = createRequest({
        originalTest: `test("test1", () => {
  expect(1).toBe(1)
})

test("test2", () => {
  expect(2).toBe(2)
})

test("test3", () => {
  expect(3).toBe(3)
})`,
        suggestedChange: `test("test1", () => {
  expect(1).toBe(1)
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("测试用例数量减少")
    })

    test("检测将 toEqual 替换为 toBeDefined 的行为", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect({ a: 1, b: 2 }).toEqual({ a: 1, b: 2 })
})`,
        suggestedChange: `test("example", () => {
  expect({ a: 1, b: 2 }).toBeDefined()
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("defined")
    })

    test("检测将 toHaveLength 替换为 toBeDefined 的行为", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect([1, 2, 3]).toHaveLength(3)
})`,
        suggestedChange: `test("example", () => {
  expect([1, 2, 3]).toBeDefined()
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("defined")
    })
  })

  describe("Boundary Conditions", () => {
    test("空测试代码", () => {
      const judge = make()
      const request = createRequest({
        originalTest: "",
        suggestedChange: "",
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true) // 空代码没有断言可删除
    })

    test("超长测试代码", () => {
      const judge = make()
      const longTest = "expect(1).toBe(1)\n".repeat(1000)
      const request = createRequest({
        originalTest: `test("long", () => {\n${longTest}})`,
        suggestedChange: `test("long", () => {\n${longTest}})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true) // 没有修改
    })

    test("包含特殊字符的测试代码", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("special chars", () => {
  expect("hello\\nworld").toContain("\\n")
  expect("tab\\there").toContain("\\t")
  expect("quote\\"").toContain("\\"")
})`,
        suggestedChange: `test("special chars", () => {
  expect("hello\\nworld").toContain("\\n")
  expect("tab\\there").toContain("\\t")
  expect("quote\\"").toContain("\\"")
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true) // 没有修改
    })

    test("嵌套测试结构", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `describe("outer", () => {
  describe("inner", () => {
    test("deep", () => {
      expect(true).toBe(true)
    })
  })
})`,
        suggestedChange: `describe("outer", () => {
  describe("inner", () => {
    test("deep", () => {
      expect(true).toBeTruthy()
    })
  })
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false) // 检测到断言简化
    })
  })

  describe("Configuration Edge Cases", () => {
    test("maxAssertionReduction = 0 表示禁止任何断言删除", () => {
      const judge = make({ maxAssertionReduction: 0 })
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1).toBe(1)
  expect(2).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1).toBe(1)
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
    })

    test("maxAssertionReduction = 1 表示允许删除所有断言", () => {
      const judge = make({ maxAssertionReduction: 1.0, allowStructuralChanges: true })
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1).toBe(1)
  expect(2).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  // no assertions
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true) // 允许删除
    })

    test("allowStructuralChanges = true 允许删除测试用例", () => {
      const judge = make({ allowStructuralChanges: true, maxAssertionReduction: 1.0 })
      const request = createRequest({
        originalTest: `test("test1", () => {
  expect(1).toBe(1)
})

test("test2", () => {
  expect(2).toBe(2)
})`,
        suggestedChange: `test("test1", () => {
  expect(1).toBe(1)
})`,
      })

      const result = judge.quickReview(request)
      expect(result.approved).toBe(true) // 允许删除
    })
  })

  describe("Response Parsing Edge Cases", () => {
    test("解析包含换行的 JSON", () => {
      const judge = make()
      const response = `{
  "approved": true,
  "rationale": "修改合理\\n包含换行"
}`

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(true)
      expect(result.rationale).toContain("换行")
    })

    test("解析包含中文的 JSON", () => {
      const judge = make()
      const response = `{
  "approved": false,
  "rationale": "断言被删除",
  "suggestions": ["恢复断言", "保持原有断言"]
}`

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(false)
      expect(result.suggestions).toContain("恢复断言")
    })

    test("解析无效的 JSON 结构", () => {
      const judge = make()
      const response = "这不是JSON"

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("无法解析")
    })

    test("解析缺少字段的 JSON", () => {
      const judge = make()
      const response = '{"approved": true}'

      const result = judge.parseReviewResponse(response)
      expect(result.approved).toBe(true)
      expect(result.rationale).toBeUndefined() // 缺少字段
    })

    test("解析嵌套的 JSON 文本", () => {
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
    })
  })

  describe("Prompt Generation Edge Cases", () => {
    test("生成包含特殊字符的提示", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("special", () => {
  expect("hello\\nworld").toContain("\\n")
})`,
        suggestedChange: `test("special", () => {
  expect("hello\\nworld").toBeTruthy()
})`,
        context: { error: "Error: Expected '\\n', got true" },
      })

      const prompt = judge.generateReviewPrompt(request)
      expect(prompt).toContain("special")
      expect(prompt).toContain("\\n")
    })

    test("生成包含大量上下文的提示", () => {
      const judge = make()
      const request = createRequest({
        context: {
          error: "A".repeat(5000),
          codeDiff: "B".repeat(5000),
          testOutput: "C".repeat(5000),
        },
      })

      const prompt = judge.generateReviewPrompt(request)
      expect(prompt.length).toBeGreaterThan(15000) // 包含所有上下文
    })
  })
})
