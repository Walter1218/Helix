# Helix Loop 启动前信息收集与运行时卡点处理方案

## 一、问题定位（基于代码事实）

### 1.1 当前启动流程

`runLoop` 在 `packages/opencode/src/session/prompt.ts:2120` 中直接启动：

```ts
while (true) {
  if (!agentID || agentID === "main") yield* status.set(sessionID, { type: "busy" })
  yield* inbox.drain(sessionID, agentID ?? "main").pipe(Effect.ignore)
  // ... 直接加载历史 → 构建请求 → 调用 LLM
}
```

**问题**：用户输入的任务描述（如"帮我优化这个函数"）直接进入 `lastUser`，没有以下检查：
- 目标是否模糊？边界条件是否缺失？
- 用户对 loop 的介入偏好是什么？（全自动 / 每步确认 / 测试失败时询问）
- 不同模式（Ask/Build/Plan/Compose/Max）的启动前信息需求不同

### 1.2 当前运行时卡点处理

代码中已有的机制：
- `Question` 工具 (`question/index.ts`)：结构化问答，但只在模型"想到要问"时触发
- `AskUserQuestion` / `Suspend_Task` / `Request_Goal_Revision` (`processor.ts:391`)：触发 `ctx.suspended = true`，loop 终止等待用户
- `taskGate` (`prompt.ts:1803`)：loop 终止前检查未完成任务
- `goalGate` (`prompt.ts:1873`)：loop 终止前 judge 判定目标是否满足
- `Doom loop` 检测 (`processor.ts:27`)：同一工具调用 3 次 → 触发权限询问

**问题**：全部是**运行时被动触发**，没有**启动前主动确认**和**运行时结构化卡点检测**。模型可能在"自以为知道"的情况下继续执行，导致 5 轮迭代全浪费。

---

## 二、核心设计原则

1. **先 Harness 后业务**：先补齐信息收集和卡点检测的 Harness 层，再改造 loop 脚本
2. **不过滤**：让用户决定信息是否充分，不替用户做"这个信息足够/不够"的判断
3. **模式差异化**：Ask/Build/Plan/Compose/Max 五种模式的信息收集策略不同
4. **复用优先**：复用现有 `Question` 工具、`BusEvent` 系统、`SessionStatus` 状态机
5. **成本意识**：启动前信息收集的成本要远小于一轮错误迭代的成本

---

## 三、方案架构：三层检测机制

```
┌─────────────────────────────────────────────┐
│  Layer 1: Pre-flight Check（启动前）          │
│  - 模糊度分析                                 │
│  - 约束条件收集                               │
│  - 模式差异化问卷                              │
│  - 介入偏好配置                                │
├─────────────────────────────────────────────┤
│  Layer 2: In-flight Cardinal Detection（运行时）│
│  - 卡点检测（模糊语义、外部依赖、测试失败）     │
│  - 结构化暂停（不是通用 Question，而是模式化）  │
│  - 成本预警（token 消耗超过阈值）              │
├─────────────────────────────────────────────┤
│  Layer 3: Post-hoc Gate（终止前）             │
│  - taskGate（已有）                           │
│  - goalGate（已有）                           │
│  - 新增：deliverableGate（交付物质量检查）      │
└─────────────────────────────────────────────┘
```

---

## 四、Layer 1: Pre-flight Check（启动前信息收集）

### 4.1 新增模块：`session/preflight.ts`

复用 `Question` 工具的 schema 定义，但改为**启动前主动调用**。

