# Helix 自我迭代统一开发规划

> 编制日期：2026-06-22
> 目标：以数据流为主线，融合自动开发、OpenSpec、Judge、进化飞轮，构建需求驱动的自我进化闭环

---

## 一、项目目标回顾

Helix 的核心目标是**构建能自主执行复杂代码任务并持续自我进化的 AI 智能体**。

用户只需描述目标，Agent 会自动规划、执行、验证，从执行轨迹中学习并持续改进——无需人工干预。

**核心差异化能力**：需求驱动的自我进化闭环

```
OpenSpec需求 → 自动分解 → 自动执行 → Judge审查 → 进化学习 → 能力提升
```

---

## 二、当前状态总结

### 2.1 已完成能力

| 能力 | 状态 | 说明 |
|------|------|------|
| **自动开发闭环** | ✅ 完成 | Scheduler → Loop重试(3次) → Judge验证 → 飞书通知 |
| **OpenSpec集成** | ✅ 完成 | 需求规范 → 自动生成roadmap → 执行后回写状态 |
| **Judge增强** | ✅ 5/7项 | 安全性、相关性、过量改动、完整性、Trace覆盖 |
| **进化飞轮基础** | ✅ 完成 | DPO导出、ProgressObserver、HeuristicFilter |
| **可观测性基础** | ✅ 完成 | TraceReporter、AlignmentGuard |
| **安全沙箱** | ✅ 完成 | Shadow Worktree、VFSOverlay、ToolInterceptor |

### 2.2 待完成能力

| 能力 | 状态 | 说明 |
|------|------|------|
| **Judge补全** | ⏳ 2项缺失 | 回归风险检查、一致性检查 |
| **数据流打通** | ⏳ 未实现 | 自动开发trace → DPO导出 |
| **模式注册表** | ⏳ 后端缺失 | 前端有UI，后端硬编码 |
| **Pre-flight** | ⏳ 后端缺失 | 前端有面板，后端无实现 |
| **Cardinal** | ⏳ 后端缺失 | 前端有面板，后端无实现 |
| **动态智能体** | ⏳ 未实现 | 仅设计文档 |

### 2.3 代码质量状态

| 检查项 | 状态 |
|--------|------|
| 类型检查 | ✅ 通过 |
| Lint | 3376 warnings, 0 errors |
| 测试 | 运行超时，需优化 |
| 工作区 | 干净，无未提交变更 |

---

## 三、能力融合分析

### 3.1 数据流闭环

```
┌─────────────────────────────────────────────────────────────────┐
│                    Helix 数据流闭环                               │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ OpenSpec     │────→│ 自动开发     │────→│ Trace记录    │    │
│  │ 需求规范     │     │ Scheduler    │     │ TraceReporter│    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         ↑                   │                      │           │
│         │                   ▼                      ▼           │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ Spec状态回写 │←────│ Judge审查    │←────│ Heuristic    │    │
│  │ spec-writer  │     │ judge-enhanced│    │ Filter       │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                   │                      │           │
│         ▼                   ▼                      ▼           │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ DPO数据导出  │←────│ Alignment    │←────│ 进化飞轮     │    │
│  │ export_dpo   │     │ Guard        │     │ beta_loop    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 能力融合点

| 融合点 | 上游 | 下游 | 价值 |
|--------|------|------|------|
| **需求→执行** | OpenSpec需求 | Scheduler任务 | 需求驱动开发 |
| **执行→审查** | 自动开发trace | Judge审查 | 质量保障 |
| **审查→学习** | Judge结果 | DPO数据 | 进化学习 |
| **学习→改进** | DPO训练 | 模型改进 | 能力提升 |
| **改进→需求** | 能力提升 | OpenSpec更新 | 持续迭代 |

---

## 四、统一迭代规划

### 4.1 第一阶段：数据流打通（1周）

**目标**：让自动开发产生的数据自动进入进化飞轮

| 任务 | 文件 | 预计工期 | 说明 |
|------|------|----------|------|
| Judge补全 | `script/auto-dev/judge-enhanced.ts` | 2天 | 补全回归风险检查、一致性检查 |
| Trace自动导出 | `script/auto-dev/scheduler.ts` | 1天 | 任务完成后自动导出trace到DPO目录 |
| DPO自动触发 | `script/dogfooding/auto-export.ts` | 2天 | 每日自动检查并导出DPO数据集 |

**实现方案**：复用现有Bus，订阅TraceNodeEvent

```typescript
// 复用现有Trace事件，DPO导出器订阅
bus.subscribeCallback(TraceNodeEvent, (event) => {
  dpoExporter.collect(event.properties)
})

