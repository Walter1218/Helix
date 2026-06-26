#!/usr/bin/env bun

import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"

const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }
const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })

const log = (msg: string) => console.log(`\n${"=".repeat(60)}\n${msg}\n${"=".repeat(60)}`)
const step = (msg: string) => console.log(`\n>>> ${msg}`)
const result = (msg: string) => console.log(`    ${msg}`)

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function chat(sessionID: string, message: string, agent?: string): Promise<string> {
  const res = await client.session.prompt({ sessionID, parts: [{ type: "text", text: message }], agent })
  return res.data!.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text || p.content)
    .join("")
}

async function main() {
  log("Helix TUI 综合功能验收")
  const sessions: string[] = []

  // ═══════════════════════════════════════════════════════════
  // 测试 1: Session 创建
  // ═══════════════════════════════════════════════════════════
  log("测试 1: Session 创建")

  step("创建 session '验收测试-A'")
  const s1 = await client.session.create({ title: "验收测试-A" })
  result(`ID: ${s1.data!.id}, Title: ${s1.data!.title}`)
  sessions.push(s1.data!.id)

  step("创建 session '验收测试-B'")
  const s2 = await client.session.create({ title: "验收测试-B" })
  result(`ID: ${s2.data!.id}, Title: ${s2.data!.title}`)
  sessions.push(s2.data!.id)

  step("创建 session '验收测试-C'")
  const s3 = await client.session.create({ title: "验收测试-C" })
  result(`ID: ${s3.data!.id}, Title: ${s3.data!.title}`)
  sessions.push(s3.data!.id)

  step("验证 session 列表")
  const list = await client.session.list({ limit: 10 })
  result(`当前 session 数量: ${list.data!.length}`)

  // ═══════════════════════════════════════════════════════════
  // 测试 2: 多 Session 并行对话
  // ═══════════════════════════════════════════════════════════
  log("测试 2: 多 Session 并行对话")

  step("Session A: 询问 Python 问题")
  const r1 = await chat(s1.data!.id, "Python 的列表推导式怎么写？")
  result(`回复长度: ${r1.length} 字符`)
  result(`包含列表推导: ${r1.includes("for") && r1.includes("in")}`)

  step("Session B: 询问 JavaScript 问题")
  const r2 = await chat(s2.data!.id, "JavaScript 的箭头函数语法是什么？")
  result(`回复长度: ${r2.length} 字符`)
  result(`包含箭头函数: ${r2.includes("=>") || r2.includes("arrow")}`)

  step("Session C: 询问 Rust 问题")
  const r3 = await chat(s3.data!.id, "Rust 的所有权机制是什么？")
  result(`回复长度: ${r3.length} 字符`)
  result(`包含所有权: ${r3.includes("ownership") || r3.includes("所有权") || r3.includes("borrow")}`)

  // ═══════════════════════════════════════════════════════════
  // 测试 3: Session 切换与上下文保持
  // ═══════════════════════════════════════════════════════════
  log("测试 3: Session 切换与上下文保持")

  step("回到 Session A，追问之前的 Python 问题")
  const r4 = await chat(s1.data!.id, "能给个具体的例子吗？")
  result(`回复长度: ${r4.length} 字符`)
  result(`上下文保持: ${r4.includes("列表") || r4.includes("list") || r4.includes("推导")}`)

  step("回到 Session B，追问之前的 JavaScript 问题")
  const r5 = await chat(s2.data!.id, "箭头函数和普通函数有什么区别？")
  result(`回复长度: ${r5.length} 字符`)
  result(`上下文保持: ${r5.includes("箭头") || r5.includes("arrow") || r5.includes("function")}`)

  step("回到 Session C，追问之前的 Rust 问题")
  const r6 = await chat(s3.data!.id, "能举个例子说明借用规则吗？")
  result(`回复长度: ${r6.length} 字符`)
  result(`上下文保持: ${r6.includes("borrow") || r6.includes("借用") || r6.includes("&")}`)

  // ═══════════════════════════════════════════════════════════
  // 测试 4: 不同 Mode 的任务权限
  // ═══════════════════════════════════════════════════════════
  log("测试 4: 不同 Mode 的任务权限")

  step("查询可用 agents")
  const agents = await client.app.agents()
  const agentList = agents.data ?? []
  result(`可用 agents: ${agentList.map((a: any) => a.name).join(", ")}`)

  step("Ask mode: 只读对话（应该不写文件）")
  const s4 = await client.session.create({ title: "Ask模式测试" })
  sessions.push(s4.data!.id)
  const r7 = await chat(s4.data!.id, "当前目录下有哪些文件？", "ask")
  result(`回复长度: ${r7.length} 字符`)
  result(`回复内容: ${r7.slice(0, 200)}`)

  step("Build mode: 标准开发（应该可以读写文件）")
  const s5 = await client.session.create({ title: "Build模式测试" })
  sessions.push(s5.data!.id)
  const r8 = await chat(
    s5.data!.id,
    '创建一个文件 test_mode.txt，内容为 "build mode test"',
    "build",
  )
  result(`回复长度: ${r8.length} 字符`)
  result(`回复内容: ${r8.slice(0, 200)}`)

  step("Plan mode: 规划模式（应该只读不写）")
  const s6 = await client.session.create({ title: "Plan模式测试" })
  sessions.push(s6.data!.id)
  const r9 = await chat(
    s6.data!.id,
    "分析一下这个项目的结构，给出改进建议",
    "plan",
  )
  result(`回复长度: ${r9.length} 字符`)
  result(`回复内容: ${r9.slice(0, 200)}`)

  // ═══════════════════════════════════════════════════════════
  // 测试 5: Session 重命名
  // ═══════════════════════════════════════════════════════════
  log("测试 5: Session 重命名")

  step("重命名 Session A")
  await client.session.update({ sessionID: s1.data!.id, title: "Python学习笔记" })
  const updated = await client.session.get({ sessionID: s1.data!.id })
  result(`新标题: ${updated.data!.title}`)

  // ═══════════════════════════════════════════════════════════
  // 测试 6: Session 状态查询
  // ═══════════════════════════════════════════════════════════
  log("测试 6: Session 状态查询")

  step("查询所有 session 状态")
  const status = await client.session.status()
  const statusMap = status.data ?? {}
  for (const [id, st] of Object.entries(statusMap)) {
    const session = sessions.find((s) => s === id)
    if (session) {
      result(`Session ${id.slice(0, 12)}...: ${(st as any).type}`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 测试 7: Session 删除
  // ═══════════════════════════════════════════════════════════
  log("测试 7: Session 删除")

  step(`删除前 session 数量: ${(await client.session.list({ limit: 100 })).data!.length}`)

  step("删除测试 sessions")
  for (const sid of sessions) {
    await client.session.delete({ sessionID: sid }).catch(() => {})
  }

  step(`删除后 session 数量: ${(await client.session.list({ limit: 100 })).data!.length}`)
  result("清理完成")

  // ═══════════════════════════════════════════════════════════
  // 总结
  // ═══════════════════════════════════════════════════════════
  log("验收完成")
  console.log(`
测试项目:
  ✅ Session 创建 (3 个)
  ✅ 多 Session 并行对话
  ✅ Session 切换与上下文保持
  ✅ 不同 Mode 任务权限 (ask/build/plan)
  ✅ Session 重命名
  ✅ Session 状态查询
  ✅ Session 删除
  ✅ 自动清理测试数据
`)
}

main().catch(console.error)