```ts
// packages/opencode/src/session/preflight.ts
import { Effect, Schema } from "effect"
import { Question } from "@/question"
import { SessionStatus } from "./status"
import { SessionID } from "./schema"
import { BusEvent } from "@/bus/bus-event"
import { z } from "zod"

export const Ambiguity = z.object({
  score: z.number().min(0).max(1),
  dimensions: z.array(z.object({
    name: z.string(),
    missing: z.boolean(),
    hint: z.string(),
  })),
  suggestedQuestions: z.array(z.string()),
})

export const Event = {
  PreFlightRequired: BusEvent.define(
    "session.preflight.required",
    z.object({
      sessionID: SessionID.zod,
      questions: z.array(Question.Info.zod),
      ambiguity: Ambiguity.optional(),
    }),
  ),
  PreFlightCompleted: BusEvent.define(
    "session.preflight.completed",
    z.object({
      sessionID: SessionID.zod,
      answers: z.array(z.string()),
      mode: z.enum(["ask", "build", "plan", "compose", "max"]),
      constraints: z.array(z.string()).optional(),
    }),
  ),
}

export interface Interface {
  /** 分析用户输入的模糊度，返回需要收集的问题列表 */
  readonly analyze: (input: {
    sessionID: SessionID
    userText: string
    mode: "ask" | "build" | "plan" | "compose" | "max"
    context: { files: string[]; projectType: string }
  }) => Effect.Effect<{ needPreFlight: boolean; questions: Question.Info[]; ambiguity: Ambiguity }>

  /** 等待用户回答 pre-flight 问题 */
  readonly awaitAnswers: (sessionID: SessionID) => Effect.Effect<{ answers: string[]; constraints: string[] }>

  /** 将用户回答注入为合成消息 */
  readonly injectAnswers: (input: {
    sessionID: SessionID
    answers: string[]
    constraints: string[]
  }) => Effect.Effect<void>
}
```

### 4.2 模糊度分析策略

**轻量模型调用**（用 cheapest model，如 `xiaomi/mimo-lite`）：

```ts
const analyzeAmbiguity = Effect.fn("PreFlight.analyze")(function* (input) {
  const llm = yield* LLM.Service
  // 用结构化输出让轻量模型评估模糊度
  const result = yield* llm.generateObject({
    model: { providerID: "xiaomi", modelID: "mimo-lite" },
    system: `You are a task-intent analyzer. Given a user's task description and project context, evaluate whether the task is clear enough for an autonomous coding agent to execute.

Evaluate on these dimensions:
1. Scope: Is the target file/function/component specified?
2. Constraints: Are there unstated constraints (API compatibility, no breaking changes, performance requirements)?
3. Success criteria: How will the agent know it's done?
4. Context: Does the agent have enough project context to start?

Return a score 0-1 and a list of missing dimensions. Score < 0.6 means pre-flight questions are needed.`,
    messages: [{ role: "user", content: `Task: ${input.userText}\nProject: ${input.context.projectType}\nFiles: ${input.context.files.join(", ")}` }],
    schema: Ambiguity,
  })
  return result
})
```

**成本估算**：
- 轻量模型调用 ≈ 500-1000 tokens ≈ $0.001-0.002
- 一轮错误迭代的成本 ≈ $0.02-0.05（5-10x 浪费）

### 4.3 模式差异化问卷

不同模式启动前的问题不同：

| 模式 | 核心问题 | 示例 |
|------|---------|------|
| **Build** | "执行范围确认" | 1. 要修改哪些文件？ 2. 是否允许创建新文件？ 3. 测试通过后是否直接提交？ |
| **Plan** | "目标与约束确认" | 1. 优先级：性能 vs 可读性？ 2. 是否有必须保留的 API 签名？ 3. 计划是否需要你确认后再执行？ |
| **Compose** | "技能与编排确认" | 1. 有哪些已知技能可用？ 2. 任务是否需要多技能串联？ 3. 失败时的回退策略？ |
| **Max** | "评估标准确认" | 1. 多路径评估的核心维度？（性能/正确性/简洁性） 2. 最大 token 预算？ 3. 是否允许超时后降格为单路径？ |

### 4.4 用户介入偏好配置

在 `mimocode.json` 中新增 `loop.intervention` 配置：

```json
{
  "loop": {
    "intervention": {
      "preFlight": {
        "enabled": true,
        "threshold": 0.6,
        "mode": "structured"  // "structured" | "freeform" | "skip"
      },
      "inFlight": {
        "onAmbiguity": "pause",      // "pause" | "warn" | "ignore"
        "onTestFailure": "ask",      // "ask" | "autoHeal" | "stop"
        "onExternalDep": "ask",      // "ask" | "autoInstall" | "skip"
        "onTokenBudget": 0.8,         // 0.8 = 80% 预算时预警
        "maxHealAttempts": 3
      },
      "postFlight": {
        "confirmDeliverable": true,  // 交付前确认
        "showCostBreakdown": true    // 显示成本明细
      }
    }
  }
}
```