// scheduler.ts 任务完成后触发导出检查
dpoExporter.checkAndExport()
```

**验收标准**：
- 自动开发任务完成后，trace自动进入success/failed目录
- DPO数据集每日自动更新
- Judge检查项完整（7/7）

---

### 4.2 第二阶段：模式注册表（2周）

**目标**：支持可插拔模式，一步到位迁移所有模式

| 任务 | 文件 | 预计工期 | 说明 |
|------|------|----------|------|
| Mode Registry后端 | `src/session/mode-registry.ts` | 5天 | 实现ModeHandler接口，迁移6个模式 |
| 配置文件 | `mimocode.json` modes配置 | 包含在上述 | 配置化模式参数 |

**ModeHandler接口**：
```typescript
interface ModeHandler {
  readonly id: string
  
  // 系统提示注入（Compose/Plan用）
  readonly buildSystemPrompt?: (ctx: BuildContext) => Effect.Effect<string>
  
  // 预处理：修改消息/注入额外内容（Compose/Plan用）
  readonly preprocess?: (ctx: ProcessContext) => Effect.Effect<ProcessContext>
  
  // 核心执行（Max用，其他模式用默认handle.process）
  readonly execute?: (ctx: ExecuteContext) => Effect.Effect<ExecuteResult>
  
  // 数据流闭环配置
  readonly evolutionConfig?: EvolutionConfig
}
```

**迁移范围**（一步到位）：
| 模式 | 原代码位置 | 迁移内容 |
|------|-----------|----------|
| Compose | `prompt.ts:451-464` | 注入PROMPT_COMPOSE + skills block |
| Plan | `prompt.ts:467-499` | 注入plan限制 + workflow prompt |
| Max | `prompt.ts:2779-2810` | 调用runMaxStep |
| Ask | 默认 | 纯对话，无特殊处理 |
| Build | 默认 | 标准process |
| Loop | 类似Max | 循环执行逻辑 |

**配置文件**（mimocode.json）：
```json
{
  "modes": {
    "ask": {
      "enabled": true,
      "evolution": { "judgeEnabled": false, "traceExportEnabled": false, "evolutionEnabled": false }
    },
    "build": {
      "enabled": true,
      "evolution": { "judgeEnabled": true, "traceExportEnabled": true, "evolutionEnabled": true }
    },
    "plan": {
      "enabled": true,
      "systemPrompt": "Plan mode is active...",
      "evolution": { "judgeEnabled": true, "judgeChecks": ["security", "relevance"], "traceExportEnabled": true, "evolutionEnabled": true }
    },
    "compose": {
      "enabled": true,
      "evolution": { "judgeEnabled": true, "judgeChecks": ["security", "completeness"], "traceExportEnabled": true, "evolutionEnabled": true }
    },
    "max": {
      "enabled": true,
      "candidates": 3,
      "evolution": { "judgeEnabled": true, "traceExportEnabled": true, "evolutionEnabled": true }
    },
    "loop": {
      "enabled": true,
      "maxRetries": 3,
      "evolution": { "judgeEnabled": true, "traceExportEnabled": true, "evolutionEnabled": true }
    }
  }
}
```

**配置覆盖方式**：
1. 全局配置文件 (mimocode.json)
2. 运行时参数：`mimo run "task" --mode build --no-judge`
3. 环境变量：`MIMOCODE_EVOLUTION_PLAN_ENABLED=false`

**验收标准**：
- 新增模式只需注册，无需修改prompt.ts
- 默认配置：除Ask外所有模式接入数据流闭环
- 支持三种配置覆盖方式
- 现有模式（Ask/Build/Plan/Compose/Max/Loop）正常工作

---

### 4.3 第三阶段：Pre-flight + Cardinal（1周）

**目标**：任务执行前验证需求完整性，运行时阻塞高风险任务

| 任务 | 文件 | 预计工期 | 说明 |
|------|------|----------|------|
| Pre-flight检查 | `src/session/preflight.ts` | 3天 | 任务执行前准入检查 |
| Cardinal阻塞 | `src/session/cardinal.ts` | 2天 | 运行时动态阻塞降级 |

**Pre-flight检查**（任务执行前）：

| 检查项 | 检查内容 | 阻塞级别 | 默认启用 |
|--------|----------|----------|----------|
| spec完整性 | OpenSpec需求是否明确、无歧义 | block | ✅ |
| token预算 | 剩余token是否够用 | block | ✅ |
| 依赖检查 | 前置任务是否完成 | pause | ✅ |
| 权限检查 | 是否需要特殊权限 | warn | ✅ |

```typescript
interface PreFlightCheck {
  readonly id: string
  readonly name: string
  readonly check: (task: Task) => Effect.Effect<CheckResult>
}

