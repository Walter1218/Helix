#!/usr/bin/env bun
import { $, file } from "bun"
import path from "path"
import fs from "fs/promises"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

async function ensurePackageJson(dir: string, env?: string) {
  const p = path.join(dir, "package.json")
  if (!(await file(p).exists())) {
    const pkg: any = {
      name: "helix-dogfooding-env",
      version: "1.0.0",
      description: "Temporary environment for testing Helix",
      scripts: {
        "typecheck": "tsc --noEmit"
      },
      dependencies: {},
      devDependencies: {
        "typescript": "^5.0.0",
        "@types/bun": "latest"
      }
    };
    if (env === "node-esm") {
      pkg.type = "module";
    }
    if (env === "react") {
      pkg.dependencies["react"] = "^18.2.0";
      pkg.dependencies["react-dom"] = "^18.2.0";
      pkg.devDependencies["@types/react"] = "^18.2.0";
    }
    await fs.writeFile(p, JSON.stringify(pkg, null, 2))
  }
}

async function ensureTsconfig(dir: string, env?: string, cond?: string) {
  if (cond === "missing-config") return; // 模拟配置文件丢失
  
  const p = path.join(dir, "tsconfig.json")
  if (!(await file(p).exists())) {
    const tsconfig: any = {
      compilerOptions: {
        target: "ESNext",
        module: env === "node-esm" ? "ESNext" : "CommonJS",
        moduleResolution: "node",
        strict: cond === "strict-ts",
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      }
    };
    if (env === "react" || env === "vue") {
      tsconfig.compilerOptions.jsx = "react-jsx";
    }
    await fs.writeFile(p, JSON.stringify(tsconfig, null, 2))
  }
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  console.log(`${YELLOW}=== Helix Dogfooding 环境准备脚手架 ===${RESET}`)

  if (!cmd) {
    console.log(`${RED}❌ 请提供测试用例 ID。例如: bun run script/dogfooding/setup.ts ENV-001${RESET}`)
    process.exit(1)
  }

  const casesPath = path.resolve(__dirname, "cases.json")
  if (!(await file(casesPath).exists())) {
    console.log(`${RED}❌ 找不到 cases.json，请先执行 bun run script/dogfooding/generate_cases.ts${RESET}`)
    process.exit(1)
  }

  const cases = await Bun.file(casesPath).json()
  const testCase = cases.find((c: any) => c.id === cmd)

  if (!testCase) {
    console.log(`${RED}❌ 找不到测试用例: ${cmd}${RESET}`)
    process.exit(1)
  }

  console.log(`\n${BLUE}>>> 正在准备测试环境: ${testCase.id} (${testCase.description})${RESET}`)
  const targetDir = path.resolve(`./.dogfooding/${testCase.id.toLowerCase()}`)
  
  // Clean and recreate
  await $`rm -rf ${targetDir}`.quiet()
  await $`mkdir -p ${targetDir}`.quiet()

  // Write all files defined in the test case
  for (const [relPath, content] of Object.entries(testCase.files)) {
    const fullPath = path.join(targetDir, relPath)
    await $`mkdir -p ${path.dirname(fullPath)}`.quiet()
    await fs.writeFile(fullPath, content as string)
  }

  // Ensure default environment configuration if not explicitly provided
  await ensurePackageJson(targetDir, testCase.environment)
  await ensureTsconfig(targetDir, testCase.environment, testCase.condition)

  // Install dependencies
  console.log(`${BLUE}📦 正在安装基础依赖...${RESET}`)
  await $`bun install`.cwd(targetDir).quiet()

  console.log(`${GREEN}✅ 环境已就绪。${RESET}`)
  console.log(`\n请新开一个终端，执行以下命令进入测试目录并唤起 Helix:`)
  
  const platform = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const cliScript = `../../packages/opencode/dist/mimocode-${platform}-${arch}/bin/mimo${process.platform === "win32" ? ".exe" : ""}`
  
  console.log(`${YELLOW}cd ${targetDir} && ${cliScript} run "${testCase.prompt}" ${RESET}\n`)
}

main().catch(console.error)
