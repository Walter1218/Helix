# 动态智能体生态系统（Dynamic Agent Ecosystem）v1

> **版本**: 1.0
> **日期**: 2026-06-17
> **状态**: 方案确认，待实施
> **原则**: 不过滤、允许犯错、先 Harness 后业务、不持久化、常驻化推迟

---

## 1. 背景与问题

当前 Helix 的多智能体采用**显式编排**：主智能体在 ReAct 循环中必须主动调用 `actor` 工具才能 `spawn` 或 `run` 子智能体。这种设计存在三个结构性瓶颈：

### 1.1 决策摩擦

模型需要具备"元认知"能力——知道自己什么时候搞不定、需要求助。但实践中，模型面对大量文件读取、多维度分析、并行任务时，往往选择自己硬撑，导致上下文窗口爆炸、步骤数失控、同一工具反复调用。

### 1.2 人设僵化

当前预定义 persona 只有 `explore`/`general`/`judge` 等少数几个。用户任务是无限多样的：数据库迁移审查、API 向后兼容分析、安全加固审计、文档一致性检查。预定义人设永远追不上真实需求。

### 1.3 不可观测

没有 spawn 频率、成功率、效果评估等统计。不知道哪些 persona 好用、哪些该淘汰、资源花在了哪里。

---

## 2. 核心设计原则

| 原则 | 含义 | 与传统做法的区别 |
|------|------|----------------|
| **不过滤** | 动态生成的 persona 不做字数限制、重复检测、语义去重、质量后验过滤。让模型在试错中自然进化。 | 传统：生成后必须过滤，否则系统污染 |
| **允许犯错** | 分解失败、人设无用、选错 agent 类型，都是数据而非故障。完整记录轨迹，不自动回退或删除。 | 传统：失败即回退到 `general` 或兜底 |
| **Loop 工程积累** | Orchestrator 的准确性、人设的优劣、分解的时机，全部通过 `AgentStats` 和 `Trace` 记录，由 DPO/规则优化在后续周期中自然提升。不依赖人工写规则。 | 传统：人工调 prompt、调阈值、调规则 |
| **先 Harness 后业务** | 必须先补齐 Harness 基础设施层（同步屏障、资源配额、决策审计、编排钩子），然后才实现分解业务逻辑。没有 Harness 的分解是伪闭环。 | 传统：先上功能，再补治理 |
| **不持久化** | 动态 persona 只注入内存 `InstanceState`，不写入 `mimocode.json`。进程重启后归零，避免配置漂移和权限风险。 | 传统：自动生成即写入配置 |
| **常驻化推迟** | 本版本不做 `subagent → persistent peer` 的自动提升。生命周期管理复杂，先观察统计数据再决定。 | 传统：达到一定阈值就自动常驻 |

---

## 3. 总体架构：双层 + 四方