### 4.5 与 `runLoop` 的对接

在 `prompt.ts` 的 `loop` 函数中，在 `runLoop` 之前插入 `preFlightCheck`：

```ts
// packages/opencode/src/session/prompt.ts:2964
const loop = Effect.fn("SessionPrompt.loop")(function* (input) {
  const agentID = input.agentID ?? "main"

  // 新增：启动前检查（仅主 agent 且用户未跳过）
  if (agentID === "main" && !(yield* preFlight.isSkipped(input.sessionID))) {
    const preFlightResult = yield* preFlight.run({
      sessionID: input.sessionID,
      userText: input.userText, // 从 input 或消息中提取
      mode: input.mode ?? "build", // 从用户选择或默认
    })
    if (preFlightResult.status === "need_input") {
      // 设置状态为 waiting，前端展示问卷
      yield* status.set(input.sessionID, { type: "busy", message: "waiting_user_input" })
      yield* bus.publish(PreFlight.Event.PreFlightRequired, {
        sessionID: input.sessionID,
        questions: preFlightResult.questions,
        ambiguity: preFlightResult.ambiguity,
      })
      // 等待用户回答（通过 inbox 或 API）
      const answers = yield* preFlight.awaitAnswers(input.sessionID)
      yield* preFlight.injectAnswers({ sessionID: input.sessionID, ...answers })
    }
  }

  return yield* state.ensureRunning(
    input.sessionID,
    agentID,
    lastAssistant(input.sessionID, agentID),
    runLoop(input.sessionID, agentID, input.task_id),
  )
})
```

### 4.6 状态机扩展

在 `session/status.ts` 中新增 `waiting_user_input` 状态：

```ts
export const Info = z.union([
  z.object({ type: z.literal("idle") }),
  z.object({ type: z.literal("busy"), message: z.string().optional() }),
  z.object({ type: z.literal("retry"), attempt: z.number(), message: z.string(), next: z.number() }),
  // 新增
  z.object({
    type: z.literal("waiting_user_input"),
    message: z.string().optional(),
    preFlightQuestions: z.array(Question.Info.zod).optional(),
  }),
])
```

---

## 五、Layer 2: In-flight Cardinal Detection（运行时卡点检测）

### 5.1 卡点类型定义

```ts
// packages/opencode/src/session/cardinal.ts
export type CardinalType =
  | "ambiguity"        // 模型在执行中遇到语义模糊
  | "external_dep"     // 需要外部依赖（安装包、API key）
  | "test_failure"     // 测试失败
  | "tool_error"       // 工具调用错误（权限不足、文件不存在）
  | "token_budget"     // 接近 token 预算上限
  | "heal_exhausted"   // 修复次数耗尽
  | "user_interrupt"   // 用户手动中断（已有）

export const CardinalEvent = BusEvent.define(
  "session.cardinal",
  z.object({
    sessionID: SessionID.zod,
    type: z.enum(["ambiguity", "external_dep", "test_failure", "tool_error", "token_budget", "heal_exhausted"]),
    severity: z.enum(["warn", "pause", "stop"]),
    message: z.string(),
    context: z.record(z.any()).optional(),
  }),
)
```

### 5.2 卡点检测器

在 `processor.ts` 的 `handleEvent` 中，新增卡点检测逻辑：

```ts
// packages/opencode/src/session/processor.ts:379
// 在 tool-call 处理中增加卡点检测
if (value.toolName === "AskUserQuestion" || value.toolName === "Suspend_Task" || value.toolName === "Request_Goal_Revision") {
  ctx.suspended = true
}

// 新增：运行时卡点检测
const cardinal = detectCardinal({ toolName: value.toolName, input: value.input, ctx })
if (cardinal) {
  yield* bus.publish(CardinalEvent, { sessionID: ctx.sessionID, ...cardinal })
  if (cardinal.severity === "pause") {
    ctx.suspended = true
  } else if (cardinal.severity === "stop") {
    ctx.shouldBreak = true
  }
}
```

卡点检测规则：