interface CheckResult {
  readonly passed: boolean
  readonly level: "block" | "pause" | "warn" | "info"
  readonly message: string
  readonly suggestion?: string
}
```

**处理流程**：
```
任务选中 → Pre-flight检查
    ↓
通过 → 执行
    ↓
block → 跳过，飞书通知原因
    ↓
pause → 飞书通知，等待用户通过飞书回复"确认"后继续
    ↓
warn → 记录日志，继续执行
```

**用户确认方式**：
- 飞书通知包含任务ID和确认链接
- 用户回复"确认"或点击链接
- 超时未确认（默认30分钟）自动跳过任务

**Cardinal阻塞级别**（执行过程中）：

| 级别 | 含义 | 处理方式 |
|------|------|----------|
| **block** | 严重风险，必须停止 | 立即终止，飞书通知 |
| **pause** | 中等风险，需确认 | 暂停，飞书等用户确认 |
| **stop** | 轻微风险，建议停止 | 停止，记录日志 |
| **warn** | 潜在风险，继续执行 | 警告，继续执行 |

**触发条件**：

| 条件 | 级别 | 判断标准 | 说明 |
|------|------|----------|------|
| 安全风险 | block | 检测到eval/exec/密钥泄露 | 立即终止 |
| 过量改动 | pause | 改动文件数 > 预估文件数 × 2 | 预估基于任务描述 |
| 连续失败 | pause | 同一任务失败3次 | 避免死循环 |
| 偏离目标 | stop | AlignmentGuard连续3次告警 | 累积判断 |
| token超限 | warn | 单任务消耗 > 总预算的20% | 比例判断 |

```typescript
interface CardinalRule {
  readonly id: string
  readonly name: string
  readonly evaluate: (context: ExecutionContext) => Effect.Effect<CardinalDecision>
}

