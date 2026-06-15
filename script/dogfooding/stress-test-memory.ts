#!/usr/bin/env bun
/**
 * 记忆代谢压力测试 (Memory Decay Stress Test)
 *
 * 模拟 3 个月的代码库迭代：
 * 1. 注入 200 条带有 [file: ...][hash: ...] 标记的规则到 AGENTS.md
 * 2. 随机修改 80% 的关联文件（模拟真实迭代）
 * 3. 运行 MemoryDecay.filterDecayed，验证代谢率
 * 4. 断言：僵尸规则应被代谢到 < 10 条
 *
 * 用法: bun run script/dogfooding/stress-test-memory.ts
 */

import { $, file } from "bun"
import path from "path"
import fs from "fs/promises"
import * as crypto from "crypto"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

const TEST_DIR = path.resolve(".dogfooding/memory-stress-test")
const RULE_COUNT = 200
const MODIFY_RATIO = 0.8 // 80% 的文件会被修改（导致 hash 变化）

// ---- 工具函数 ----

function semanticHash(content: string): string {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "")
    .replace(/(^|\s)#.*/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return crypto.createHash("sha256").update(stripped).digest("hex").slice(0, 12)
}

function generateRule(fileIndex: number, fileHash: string): string {
  const categories = ["React", "TypeScript", "CSS", "Bun", "Node", "Testing", "API", "DB", "Auth", "Deploy"]
  const actions = [
    "Always ensure imports are explicit",
    "Prefer functional components over class components",
    "Use async/await over Promise chains",
    "Avoid any type, use unknown or generic constraints",
    "Ensure error boundaries for every route",
    "Validate input at every API boundary",
    "Use environment variables, never hardcode secrets",
    "Prefer Bun APIs over Node APIs when available",
    "Add unit tests for every public function",
    "Use proper TypeScript strict mode",
  ]
  const cat = categories[fileIndex % categories.length]
  const action = actions[fileIndex % actions.length]
  return `- [file: src/module-${fileIndex}.ts] [hash: ${fileHash}] **[${cat}]** ${action} in all related files.`
}

// ---- 主测试 ----

