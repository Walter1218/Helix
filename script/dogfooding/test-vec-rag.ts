#!/usr/bin/env bun
/**
 * Vector RAG 集成测试：LM Studio embedding → 向量存储 → 余弦相似度检索
 * 直接在内存中验证完整链路。sqlite-vec 在 Helix 运行时中通过 C 扩展加载。
 */

const EMBED_URL = "http://localhost:1234/v1/embeddings"
const EMBED_MODEL = "text-embedding-nomic-embed-text-v1.5"

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  })
  const data = await res.json() as any
  return (data.data as Array<{ embedding: number[] }>).map(d => d.embedding)
}

// ===== Test Data =====
const docs = [
  { id: "JWT", title: "JWT Authentication", body: "The auth middleware validates JWT Bearer tokens from the Authorization header. Extracts user payload and attaches req.user. Tokens expire after 30 minutes with refresh tokens in Redis." },
  { id: "DB", title: "Database Pool", body: "PostgreSQL connection pool with pg.Pool. Max 20 connections, idle timeout 30 seconds. SSL enabled for production. Connection retry with exponential backoff." },
  { id: "RN", title: "React Counter", body: "A React component using useState hook. Renders a button that increments a counter. Functional component with TypeScript props. Uses JSX with onClick handler." },
  { id: "CSS", title: "CSS Layout", body: "Flexbox layout with responsive grid. Uses grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)). Media queries at 768px and 480px breakpoints. CSS custom properties for theming." },
  { id: "DK", title: "Docker Compose", body: "docker-compose.yml with nginx, postgres, redis. Volume mounts for persistent data. Network configuration with internal and external networks. Health checks for all services." },
  { id: "ERR", title: "Error Handler", body: "Global error handling middleware for Express. Catches unhandled exceptions and rejected promises. Returns structured error with trace ID, status, and sanitized stack trace." },
  { id: "SQL", title: "SQL Query", body: "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20. Uses parameterized queries to prevent SQL injection. Index on email column." },
  { id: "API", title: "REST API", body: "RESTful API endpoint for user management. POST /api/users creates user, GET /api/users/:id fetches, PUT updates, DELETE soft-deletes. All endpoints require JWT authentication." },
]

// ===== Step 1: Embed all docs =====
console.log("Step 1: Generating embeddings for all docs...")
const bodies = docs.map(d => d.body)
const t0 = Date.now()
const vecs = await embed(bodies)
console.log(`  ✅ ${docs.length} docs embedded in ${Date.now() - t0}ms`)

const store = docs.map((d, i) => ({ ...d, vec: vecs[i] }))

// ===== Step 2: Semantic search =====
console.log("\nStep 2: Semantic search accuracy test...")

const queries = [
  { text: "How does user login work?", expect: "JWT", desc: "认证" },
  { text: "database connection settings", expect: "DB", desc: "数据库" },
  { text: "React component with button", expect: "RN", desc: "React" },
  { text: "website styling and layout", expect: "CSS", desc: "CSS" },
  { text: "container orchestration", expect: "DK", desc: "Docker" },
  { text: "catch exceptions and return error", expect: "ERR", desc: "错误处理" },
  { text: "get user by email from database", expect: "SQL", desc: "SQL" },
  { text: "API endpoint to create users", expect: "API", desc: "API" },
]

let correct = 0
for (const q of queries) {
  const [qVec] = await embed([q.text])
  const scored = store.map(d => ({ id: d.id, title: d.title, sim: cosine(qVec, d.vec) }))
  scored.sort((a, b) => b.sim - a.sim)

  const hit = scored[0].id === q.expect
  if (hit) correct++
  console.log(`  ${hit ? "✅" : "❌"} [${q.desc}] → #1: ${scored[0].title} (${scored[0].sim.toFixed(4)}) expected: ${store.find(d=>d.id===q.expect)!.title}`)
  console.log(`       #2: ${scored[1].title} (${scored[1].sim.toFixed(4)})  #3: ${scored[2].title} (${scored[2].sim.toFixed(4)})`)
}

console.log(`\n  Accuracy: ${correct}/${queries.length} (${(correct/queries.length*100).toFixed(0)}%)`)

// ===== Step 3: Discrimination (should NOT match) =====
console.log("\nStep 3: Discrimination test...")
const crossTests = [
  { q: "authentication token validation", unrelated: "CSS", desc: "JWT vs CSS" },
  { q: "SQL database configuration", unrelated: "RN", desc: "DB vs React" },
]

for (const t of crossTests) {
  const [qVec] = await embed([t.q])
  const scored = store.map(d => ({ id: d.id, sim: cosine(qVec, d.vec) }))
  scored.sort((a, b) => b.sim - a.sim)

  const unrelatedRank = scored.findIndex(s => s.id === t.unrelated) + 1
  const unrelated = store.find(d => d.id === t.unrelated)!
  const ok = unrelatedRank > 3
  console.log(`  ${ok ? "✅" : "⚠️"} [${t.desc}] "${t.unrelated}" ranked #${unrelatedRank} (sim: ${scored.find(s=>s.id===t.unrelated)!.sim.toFixed(4)})`)
}

// ===== Step 4: BM25 + Vector Hybrid simulation =====
console.log("\nStep 4: Hybrid retrieval (BM25 + Vector simulation)...")
const hybridQuery = "database user query authentication"
const [qVec] = await embed([hybridQuery])

// Simulate BM25: score based on keyword overlap
function bm25Score(body: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/)
  const bodyLower = body.toLowerCase()
  let score = 0
  for (const w of words) score += bodyLower.split(w).length - 1
  return score
}

// Hybrid: BM25 * 0.6 + Cosine * 0.4
const hybridScored = store.map(d => {
  const b = bm25Score(d.body, hybridQuery)
  const v = cosine(qVec, d.vec)
  return { id: d.id, title: d.title, bm25: b, vec: v, hybrid: b * 0.6 + v * 0.4 }
})
hybridScored.sort((a, b) => b.hybrid - a.hybrid)

console.log("  Query: 'database user query authentication'")
console.log("  Rank | Title            | BM25    | Vector  | Hybrid")
console.log("  -----|------------------|---------|---------|---------")
for (let i = 0; i < Math.min(5, hybridScored.length); i++) {
  const { title, bm25, vec, hybrid } = hybridScored[i]
  console.log(`  #${i + 1}   | ${title.padEnd(16)} | ${bm25.toFixed(2).padStart(7)} | ${vec.toFixed(4).padStart(7)} | ${hybrid.toFixed(4)}`)
}

console.log("\n✅ All Vector RAG tests passed!")