| 卡点 | 检测规则 | 默认响应 |
|------|---------|---------|
| **ambiguity** | 模型连续 2 步只调用 `read`/`glob` 没有 `edit`/`write`，且 reasoning 中出现 "unclear" / "not sure" | 触发 `pause`，要求用户确认 |
| **external_dep** | `bash` 调用返回 `npm install` / `pip install` / `brew install` 等安装命令 | 触发 `pause`，询问用户是否允许安装 |
| **test_failure** | `bash` 调用测试返回非 0，且模型进入 heal 循环 | 根据 `loop.intervention.onTestFailure` 配置 |
| **tool_error** | `tool-error` 事件连续出现，或 `Permission.RejectedError` | 触发 `warn` 或 `pause` |
| **token_budget** | 当前会话 token > 预算的 `onTokenBudget` 比例 | 触发 `warn`，在消息流中显示预警 |
| **heal_exhausted** | heal 尝试次数达到 `maxHealAttempts` | 触发 `stop`，loop 终止，报告给用户 |

### 5.3 与现有 `Question` 工具的整合

不是替换 `Question` 工具，而是**扩展**为模式化的结构化暂停：

```ts
// 新增：CardinalQuestion 工具（复用 Question schema）
export const CardinalQuestion = Tool.define<typeof parameters, Metadata, Config.Service>(
  "cardinal_question",
  Effect.gen(function* () {
    const config = yield* Config.Service
    const run = Effect.fn("CardinalQuestion.execute")(function* (input, ctx) {
      const cfg = (yield* config.get()).loop?.intervention
      // 根据卡点类型和配置决定响应方式
      if (input.type === "test_failure" && cfg?.onTestFailure === "ask") {
        // 触发 Question 暂停
        return { ... } // 返回 Question 格式
      }
      // ...
    })
    return { run, id: "cardinal_question" }
  })
)
```

---

## 六、Layer 3: Post-hoc Gate（终止前新增检查）

### 6.1 新增 `deliverableGate`

在 `taskGate` 和 `goalGate` 之后，新增交付物质量检查：

```ts
// packages/opencode/src/session/prompt.ts:2929
if (outcome === "break") {
  if (yield* taskGate(lastUser)) continue
  if (yield* goalGate(lastUser)) continue
  if (yield* deliverableGate(lastUser)) continue  // 新增
  break
}
```

```ts
const deliverableGate = Effect.fn("SessionPrompt.deliverableGate")(function* (lastUser: MessageV2.User) {
  if ((agentID ?? "main") !== "main") return false
  const cfg = yield* config.get()
  if (!cfg.loop?.intervention?.postFlight?.confirmDeliverable) return false

  // 检查当前会话是否有未确认的修改
  const pendingChanges = yield* sessions.findParts(sessionID, (p) =>
    p.type === "tool" && p.state.status === "pending" && ["edit", "write", "multiedit"].includes(p.tool)
  )
  if (pendingChanges.length === 0) return false

  // 注入合成消息，要求用户确认交付物
  const reentry = yield* sessions.updateMessage({ ... })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: reentry.id,
    sessionID,
    type: "text",
    synthetic: true,
    text: `I have completed the task. Before finishing, please review the pending changes:
${pendingChanges.map(c => `- ${c.tool}: ${c.state.input.file}`).join("\n")}

Confirm to proceed, or let me know if anything needs adjustment.`,
  })
  return true
})
```

---

## 七、Loop 模式整合

### 7.1 五种模式的差异化处理

| 模式 | Pre-flight 重点 | In-flight 卡点 | Post-flight 检查 |
|------|----------------|---------------|-----------------|
| **Build** | 执行范围确认、文件修改边界 | 工具错误（权限/文件不存在）、连续 read 无 edit | 未确认修改的 Diff 列表 |
| **Plan** | 目标与约束、优先级确认 | 计划过于宏大（步骤 > 10）、无验证步骤 | 计划可执行性检查 |
| **Compose** | 可用技能确认、编排策略 | 技能调用失败、循环依赖 | 技能执行结果汇总 |
| **Max** | 评估维度、预算上限 | 候选全失败、Judge 评分过低 | 最佳候选的可解释性 |

### 7.2 在 UI 中的外显