interface CardinalDecision {
  readonly level: "block" | "pause" | "stop" | "warn"
  readonly reason: string
  readonly suggestion?: string
}
```

**与Pre-flight的区别**：
| | Pre-flight | Cardinal |
|--|------------|----------|
| 时机 | 任务执行前 | 执行过程中 |
| 频率 | 一次 | 每步检查 |
| 数据 | 静态（spec、预算） | 动态（运行时状态） |

**验收标准**：
- 任务执行前自动检查，block任务跳过，pause任务等用户确认
- 执行过程中动态检测风险，高风险任务自动阻塞
- 失败/阻塞均通过飞书通知用户

---

### 4.4 第四阶段：可观测性提升（1周）

**目标**：全模块Trace覆盖，可配置采样，长期保留

| 任务 | 文件 | 预计工期 | 说明 |
|------|------|----------|------|
| Trace全覆盖 | `src/observability/trace-reporter.ts` | 3天 | 全模块埋点补充 |
| HeuristicFilter扩展 | `src/observability/heuristic-filter.ts` | 2天 | 扩展脏数据模式 |

**覆盖范围**（全覆盖）：
| 模块 | 当前 | 目标 |
|------|------|------|
| session | 90% | 100% |
| server | 85% | 100% |
| llm | 80% | 100% |
| tool | 85% | 100% |
| workflow | 60% | 100% |
| actor | 70% | 100% |
| task | 65% | 100% |
| memory | 85% | 100% |
| agent | 70% | 100% |

**配置**：
```json
{
  "observability": {
    "trace": {
      "coverage": "full",
      "sampling": { "enabled": false, "rate": 1.0 },
      "retention": { "maxSize": "10GB", "autoCleanup": true }
    }
  }
}
```

**HeuristicFilter扩展**：
```typescript
const DIRTY_PATTERNS = [
  // 现有模式...
  /rate.?limit/i,           // API限流
  /quota.?exceeded/i,       // 配额超限
  /insufficient.?funds/i,   // 余额不足
  /model.?overloaded/i,     // 模型过载
  /context.?length.?exceeded/i, // 上下文超长
]
```

**可视化**：VS Code + Web 优先，飞书作为补充

**验收标准**：
- 全模块Trace覆盖率达到100%
- 支持全量/采样可配置
- 数据长期保留，按存储上限自动清理

---

### 4.5 第五阶段：动态智能体（3周）

**目标**：根据复杂度自动分解任务，动态生成Persona

| 任务 | 文件 | 预计工期 | 说明 |
|------|------|----------|------|
| DecompositionGate | `src/agent/decomposition-gate.ts` | 5天 | 任务分解编排 |
| DynamicAgent | `src/agent/dynamic-agent.ts` | 7天 | 动态Persona生成 |
| AgentStats | `src/agent/agent-stats.ts` | 3天 | 三层成功定义 |

**DecompositionGate**（按复杂度分解）：
```typescript
interface DecompositionGate {
  // 判断是否需要分解（基于复杂度）
  shouldDecompose(task: Task): Effect.Effect<boolean>
  // 分解任务
  decompose(task: Task): Effect.Effect<Task[]>
  // 验证分解质量
  validate(original: Task, decomposed: Task[]): Effect.Effect<boolean>
}

// 复杂度阈值配置
{
  "decomposition": {
    "complexity_threshold": 10000,  // 超过10K token考虑分解
    "max_subtasks": 5               // 最多分解5个子任务
  }
}
```

**DynamicAgent**（动态生成system prompt）：
```typescript
interface DynamicAgent {
  // 根据任务和spec生成Persona（含system prompt）
  generate(task: Task, spec: Spec): Effect.Effect<Persona>
  // 注入内存
  injectMemory(persona: Persona): Effect.Effect<void>
}
```

**AgentStats三层成功定义**：
```typescript
type SuccessLevel = "L0" | "L1" | "L2"

interface AgentStats {
  L0: boolean  // 物理成功：代码能运行
  L1: boolean  // 功能成功：测试通过
  L2: boolean  // 价值成功：用户满意（按交互轮次判断）
}

// L2判断逻辑：任务完成后用户继续修改 = 不满意
function evaluateL2(taskId: string): boolean {
  const postCompletionInteractions = getInteractionsAfterCompletion(taskId)
  return postCompletionInteractions.length === 0  // 无后续修改 = 满意
}
```

**分解质量与进化飞轮打通**：
```
任务分解 → 子任务执行 → 结果统计
    ↓              ↓
成功分解 → chosen   失败分解 → rejected
    ↓              ↓
    └──→ DPO数据集 ──┘
        ↓
    进化学习
