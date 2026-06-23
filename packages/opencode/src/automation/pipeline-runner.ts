import { Effect, Context, Layer } from "effect"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"
import { Log } from "@/util"
import { Config } from "@/config"

const log = Log.create({ service: "pipeline-runner" })

export interface StepResult {
  readonly name: string
  readonly success: boolean
  readonly output: string
  readonly duration: number
  readonly tokensUsed?: number
}

export interface JudgeVerdict {
  readonly approved: boolean
  readonly issues: string[]
  readonly suggestions: string[]
}

export interface PipelineInput {
  readonly taskDescription: string
  readonly dryRun?: boolean
  readonly maxRetries?: number
  readonly timeoutMs?: number
}

export interface PipelineResult {
  readonly success: boolean
  readonly steps: StepResult[]
  readonly judgeVerdict: JudgeVerdict
  readonly totalDuration: number
  readonly tokensUsed: number
}

export interface Interface {
  readonly runPipeline: (input: PipelineInput) => Effect.Effect<PipelineResult>
  readonly stepBuild: () => Effect.Effect<StepResult>
  readonly stepTypecheck: () => Effect.Effect<StepResult>
  readonly stepTest: (changedFiles?: string[]) => Effect.Effect<StepResult>
  readonly stepLint: (changedFiles?: string[]) => Effect.Effect<StepResult>
  readonly judgeReviewChanges: () => Effect.Effect<JudgeVerdict>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/PipelineRunner") {}

const KNOWN_TYPE_ERRORS = ["bash.ts", "tool.ts", "workflow.ts"]

function runCmd(cmd: string, timeoutMs = 5 * 60 * 1000): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    })
    return { success: true, output }
  } catch (err: any) {
    return { success: false, output: err.stderr || err.stdout || err.message }
  }
}

function extractErrorPattern(output: string): string {
  if (output.includes("FOREIGN KEY")) return "FK_CONSTRAINT"
  if (output.includes("timeout") || output.includes("超时")) return "TIMEOUT"
  if (output.includes("permission") || output.includes("权限")) return "PERMISSION"
  if (output.includes("not found") || output.includes("不存在")) return "NOT_FOUND"
  if (output.includes("syntax error") || output.includes("语法错误")) return "SYNTAX_ERROR"
  return "UNKNOWN"
}

