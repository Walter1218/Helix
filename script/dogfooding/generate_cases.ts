import fs from "fs/promises";
import path from "path";

export interface TestCase {
  id: string;
  category: "ENV" | "AST" | "HEAL" | "PLAN" | "ROLL" | "COMP";
  environment: "bun" | "node-cjs" | "node-esm" | "react" | "vue";
  condition: "normal" | "strict-ts" | "missing-config" | "syntax-error";
  description: string;
  files: Record<string, string>;
  prompt: string;
  validationCommand: string;
}

let cases: TestCase[] = [];

// 辅助函数：生成变异属性
function getRandomEnvironment(): TestCase["environment"] {
  const envs: TestCase["environment"][] = ["bun", "node-cjs", "node-esm", "react", "vue"];
  return envs[Math.floor(Math.random() * envs.length)] || "bun";
}

function getRandomCondition(): TestCase["condition"] {
  const conds: TestCase["condition"][] = ["normal", "strict-ts", "missing-config", "syntax-error"];
  return conds[Math.floor(Math.random() * conds.length)] || "normal";
}

// ------------------------------------------------------------------
// 1. ENV (环境认知与依赖自愈) - 10 cases
// 测试模型是否能发现缺失的包，自动安装并正确使用
// ------------------------------------------------------------------
const envDeps = [
  { name: "lodash", import: "import _ from 'lodash';", code: "export const chunk = (arr: any[], size: number) => _.chunk(arr, size);" },
  { name: "zod", import: "import { z } from 'zod';", code: "export const schema = z.object({ name: z.string() });" },
  { name: "axios", import: "import axios from 'axios';", code: "export const fetch = () => axios.get('/api');" },
  { name: "uuid", import: "import { v4 as uuidv4 } from 'uuid';", code: "export const genId = () => uuidv4();" },
  { name: "dayjs", import: "import dayjs from 'dayjs';", code: "export const now = () => dayjs().format();" },
  { name: "chalk", import: "import chalk from 'chalk';", code: "export const red = (msg: string) => chalk.red(msg);" },
  { name: "dotenv", import: "import dotenv from 'dotenv';", code: "dotenv.config(); export const getEnv = (k: string) => process.env[k];" },
  { name: "express", import: "import express from 'express';", code: "export const app = express();" },
  { name: "react", import: "import React, { useState } from 'react';", code: "export const App = () => { const [c, setC] = useState(0); return <div onClick={() => setC(c+1)}>{c}</div>; }" },
  { name: "commander", import: "import { Command } from 'commander';", code: "export const program = new Command();" }
];

envDeps.forEach((dep, i) => {
  cases.push({
    id: `ENV-${String(i + 1).padStart(3, '0')}`,
    category: "ENV",
    environment: getRandomEnvironment(),
    condition: getRandomCondition(),
    description: `Auto-install missing dependency: ${dep.name}`,
    files: {
      "src/index.tsx": `${dep.import}\n${dep.code}`
    },
    prompt: `Make sure the code in src/index.tsx compiles without errors. Install any missing dependencies if necessary.`,
    validationCommand: "npx tsc --noEmit"
  });
});

// ------------------------------------------------------------------
// 2. AST (爆炸半径感知与防爆改) - 10 cases
// 测试模型是否能顺藤摸瓜修改所有依赖链路
// ------------------------------------------------------------------
for (let i = 1; i <= 10; i++) {
  cases.push({
    id: `AST-${String(i).padStart(3, '0')}`,
    category: "AST",
    environment: getRandomEnvironment(),
    condition: getRandomCondition(),
    description: `Refactor type and usages variant ${i}`,
    files: {
      "src/types.ts": `export interface Item { id: ${i % 2 === 0 ? 'number' : 'string'}; value: string; }`,
      "src/consumer.ts": `import { Item } from './types';\nexport function processItem(item: Item) {\n  if (item.id === ${i % 2 === 0 ? '123' : '"123"'}) return true;\n  return false;\n}`,
      "src/nested/deep.ts": `import { Item } from '../types';\nexport const fallbackItem: Item = { id: ${i % 2 === 0 ? '0' : '"0"'}, value: 'none' };`
    },
    prompt: `Change the 'id' field in Item interface in src/types.ts to ${i % 2 === 0 ? 'string' : 'number'} and fix all type errors across the project.`,
    validationCommand: "npx tsc --noEmit"
  });
}