```

**验收标准**：
- 复杂任务（>10K token）自动分解为子任务
- 动态生成system prompt并注入
- L2按用户交互轮次判断
- 分解质量数据进入DPO数据集

---

## 五、关键技术决策

### 5.1 数据流架构

**决策**：复用现有Bus系统，订阅TraceNodeEvent

```typescript
// 复用现有Trace事件，DPO导出器订阅
bus.subscribeCallback(TraceNodeEvent, (event) => {
  dpoExporter.collect(event.properties)
})
```

**优势**：最小改动，无需新建事件类型

### 5.2 模式注册表设计

**决策**：采用Effect.Service + Registry模式，一步到位迁移

```typescript
export class ModeRegistry extends Context.Service<ModeRegistry>()("@opencode/ModeRegistry") {
  readonly register: (handler: ModeHandler) => Effect.Effect<void>
  readonly get: (modeId: string) => Effect.Effect<ModeHandler | undefined>
  readonly getAll: () => Effect.Effect<ModeHandler[]>
}
```

**配置**：mimocode.json集中管理，支持运行时覆盖

### 5.3 Pre-flight检查策略

**决策**：任务执行前准入检查，block跳过，pause等用户确认，失败飞书通知

```typescript
export class PreFlight extends Context.Service<PreFlight>()("@opencode/PreFlight") {
  readonly register: (check: PreFlightCheck) => Effect.Effect<void>
  readonly runAll: (task: Task) => Effect.Effect<CheckResult[]>
}
```

### 5.4 Cardinal阻塞策略

**决策**：运行时动态检查，每步执行后评估

```typescript
export class Cardinal extends Context.Service<Cardinal>()("@opencode/Cardinal") {
  readonly register: (rule: CardinalRule) => Effect.Effect<void>
  readonly evaluate: (context: ExecutionContext) => Effect.Effect<CardinalDecision>
}
```

### 5.5 可观测性策略

**决策**：全模块覆盖，可配置采样，长期保留，VS Code + Web优先

### 5.6 进化飞轮部署

**决策**：保持现有方案，不Docker化

- 本地开发：`start-services.sh`一键启动
- 定时任务：launchd每天14:00执行
- 后续有部署需求再考虑Docker化

---

## 六、执行计划

### 6.1 里程碑时间线

| 阶段 | 任务 | 时间 | 产出 |
|------|------|------|------|
| **W1** | 数据流打通 | 第1周 | Judge补全 + Trace自动导出 + DPO自动触发 |
| **W2-3** | 模式注册表 | 第2-3周 | Mode Registry + 一步到位迁移 + 配置文件 |
| **W4** | Pre-flight + Cardinal | 第4周 | 任务前检查 + 运行时阻塞 + 飞书通知 |
| **W5** | 可观测性提升 | 第5周 | 全模块Trace覆盖 + 可配置采样 |
| **W6-8** | 动态智能体 | 第6-8周 | DecompositionGate + DynamicAgent + AgentStats |

### 6.2 验收标准

| 阶段 | 验收标准 |
|------|----------|
| **W1** | trace自动进入DPO目录，Judge检查项7/7 |
| **W2-3** | 新增模式无需修改prompt.ts，配置文件生效 |
| **W4** | block任务跳过，pause任务等确认，失败飞书通知 |
| **W5** | 全模块Trace覆盖，支持全量/采样配置 |
| **W6-8** | 复杂任务自动分解，动态system prompt，L2按交互判断 |

### 6.3 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 模式注册表重构范围扩大 | 中 | 延迟W2-3 | 一步到位，限定6个模式 |
| Pre-flight检查误判 | 中 | 阻塞任务 | 可配置，支持跳过 |
| 动态智能体分解质量不稳定 | 高 | W6-8延迟 | 允许犯错，靠DPO迭代 |

---

## 七、测试验收方案

### 7.1 测试原则

1. **正向测试**：验证应该通过的场景确实通过
2. **反向测试**：验证应该拦截的场景确实拦截
3. **边界测试**：验证边界条件的处理
4. **集成测试**：验证各模块协同工作

---

### 7.2 W1 测试：数据流打通

**测试文件**：`script/auto-dev/test-dataflow.ts`

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 任务执行成功，trace写入success目录 | `.dogfooding/success_traces/`有新文件 |
| **正向** | 任务执行失败，trace写入failed目录 | `.dogfooding/failed_traces/`有新文件 |
| **正向** | DPO导出正常运行 | `.dogfooding/dpo_dataset/`有新JSONL文件 |
| **正向** | 采样模式开启（rate=0.5） | trace数量约为之前的一半 |
| **反向** | 脏数据（OOM/timeout）不进入DPO | HeuristicFilter正确过滤 |
| **反向** | Judge检查项缺失时任务失败 | 7项检查全部执行 |
| **反向** | 采样率=0 | 不记录任何trace |

**验收命令**：
```bash
# 运行测试
bun run script/auto-dev/test-dataflow.ts