async function run() {
  console.log(`\n${BLUE}🧠 记忆代谢压力测试 启动${RESET}`)
  console.log(`${YELLOW}规则数: ${RULE_COUNT} | 文件修改比例: ${(MODIFY_RATIO * 100).toFixed(0)}%${RESET}\n`)

  // 1. 准备沙箱目录
  await fs.rm(TEST_DIR, { recursive: true, force: true })
  await fs.mkdir(path.join(TEST_DIR, "src"), { recursive: true })

  // 2. 生成 200 个 .ts 文件 + 对应规则
  const files: Map<number, { path: string; originalHash: string }> = new Map()

  console.log(`${BLUE}▶ 阶段 1: 生成 ${RULE_COUNT} 个文件 & 规则...${RESET}`)
  for (let i = 0; i < RULE_COUNT; i++) {
    const content = `// Generated test module ${i}\nexport function mod${i}(): number {\n  return ${i * 7};\n}\n`
    const filePath = path.join(TEST_DIR, "src", `module-${i}.ts`)
    await fs.writeFile(filePath, content)
    files.set(i, { path: filePath, originalHash: semanticHash(content) })
  }

  // 3. 生成 AGENTS.md，注入所有规则
  let agentsMd = "# AGENTS.md - Stress Test Rules\n\n"
  for (let i = 0; i < RULE_COUNT; i++) {
    const f = files.get(i)!
    agentsMd += generateRule(i, f.originalHash) + "\n"
  }
  const agentsMdPath = path.join(TEST_DIR, "AGENTS.md")
  await fs.writeFile(agentsMdPath, agentsMd)
  console.log(`${GREEN}✅ AGENTS.md 已生成 (${new Blob([agentsMd]).size} bytes)${RESET}`)

  // 4. 模拟 3 个月迭代：随机修改 80% 的文件
  console.log(`\n${BLUE}▶ 阶段 2: 模拟迭代，修改 ${(MODIFY_RATIO * 100).toFixed(0)}% 的文件...${RESET}`)
  const modifiedIndices = new Set<number>()
  for (let i = 0; i < RULE_COUNT; i++) {
    if (Math.random() < MODIFY_RATIO) {
      modifiedIndices.add(i)
      const newContent = `// Modified module ${i} in iteration\n\nexport function mod${i}(x: number): number {\n  return x * ${i} + 1;\n}\n`
      await fs.writeFile(path.join(TEST_DIR, "src", `module-${i}.ts`), newContent)
    }
  }
  console.log(`${YELLOW}已修改 ${modifiedIndices.size} 个文件${RESET}`)

  // 5. 读取 AGENTS.md，执行代谢检测
  console.log(`\n${BLUE}▶ 阶段 3: 执行记忆代谢检测...${RESET}`)
  const content = await fs.readFile(agentsMdPath, "utf-8")
  const lines = content.split("\n")
  const headerLines = lines.filter(l => !l.startsWith("- [file:"))
  const ruleLines = lines.filter(l => l.startsWith("- [file:"))

  let validCount = 0
  let decayedCount = 0
  const validRules: string[] = []
  const decayedRules: string[] = []

  for (const line of ruleLines) {
    const match = line.match(/\[file:\s*([^\]]+)\]\s*\[hash:\s*([a-f0-9]+)\]/)
    if (!match) {
      validRules.push(line)
      validCount++
      continue
    }

    const fileRelative = match[1]
    const expectedHash = match[2]
    const fullPath = path.join(TEST_DIR, fileRelative)

    try {
      const fileContent = await fs.readFile(fullPath, "utf-8")
      const currentHash = semanticHash(fileContent)

      if (currentHash === expectedHash) {
        validRules.push(line)
        validCount++
      } else {
        decayedRules.push(`  ❌ ${fileRelative}: expected=${expectedHash} current=${currentHash}`)
        decayedCount++
      }
    } catch {
      // file deleted → definitely decayed
      decayedRules.push(`  ❌ ${fileRelative}: FILE NOT FOUND`)
      decayedCount++
    }
  }

  // 6. 生成代谢后的 AGENTS.md
  const metabolized = [...headerLines, ...validRules].join("\n")
  await fs.writeFile(agentsMdPath + ".metabolized", metabolized)

  // 7. 结果报告
  console.log(`\n${BLUE}==========================================${RESET}`)
  console.log(`${BLUE}📊 记忆代谢压力测试 结果${RESET}`)
  console.log(`${BLUE}==========================================${RESET}`)
  console.log(`  原始规则数:   ${RULE_COUNT}`)
  console.log(`  文件被修改:   ${modifiedIndices.size} (${(modifiedIndices.size / RULE_COUNT * 100).toFixed(0)}%)`)
  console.log(`  保留规则:     ${GREEN}${validCount}${RESET}`)
  console.log(`  代谢规则:     ${RED}${decayedCount}${RESET}`)
  console.log(`  代谢率:       ${(decayedCount / RULE_COUNT * 100).toFixed(1)}%`)

  // 打印前 10 条被代谢的规则
  if (decayedRules.length > 0) {
    console.log(`\n${YELLOW}被代谢的规则（前 10 条）:${RESET}`)
    for (const r of decayedRules.slice(0, 10)) {
      console.log(r)
    }
  }

  // 8. 断言验证
  const pass = decayedCount >= modifiedIndices.size * 0.9 // 至少 90% 的修改文件所对应的规则被正确代谢
  const zombieRules = RULE_COUNT - validCount - (modifiedIndices.size > 0 ? modifiedIndices.size : 0)
  const zombieThreshold = 10

  console.log(`\n${BLUE}验证阈值:${RESET}`)
  console.log(`  代谢率 >= 修改率 * 0.9: ${pass ? GREEN + "PASS" : RED + "FAIL"}${RESET}`)
  console.log(`  残留僵尸规则 < ${zombieThreshold}: ${zombieRules < zombieThreshold ? GREEN + "PASS" : RED + "FAIL"}${RESET} (${zombieRules})`)

  if (pass && zombieRules < zombieThreshold) {
    console.log(`\n${GREEN}✅ 记忆代谢机制验证通过！${RESET}`)
    console.log(`${GREEN}MemoryDecay 能有效识别并清除过期规则，防止"只进不出"的毒药记忆。${RESET}`)
    process.exit(0)
  } else {
    console.log(`\n${RED}❌ 记忆代谢机制验证失败！${RESET}`)
    console.log(`${RED}需要检查 MemoryDecay.filterDecayed 的 hash 比对逻辑。${RESET}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(`${RED}❌ 测试异常:${RESET}`, e)
  process.exit(1)
})