```
┌─────────────────────────────────────────────────────────────┐
│                    Judge 智能体（可信第三方审计）               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 分解决策后验 │  │ 结果质量评估 │  │ 价值成功判定 L2  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Orchestrator 校准（Meta-Judge）               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    Harness 基础设施层（必须先有）               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 同步屏障      │  │ 资源配额     │  │ 决策审计         │  │
│  │ 结果通道      │  │ 熔断机制     │  │ 输入隔离         │  │
│  │ 编排钩子      │  │ LRU 淘汰     │  │ 后台调度器       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    业务逻辑层（后实现）                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Decomposition│  │ DynamicAgent │  │ AgentStats       │  │
│  │ Gate         │  │ 动态人设     │  │ 统计层           │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**四方制衡**：
- **主智能体（执行者）**：做具体工作，执行子智能体结果
- **子智能体（被评估者）**：被 spawn 执行特定任务，报告结果
- **Orchestrator（决策者）**：判断何时分解、用什么 agent、任务描述
- **Judge（审计者）**：独立评估决策是否正确、结果质量如何、价值是否被采纳

---

## 4. Harness 基础设施层（v1 必须先实现）

### 4.1 L3 生命周期编排：同步屏障 + 编排钩子

**问题**：`background: true` 的异步 spawn 导致主智能体可能提前 `final`，子智能体结果无人消费。

**方案**：

- **同步屏障（Synchronization Barrier）**：主智能体在输出 `final` 前，必须检查 `unfinishedSpawns` 列表。如有未完成的子智能体，阻塞等待（或转为 `actor wait` 语义）。
- **编排钩子（Orchestration Hook）**：把 `decompositionGate` 从 `stop-condition` 链中解耦。`stop-condition` 只负责"是否继续"，编排钩子负责"是否分流"。两者不在同一个 `if` 链中，避免语义污染和 `step++` 计数混乱。
- **后台 Actor 统一调度器**：`auto-dream`、`auto-distill`、`decompositionGate` 产生的所有后台 spawn，统一走调度器队列。调度器管理优先级、并发上限、数据库写锁防竞态。

### 4.2 C 上下文记忆：保证交付的结果通道

**问题**：`inbox.send` + `synthetic message` 是尽力而为，子智能体结果可能丢失、被忽略、被 compaction 截断。

**方案**：

- **结果通道带 ACK**：子智能体通过 inbox 投递结果 → 主智能体（或编排器）消费后回 ACK → 子智能体确认后才真正结束生命周期。
- **上下文合并语义**：子智能体结果不以 `system-reminder` text 形式注入，而是作为结构化 `MessageV2.Part` 注入（如 `type: "checkpoint"` 或 `type: "tool_result"`），确保主智能体在后续步骤中能直接引用。
- **半同步模式**：子智能体 `background` 运行，但主智能体在 `final` 前强制 poll 结果。避免"子智能体白跑"。

### 4.3 E 执行环境：资源配额 + 熔断

**问题**：进程内内存无限增长、数据库并发无限制、动态 persona 膨胀。

**方案**：

- **资源配额**：每 session 最多 N 个动态 persona（默认 50）、最多 M 个并发子智能体（默认 3）、数据库连接池上限。
- **LRU 淘汰**：进程内动态 persona 超过上限时，淘汰最久未使用的（基于 `AgentStats.lastSpawnedAt`）。
- **熔断**：如果某类 persona 连续失败率 > 50%，不自动删除，但 orchestrator 在推荐中降低其优先级（排序靠后）。

### 4.4 O 可观测性：三层成功定义 + 决策轨迹

**问题**：`onSuccess` = `runLoop` 正常退出，不等于任务成功。统计记录的是噪声。

**方案**：

- **L0 执行成功**：`runLoop` 正常退出，无异常。
- **L1 任务成功**：解析子智能体 final message 的 `**Status**` 头，记录 `success`/`partial`/`failed`。
- **L2 价值成功**：检测主智能体在后续步骤中是否**引用了**子智能体结果（通过 `task_id` 或结果摘要的文本匹配）。
- **决策轨迹 Trace**：所有 `decompositionGate` 的输入、决策、spawn 参数、结果合并点，统一使用 `trace_id` 发布到 `TraceReporter`。支持跨 session 对齐。

### 4.5 G 治理安全：输入隔离 + 决策审计

**问题**：用户可通过自然语言诱导 orchestrator 做出不必要的分解。

**方案**：

- **输入隔离**：Orchestrator 的 prompt 分两个区块——`<system-state>`（可信状态）和 `<user-query>`（不可信输入）。模型被要求"不要仅因用户说需要分解就做分解"。
- **决策审计**：所有 `decompositionGate` 的决策写入 `decomposition_decisions` 表（或 trace），人工可追溯。
- **Override 规则**：配置可覆盖模型决策。如 `decomposition.max_per_session: 3`，超过后自动拒绝，无视模型判断。

---

## 5. 业务逻辑层（在 Harness 补齐后实现）

### 5.1 DecompositionGate（自主分解门）

在主循环中引入独立的编排钩子（不在 `stop-condition` 链中）。

**触发时机**：主智能体每轮 `handle.process` 后，编排钩子评估当前状态。与 `stop-condition` 并行，不是串行。

**双层判断**：

1. **规则层（零成本）**：检测重复步骤（`stepSignature` 连续 3 次相同）、待办任务过多（> 5）、上下文压力（token > 10 万）、步骤过多（> 10）。
2. **模型层（轻量模型）**：只有规则层通过后才调用。Orchestrator 模型优先使用 `model_groups.lite`，fallback 主模型。

**硬约束**：

- `maxDecompositionDepth = 3`（session 级）
- 同一 agent 类型冷却期 1 小时
- 资源配额上限（E 层兜底）

**决策 Schema**：

```json
{
  "shouldDecompose": true,
  "reason": "Task involves 12 files and SQL migration review",
  "suggestedAgent": "NEW",
  "agentDescription": "A specialized SQL migration auditor who checks backward compatibility and schema safety",
  "taskDescription": "Review the migration SQL for backward compatibility and rollback safety",
  "contextMode": "state",
  "requiresWrite": false
}
```

**执行流程**：

- 如果 `suggestedAgent === "NEW"`，调用 `DynamicAgent.create`。
- 验证 agent 存在后，直接 `spawn`（通过编排器/调度器，不走模型工具调用）。
- 更新 `AgentStats`。
- 注入 synthetic message（以结构化 `Part` 形式，非 text）。

### 5.2 DynamicAgent（动态人设）

**生成**：

- 调用 `Agent.generate`，输入 `description` 和 `model`。
- 返回 `{identifier, whenToUse, systemPrompt}`。

**注册**：

- 构建 `Agent.Info`，`mode: "subagent"`，`native: false`。
- 注入内存 `InstanceState`，**不写入 `mimocode.json`**。
- 权限继承父智能体当前权限（不额外限制，不额外 grant）。

**治理**：

- 无字数限制。
- 无重复检测。
- 无质量过滤。
- 进程内 LRU 淘汰（E 层）。

### 5.3 AgentStats（统计层）

**内存级 Map**（进程级，重启归零）：

```ts
interface AgentStat {
  spawnCount: number
  l0Success: number      // runLoop 正常退出
  l1Success: number      // ReturnStatus: success
  l1Partial: number      // ReturnStatus: partial
  l1Failed: number       // ReturnStatus: failed
  l2Adopted: number      // 主智能体后续引用了结果（机械检测）
  l2Judge: number        // Judge 判定价值成功（语义评估）
  lastSpawnedAt: number
  averageTurns: number
  totalTurns: number
}
```

**记录时机**：

- `spawn` 时：`spawnCount++`
- `forkWork` 结束：`l0Success`/`l0Failure`/`l0Cancelled`
- 解析 `ReturnStatus`：`l1Success`/`l1Partial`/`l1Failed`
- 主智能体后续消息检测：`l2Adopted`（机械）
- Judge 评估后：`l2Judge`（语义）

**用途**：

- Orchestrator 推荐排序（高频 + 高 L2 的优先）。
- 熔断阈值（E 层）。
- LRU 淘汰依据（E 层）。
- DPO 进化的正负样本来源（`l2Judge = 0` 的分解为负样本，`l2Judge > 0` 为正样本）。

---

## 6. Judge 智能体协作（可信第三方审计）

Judge 复用现有 `goal.ts` 的 `evaluate` 模式：
- 独立模型调用（不污染主智能体上下文）
- `Verdict` schema（`ok`/`impossible`/`reason`）
- `BusEvent` 广播（verdict 可观测）
- 优先使用 `model_groups.lite` 或 `judge` persona

Judge 在动态智能体生态系统中承担四个角色：

### 6.1 角色一：分解决策后验者（Decomposition Necessity Auditor）

**触发**：主智能体完成任务后（或分解后的若干步），Judge 独立评估"这次分解是否必要"。

**输入**：
- 分解前的 transcript（触发 DecompositionGate 时的上下文）
- 子智能体的任务描述和结果
- 最终主智能体的完成方式

**输出**：
```json
{
  "decompositionNecessary": true,
  "reason": "SQL migration review required specialized schema knowledge",
  "roi": 1.5,
  "alternative": "Main agent could have done this in 8 steps; decomposition took 5 total"
}
```

**价值**：为 DPO 提供高质量负样本。Judge 判定"不必要"的分解，直接用于优化 Orchestrator 的 prompt。

### 6.2 角色二：结果质量评估者（Subagent Quality Judge）

**触发**：子智能体完成后。

**输入**：
- 子智能体的原始任务描述
- 子智能体的最终输出（完整 final message）
- 主智能体后续步骤中的引用/使用情况

**输出**：
```json
{
  "quality": "high",
  "completeness": 0.9,
  "accuracy": 0.85,
  "actionable": true,
  "redundancy": 0.1,
  "verdict": "Correctly identified 3 backward compatibility issues and provided actionable scripts"
}
```

**价值**：子智能体声称 `success` 但 Judge 判定 `quality: low` 时，这个 delta 是**数据质量标签**，用于：
- 惩罚该 persona 的推荐权重
- 训练子智能体更诚实的 `ReturnStatus` 报告
- 优化 `generate.txt` 的 prompt 生成质量

### 6.3 角色三：价值成功判定者（L2 Adoption Judge）

**触发**：AgentStats 的 L2 机械检测完成后。

**输入**：
- 子智能体的结果摘要
- 主智能体后续 3 步的完整输出
- 最终任务输出

**输出**：
```json
{
  "adopted": true,
  "adoptionForm": "direct_reference",
  "reason": "Main agent explicitly used the subagent's SQL audit findings in the final migration plan",
  "valueAdded": "Without the subagent's audit, the migration would have missed the rollback edge case"
}
```

**价值**：解决 `l2Adopted` 机械检测的缺陷，提供可信的 L2 语义评估。

### 6.4 角色四：Orchestrator 校准者（Orchestrator Calibration Judge）

**触发**：最终任务完成后。

**输入**：
- Orchestrator 的决策 record（`reason`、`suggestedAgent`、`taskDescription`）
- 实际执行结果（子智能体做了什么、主智能体如何合并）
- 最终任务完成状态

**输出**：
```json
{
  "orchestratorDecision": "correct",
  "agentSelection": "suboptimal",
  "taskDescriptionAccuracy": 0.8,
  "verdict": "Correctly identified decomposition need, but selected 'NEW' when existing 'explore' could have handled it. Task description was slightly vague."
}
```

**价值**：元认知评估——评估"评估者"本身。直接反馈给 Orchestrator 的 DPO 优化，发现系统性偏差（如"总是过度选择 NEW"）。

---

## 7. 逻辑梳理：完整数据流

```
用户任务输入
    │
    ▼