# 手动验证
ls -la .dogfooding/success_traces/
ls -la .dogfooding/failed_traces/
ls -la .dogfooding/dpo_dataset/

# Judge检查项验证
bun run script/auto-dev/test-judge-acceptance.ts
```

---

### 7.3 W2-3 测试：模式注册表

**测试文件**：`packages/opencode/test/session/mode-registry.test.ts`

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 注册新模式，无需修改prompt.ts | 模式正常执行 |
| **正向** | 配置文件修改，运行时生效 | mimocode.json配置生效 |
| **正向** | Ask模式不触发Judge | judgeEnabled=false生效 |
| **正向** | Build模式触发全量Judge | judgeEnabled=true生效 |
| **反向** | 未注册的模式调用 | 返回错误或fallback到默认 |
| **反向** | 配置文件格式错误 | 启动时报错，提示配置问题 |
| **边界** | 同一模式重复注册 | 后注册覆盖前注册 |

**验收命令**：
```bash
# 运行测试
bun run packages/opencode/test/session/mode-registry.test.ts

# 手动验证：修改配置文件
# 1. 修改mimocode.json中plan模式的judgeEnabled为false
# 2. 执行plan模式任务
# 3. 验证Judge未触发
```

---

### 7.4 W4 测试：Pre-flight + Cardinal

**测试文件**：`packages/opencode/test/session/preflight.test.ts` + `cardinal.test.ts`

#### Pre-flight测试

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | spec完整+token充足+依赖满足 | 任务正常执行 |
| **反向** | spec不完整（需求模糊） | block，任务跳过，飞书通知 |
| **反向** | token不足 | block，任务跳过，飞书通知 |
| **反向** | 前置任务未完成 | pause，飞书等用户确认 |
| **边界** | spec为空 | block，提示spec缺失 |
| **边界** | token刚好够用 | 通过，记录警告 |
| **验证** | 飞书通知发送 | 检查飞书消息内容包含任务ID和原因 |

#### Cardinal测试

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 正常执行，无风险 | 任务继续 |
| **反向** | 检测到eval/exec | block，立即终止，飞书通知 |
| **反向** | 改动文件数>10 | pause，飞书等用户确认 |
| **反向** | 同一任务失败3次 | pause，飞书等用户确认 |
| **反向** | AlignmentGuard检测偏离 | stop，任务停止 |
| **边界** | 改动文件数=10 | warn，记录日志，继续 |

**验收命令**：
```bash
# 运行测试
bun run packages/opencode/test/session/preflight.test.ts
bun run packages/opencode/test/session/cardinal.test.ts

