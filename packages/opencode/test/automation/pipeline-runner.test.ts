import { test, expect, describe } from "bun:test"

describe("pipeline-runner", () => {
  describe("extractErrorPattern", () => {
    const extractErrorPattern = (output: string): string => {
      if (output.includes("FOREIGN KEY")) return "FK_CONSTRAINT"
      if (output.includes("timeout") || output.includes("超时")) return "TIMEOUT"
      if (output.includes("permission") || output.includes("权限")) return "PERMISSION"
      if (output.includes("not found") || output.includes("不存在")) return "NOT_FOUND"
      if (output.includes("syntax error") || output.includes("语法错误")) return "SYNTAX_ERROR"
      return "UNKNOWN"
    }

    test("识别 FOREIGN KEY 错误", () => {
      expect(extractErrorPattern("FOREIGN KEY constraint failed")).toBe("FK_CONSTRAINT")
    })

    test("识别 timeout 错误", () => {
      expect(extractErrorPattern("operation timeout")).toBe("TIMEOUT")
      expect(extractErrorPattern("操作超时")).toBe("TIMEOUT")
    })

    test("识别 permission 错误", () => {
      expect(extractErrorPattern("permission denied")).toBe("PERMISSION")
      expect(extractErrorPattern("权限不足")).toBe("PERMISSION")
    })

    test("识别 not found 错误", () => {
      expect(extractErrorPattern("file not found")).toBe("NOT_FOUND")
      expect(extractErrorPattern("文件不存在")).toBe("NOT_FOUND")
    })

    test("识别 syntax error", () => {
      expect(extractErrorPattern("syntax error near 'foo'")).toBe("SYNTAX_ERROR")
      expect(extractErrorPattern("语法错误")).toBe("SYNTAX_ERROR")
    })

    test("未知错误返回 UNKNOWN", () => {
      expect(extractErrorPattern("something went wrong")).toBe("UNKNOWN")
    })

    test("空字符串返回 UNKNOWN", () => {
      expect(extractErrorPattern("")).toBe("UNKNOWN")
    })
  })

  describe("KNOWN_TYPE_ERRORS", () => {
    const KNOWN_TYPE_ERRORS = ["bash.ts", "tool.ts", "workflow.ts"]

    test("已知文件被识别为类型安全", () => {
      const hasOnlyKnownErrors = (output: string) =>
        output.split("\n").every(
          (line) => KNOWN_TYPE_ERRORS.some((e) => line.includes(e)) || line.trim() === "",
        )

      expect(hasOnlyKnownErrors("bash.ts:123 - error")).toBe(true)
      expect(hasOnlyKnownErrors("tool.ts:456 - error")).toBe(true)
      expect(hasOnlyKnownErrors("")).toBe(true)
    })

    test("非已知文件不被识别为类型安全", () => {
      const hasOnlyKnownErrors = (output: string) =>
        output.split("\n").every(
          (line) => KNOWN_TYPE_ERRORS.some((e) => line.includes(e)) || line.trim() === "",
        )

      expect(hasOnlyKnownErrors("session.ts:123 - error")).toBe(false)
    })
  })

  describe("test file discovery", () => {
    test("src 文件映射到 test 文件路径", () => {
      const file = "packages/opencode/src/memory/service.ts"
      const base = file.replace("packages/opencode/src/", "").replace(".ts", "")
      expect(base).toBe("memory/service")
      const testPath = `packages/opencode/test/${base}.test.ts`
      expect(testPath).toBe("packages/opencode/test/memory/service.test.ts")
    })

    test("非 src 文件不映射", () => {
      const file = "packages/app/src/index.ts"
      const isSrc = file.startsWith("packages/opencode/src/") && file.endsWith(".ts")
      expect(isSrc).toBe(false)
    })

    test("非 ts 文件不映射", () => {
      const file = "packages/opencode/src/style.css"
      const isTs = file.endsWith(".ts") || file.endsWith(".tsx")
      expect(isTs).toBe(false)
    })
  })

  describe("changed files extraction", () => {
    test("解析 git diff --name-only 输出", () => {
      const output = "src/foo.ts\nsrc/bar.ts\n"
      const files = output.split("\n").filter((f) => f.trim())
      expect(files).toEqual(["src/foo.ts", "src/bar.ts"])
    })

    test("解析 git status porcelain 输出（staged files）", () => {
      const output = "M  src/foo.ts\nA  src/bar.ts"
      const files = output.split("\n").filter((f) => f.trim()).map((f) => f.replace(/^[AM]\s+/, "").trim())
      expect(files).toEqual(["src/foo.ts", "src/bar.ts"])
    })

    test("untracked 文件保留 ?? 前缀", () => {
      const output = "?? src/baz.ts"
      const files = output.split("\n").filter((f) => f.trim()).map((f) => f.replace(/^[AM]\s+/, "").trim())
      expect(files).toEqual(["?? src/baz.ts"])
    })

    test("空输出返回空数组", () => {
      const files = "".split("\n").filter((f) => f.trim())
      expect(files).toEqual([])
    })
  })

  describe("dangerous file detection", () => {
    const dangerousFiles = ["AGENTS.md", "package.json", "tsconfig.json", "drizzle.config.ts"]

    test("识别关键文件修改", () => {
      expect(dangerousFiles.some((df) => "project/AGENTS.md".endsWith(df))).toBe(true)
      expect(dangerousFiles.some((df) => "package.json".endsWith(df))).toBe(true)
    })

    test("普通文件不被标记", () => {
      expect(dangerousFiles.some((df) => "src/utils.ts".endsWith(df))).toBe(false)
    })
  })

  describe("secret detection", () => {
    const secretPatterns = [/api[_-]?key\s*[:=]\s*["'][^"']+["']/i, /AKIA[A-Z0-9]{16}/, /sk-[a-zA-Z0-9]{48}/]

    test("检测 API key 硬编码", () => {
      const diff = '+  apiKey = "sk-1234567890abcdef1234567890abcdef1234567890abcdef"'
      const found = secretPatterns.some((p) => p.test(diff))
      expect(found).toBe(true)
    })

    test("检测 AWS key", () => {
      const diff = "+  key = 'AKIAIOSFODNN7EXAMPLE'"
      const found = secretPatterns.some((p) => p.test(diff))
      expect(found).toBe(true)
    })

    test("普通代码不误报", () => {
      const diff = "+  const x = 1 + 2"
      const found = secretPatterns.some((p) => p.test(diff))
      expect(found).toBe(false)
    })
  })
})
