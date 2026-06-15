#!/usr/bin/env bun
/**
 * Embedding 区分度测试：验证 nomic-embed-text 在代码场景下能否区分相似/不相似内容
 */

const BASE = "http://localhost:1234/v1/embeddings"
const MODEL = "text-embedding-nomic-embed-text-v1.5"
const MODEL_BGE = "text-embedding-bge-m3"

interface EmbedResult {
  embedding: number[]
  tokens?: number
}

async function embed(input: string | string[], model = MODEL): Promise<EmbedResult> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  })
  const data = await res.json() as any
  return { embedding: data.data[0].embedding, tokens: data.usage?.total_tokens }
}

async function embedBatch(inputs: string[], model = MODEL): Promise<EmbedResult[]> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
  })
  const data = await res.json() as any
  return (data.data as any[]).map((d: any) => ({
    embedding: d.embedding,
  }))
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ===== 测试用例 =====
const pairs: [string, string, string][] = [
  // 🔴 应该高相似 (相关代码)
  [
    "JWT authentication middleware that checks Bearer tokens and sets req.user",
    "Bearer token validation with JWT verify, extracting user payload from Authorization header",
    "高相似: JWT认证不同表述",
  ],
  [
    "PostgreSQL connection pool configuration with max 20 connections and idle timeout",
    "Database pool settings: max_connections=20, idle_timeout=30s, using pg library",
    "高相似: DB连接池配置",
  ],
  [
    "function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count+1)}>{count}</button> }",
    "React component with useState hook that increments a counter on button click",
    "高相似: React Counter组件 代码↔描述",
  ],
  [
    "Error handling middleware that catches exceptions and returns 500 with error ID",
    "try-catch wrapper that logs errors and sends structured error response with trace ID",
    "高相似: 错误处理中间件",
  ],

  // 🟢 应该低相似 (不相关)
  [
    "JWT authentication middleware that checks Bearer tokens and sets req.user",
    "CSS flexbox layout with responsive grid, auto-fill columns at minmax(200px, 1fr)",
    "低相似: JWT vs CSS布局",
  ],
  [
    "PostgreSQL connection pool configuration with max 20 connections and idle timeout",
    "React useEffect cleanup to remove event listeners on component unmount",
    "低相似: DB连接池 vs React lifecycle",
  ],
  [
    "function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count+1)}>{count}</button> }",
    "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
    "低相似: React组件 vs SQL查询",
  ],
  [
    "Error handling middleware that catches exceptions and returns 500 with error ID",
    "docker-compose.yml with nginx, postgres, redis services and volume mounts",
    "低相似: 错误处理 vs Docker配置",
  ],

  // 🟡 边界测试 (表面相似但概念不同)
  [
    "Use React state management to handle form input changes",
    "Use Zustand for global state management across multiple components",
    "边界: useState vs Zustand 都是状态管理",
  ],
  [
    "GitHub Actions CI pipeline running Jest tests on push to main branch",
    "GitHub Actions CD pipeline deploying to AWS ECS after tests pass",
    "边界: CI vs CD 都是GitHub Actions",
  ],
]

console.log("===== Embedding 区分度测试 =====\n")
console.log(`模型: ${MODEL}`)
console.log(`测试对: ${pairs.length} 组\n`)

// 批量获取所有 embedding
const allTexts = pairs.flatMap(p => [p[0], p[1]])
const allEmbs = await embedBatch(allTexts)

const results: { desc: string; sim: number; expected: string }[] = []

for (let i = 0; i < pairs.length; i++) {
  const [a, b, desc] = pairs[i]
  const sim = cosine(allEmbs[i * 2].embedding, allEmbs[i * 2 + 1].embedding)
  results.push({ desc, sim, expected: desc.slice(0, 3) })
}

// 分组统计
const highSim = results.filter(r => r.expected === "高相似")
const lowSim = results.filter(r => r.expected === "低相似")
const edgeSim = results.filter(r => r.expected === "边界:")

console.log("--- 逐对结果 ---")
for (const r of results) {
  const icon = r.sim > 0.7 ? "🔴" : r.sim > 0.5 ? "🟡" : "🟢"
  console.log(`${icon} ${r.sim.toFixed(4)}  ${r.desc}`)
}

console.log(`\n--- 分组统计 ---`)
console.log(`高相似组 平均: ${(highSim.reduce((s,r)=>s+r.sim,0)/highSim.length).toFixed(4)}  范围: ${Math.min(...highSim.map(r=>r.sim)).toFixed(4)} ~ ${Math.max(...highSim.map(r=>r.sim)).toFixed(4)}`)
console.log(`低相似组 平均: ${(lowSim.reduce((s,r)=>s+r.sim,0)/lowSim.length).toFixed(4)}  范围: ${Math.min(...lowSim.map(r=>r.sim)).toFixed(4)} ~ ${Math.max(...lowSim.map(r=>r.sim)).toFixed(4)}`)
console.log(`边界组   平均: ${(edgeSim.reduce((s,r)=>s+r.sim,0)/edgeSim.length).toFixed(4)}  范围: ${Math.min(...edgeSim.map(r=>r.sim)).toFixed(4)} ~ ${Math.max(...edgeSim.map(r=>r.sim)).toFixed(4)}`)

const gap = highSim.reduce((s,r)=>s+r.sim,0)/highSim.length - lowSim.reduce((s,r)=>s+r.sim,0)/lowSim.length
console.log(`\n高-低相似度差距: ${gap.toFixed(4)} ${gap > 0.3 ? "✅ 区分度优秀" : gap > 0.15 ? "⚠️ 可接受" : "❌ 区分度不足"}`)
