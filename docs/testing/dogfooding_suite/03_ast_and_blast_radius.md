# 验证集 03：AST 依赖图谱与防爆改 (AST & Blast Radius)

## Task ID: `AST-001`
**Category**: 爆炸半径感知
**Difficulty**: Hard
**Description**: 验证大模型在修改底层核心类型或接口时，是否能利用 AST 依赖图谱找到受影响的下游文件并同步更新。

- **Prompt**:
  > “把 `src/types/user.ts` 里面的 `User` 接口的 `id` 字段从 `number` 改成 `string`。”
- **Initial State**:
  - `src/types/user.ts` 定义了 `User` 接口。
  - 有至少 3 个深层嵌套的组件或服务（如 `src/services/auth.ts`, `src/components/UserProfile.tsx`）引入并使用了 `User.id` 且进行了严格的 `number` 类型判断。
- **Expected Ground Truth**:
  1. 大模型在修改 `user.ts` 之前或之后，必须调用工具读取 AST 爆炸半径（查出 `auth.ts` 和 `UserProfile.tsx`）。
  2. 智能体不仅修改了 `user.ts`，还主动将下游所有的 `id === 123` 逻辑同步改为了 `id === '123'`。
  3. `bun run typecheck` 最终验证 0 报错。
- **Architectural Trace**:
  - `TraceReporter` 记录到工具调用 `AstGraph.getBlastRadius` 并返回了预期的调用方列表。

---

## Task ID: `AST-002`
**Category**: 契约提取 (Contract Extraction) 节省 Token
**Difficulty**: Medium
**Description**: 验证在引入巨大的第三方或本地核心库时，系统是否只提取契约而不读取全量实现。

- **Prompt**:
  > “参考 `src/core/massive-engine.ts` 的逻辑，帮我写一个调用它的插件。”
- **Initial State**:
  - `src/core/massive-engine.ts` 是一个几万行的文件，包含了极多的内部私有逻辑，但只有几个 `export class` 和 `export function`。
- **Expected Ground Truth**:
  1. 系统通过 `AstGraph.getContract` 工具，仅读取了 `massive-engine.ts` 的类型签名和暴露接口。
  2. 大模型成功写出了插件，且并未因为读取了几万行代码而导致 Token 截断或触发长度警告。