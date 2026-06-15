#!/usr/bin/env bun
import { $, file } from "bun"
import path from "path"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

async function runE2E() {
  console.log(`\n${BLUE}🚀 开始执行 Helix 自动化验证集 (E2E Test Suite)...${RESET}`)
  
  const setupScript = path.resolve("script/dogfooding/setup.ts")
  const platform = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const cliScript = path.resolve(`packages/opencode/dist/mimocode-${platform}-${arch}/bin/mimo${process.platform === "win32" ? ".exe" : ""}`)
  
  if (!(await file(setupScript).exists()) || !(await file(cliScript).exists())) {
    console.error(`${RED}❌ 找不到环境脚手架或 CLI 脚本，请在 Helix 项目根目录执行。${RESET}`)
    process.exit(1)
  }

  const casesPath = path.resolve("script/dogfooding/cases.json")
  if (!(await file(casesPath).exists())) {
    console.error(`${RED}❌ 找不到 cases.json，请先执行 bun run script/dogfooding/generate_cases.ts${RESET}`)
    process.exit(1)
  }

  let allCases = await Bun.file(casesPath).json()

  // 解析命令行参数
  const args = process.argv.slice(2)
  let targetId = ""
  let targetCategory = ""

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id" && args[i+1]) {
      targetId = args[i+1]
      i++
    } else if (args[i] === "--category" && args[i+1]) {
      targetCategory = args[i+1]
      i++
    }
  }

  if (targetId) {
    allCases = allCases.filter((c: any) => c.id === targetId)
  } else if (targetCategory) {
    allCases = allCases.filter((c: any) => c.category === targetCategory)
  } else {
    console.log(`${YELLOW}⚠️ 未指定过滤条件，默认将执行全部 ${allCases.length} 个测试用例。这可能需要较长时间。${RESET}`)
    console.log(`${YELLOW}提示: 可以使用 --id ENV-001 或 --category HEAL 来过滤。${RESET}\n`)
  }

  if (allCases.length === 0) {
    console.log(`${RED}❌ 未找到符合条件的测试用例。${RESET}`)
    process.exit(1)
  }

  let passed = 0

  for (const t of allCases) {
    console.log(`\n${YELLOW}==========================================${RESET}`)
    console.log(`${YELLOW}▶ 正在执行测试: ${t.id} - ${t.description}${RESET}`)
    console.log(`${YELLOW}==========================================${RESET}`)
    
    // 1. 准备环境
    await $`bun run ${setupScript} ${t.id}`.quiet()
    
    // 2. 注入任务指令并启动 Helix
    const targetDir = path.resolve(`./.dogfooding/${t.id.toLowerCase()}`)
    console.log(`${BLUE}正在唤起智能体执行任务 (这可能需要几分钟)...${RESET}`)
    
    try {
      // 传入 prompt 并让它在 targetDir 执行
      await $`${cliScript} run "${t.prompt}" --dangerously-skip-permissions`.cwd(targetDir)
      
      // 3. 验证 Ground Truth
      console.log(`${BLUE}正在验证结果...${RESET}`)
      const cmdParts = t.validationCommand.split(" ")
      const executable = cmdParts[0]
      const cmdArgs = cmdParts.slice(1)
      
      const isSuccess = await $`${executable} ${cmdArgs}`.cwd(targetDir).nothrow().quiet().then(res => res.exitCode === 0)
      
      if (isSuccess) {
        console.log(`${GREEN}✅ 测试通过: ${t.id}${RESET}`)
        passed++
      } else {
        console.log(`${RED}❌ 测试失败: ${t.id} (验证标准未达成)${RESET}`)
      }
    } catch (e) {
      console.log(`${RED}❌ 测试异常中断: ${t.id}${RESET}`)
      console.error(e)
    }
  }

  console.log(`\n${BLUE}==========================================${RESET}`)
  console.log(`📊 验证集执行完毕: ${passed}/${allCases.length} 通过`)
  if (passed === allCases.length) {
    console.log(`${GREEN}🎉 恭喜！Helix 底座完美通过了本批次验证。${RESET}`)
  } else {
    console.log(`${RED}⚠️ 存在未通过的测试，请检查 Trace 日志进行优化。${RESET}`)
  }
}

runE2E().catch(console.error)