┌──────────────────┐
│ 主智能体 runLoop  │◄──────────────────────────────────────────────────────────┐
│                  │                                                           │
│  ┌──────────┐   │                                                           │
│  │编排钩子  │   │                                                           │
│  │(Decomp  │   │                                                           │
│  │ Gate)   │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  ┌──────────┐   │                                                           │
│  │规则层    │   │                                                           │
│  │(0成本)   │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │ 不通过   │                                                           │
│       ├────────►│ 正常执行 process → 输出 → classify → continue/final         │
│       │ 通过    │                                                           │
│       ▼         │                                                           │
│  ┌──────────┐   │                                                           │
│  │模型层    │   │                                                           │
│  │(lite)   │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │ 不分解   │                                                           │
│       ├────────►│ 正常执行 process → 输出 → classify → continue/final         │
│       │ 分解    │                                                           │
│       ▼         │                                                           │
│  ┌──────────┐   │                                                           │
│  │suggested │   │                                                           │
│  │Agent    │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │ 已有    │                                                           │
│       ├────────►│ 直接 spawn 子智能体                                        │
│       │ NEW     │                                                           │
│       ▼         │                                                           │
│  ┌──────────┐   │                                                           │
│  │Dynamic   │   │                                                           │
│  │Agent     │   │                                                           │
│  │create()  │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  spawn 子智能体   │                                                           │
│  (通过调度器)    │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  ┌──────────┐   │                                                           │
│  │子智能体  │   │                                                           │
│  │runTurn   │   │                                                           │
│  │执行      │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │ 完成    │                                                           │
│       ▼         │                                                           │
│  ┌──────────┐   │                                                           │
│  │结果通道  │   │                                                           │
│  │(带 ACK) │   │                                                           │
│  └────┬─────┘   │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  合并回主上下文   │                                                           │
│  (结构化 Part)   │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  AgentStats 更新 │                                                           │
│  (L0/L1/L2)     │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  Judge 审计     │                                                           │
│  (四个角色)     │                                                           │
│       │         │                                                           │
│       ▼         │                                                           │
│  Trace 记录     │                                                           │
│       │         │                                                           │
│       └─────────┘                                                           │
│                                                                             │
│  主智能体继续 / 输出 final ────────┐                                        │
│       │                           │                                        │
│       ▼                           │                                        │
│  ┌──────────┐                     │                                        │
│  │同步屏障  │                     │                                        │
│  │检查     │                     │                                        │
│  │unfinished│                     │                                        │
│  │Spawns   │                     │                                        │
│  └────┬─────┘                     │                                        │
│       │ 有未完成                   │                                        │
│       ├────────► 阻塞等待子智能体 ──┘                                        │
│       │ 全部完成                   │                                        │
│       └────────► 正常 final，退出 runLoop                                   │
└──────────────────┘
```

**Judge 介入点**（异步，不阻塞主循环）：
1. 子智能体完成后 → Judge 评估结果质量（角色二）
2. 主智能体后续步骤 → 检测 L2 Adoption → Judge 语义确认（角色三）
3. 主智能体 final 后 → Judge 评估分解决策必要性（角色一）
4. 整个任务完成后 → Judge 评估 Orchestrator 校准（角色四）

**所有 Judge verdict 通过 `BusEvent` 广播，写入 `AgentStats` 和 `Trace`，不阻塞主循环。**

---

## 8. 与其他方案对比

| 维度 | 显式编排（当前） | Meta-Cognition Router | 外部框架（LangGraph） | **本方案** |
|------|---------------|----------------------|----------------------|-----------|
| 触发方式 | 模型主动调 `actor` | 系统拦截工具调用路由 | 预定义 DAG | **系统编排钩子自主判断** |
| Persona 来源 | 预定义 | 预定义 | 预定义 | **动态生成** |
| 错误处理 | 回退到 `general` | 路由失败 fallback | 节点失败重试 | **记录完整轨迹，不自动回退** |
| 治理 | 权限 | 权限 | 无 | **Harness 层 + Judge 审计** |
| 成本 | 低 | 高（路由层消耗） | 高（框架 overhead） | **可控（lite 模型 + 规则层过滤）** |
| 可进化性 | 无 | 无 | 无 | **DPO 闭环 + Judge 数据标签** |

---

## 9. 剩余挑战：AI 效果天花板（Harness 无法解决）

即使 Harness 和 Judge 完全补齐，以下三类问题属于**效果天花板**，需要数据积累 + 进化机制：

### 9.1 Orchestrator 判断准确性

Harness 保证"错了不崩"，Judge 审计"错了在哪"，但无法保证"对了"。不该分解时分解了，token 和时间已经消耗。

**解决路径**：积累 1000+ 次分解决策的 Trace，用 DPO 优化 Orchestrator 的 prompt，降低误判率。

### 9.2 结果注入的语义质量

Harness 保证"结果一定注入"，但无法保证"主智能体有效利用"。

**解决路径**：任务相关的注入形式实验（完整 transcript vs 结构化摘要 vs 工具结果），由 `l2Judge` 指标反馈。

### 9.3 冷启动经济成本

数据不足时，Orchestrator 和 Judge 的误判率无法避免，用户账单可能增加 20-50%。

**解决路径**：默认关闭，仅对特定任务类型（如 10+ 文件读取）开启；积累数据后逐步全量。

---

## 10. 实施路径

| 阶段 | 内容 | 产出 | 说明 |
|------|------|------|------|
| **H1** | 同步屏障 + 结果通道（ACK） | 子智能体结果可靠合并 | 必须先有，否则闭环是假的 |
| **H2** | 资源配额 + LRU + 熔断 | 内存/并发可控 | 防止不过滤后的资源失控 |
| **H3** | 三层成功定义 + 决策轨迹 Trace | 统计不再失真 | 为后续 DPO 进化提供数据 |
| **H4** | 编排钩子 + 后台调度器 | 架构冲突解决 | 从 stop-condition 中解耦 |
| **H5** | 输入隔离 + 决策审计 | 防用户操控 | 治理层底线 |
| **B1** | DecompositionGate | 自主分解 | 在 Harness 上运行 |
| **B2** | DynamicAgent | 动态人设 | 不过滤、不持久化 |
| **B3** | AgentStats | 统计层 | 完整 L0/L1/L2 轨迹 |
| **J1** | Judge 角色一 + 二 | 分解决策后验 + 结果质量评估 | 复用 goal.ts evaluate |
| **J2** | Judge 角色三 + 四 | 价值成功判定 + Orchestrator 校准 | 与 AgentStats 联动 |
| **B4** | DPO 进化闭环 | Orchestrator 准确性提升 | 数据驱动优化 |

**关键顺序**：H1-H5 必须串行（基础设施依赖）；B1-B3 可以并行；J1-J2 在 B3 后引入（需要 AgentStats 数据作为 Judge 输入）；B4 在所有数据积累后周期性运行。

---

## 11. 风险管控

| 风险 | 措施 | 优先级 |
|------|------|--------|
| 无限分解递归 | `maxDecompositionDepth = 3` + 冷却期 + 资源配额 | P0 |
| 动态人设质量不可控 | **不过滤，但记录完整轨迹** → Judge 审计 → DPO 自然淘汰 | P1 |
| Token 成本增加 | 规则层过滤 + lite 模型 + 冷启动局部开启 | P1 |
| 内存膨胀 | LRU 淘汰（E 层） | P2 |
| 用户提示注入 | 输入隔离 + 决策审计（G 层） | P2 |
| 跨 session 数据丢失 | 进程级统计，接受重启归零。后续版本评估持久化 | P3 |
| Judge 自身误判 | 轻量模型可能评估不准，但这是审计层，不影响主流程 | P3 |

---

## 12. 相关文档

- `agent/generate.txt` — 动态 persona 生成的系统提示
- `docs/superpowers/specs/2026-05-26-fork-agent-prefix-cache-design.md` — ForkContext 上下文继承
- `actor/spawn.ts` — Actor spawn 生命周期
- `session/goal.ts` — Judge 评估模式（`evaluate` + `Verdict` + `BusEvent`）
- `session/prompt.ts` — runLoop 主循环，插入编排钩子的位置
- `config/config.ts` — `updateGlobal` 配置更新接口
- `script/dogfooding/export_dpo.ts` — DPO 数据集导出（进化闭环）

---

## 13. 结论

> **动态智能体生态系统的本质，是把"子智能体"从"预定义工具"变成"模型可以创造、使用、评估、迭代的能力"。**

**Harness 层**是土壤——没有同步屏障，结果就是沙；没有资源配额，内存就是洪水。

**业务层**是植物——Orchestrator 决定何时播种，DynamicAgent 生成新种子，AgentStats 记录每颗种子的生长轨迹。

**Judge 层**是园丁——不阻止犯错，但准确记录错在哪里、为什么错、值不值。让"不过滤"有了审计底线，让"允许犯错"有了进化方向。

**进化机制**是自然选择——数据积累后，DPO 优化让 Orchestrator 更准，Judge 评估让数据更可信，统计让好的人设自然优先，差的人设自然淘汰。

**不过滤、允许犯错、靠数据说话、由 Judge 审计。**