复用 `docs/ide-ui-design.md` 中已有的设计：

**Pre-flight 卡片**（在消息流中展示）：
```
┌──────────────────────────────┐
│  📋 Pre-flight Check           │
│  检测到 3 个模糊点：            │
│  1. 要优化哪些文件？            │
│  2. 性能还是可读性优先？        │
│  3. 是否允许创建新文件？        │
│                              │
│  [快速回答] [详细回答] [跳过]  │
└──────────────────────────────┘
```

**运行时卡点指示器**（在状态栏中展示）：
```
┌────────────────────────────────────┐
│  🛠️ Build  ·  🔄 正在生成...       │
│  ⚠️ 卡点：检测到外部依赖 npm install│  ← 新增：实时卡点指示
│  [允许] [拒绝] [查看详情]           │
├────────────────────────────────────┤
│  ⚡ 使用: MiMo-V2.5-Pro            │
│  💰 本次: 12.3K tokens ($0.04)     │
│  📊 会话: 128K / 200K              │
└────────────────────────────────────┘
```

---

## 八、代码修改清单

### 8.1 新增文件

| 文件 | 内容 | 工时 |
|------|------|------|
| `packages/opencode/src/session/preflight.ts` | Pre-flight 分析、问卷生成、等待回答 | 2d |
| `packages/opencode/src/session/cardinal.ts` | 运行时卡点检测器、规则引擎 | 1.5d |
| `packages/opencode/src/session/preflight.sql.ts` | Pre-flight 回答持久化（SQLite 表） | 0.5d |
| `packages/opencode/src/tool/cardinal-question.ts` | 模式化卡点询问工具 | 1d |

### 8.2 修改文件

| 文件 | 修改点 | 行号 | 工时 |
|------|--------|------|------|
| `packages/opencode/src/session/prompt.ts` | `loop` 函数插入 preFlightCheck；`runLoop` 中 outcome="break" 后插入 deliverableGate | 2964, 2929 | 1d |
| `packages/opencode/src/session/processor.ts` | `handleEvent` 的 `tool-call` 分支增加卡点检测 | 379 | 0.5d |
| `packages/opencode/src/session/status.ts` | `Info` union 新增 `waiting_user_input` | 8 | 0.5d |
| `packages/opencode/src/config/config.ts` | 新增 `loop.intervention` 配置 schema | - | 0.5d |
| `packages/opencode/src/session/goal.ts` | 新增 `deliverableGate` 逻辑（或独立文件） | - | 0.5d |
| `packages/opencode/src/server/routes/instance/session.ts` | 新增 `/api/v1/session/:id/preflight` 端点（提交回答） | - | 1d |
| `packages/opencode/src/cli/cmd/tui/app.tsx` | TUI 订阅 `PreFlightRequired` 和 `CardinalEvent` | - | 1d |
| `packages/opencode/src/cli/cmd/tui/context/sync.tsx` | Sync store 新增 preFlight 状态 | - | 0.5d |
| `packages/app/src/components/message-timeline.tsx` | 消息流渲染 pre-flight 卡片和卡点指示器 | - | 1.5d |
| `packages/app/src/components/prompt-input.tsx` | 输入框支持 pre-flight 快速回答模式 | - | 1d |
| `packages/opencode/src/workflow/builtin/auto-loop.js` | 修改脚本，支持 pre-flight 配置和 heal 次数检测 | - | 1d |

### 8.3 测试文件

| 文件 | 测试内容 | 工时 |
|------|---------|------|
| `test/session/preflight.test.ts` | 模糊度分析、问卷生成、回答注入 | 1d |
| `test/session/cardinal.test.ts` | 卡点检测规则、severity 判定 | 1d |
| `test/session/preflight-integration.test.ts` | 端到端：用户输入 → pre-flight → runLoop | 1d |

**总计：约 15.5 人天**

---

## 九、实施计划（2 周）

### Week 1: Harness 层（Pre-flight + Cardinal）

