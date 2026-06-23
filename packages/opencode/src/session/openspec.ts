import { Effect, Context, Layer } from "effect"
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import { Log } from "@/util"

const log = Log.create({ service: "openspec" })

export interface SpecMatch {
  readonly specPath: string
  readonly requirement: string
}

export interface SpecResult {
  readonly success: boolean
  readonly output: string
  readonly tokensUsed: number
}

export interface Interface {
  readonly findSpec: (description: string) => Effect.Effect<SpecMatch | undefined>
  readonly findSpecByFiles: (files: string[]) => Effect.Effect<SpecMatch | undefined>
  readonly updateSpec: (match: SpecMatch, result: SpecResult) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/OpenSpec") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const specsDir = join(process.cwd(), "openspec/specs")

    const findSpec = Effect.fn("OpenSpec.findSpec")(function* (description: string) {
      if (!existsSync(specsDir)) return undefined

      const dirs = readdirSync(specsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)

      if (dirs.length === 0) return undefined

      const taskLower = description.toLowerCase()
      const keywords = taskLower.split(/[\s,;:/\\]+/).filter(Boolean)

      // Round 1: keyword match against directory name
      for (const dir of dirs) {
        const dirLower = dir.toLowerCase()
        const matchCount = keywords.filter((kw) => dirLower.includes(kw)).length
        if (matchCount >= 1) {
          const specPath = join(specsDir, dir, "spec.md")
          if (existsSync(specPath)) {
            const content = readFileSync(specPath, "utf-8")
            const pendingMatch = content.match(/^### (.+)\n[^\n]*\n\n\*\*Status\*\*: pending/m)
            if (pendingMatch) return { specPath, requirement: pendingMatch[1].trim() }
            const reqMatch = content.match(/^### (.+)/m)
            if (reqMatch) return { specPath, requirement: reqMatch[1].trim() }
          }
        }
      }

      // Round 2: directory word split match
      for (const dir of dirs) {
        const dirWords = dir.toLowerCase().split("-")
        const matchCount = dirWords.filter((w) => taskLower.includes(w)).length
        if (matchCount >= dirWords.length * 0.5) {
          const specPath = join(specsDir, dir, "spec.md")
          if (existsSync(specPath)) {
            const content = readFileSync(specPath, "utf-8")
            const reqMatch = content.match(/^### (.+)/m)
            if (reqMatch) return { specPath, requirement: reqMatch[1].trim() }
          }
        }
      }

      return undefined
    })

    const findSpecByFiles = Effect.fn("OpenSpec.findSpecByFiles")(function* (files: string[]) {
      if (!existsSync(specsDir) || files.length === 0) return undefined

      const dirs = readdirSync(specsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)

      if (dirs.length === 0) return undefined

      // Extract keywords from file paths: split on /, -, . and take meaningful segments
      const pathKeywords = new Set<string>()
      for (const f of files) {
        const segments = f.toLowerCase().split(/[/\-_.]+/).filter((s) => s.length > 2)
        for (const seg of segments) pathKeywords.add(seg)
      }

      // Round 1: keyword match against directory name
      for (const dir of dirs) {
        const dirLower = dir.toLowerCase()
        const matchCount = [...pathKeywords].filter((kw) => dirLower.includes(kw)).length
        if (matchCount >= 1) {
          const specPath = join(specsDir, dir, "spec.md")
          if (existsSync(specPath)) {
            const content = readFileSync(specPath, "utf-8")
            const pendingMatch = content.match(/^### (.+)\n[^\n]*\n\n\*\*Status\*\*: pending/m)
            if (pendingMatch) return { specPath, requirement: pendingMatch[1].trim() }
            const reqMatch = content.match(/^### (.+)/m)
            if (reqMatch) return { specPath, requirement: reqMatch[1].trim() }
          }
        }
      }

      // Round 2: directory word split match
      for (const dir of dirs) {
        const dirWords = dir.toLowerCase().split("-")
        const matchCount = dirWords.filter((w) => pathKeywords.has(w)).length
        if (matchCount >= Math.max(1, dirWords.length * 0.5)) {
          const specPath = join(specsDir, dir, "spec.md")
          if (existsSync(specPath)) {
            const content = readFileSync(specPath, "utf-8")
            const reqMatch = content.match(/^### (.+)/m)
            if (reqMatch) return { specPath, requirement: reqMatch[1].trim() }
          }
        }
      }

      return undefined
    })

    const updateSpec = Effect.fn("OpenSpec.updateSpec")(function* (match: SpecMatch, result: SpecResult) {
      if (!existsSync(match.specPath)) return false

      let content = readFileSync(match.specPath, "utf-8")
      const lines = content.split("\n")
      const newLines: string[] = []
      let inTarget = false
      let found = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (line.startsWith("### ") && line.includes(match.requirement)) {
          inTarget = true
          found = true
          newLines.push(line)
          continue
        }

        if (inTarget && (line.startsWith("### ") || line.startsWith("## "))) {
          const date = new Date().toISOString().slice(0, 10)
          const icon = result.success ? "✅" : "❌"
          const status = result.success ? "implemented" : "failed"
          newLines.push("")
          newLines.push(`**Status**: ${icon} ${status} (${date})`)
          newLines.push(`**Tokens**: ${result.tokensUsed.toLocaleString()}`)
          if (!result.success && result.output) {
            newLines.push(`**Notes**: ${result.output.slice(0, 200).replace(/\n/g, " ")}`)
          }
          newLines.push("")
          inTarget = false
        }

        if (inTarget && (line.startsWith("**Status**:") || line.startsWith("**Tokens**:") || line.startsWith("**Notes**:"))) {
          continue
        }

        newLines.push(line)
      }

      if (!found) return false

      writeFileSync(match.specPath, newLines.join("\n"))
      log.info("spec updated", { specPath: match.specPath, requirement: match.requirement, success: result.success })
      return true
    })

    return { findSpec, findSpecByFiles, updateSpec }
  }),
)

export const defaultLayer = layer

export * as OpenSpec from "./openspec"
