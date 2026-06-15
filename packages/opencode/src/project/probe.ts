import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { InstanceState } from "@/effect"
import * as path from "path"

export interface Interface {
  /**
   * Scans the current project directory for configuration files
   * and generates strict constraints for the LLM system prompt.
   */
  readonly getConstraints: () => Effect.Effect<string[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectProbe") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const getConstraints = Effect.fn("ProjectProbe.getConstraints")(function* () {
      const ctx = yield* InstanceState.context
      const rootDir = ctx.directory
      const constraints: string[] = []

      // 1. Package Manager Constraints
      const pkgJsonExists = yield* fs.existsSafe(path.join(rootDir, "package.json"))
      if (pkgJsonExists) {
        const hasPnpmLock = yield* fs.existsSafe(path.join(rootDir, "pnpm-lock.yaml"))
        const hasYarnLock = yield* fs.existsSafe(path.join(rootDir, "yarn.lock"))
        const hasBunLockb = yield* fs.existsSafe(path.join(rootDir, "bun.lockb"))
        const hasBunLock = yield* fs.existsSafe(path.join(rootDir, "bun.lock"))
        
        if (hasPnpmLock) {
          constraints.push("This project uses pnpm. You MUST use 'pnpm' for installing dependencies and running scripts, NEVER use npm or yarn.")
        } else if (hasYarnLock) {
          constraints.push("This project uses yarn. You MUST use 'yarn' for installing dependencies and running scripts, NEVER use npm or pnpm.")
        } else if (hasBunLockb || hasBunLock) {
          constraints.push("This project uses bun. You MUST use 'bun' for installing dependencies and running scripts.")
        } else {
          constraints.push("This project uses npm. You MUST use 'npm' for installing dependencies.")
        }
        
        const pkgData = yield* fs.readFileString(path.join(rootDir, "package.json")).pipe(Effect.catch(() => Effect.succeed("{}")))
        try {
          const pkg = JSON.parse(pkgData)
          if (pkg.dependencies?.["@tarojs/taro"] || pkg.devDependencies?.["@tarojs/taro"]) {
            constraints.push("This project uses Taro framework. Adhere to Taro specific lifecycle and components.")
          }
          if (pkg.dependencies?.["react"] || pkg.devDependencies?.["react"]) {
            constraints.push("This project uses React. Use functional components and hooks.")
          }
          if (pkg.dependencies?.["vue"] || pkg.devDependencies?.["vue"]) {
            constraints.push("This project uses Vue.js. Follow Vue best practices.")
          }
        } catch(e) {}
      }

      // 2. Formatting & Linting
      const hasBiome = yield* fs.existsSafe(path.join(rootDir, "biome.json"))
      if (hasBiome) {
        constraints.push("This project uses Biome for linting and formatting. Ensure code modifications pass Biome checks.")
      } else {
        const hasEslintJs = yield* fs.existsSafe(path.join(rootDir, ".eslintrc.js"))
        const hasEslintJson = yield* fs.existsSafe(path.join(rootDir, ".eslintrc.json"))
        if (hasEslintJs || hasEslintJson) {
          constraints.push("This project uses ESLint. Adhere strictly to the project's ESLint rules.")
        }
      }
      
      const hasPrettier = yield* fs.existsSafe(path.join(rootDir, ".prettierrc"))
      if (hasPrettier) {
        constraints.push("This project uses Prettier. Ensure code is formatted according to Prettier rules.")
      }

      // 3. Typescript
      const hasTsConfig = yield* fs.existsSafe(path.join(rootDir, "tsconfig.json"))
      if (hasTsConfig) {
        constraints.push("This is a TypeScript project. Always use proper static typing, avoid 'any', and ensure 'bun typecheck' or 'tsc' passes.")
      }

      return constraints
    })

    return Service.of({ getConstraints })
  })
)

export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

export * as ProjectProbe from "./probe"