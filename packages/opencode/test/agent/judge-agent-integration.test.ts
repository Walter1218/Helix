/**
 * JudgeAgent 完整流程集成测试
 * 
 * 测试所有检查功能的完整流程：
 * 1. 断言保护检查
 * 2. 结构变更检查
 * 3. 简化断言检查
 * 4. 安全检查（eval/exec/密钥泄露）
 * 5. 规范合规性检查
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
        suggestedChange: `test("example", () => {
  const result = eval("1 + 1")
  expect(result).toBe(2)
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("eval()")
    })

    test("exec() 调用应被驳回", () => {
      const judge = make()
      const request = createRequest({
        suggestedChange: `test("example", () => {
  const { exec } = require("child_process")
  exec("rm -rf /")
})`,
      })
      
      const result = judge.quickReview(request)
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
    })

    test("API key 泄露应被驳回", () => {
      const judge = make()
      const request = createRequest({
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

    test("规范合规性检查应提供建议", () => {
      const judge = make({ specDrivenEnabled: true })
      const request = createRequest({
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
      expect(result.suggestions![0]).toContain("assertion protection")
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
      expect(prompt).toContain("Test Spec")
      expect(prompt).toContain("规范合规性")
    })

    test("生成不包含规范内容的提示", () => {
      const judge = make()
      const request = createRequest()
      
      const prompt = judge.generateReviewPrompt(request)
      expect(prompt).not.toContain("相关规范")
      expect(prompt).not.toContain("规范合规性")
    })
  })

  describe("配置组合测试", () => {
    test("严格模式 + 规范驱动", () => {
      const judge = make({ 
        strictMode: true, 
        specDrivenEnabled: true,
        maxAssertionReduction: 0.1 
      })
      
      expect(judge.config.strictMode).toBe(true)
      expect(judge.config.specDrivenEnabled).toBe(true)
      expect(judge.config.maxAssertionReduction).toBe(0.1)
    })

    test("宽松模式 + 禁用规范驱动", () => {
      const judge = make({ 
        strictMode: false, 
        specDrivenEnabled: false,
        maxAssertionReduction: 0.8,
        allowStructuralChanges: true 
      })
      
      expect(judge.config.strictMode).toBe(false)
      expect(judge.config.specDrivenEnabled).toBe(false)
      expect(judge.config.maxAssertionReduction).toBe(0.8)
      expect(judge.config.allowStructuralChanges).toBe(true)
    })
  })
})