// ------------------------------------------------------------------
// 3. HEAL (对抗性自愈) - 10 cases
// 测试模型能否通过测试报错自我反思修复代码
// ------------------------------------------------------------------
const healScenarios = [
  { name: "leap_year", bad: "return year % 4 === 0;", test: "expect(isLeap(2000)).toBe(true); expect(isLeap(1900)).toBe(false); // intentional strict test for 1900 which is not leap, wait 1900 is NOT leap, 2000 is." },
  { name: "chunk_array", bad: "return [arr.slice(0, size)];", test: "expect(chunk([1,2,3,4], 2)).toEqual([[1,2], [3,4]]);" },
  { name: "palindrome", bad: "return str === str.split('').reverse().join('');", test: "expect(isPalindrome('A man a plan a canal Panama')).toBe(true);" },
  { name: "email_regex", bad: "return /.+@.+/.test(email);", test: "expect(isValidEmail('test@domain')).toBe(false); expect(isValidEmail('test@domain.com')).toBe(true);" },
  { name: "div_zero", bad: "return nums.reduce((a,b)=>a+b, 0) / nums.length;", test: "expect(average([])).toBe(0);" },
  { name: "deep_clone", bad: "return Object.assign({}, obj);", test: "const o={a:{b:1}}; const c=clone(o); c.a.b=2; expect(o.a.b).toBe(1);" },
  { name: "async_sequence", bad: "return Promise.all(tasks.map(t => t()));", test: "/* mock tasks that must run sequentially */" },
  { name: "json_parse", bad: "return JSON.parse(str);", test: "expect(safeParse('bad json')).toBeNull();" },
  { name: "title_case", bad: "return str.toLowerCase();", test: "expect(titleCase('hello world')).toBe('Hello World');" },
  { name: "fizzbuzz", bad: "if(n%3===0) return 'Fizz'; if(n%5===0) return 'Buzz'; return n;", test: "expect(fizzbuzz(15)).toBe('FizzBuzz');" },
];

healScenarios.forEach((sc, i) => {
  cases.push({
    id: `HEAL-${String(i + 1).padStart(3, '0')}`,
    category: "HEAL",
    environment: getRandomEnvironment(),
    condition: getRandomCondition(),
    description: `Fix logical bug: ${sc.name}`,
    files: {
      "src/logic.ts": `export function runLogic(input: any): any { ${sc.bad} }`,
      "test/logic.test.ts": `import { expect, test } from "bun:test";\nimport { runLogic } from "../src/logic";\n\ntest("validation", () => {\n  // Intentionally strict assertions\n  // This ensures the agent must run tests and heal.\n  ${sc.test}\n});`
    },
    prompt: `The logic in src/logic.ts is flawed. Fix it so that it passes the strict tests in test/logic.test.ts perfectly. Do not modify the test file.`,
    validationCommand: "bun test"
  });
});

// ------------------------------------------------------------------
// 4. PLAN (宏观规划与生成) - 10 cases
// 测试模型从零构建多文件能力
// ------------------------------------------------------------------
for (let i = 1; i <= 10; i++) {
  cases.push({
    id: `PLAN-${String(i).padStart(3, '0')}`,
    category: "PLAN",
    environment: getRandomEnvironment(),
    condition: getRandomCondition(),
    description: `Implement requested utility ${i}`,
    files: {
      "test/util.test.ts": `import { expect, test } from "bun:test";\nimport { Util } from "../src/util";\ntest("check instance", () => { expect(new Util()).toBeDefined(); });`
    },
    prompt: `Create a class named Util in src/util.ts. Make sure it is exported and passes the basic instantiation test in test/util.test.ts. Add at least one meaningful method to it.`,
    validationCommand: "bun test"
  });
}

