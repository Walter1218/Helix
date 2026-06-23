/**
 * JudgeAgent 完整流程测试
 * 
 * 测试所有检查功能：
 * 1. 断言保护检查
 * 2. 结构变更检查
 * 3. 简化断言检查
 * 4. 安全检查（eval/exec/密钥）
 * 5. 规范合规性检查
 */

import { test, expect, describe } from "bun:test"
import { make, type ReviewRequest } from "../../src/agent/judge-agent"

describe("JudgeAgent 完整流程", () => {
  const judge = make({
    strictMode: true,
    maxAssertionReduction: 0.3,
    allowStructuralChanges: false,
    specDrivenEnabled: true,
  })

  describe("1. 断言保护检查", () => {
    test("✅ 通过：保留所有断言", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("math", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        suggestedChange: `test("math", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
        reason: "添加新断言",
        context: {},
      })
      expect(result.approved).toBe(true)
    })

    test("❌ 驳回：删除超过30%断言", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("math", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
  expect(4 + 4).toBe(8)
})`,
        suggestedChange: `test("math", () => {
  expect(1 + 1).toBe(2)
})`,
        reason: "简化测试",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("断言数量减少")
    })
  })

  describe("2. 结构变更检查", () => {
    test("❌ 驳回：删除测试用例", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})

test("subtraction", () => {
  expect(2 - 1).toBe(1)
  expect(3 - 2).toBe(1)
  expect(4 - 3).toBe(1)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})`,
        reason: "删除失败的测试",
        context: {},
      })
      // 断言检查先触发（从6个减少到3个，50% > 30%）
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("断言数量减少")
    })

    test("✅ 通过：保留所有测试用例", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("addition", () => {
  expect(1 + 1).toBe(2)
})

test("subtraction", () => {
  expect(2 - 1).toBe(1)
})`,
        suggestedChange: `test("addition", () => {
  expect(1 + 1).toBe(2)
})

test("subtraction", () => {
  expect(2 - 1).toBe(1)
})

test("multiplication", () => {
  expect(2 * 3).toBe(6)
})`,
        reason: "添加新测试",
        context: {},
      })
      expect(result.approved).toBe(true)
    })
  })

  describe("3. 简化断言检查", () => {
    test("❌ 驳回：将 toBe 简化为 toBeTruthy", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("check", () => {
  expect(value).toBe(true)
})`,
        suggestedChange: `test("check", () => {
  expect(value).toBeTruthy()
})`,
        reason: "简化断言",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("truthy")
    })

    test("❌ 驳回：将 toEqual 简化为 toBeDefined", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("object", () => {
  expect({ a: 1 }).toEqual({ a: 1 })
})`,
        suggestedChange: `test("object", () => {
  expect({ a: 1 }).toBeDefined()
})`,
        reason: "简化断言",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("defined")
    })

    test("✅ 通过：保持具体值断言", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("math", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("math", () => {
  expect(1 + 1).toBe(3) // 修正预期值
})`,
        reason: "修正预期值",
        context: {},
      })
      expect(result.approved).toBe(true)
    })
  })

  describe("4. 安全检查", () => {
    test("❌ 驳回：包含 eval() 调用", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("dynamic", () => {
  const fn = new Function('return 1')
  expect(fn()).toBe(1)
})`,
        suggestedChange: `test("dynamic", () => {
  const result = eval('1 + 1')
  expect(result).toBe(2)
})`,
        reason: "使用eval简化",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("eval()")
    })

    test("❌ 驳回：包含 exec() 调用", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("command", () => {
  console.log("test")
})`,
        suggestedChange: `test("command", () => {
  exec('rm -rf /')
})`,
        reason: "执行命令",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("exec()")
    })

    test("❌ 驳回：包含 API key 硬编码", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("api", () => {
  const key = process.env.API_KEY
})`,
        suggestedChange: `test("api", () => {
  const apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890ab"
})`,
        reason: "硬编码key",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("安全检查失败")
      expect(result.rationale).toContain("API key")
    })

    test("❌ 驳回：包含 AWS Access Key", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("aws", () => {
  // test
})`,
        suggestedChange: `test("aws", () => {
  const accessKey = "AKIAIOSFODNN7EXAMPLE"
})`,
        reason: "AWS key",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("AWS Access Key")
    })

    test("❌ 驳回：包含 GitHub Token", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("github", () => {
  // test
})`,
        suggestedChange: `test("github", () => {
  const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
})`,
        reason: "GitHub token",
        context: {},
      })
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("GitHub Personal Access Token")
    })

    test("✅ 通过：安全的代码", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("safe", () => {
  const value = process.env.SECRET
  expect(value).toBeDefined()
})`,
        suggestedChange: `test("safe", () => {
  const value = process.env.SECRET
  expect(value).toBe("safe-value")
})`,
        reason: "修正预期值",
        context: {},
      })
      expect(result.approved).toBe(true)
    })
  })

  describe("5. 规范合规性检查", () => {
    test("✅ 通过：有规范内容时检查合规性", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("feature", () => {
  expect(feature.isEnabled()).toBe(true)
})`,
        suggestedChange: `test("feature", () => {
  expect(feature.isEnabled()).toBe(true)
  expect(feature.name()).toBe("test-feature")
})`,
        reason: "添加功能测试",
        context: {},
        specContent: `# Feature Spec

### Feature implementation
The system SHALL implement the feature with name and status.

**Status**: pending`,
        taskDescription: "实现功能特性",
      })
      expect(result.approved).toBe(true)
    })

    test("✅ 通过：无规范内容时跳过检查", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("feature", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("feature", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        reason: "添加断言",
        context: {},
      })
      expect(result.approved).toBe(true)
    })
  })

  describe("6. 完整流程组合测试", () => {
    test("❌ 驳回：同时违反多个规则", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("math", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
})

test("security", () => {
  expect(isSecure()).toBe(true)
})`,
        suggestedChange: `test("math", () => {
  expect(1 + 1).toBeTruthy()
  const result = eval('2 + 2')
  const apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890ab"
})`,
        reason: "重构测试",
        context: {},
      })
      // 应该被驳回，因为：
      // 1. 删除了断言（从7个减少到1个）
      // 2. 删除了测试用例（从2个减少到1个）
      // 3. 简化了断言（toBe -> toBeTruthy）
      // 4. 包含 eval() 调用
      // 5. 包含 API key 硬编码
      expect(result.approved).toBe(false)
    })

    test("✅ 通过：所有检查都通过", () => {
      const result = judge.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("math", () => {
  expect(1 + 1).toBe(2)
})`,
        suggestedChange: `test("math", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})

test("string", () => {
  expect("hello".length).toBe(5)
})`,
        reason: "扩展测试覆盖",
        context: {},
        specContent: `# Math Spec

### Basic arithmetic
The system SHALL support basic arithmetic operations.

**Status**: implemented`,
        taskDescription: "添加数学运算测试",
      })
      expect(result.approved).toBe(true)
    })
  })

  describe("7. generateReviewPrompt 包含规范", () => {
    test("包含规范内容", () => {
      const prompt = judge.generateReviewPrompt({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("feature", () => {})`,
        suggestedChange: `test("feature", () => {
  expect(feature.isEnabled()).toBe(true)
})`,
        reason: "添加测试",
        context: {},
        specContent: `# Feature Spec

### Feature implementation
The system SHALL implement the feature.

**Status**: pending`,
        taskDescription: "实现功能",
      })
      expect(prompt).toContain("相关规范")
      expect(prompt).toContain("Feature Spec")
      expect(prompt).toContain("规范合规性")
    })

    test("无规范时不包含规范部分", () => {
      const prompt = judge.generateReviewPrompt({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("feature", () => {})`,
        suggestedChange: `test("feature", () => {
  expect(1 + 1).toBe(2)
})`,
        reason: "添加测试",
        context: {},
      })
      expect(prompt).not.toContain("相关规范")
      expect(prompt).not.toContain("规范合规性")
    })
  })

  describe("8. 配置组合测试", () => {
    test("禁用规范驱动时跳过规范检查", () => {
      const judgeWithoutSpec = make({ specDrivenEnabled: false })
      const result = judgeWithoutSpec.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("feature", () => {})`,
        suggestedChange: `test("feature", () => {
  expect(eval('1 + 1')).toBe(2)
})`,
        reason: "使用eval",
        context: {},
        specContent: `# Spec

### Requirement
Must not use eval.

**Status**: pending`,
      })
      // 规范检查被跳过，但安全检查仍然生效
      expect(result.approved).toBe(false)
      expect(result.rationale).toContain("eval()")
    })

    test("允许结构变更时跳过结构检查", () => {
      const judgeWithStructuralChanges = make({ allowStructuralChanges: true })
      const result = judgeWithStructuralChanges.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("test1", () => {
  expect(1 + 1).toBe(2)
})

test("test2", () => {
  expect(2 + 2).toBe(4)
})`,
        suggestedChange: `test("test1", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
})`,
        reason: "合并测试",
        context: {},
      })
      // 结构检查被跳过，断言数量保持不变（2个），所以通过
      expect(result.approved).toBe(true)
    })

    test("宽松断言阈值允许更多删除", () => {
      const judgeWithLooseThreshold = make({ maxAssertionReduction: 0.8 })
      const result = judgeWithLooseThreshold.quickReview({
        actorID: "test-actor",
        requestType: "test_modification",
        originalTest: `test("math", () => {
  expect(1 + 1).toBe(2)
  expect(2 + 2).toBe(4)
  expect(3 + 3).toBe(6)
  expect(4 + 4).toBe(8)
  expect(5 + 5).toBe(10)
})`,
        suggestedChange: `test("math", () => {
  expect(1 + 1).toBe(2)
})`,
        reason: "简化测试",
        context: {},
      })
      // 80%阈值允许删除80%的断言
      expect(result.approved).toBe(true)
    })
  })
})