# 手动验证：构造block场景
# 1. 创建spec不完整的任务
# 2. 执行任务
# 3. 验证任务被跳过，飞书收到通知
```

---

### 7.5 W5 测试：可观测性

**测试文件**：`script/dogfooding/test-observability.ts`

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 全模块trace埋点 | verify_trace.ts报告100%覆盖 |
| **正向** | 采样模式开启 | 只记录指定比例的trace |
| **正向** | 数据保留超限 | 自动清理旧数据 |
| **反向** | 脏数据模式匹配 | HeuristicFilter正确过滤 |
| **反向** | 采样率=0 | 不记录任何trace |
| **边界** | 采样率=1.0 | 全量记录 |

**验收命令**：
```bash
# 运行trace覆盖率验证
bun run script/dogfooding/verify_trace.ts

# 运行HeuristicFilter测试
bun run script/dogfooding/test-heuristic-filter.ts

# 手动验证：修改采样配置
# 1. 修改mimocode.json中observability.trace.sampling.rate=0.5
# 2. 执行任务
# 3. 验证trace数量约为之前的一半
```

---

### 7.6 W6-8 测试：动态智能体

**测试文件**：`packages/opencode/test/agent/decomposition.test.ts` + `dynamic-agent.test.ts`

#### DecompositionGate测试

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 复杂任务（>10K token） | 自动分解为子任务 |
| **正向** | 简单任务（<1K token） | 不分解，直接执行 |
| **反向** | 分解后子任务失败 | 记录到DPO为rejected |
| **反向** | 分解后子任务成功 | 记录到DPO为chosen |
| **边界** | 复杂度刚好=10K | 不分解 |
| **边界** | 分解后子任务数=5 | 正常执行 |
| **边界** | 分解后子任务数>5 | 只取前5个，其余合并 |

#### DynamicAgent测试

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 根据任务生成system prompt | prompt内容符合任务需求 |
| **正向** | Persona注入内存 | 后续对话使用该Persona |
| **反向** | 任务无spec | 使用默认Persona |
| **边界** | spec内容过长 | 截断到合理长度 |

#### AgentStats测试

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 代码能运行 | L0=true |
| **正向** | 测试通过 | L1=true |
| **正向** | 用户无后续修改 | L2=true |
| **反向** | 代码不能运行 | L0=false |
| **反向** | 测试失败 | L1=false |
| **反向** | 用户继续修改 | L2=false |

#### 分解质量与DPO打通测试

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **正向** | 分解成功+子任务全部完成 | DPO数据集有chosen样本 |
| **正向** | 分解失败+子任务部分失败 | DPO数据集有rejected样本 |
| **反向** | 分解失败+子任务全部失败 | DPO数据集有rejected样本 |

**验收命令**：
```bash
# 运行测试
bun run packages/opencode/test/agent/decomposition.test.ts
bun run packages/opencode/test/agent/dynamic-agent.test.ts
bun run packages/opencode/test/agent/agent-stats.test.ts

# 手动验证：提交复杂任务
# 1. 提交一个>10K token的复杂任务
# 2. 观察是否自动分解为子任务
# 3. 检查生成的system prompt内容
```

---

### 7.7 整体系统测试

**测试文件**：`script/auto-dev/test-e2e.ts`

**测试场景**：端到端完整流程

| 测试类型 | 测试用例 | 预期结果 |
|----------|----------|----------|
| **E2E-1** | OpenSpec需求 → 自动分解 → 执行 → Judge审查 → DPO导出 | 全流程正常，DPO有数据 |
| **E2E-2** | spec不完整 → Pre-flight block → 飞书通知 | 任务未执行，收到通知 |
| **E2E-3** | 执行中检测到安全风险 → Cardinal block → 飞书通知 | 任务终止，收到通知 |
| **E2E-4** | 任务成功 → trace记录 → chosen样本 | DPO数据集有chosen |
| **E2E-5** | 任务失败 → trace记录 → rejected样本 | DPO数据集有rejected |
| **E2E-6** | 用户继续修改 → L2=false | AgentStats记录不满意 |
| **E2E-7** | 采样模式开启 → 只记录50%trace | trace数量减半 |
| **E2E-8** | 配置文件修改 → 运行时生效 | 新配置立即生效 |

**验收命令**：
```bash
# 运行端到端测试
bun run script/auto-dev/test-e2e.ts