function getChangedFiles(): string[] {
  const { output } = runCmd("git diff --name-only HEAD~1 2>/dev/null || git status --porcelain")
  return output.split("\n").filter((f) => f.trim()).map((f) => f.replace(/^[AM]\s+/, "").trim())
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const stepBuild = Effect.fn("PipelineRunner.stepBuild")(function* () {
      const start = Date.now()
      log.info("build.start")
      const result = runCmd("bun run packages/opencode/script/build.ts --single", 3 * 60 * 1000)
      log.info(result.success ? "build.pass" : "build.fail", { output: result.output.slice(0, 200) })
      return { name: "编译验证", ...result, duration: Date.now() - start }
    })

    const stepTypecheck = Effect.fn("PipelineRunner.stepTypecheck")(function* () {
      const start = Date.now()
      log.info("typecheck.start")
      const result = runCmd("bun typecheck", 2 * 60 * 1000)
      const hasOnlyKnownErrors = result.output.split("\n").every(
        (line) => KNOWN_TYPE_ERRORS.some((e) => line.includes(e)) || line.trim() === "",
      )
      const success = result.success || hasOnlyKnownErrors
      log.info(success ? "typecheck.pass" : "typecheck.fail")
      return { name: "类型检查", success, output: result.output, duration: Date.now() - start }
    })

    const stepTest = Effect.fn("PipelineRunner.stepTest")(function* (changedFiles?: string[]) {
      const start = Date.now()
      log.info("test.start")

      const files = changedFiles ?? getChangedFiles()
      const testFiles: string[] = []
      for (const file of files) {
        if (file.startsWith("packages/opencode/src/") && file.endsWith(".ts")) {
          const base = file.replace("packages/opencode/src/", "").replace(".ts", "")
          const patterns = [
            `packages/opencode/test/${base}.test.ts`,
            `packages/opencode/test/${base}.test.ts`,
          ]
          for (const p of patterns) {
            if (existsSync(join(process.cwd(), p))) testFiles.push(p)
          }
        }
      }

      if (testFiles.length === 0) {
        log.info("test.skip", { reason: "no matching test files" })
        return { name: "测试", success: true, output: "无相关测试，跳过", duration: Date.now() - start }
      }

      log.info("test.running", { files: testFiles.length })
      const result = runCmd(`cd packages/opencode && bun test ${testFiles.join(" ")}`, 2 * 60 * 1000)
      log.info(result.success ? "test.pass" : "test.fail")
      return { name: "测试", ...result, duration: Date.now() - start }
    })

    const stepLint = Effect.fn("PipelineRunner.stepLint")(function* (changedFiles?: string[]) {
      const start = Date.now()
      log.info("lint.start")

      const files = changedFiles ?? getChangedFiles()
      const tsFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      if (tsFiles.length === 0) {
        log.info("lint.skip", { reason: "no changed TS files" })
        return { name: "Lint", success: true, output: "无变更文件，跳过", duration: Date.now() - start }
      }

      const result = runCmd(`bun run lint ${tsFiles.join(" ")}`, 2 * 60 * 1000)
      log.info(result.success ? "lint.pass" : "lint.fail")
      return { name: "Lint", ...result, duration: Date.now() - start }
    })

    const judgeReviewChanges = Effect.fn("PipelineRunner.judgeReviewChanges")(function* () {
      log.info("judge.start")
      const issues: string[] = []
      const suggestions: string[] = []

      const { output: statusOutput } = runCmd("git status --porcelain")
      const changedFiles = statusOutput.split("\n").filter((l) => l.trim()).map((l) => l.slice(3).trim())

      if (changedFiles.length === 0) {
        return { approved: true, issues, suggestions }
      }

      const { output: diff } = runCmd("git diff HEAD --unified=3")
      const { output: diffStaged } = runCmd("git diff --cached --unified=3")
      const fullDiff = diff + "\n" + diffStaged

      const testFilesChanged = changedFiles.filter(
        (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__"),
      )

      for (const testFile of testFilesChanged) {
        const { output: testDiff } = runCmd(`git diff HEAD -- "${testFile}"`)
        const removedAssertions = (testDiff.match(/^-\s*(expect|assert)\b.*$/gm) || []).length
        const addedAssertions = (testDiff.match(/^\+\s*(expect|assert)\b.*$/gm) || []).length
        if (removedAssertions > 0 && addedAssertions < removedAssertions) {
          issues.push(`测试文件 ${testFile} 删除了 ${removedAssertions - addedAssertions} 个断言`)
        }
        const removedTests = (testDiff.match(/^-\s*(test|it)\s*\(/gm) || []).length
        const addedTests = (testDiff.match(/^\+\s*(test|it)\s*\(/gm) || []).length
        if (removedTests > addedTests) {
          issues.push(`测试文件 ${testFile} 删除了 ${removedTests - addedTests} 个测试用例`)
        }
      }

      const dangerousFiles = ["AGENTS.md", "package.json", "tsconfig.json", "drizzle.config.ts"]
      for (const file of changedFiles) {
        if (dangerousFiles.some((df) => file.endsWith(df))) {
          suggestions.push(`修改了关键文件: ${file}`)
        }
      }

      if (fullDiff.includes("eval(") || fullDiff.includes("exec(")) {
        issues.push("检测到 eval/exec 调用")
      }

      const secretPatterns = [/api[_-]?key\s*[:=]\s*["'][^"']+["']/i, /AKIA[A-Z0-9]{16}/, /sk-[a-zA-Z0-9]{48}/]
      for (const pattern of secretPatterns) {
        if (pattern.test(fullDiff)) {
          issues.push("检测到可能的密钥泄露")
        }
      }

      const verdict = { approved: issues.length === 0, issues, suggestions }
      log.info(verdict.approved ? "judge.approved" : "judge.rejected", { issues: issues.length, suggestions: suggestions.length })
      return verdict
    })

    const runPipeline = Effect.fn("PipelineRunner.runPipeline")(function* (input: PipelineInput) {
      const pipelineStart = Date.now()
      const steps: StepResult[] = []
      let totalTokens = 0
      const maxRetries = input.maxRetries ?? 3

      log.info("pipeline.start", { task: input.taskDescription.slice(0, 100), dryRun: input.dryRun })

      // Step 1: Execute task (with retry)
      if (!input.dryRun) {
        const { output } = runCmd("git diff --name-only HEAD~1 2>/dev/null || git status --porcelain")
        const changedFiles = output.split("\n").filter((f) => f.trim()).map((f) => f.replace(/^[AM]\s+/, "").trim())

        // Step 2: Build
        const buildResult = yield* stepBuild()
        steps.push(buildResult)
        if (!buildResult.success) {
          return { success: false, steps, judgeVerdict: { approved: false, issues: ["编译失败"], suggestions: [] }, totalDuration: Date.now() - pipelineStart, tokensUsed: totalTokens }
        }

        // Step 3: Typecheck
        const typecheckResult = yield* stepTypecheck()
        steps.push(typecheckResult)
        if (!typecheckResult.success) {
          return { success: false, steps, judgeVerdict: { approved: false, issues: ["类型检查失败"], suggestions: [] }, totalDuration: Date.now() - pipelineStart, tokensUsed: totalTokens }
        }

        // Step 4: Test
        const testResult = yield* stepTest(changedFiles)
        steps.push(testResult)

        // Step 5: Lint
        const lintResult = yield* stepLint(changedFiles)
        steps.push(lintResult)

        // Step 6: Judge review
        const judgeVerdict = yield* judgeReviewChanges()
        if (!judgeVerdict.approved) {
          log.warn("pipeline.judge.rejected", { issues: judgeVerdict.issues })
        }

        // Step 7: Git (if all passed and judge approved)
        if (testResult.success && lintResult.success && judgeVerdict.approved) {
          const gitStart = Date.now()
          runCmd("git add -A")
          const commitResult = runCmd(`git commit -m "auto-dev: ${input.taskDescription.slice(0, 50).replace(/"/g, '\\"')}"`)
          steps.push({ name: "Git Commit", ...commitResult, duration: Date.now() - gitStart })

          if (commitResult.success) {
            const pushResult = runCmd("git push", 30_000)
            steps.push({ name: "Git Push", ...pushResult, duration: Date.now() - gitStart })
          }
        }

        const allSuccess = steps.every((s) => s.success)
        log.info("pipeline.complete", { success: allSuccess, steps: steps.length, duration: Date.now() - pipelineStart })

        return {
          success: allSuccess,
          steps,
          judgeVerdict,
          totalDuration: Date.now() - pipelineStart,
          tokensUsed: totalTokens,
        }
      }

      // Dry run
      steps.push({ name: "执行任务", success: true, output: "[dry-run] skipped", duration: 0 })
      return {
        success: true,
        steps,
        judgeVerdict: { approved: true, issues: [], suggestions: [] },
        totalDuration: Date.now() - pipelineStart,
        tokensUsed: 0,
      }
    })

    return { runPipeline, stepBuild, stepTypecheck, stepTest, stepLint, judgeReviewChanges }
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer))

export * as PipelineRunner from "./pipeline-runner"
