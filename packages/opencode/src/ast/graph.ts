import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { InstanceState } from "@/effect"
import { Project } from "ts-morph"
import * as path from "path"

export interface Interface {
  /**
   * Generates a list of all files that depend on the given filepath.
   * Helps determine the blast radius of a proposed change.
   */
  readonly getBlastRadius: (filepath: string) => Effect.Effect<string[]>
  
  /**
   * Parses the AST of the file and returns exported function/class signatures.
   * Useful for extracting the contract without the implementation details.
   */
  readonly getContract: (filepath: string) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AstGraph") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const getBlastRadius = Effect.fn("AstGraph.getBlastRadius")(function* (filepath: string) {
      const ctx = yield* InstanceState.context
      const root = ctx.directory
      
      return yield* Effect.try({
        try: () => {
          const project = new Project({
            tsConfigFilePath: path.join(root, "tsconfig.json"),
            skipAddingFilesFromTsConfig: true,
          })
          
          project.addSourceFilesAtPaths([
            path.join(root, "**/*.ts"),
            path.join(root, "**/*.tsx"),
            path.join(root, "**/*.js"),
            path.join(root, "**/*.jsx")
          ])
          
          const sourceFile = project.getSourceFileOrThrow(filepath)
          
          const dependents = new Set<string>()
          
          // Find references to all exported declarations
          const entries = Array.from(sourceFile.getExportedDeclarations().entries())
          for (const [name, declarations] of entries) {
            for (const decl of declarations) {
              // Get nodes that reference this exported declaration
              if ("findReferences" in decl && typeof decl.findReferences === "function") {
                const referencedSymbols = decl.findReferences()
                for (const symbol of referencedSymbols) {
                  for (const ref of symbol.getReferences()) {
                    const refPath = ref.getSourceFile().getFilePath()
                    if (refPath !== filepath && !refPath.includes("node_modules")) {
                      dependents.add(refPath)
                    }
                  }
                }
              }
            }
          }
          
          return Array.from(dependents)
        },
        catch: () => [] as string[]
      }).pipe(Effect.catch(() => Effect.succeed([] as string[])))
    })

    const getContract = Effect.fn("AstGraph.getContract")(function* (filepath: string) {
      return yield* Effect.try({
        try: () => {
          const project = new Project({ skipAddingFilesFromTsConfig: true })
          project.addSourceFileAtPath(filepath)
          const sourceFile = project.getSourceFileOrThrow(filepath)
          
          let contract = ""
          
          // Extract exported classes
          for (const cls of sourceFile.getClasses()) {
            if (cls.isExported()) {
              contract += `export class ${cls.getName()} {\n`
              for (const prop of cls.getProperties()) {
                contract += `  ${prop.getText()}\n`
              }
              for (const method of cls.getMethods()) {
                // Get signature without body
                const sig = method.getText().replace(/{[\s\S]*}/, "{}")
                contract += `  ${sig}\n`
              }
              contract += "}\n\n"
            }
          }
          
          // Extract exported functions
          for (const func of sourceFile.getFunctions()) {
            if (func.isExported()) {
              const sig = func.getText().replace(/{[\s\S]*}/, "{}")
              contract += `${sig}\n\n`
            }
          }
          
          // Extract exported interfaces/types
          for (const intf of sourceFile.getInterfaces()) {
            if (intf.isExported()) {
              contract += `${intf.getText()}\n\n`
            }
          }
          
          for (const typeAlias of sourceFile.getTypeAliases()) {
            if (typeAlias.isExported()) {
              contract += `${typeAlias.getText()}\n\n`
            }
          }
          
          return contract.trim()
        },
        catch: () => ""
      }).pipe(Effect.catch(() => Effect.succeed("")))
    })

    return { getBlastRadius, getContract }
  })
)

export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

export * as AstGraph from "./graph"