# 手动验证：完整流程
# 1. 创建OpenSpec需求
# 2. 运行scheduler执行任务
# 3. 验证Judge审查通过
# 4. 验证trace记录完整
# 5. 验证DPO数据集有新数据
# 6. 验证飞书收到通知
```

---

### 7.8 测试报告模板

每个阶段完成后，生成测试报告：

```markdown
# 阶段W[X]测试报告

## 测试环境
- 日期：YYYY-MM-DD
- 分支：xxx
- Commit：xxx

## 测试结果
| 测试用例 | 结果 | 说明 |
|----------|------|------|
| 正向测试1 | ✅ | |
| 反向测试1 | ✅ | |
| 边界测试1 | ✅ | |

## 问题记录
| 问题 | 严重程度 | 状态 |
|------|----------|------|
| xxx | 高/中/低 | 已修复/待修复 |

## 验收结论
- [ ] 正向测试全部通过
- [ ] 反向测试全部通过
- [ ] 边界测试全部通过
- [ ] 无高严重程度问题

## 下一步
xxx
```

---

## 八、文件结构

```
Helix/
├── packages/opencode/src/
│   ├── session/
│   │   ├── mode-registry.ts      # 新增: 模式注册表
│   │   ├── preflight.ts          # 新增: Pre-flight检查
│   │   ├── cardinal.ts           # 新增: Cardinal阻塞
│   │   └── prompt.ts             # 修改: 移除硬编码，改用registry
│   ├── agent/
│   │   ├── decomposition-gate.ts # 新增: 任务分解
│   │   ├── dynamic-agent.ts      # 新增: 动态Persona
│   │   └── agent-stats.ts        # 新增: 三层成功定义
│   └── observability/
│       ├── trace-reporter.ts     # 修改: 全模块覆盖
│       └── heuristic-filter.ts   # 修改: 扩展脏数据模式
├── packages/opencode/test/       # 新增: 测试文件
│   ├── session/
│   │   ├── mode-registry.test.ts
│   │   ├── preflight.test.ts
│   │   └── cardinal.test.ts
│   └── agent/
│       ├── decomposition.test.ts
│       ├── dynamic-agent.test.ts
│       └── agent-stats.test.ts
├── script/
│   ├── auto-dev/
│   │   ├── scheduler.ts          # 修改: 集成Trace导出
│   │   ├── judge-enhanced.ts     # 修改: 补全检查项
│   │   ├── test-dataflow.ts      # 新增: 数据流测试
│   │   └── test-e2e.ts           # 新增: 端到端测试
│   └── dogfooding/
│       ├── auto-export.ts        # 新增: DPO自动导出
│       ├── test-observability.ts # 新增: 可观测性测试
│       └── beta_evolution_loop.ts # 修改: 集成自动开发数据
├── mimocode.json                 # 修改: 新增modes配置
└── docs/
    └── helix-evolution-roadmap.md # 本文档
```

---

## 九、总结

**核心理念**：以数据流为主线，让能力互相喂养

**融合后的系统能力**：
1. **需求驱动**：OpenSpec定义需求 → 自动分解 → 自动执行
2. **质量保障**：Judge审查 → 进化飞轮学习 → 持续改进
3. **可观测**：Trace记录 → HeuristicFilter → AlignmentGuard
4. **自我进化**：执行数据 → DPO训练 → 模型改进 → 执行质量提升

**关键里程碑**：
- W1：数据流打通（Judge补全 + Trace自动导出）
- W2-3：模式注册表（可插拔模式 + 一步到位迁移）
- W4：Pre-flight + Cardinal（任务前检查 + 运行时阻塞）
- W5：可观测性提升（全模块覆盖 + 可配置采样）
- W6-8：动态智能体（任务分解 + 动态Persona + L2交互判断）

**最终目标**：构建需求驱动的自我进化闭环，让Helix成为真正自主的AI智能体。
