import { describe, expect, test } from "bun:test"
import { make, type ReviewRequest } from "../../src/agent/judge-agent"

const baseRequest: ReviewRequest = {
  actorID: "test-agent",
  requestType: "test_modification",
  originalTest: "",
  suggestedChange: "src/routes/chat.tsx",
  reason: "automated check",
  context: {},
}

describe("Claim Gate", () => {
  const judge = make()

  test("blocks 'fixed' claim without verification", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "已修复 chat textarea 的键盘输入问题",
      verificationLevel: "compile",
    })
    expect(result.approved).toBe(false)
    expect(result.rationale).toContain("验证级别")
  })

  test("blocks 'implemented' claim with only typecheck", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "Chat textarea fixed. Build and typecheck pass.",
      verificationLevel: "typecheck",
    })
    expect(result.approved).toBe(false)
    expect(result.rationale).toContain("typecheck")
  })

  test("allows 'fixed' claim with functional verification", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "已修复，功能测试通过",
      verificationLevel: "functional",
    })
    expect(result.approved).toBe(true)
  })

  test("passes when no completion claim in message", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "I changed the onKeyDown handler to onSubmit",
      verificationLevel: "compile",
    })
    expect(result.approved).toBe(true)
  })
})

describe("Test Quality Check", () => {
  const judge = make()

  test("blocks structural-only tests", () => {
    const result = judge.quickReview({
      ...baseRequest,
      testFileContents: [{
        path: "test/index.test.ts",
        content: `expect(fs.existsSync(path.join(srcPath, "routes", "chat.tsx"))).toBe(true)`,
      }],
    })
    expect(result.approved).toBe(false)
    expect(result.rationale).toContain("结构性检查")
  })

  test("allows functional tests with behavioral assertions", () => {
    const result = judge.quickReview({
      ...baseRequest,
      testFileContents: [{
        path: "test/chat.test.tsx",
        content: `expect(submitted.length).toBe(1)\nexpect(frame).toContain("Hello")`,
      }],
    })
    expect(result.approved).toBe(true)
  })

  test("passes when no test files provided", () => {
    const result = judge.quickReview({
      ...baseRequest,
      testFileContents: undefined,
    })
    expect(result.approved).toBe(true)
  })

  test("detects mixed structural + no functional", () => {
    const result = judge.quickReview({
      ...baseRequest,
      testFileContents: [{
        path: "test/index.test.ts",
        content: `
          expect(fs.existsSync(path.join(srcPath, "routes"))).toBe(true)
          expect(fs.existsSync(path.join(srcPath, "app.tsx"))).toBe(true)
        `,
      }],
    })
    expect(result.approved).toBe(false)
    expect(result.rationale).toContain("结构性检查")
  })
})

describe("Verification Level", () => {
  const judge = make()

  test("blocks L0 (compile) for 'fixed' claims", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "修复完成，编译通过",
      verificationLevel: "compile",
    })
    expect(result.approved).toBe(false)
    expect(result.rationale).toContain("compile")
  })

  test("blocks L1 (typecheck) for 'done' claims", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "Done. Typecheck passes.",
      verificationLevel: "typecheck",
    })
    expect(result.approved).toBe(false)
  })

  test("allows L2 (regression) when tests are functional", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "修复完成，测试通过",
      verificationLevel: "regression",
      testFileContents: [{
        path: "test/chat.test.tsx",
        content: "expect(result).toBe(true)",
      }],
    })
    expect(result.approved).toBe(true)
  })

  test("blocks L2 when tests are structural-only", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "修复完成，测试通过",
      verificationLevel: "regression",
      testFileContents: [{
        path: "test/index.test.ts",
        content: "expect(fs.existsSync('src/chat.tsx')).toBe(true)",
      }],
    })
    expect(result.approved).toBe(false)
    expect(result.rationale).toContain("结构性检查")
  })

  test("allows L3 (functional) unconditionally", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "fixed",
      verificationLevel: "functional",
    })
    expect(result.approved).toBe(true)
  })
})

describe("Integration: full scenario", () => {
  const judge = make()

  test("the chat textarea scenario would be caught", () => {
    const result = judge.quickReview({
      ...baseRequest,
      agentMessage: "已修复 chat textarea 的键盘输入。bun run build 成功，bun typecheck 通过。",
      verificationLevel: "compile",
      testFileContents: [{
        path: "test/index.test.ts",
        content: `
          expect(fs.existsSync(path.join(srcPath, "routes", "chat.tsx"))).toBe(true)
          expect(fs.existsSync(path.join(srcPath, "app.tsx"))).toBe(true)
        `,
      }],
    })
    expect(result.approved).toBe(false)
    expect(result.suggestions).toBeDefined()
    expect(result.suggestions!.length).toBeGreaterThan(0)
  })
})