// ------------------------------------------------------------------
// 5. ROLL (沙箱防呆与回滚) - 5 cases
// 测试致命错误时模型的自愈和回滚能力
// ------------------------------------------------------------------
for (let i = 1; i <= 5; i++) {
  cases.push({
    id: `ROLL-${String(i).padStart(3, '0')}`,
    category: "ROLL",
    environment: getRandomEnvironment(),
    condition: getRandomCondition(),
    description: `Fix syntax/fatal errors ${i}`,
    files: {
      "src/bad.ts": `export function broken() { const a = 1; return a + ; } // syntax error`
    },
    prompt: `Fix the syntax error in src/bad.ts so the project compiles.`,
    validationCommand: "npx tsc --noEmit"
  });
}

// ------------------------------------------------------------------
// 6. COMP (复合场景) - 5 cases
// AST + HEAL + ENV
// ------------------------------------------------------------------
for (let i = 1; i <= 5; i++) {
  cases.push({
    id: `COMP-${String(i).padStart(3, '0')}`,
    category: "COMP",
    environment: getRandomEnvironment(),
    condition: getRandomCondition(),
    description: `Composite scenario ${i}`,
    files: {
      "src/types.ts": `export interface Config { timeout: number; }`,
      "src/api.ts": `import { Config } from './types'; export function callApi(c: Config) { return c.timeout * 2; }`,
      "test/api.test.ts": `import { expect, test } from "bun:test"; import { callApi } from "../src/api"; test("api", () => { expect(callApi({ timeout: 1000, retry: true })).toBe(2000); });`
    },
    prompt: `Refactor Config in src/types.ts to include an optional 'retry: boolean' field. Then update src/api.ts to use 'zod' to validate the Config at runtime. Install zod if missing. Ensure tests pass.`,
    validationCommand: "bun test"
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isDailyExpand = args.includes("--daily-expand");
  
  const outputPath = path.resolve(__dirname, "cases.json");
  let finalCases = cases;

  if (isDailyExpand) {
    let existingCases: TestCase[] = [];
    try {
      const content = await fs.readFile(outputPath, 'utf-8');
      existingCases = JSON.parse(content);
    } catch (e) {
      console.log("No existing cases.json found, creating a new one.");
    }

    // 每日扩展 50 个用例
    // 为了保证 ID 唯一，取现有对应分类的最大 ID + 1
    const newCases: TestCase[] = [];
    const categories: TestCase["category"][] = ["ENV", "AST", "HEAL", "PLAN", "ROLL", "COMP"];
    
    for (let i = 0; i < 50; i++) {
      const cat = categories[Math.floor(Math.random() * categories.length)] || "ENV";
      const env = getRandomEnvironment();
      const cond = getRandomCondition();
      
      const existingOfCat = existingCases.filter(c => c.category === cat);
      const maxIdNum = existingOfCat.length > 0 
        ? Math.max(...existingOfCat.map(c => parseInt(c.id.split('-')[1] || "0", 10))) 
        : 0;
      
      const newId = `${cat}-${String(maxIdNum + i + 1).padStart(3, '0')}`;
      
      newCases.push({
        id: newId,
        category: cat,
        environment: env,
        condition: cond,
        description: `Daily expanded case ${newId} with ${env} and ${cond}`,
        files: {
          "src/daily.ts": `export const val = ${i};`
        },
        prompt: `Refactor src/daily.ts to export a function returning ${i * 2}. Fix any tests.`,
        validationCommand: "npx tsc --noEmit"
      });
    }

    finalCases = [...existingCases, ...newCases];
    console.log(`\n🚀 Daily Expansion Triggered: Added ${newCases.length} new combinatorial cases!`);
  }

  await fs.writeFile(outputPath, JSON.stringify(finalCases, null, 2));
  console.log(`✅ Successfully saved ${finalCases.length} test cases to ${outputPath}`);
}

main().catch(console.error);
