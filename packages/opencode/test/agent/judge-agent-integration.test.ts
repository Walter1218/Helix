/**
 * JudgeAgent 完整流程集成测试
 * 
 * 测试所有检查功能的完整流程：
 * 1. 断言保护检查
 * 2. 结构变更检查
 * 3. 简化断言检查
 * 4. 安全检查（eval/exec/密钥泄露）
 * 5. 回归风险检查
 * 6. 一致性检查
 * 7. 规范合规性检查
 */

import { test, expect, describe } from "bun:test"
import { make, type ReviewRequest } from "../../src/agent/judge-agent"

describe("JudgeAgent Integration Tests", () => {
  const createRequest = (overrides: Partial<ReviewRequest> = {}): ReviewRequest => ({
    actorID: "test-actor",
    requestType: "test_modification",
    originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
    suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
    reason: "添加更多断言",
    context: {},
    ...overrides,
  })

  describe("完整流程测试", () => {
    test("正常修改应通过所有检查", () => {
      const judge = make()
      const request = createRequest()
      const result = judge.quickReview(request)
      
      expect(result.approved).toBe(true)
      expect(result.rationale).toContain("启发式检查通过")
    })

    test("删除断言应被驳回", () => {
      const judge = make({ maxAssertionReduction: 0.3 })
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("断言数量减少")
    })

    test("删除测试用例应被驳回", () => {
      const judge = make({ maxAssertionReduction: 1.0 })
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
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("测试用例数量减少")
    })

    test("简化断言应被驳回", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBeTruthy()
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("truthy")
    })

    test("eval() 调用应被驳回", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  eval("alert(1)")
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("eval")
    })

    test("exec() 调用应被驳回", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  exec("rm -rf /")
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("exec")
    })

    test("API key 泄露应被驳回", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  const apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890ab"
  expect(apiKey).toBeDefined()
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("OpenAI API Key")
    })

    test("AWS key 泄露应被驳回", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  const awsKey = "AKIAIOSFODNN7EXAMPLE"
  expect(awsKey).toBeDefined()
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("AWS Access Key")
    })

    test("DROP TABLE 应回归风险检查被驳回", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  DROP TABLE users;
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("回归风险")
    })

    test("命名约定混用应一致性检查提供建议", () => {
      const judge = make()
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  const userName = "test"
  const user_name = "test2"
  function getUserName() { return userName }
  function get_user_age() { return 10 }
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(true)
      expect(result.suggestions).toBeDefined()
      expect(result.suggestions!.some(s => s.includes("命名约定混用"))).toBe(true)
    })

    test("规范合规性检查应提供建议", () => {
      const judge = make({ specDrivenEnabled: true })
      const request = createRequest({
        originalTest: `test("example", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        specContent: `# Test Spec

### Assertion protection
The system SHALL detect and block assertion deletions in test files.

**Status**: pending

### Security checks
The system SHALL detect eval(), exec(), and secret leaks in code changes.

**Status**: implemented`,
        taskDescription: "实现 assertion protection 功能",
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(true)
      expect(result.suggestions).toBeDefined()
      expect(result.suggestions![0]).toContain("Assertion protection")
    })

    test("禁用规范驱动时跳过规范检查", () => {
      const judge = make({ specDrivenEnabled: false })
      const request = createRequest({
        specContent: `# Test Spec

### Assertion protection
The system SHALL detect and block assertion deletions in test files.

**Status**: pending`,
        taskDescription: "实现 assertion protection 功能",
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(true)
      expect(result.suggestions).toBeUndefined()
    })
  })

  describe("LLM 审查提示生成", () => {
    test("生成包含规范内容的提示", () => {
      const judge = make()
      const request = createRequest({
        specContent: `# Test Spec

### Requirement 1
**Status**: pending`,
        taskDescription: "实现 Requirement 1",
      })
      
      const prompt = judge.generateReviewPrompt(request)
      expect(prompt).toContain("相关规范")
      expect(prompt).toContain("Requirement 1")
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

  describe("LLM 响应解析", () => {
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

  describe("配置测试", () => {
    test("严格模式配置生效", () => {
      const judge = make({ strictMode: true })
      expect(judge.config.strictMode).toBe(true)
    })

    test("自定义配置生效", () => {
      const judge = make({
        strictMode: false,
        specDrivenEnabled: false,
        maxAssertionReduction: 0.8,
        allowStructuralChanges: true,
      })
      
      expect(judge.config.strictMode).toBe(false)
      expect(judge.config.specDrivenEnabled).toBe(false)
      expect(judge.config.maxAssertionReduction).toBe(0.8)
      expect(judge.config.allowStructuralChanges).toBe(true)
    })
  })
})