| 天 | 任务 | 验收标准 |
|---|------|---------|
| 1 | 实现 `preflight.ts` 核心逻辑（analyze + awaitAnswers + injectAnswers） | 单元测试通过，模糊度分析准确率 > 80% |
| 2 | 实现 `cardinal.ts` 卡点检测规则引擎 | 6 种卡点类型全部覆盖，severity 判定正确 |
| 3 | 修改 `prompt.ts`（loop 插入 preFlightCheck，runLoop 插入 deliverableGate） | 集成测试通过，主 loop 不中断 |
| 4 | 修改 `processor.ts` 和 `status.ts` | 运行时卡点检测触发正确，状态机扩展无 regression |
| 5 | 新增 API 端点和 TUI 事件订阅 | 前端能收到 pre-flight 问卷和卡点事件 |

### Week 2: UI 层 + 集成测试

| 天 | 任务 | 验收标准 |
|---|------|---------|
| 6 | `message-timeline` 渲染 pre-flight 卡片 | 视觉稿还原度 > 90% |
| 7 | `prompt-input` 支持 pre-flight 快速回答 + 状态栏卡点指示器 | 交互流程完整 |
| 8 | 修改 `auto-loop.js` 支持 pre-flight 和 heal 次数检测 | 工作流脚本能通过测试 |
| 9 | 端到端测试（8 个场景） | 全部通过 |
| 10 | 性能测试 + 回归测试 | 无性能退化，全部测试通过 |

---

## 十、关键决策

1. **轻量模型 vs 主模型做 pre-flight？**
   - 选择：轻量模型（`mimo-lite`）
   - 原因：成本差 10x，pre-flight 是"粗筛"不是"精判"，不需要主模型能力

2. **pre-flight 是否可跳过？**
   - 选择：可配置，默认不跳过
   - 原因：信任建立初期需要确认，高级用户可通过配置关闭

3. **卡点检测是模型驱动还是规则驱动？**
   - 选择：规则驱动（`cardinal.ts`），不是模型判断
   - 原因：规则可预测、可调试、无额外成本。模型只在"规则触发后"做结构化分析

4. **deliverableGate 在 taskGate 和 goalGate 之后？**
   - 选择：是的，最后执行
   - 原因：taskGate 和 goalGate 是"必须完成"，deliverableGate 是"用户确认"，优先级最低但不可跳过

---

## 十一、风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| 轻量模型 pre-flight 分析不准确 | 中 | 阈值可调（`threshold: 0.6`），保守策略（宁可多问） |
| 卡点检测规则误触发（false positive） | 中 | 规则设计为"可覆盖"（severity=warn 不 pause），用户反馈调参 |
| 前端 UI 复杂度增加 | 低 | 复用已有 Question 组件和状态栏，不新增独立面板 |
| 额外延迟 | 低 | 轻量模型调用 < 1s，远小于一轮迭代（10-30s） |
| 用户厌烦频繁确认 | 低 | 可配置跳过，且模糊度 < 阈值时自动跳过 |

---

## 附录：相关代码引用

### `runLoop` 定义
```typescript
// packages/opencode/src/session/prompt.ts:1698
const runLoop: (sessionID: SessionID, agentID?: string, task_id?: string) => Effect.Effect<MessageV2.WithParts> = Effect.fn(
  "SessionPrompt.run",
)(function* (sessionID, agentID, task_id) {
  // ... while(true) at 2120
})
```

### `Question` 工具 Schema
```typescript
// packages/opencode/src/question/index.ts:41
export class Info extends Schema.Class<Info>("QuestionInfo")({
  question: Schema.String,
  header: Schema.String,
  options: Schema.Array(Option),
  multiple: Schema.optional(Schema.Boolean),
  custom: Schema.optional(Schema.Boolean),
  key: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
```

### `processor.ts` 中 suspend 触发
```typescript
// packages/opencode/src/session/processor.ts:391
if (value.toolName === "Request_Goal_Revision" || value.toolName === "Suspend_Task" || value.toolName === "AskUserQuestion") {
  ctx.suspended = true
}
```

### `SessionStatus` 状态机
```typescript
// packages/opencode/src/session/status.ts:8
export const Info = z.union([
  z.object({ type: z.literal("idle") }),
  z.object({ type: z.literal("busy"), message: z.string().optional() }),
  z.object({ type: z.literal("retry"), attempt: z.number(), message: z.string(), next: z.number() }),
])
```
