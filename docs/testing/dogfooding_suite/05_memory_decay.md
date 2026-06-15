# 验证集 05：语义哈希与记忆衰减 (Memory Decay)

## Task ID: `MEM-001`
**Category**: 动态记忆过滤
**Difficulty**: Medium
**Description**: 验证大模型在读取到历史固化的 `MEMORY.md` 规则时，能否识别出规则对应的代码其实已经变了，从而丢弃“毒药”记忆。

- **Prompt**:
  > “基于 `src/auth/login.ts` 的逻辑，帮我加一个注册接口。”
- **Initial State**:
  - `src/auth/login.ts` 当前真实的代码是使用 JWT Token 的现代写法。
  - 项目的 `.mimocode/MEMORY.md` 中被人工插入了一条“毒药规则”：“- [file: src/auth/login.ts] [hash: 123456789abc] 用户登录必须使用 Session Cookie 进行鉴权。”
- **Expected Ground Truth**:
  1. 系统在组装 System Prompt 前，`MemoryDecay` 拦截器启动。
  2. 计算真实文件的 `SemanticHash`，发现不等于 `123456789abc`。
  3. 系统丢弃该条 Session Cookie 的规则。
  4. 最终大模型生成的注册接口，使用了符合当前代码逻辑的 JWT 方式，而没有被旧记忆带偏去写 Session Cookie。
- **Architectural Trace**:
  - 后台日志（或 `TraceReporter`）打印出：“memory decay: semantic hash mismatch, dropping rule”。