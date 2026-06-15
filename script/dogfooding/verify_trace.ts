import path from "path"
import fs from "fs/promises"

const files = {
  "session/processor.ts": ["TraceReporter", "emitTrace", "tool_interceptor_block", "fsm_transition"],
  "tool/bash.ts": ["TraceNodeEvent", "tool_interceptor_block", "high-risk", "dangerous-rm"],
  "worktree/index.ts": ["shadow_worktree_create"],
  "memory/memory-decay.ts": ["trace_type", "memory_decay"],
}

let allOk = true
for (const [f, keywords] of Object.entries(files)) {
  const fullPath = path.resolve("packages", "opencode", "src", f)
  const content = await fs.readFile(fullPath, "utf-8")
  for (const kw of keywords) {
    if (content.includes(kw)) {
      console.log(`  ✅ ${f}: ${kw}`)
    } else {
      console.log(`  ❌ ${f}: MISSING ${kw}`)
      allOk = false
    }
  }
}

console.log(allOk ? "\n✅ All trace points verified" : "\n❌ Some trace points missing")
