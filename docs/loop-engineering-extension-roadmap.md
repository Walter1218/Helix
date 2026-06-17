# Helix Loop 工程能力扩展与模式演进路线图

> 基于现有代码（`prompt.ts` 硬编码模式逻辑、`workflow/builtin.ts` 注册表、`loop_engineering_spec.md` 基建规划、`dynamic-agent-ecosystem-v1.md` 动态生态）的系统性分析。

---

## 一、模式扩展性：当前问题与演进方案

### 1.1 现状：模式逻辑硬编码于 `prompt.ts`

当前四种模式（Build/Plan/Compose/Max）的实现方式：

| 模式 | 代码位置 | 实现方式 | 扩展难度 |
|------|---------|---------|---------|
| **Compose** | `prompt.ts:451-464` | 硬编码：查找 `agent === "compose"` 的消息，注入 `PROMPT_COMPOSE` + skills block | 需修改 `buildLLMRequestPrefix` 函数 |
| **Plan** | `prompt.ts:467-499` | 硬编码：判断 `agent.name !== "plan"` 时注入 `BUILD_SWITCH`；是 plan 时注入 plan 限制 prompt | 需修改 `buildLLMRequestPrefix` 函数 |
| **Max** | `prompt.ts:2779-2810` | 硬编码：判断 `agent.name === MaxMode.MAX_MODE_AGENT` 时调用 `MaxMode.runMaxStep` | 需修改 `runLoop` 核心逻辑 |
| **Build** | 默认 | 无特殊处理，走标准 `handle.process` | — |

**核心问题**：
- 新增模式必须在 `prompt.ts` 中**硬编码** 2-3 处逻辑（system prompt 注入、消息处理、运行时分支）
- 模式特定的 UI 外显（如 `ide-ui-design.md` 中的模式标识、Max 候选进度）也是硬编码
- 没有统一的**模式注册表**（Registry）或**模式处理器**（Handler）抽象

### 1.2 演进方案：可插拔模式注册表（Pluggable Mode Registry）

**目标**：新增模式只需注册一个配置对象，无需修改 `prompt.ts` 或 `runLoop`。

**架构设计**：

```
┌─────────────────────────────────────────────────────────────┐
│                    Mode Registry (模式注册表)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Mode Handler │  │ Mode Handler │  │ Mode Handler     │  │
│  │  (build)     │  │  (plan)      │  │  (custom)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Mode Handler │  │ Mode Handler │                         │
│  │  (compose)   │  │  (max)       │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              runLoop (模式无关，只调用 Handler)               │
│  1. 获取当前 agent → 从 Registry 查找 Handler               │
│  2. 调用 Handler.preProcess() → 注入 system prompt         │
│  3. 调用 Handler.process() → 执行（标准 / 多候选 / 工作流） │
│  4. 调用 Handler.postProcess() → 后处理（如 plan 保存）    │
└─────────────────────────────────────────────────────────────┘
```

**Mode Handler 接口定义**：

```ts
// packages/opencode/src/session/mode-registry.ts
export interface ModeHandler {
  /** 模式标识符，对应 agent.name */
  readonly id: string
  
  /** 是否需要在 buildLLMRequestPrefix 中注入特殊 system prompt */
  readonly injectSystemPrompt?: (input: BuildPrefixInput) => Effect.Effect<string[]>
  
  /** 是否需要在 runLoop 的每步执行前做特殊处理 */
  readonly preProcess?: (input: ProcessInput) => Effect.Effect<ProcessInput>
  
  /** 核心执行逻辑：默认用 handle.process，Max 用 runMaxStep，未来工作流模式用 workflow runtime */
  readonly process: (input: ProcessInput & { handle: SessionProcessor.Handle }) => Effect.Effect<ProcessResult>
  
  /** 执行后处理：如 plan 模式保存 plan 文件、distill 模式触发记忆沉淀 */
  readonly postProcess?: (input: PostProcessInput) => Effect.Effect<void>
  
  /** 该模式特有的工具白名单（为空则继承 agent 配置） */
  readonly toolAllowlist?: string[]
  
  /** 该模式特有的 Pre-flight 配置 */
  readonly preFlightConfig?: PreFlightConfig
  
  /** 该模式特有的 Cardinal 检测规则 */
  readonly cardinalRules?: CardinalRule[]
  
  /** 该模式特有的 UI 配置（消息流标识、状态栏指示器） */
  readonly uiConfig?: ModeUIConfig
}
```

**改造后新增模式的流程**：

```ts
// 在 agent 配置中声明新模式（无需修改 prompt.ts）
// mimocode.json
{
  "agents": [
    {
      "name": "audit",
      "description": "安全审计模式",
      "mode": "primary",
      "prompt": "...",
      "handler": "audit"  // 对应注册表中的 handler ID
    }
  ]
}

// 注册新模式（在插件或内置代码中）
ModeRegistry.register({
  id: "audit",
  injectSystemPrompt: (input) => Effect.sync(() => [
    "You are a security auditor. Focus on: ...",
    ...input.additions
  ]),
  process: (input) => {
    // 标准执行，但限制工具为只读
    return handle.process({ ...input, toolAllowlist: ["read", "grep", "glob"] })
  },
  cardinalRules: [
    { type: "tool_error", when: (tool) => tool.name === "write", severity: "stop" }
  ],
  uiConfig: {
    icon: "🔒",
    color: "#ff0000",
    statusMessage: "🔒 Audit 模式 · 只读审查"
  }
})
```

### 1.3 与现有架构的兼容

| 现有模块 | 兼容方式 |
|---------|---------|
| `Agent.Info` (`agent.ts`) | 新增可选字段 `handler?: string`，默认 `"default"` |
| `prompt.ts` 的 `buildLLMRequestPrefix` | 将硬编码的 compose/plan 逻辑移入各自 Handler，主函数改为遍历 Registry 调用 `injectSystemPrompt` |
| `prompt.ts` 的 `runLoop` | 将 `useMaxMode` 判断改为 `ModeRegistry.get(agent.name)?.process ?? handle.process` |
| `MaxMode.runMaxStep` | 注册为 `max` 的 Handler，内部逻辑不变 |
| `workflow/builtin.ts` | 工作流模式（如 `auto-loop`）也可以注册为 Mode Handler，通过 `process` 调用 `WorkflowRuntime` |
| `ide-ui-design.md` | 模式标识、颜色、图标从 `ModeUIConfig` 动态读取，不再硬编码 |
| `mimocode.json` | 用户可在 `agents` 中配置自定义 agent 并指定 `handler`，或通过 `modeHandlers` 配置自定义 Handler 的 UI 和规则 |

---

## 二、Loop 工程的其他能力完善路线图

基于 `loop_engineering_spec.md`、`dynamic-agent-ecosystem-v1.md` 和代码分析，将 loop 工程能力分为 **7 个层级**，与现有文档形成完整闭环。

### 2.1 L0：模式与编排基础设施（新增）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **可插拔模式注册表** | 设计完成 | P0 | 本文 1.2 节，解决模式扩展性问题 |
| **模式差异化 Pre-flight** | 设计完成 | P0 | `docs/loop-preflight-design.md` §4.3，按模式定制问卷 |
| **模式差异化 Cardinal** | 设计完成 | P0 | `docs/loop-preflight-design.md` §5.2，按模式定制卡点规则 |
| **模式差异化 Deliverable Gate** | 设计完成 | P1 | `docs/loop-preflight-design.md` §6.1，按模式定制交付检查 |
| **模式 UI 配置外化** | 设计完成 | P1 | `ide-ui-design.md` §5.9/5.10，从配置动态渲染 |

### 2.2 L1：安全与隔离（已有基建，待完善）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **Shadow Worktree** | ✅ 已实现 | — | `packages/opencode/src/worktree`，影子工作树隔离 |
| **ToolInterceptor** | ✅ 已实现 | — | AST 级命令过滤，拦截高危指令 |
| **VFSOverlay** | ✅ 已实现 | — | 虚拟文件系统覆盖 |
| **Docker/MicroVM 沙箱** | 未实现 | P2 | `loop_engineering_spec.md` §6.1，容器级隔离 |
| **网络白名单拦截** | 未实现 | P2 | `loop_engineering_spec.md` §6.1，限制 `curl`/`wget` 外发 |
| **数据环境隔离** | 未实现 | P2 | `loop_engineering_spec.md` §6.2，`Env Profile` 切换机制 |
| **WorktreeGC 守护进程** | 未实现 | P1 | `loop_engineering_spec.md` §5.1，孤儿工作区自动清理 |

### 2.3 L2：上下文与记忆（部分实现，待完善）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **SQLite FTS5 + sqlite-vec** | ✅ 已实现 | — | 全文检索 + 向量检索 |
| **Memory Decay** | ✅ 已实现 | — | 记忆衰减机制 |
| **Auto-Dream / Auto-Distill** | 部分实现 | P1 | 后台服务，自动提炼记忆 |
| **动态上下文组装** | 设计完成 | P1 | `loop_engineering_spec.md` §0.1，每次 LLM 调用前动态拼装相关代码 + 经验 + 规范 |
| **项目探针 Probe** | 设计完成 | P1 | `loop_engineering_spec.md` §1.1，自动扫描 `package.json`/`tsconfig.json` 等注入约束 |
| **AST 依赖图谱** | 设计完成 | P2 | `loop_engineering_spec.md` §1.2，维护代码依赖树，修改前查询爆炸半径 |
| **外部知识挂载** | 部分实现 | P2 | `web_search`/`webfetch` 工具已可用，但缺乏 "deep-research" 子流程自动化 |
| **分层异构存储** | 设计完成 | P2 | `loop_engineering_spec.md` §5.3，规范存 Markdown、依赖存 SQLite 关系表 |

### 2.4 L3：调度与执行（部分实现，待完善）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **Hybrid FSM** | ✅ 已实现 | — | `packages/opencode/src/session/fsm/hybrid-fsm.ts` |
| **Auto-Loop Workflow** | ✅ 已实现 | — | `workflow/builtin/auto-loop.js` |
| **Workflow Runtime** | ✅ 已实现 | — | `workflow/runtime.ts`，调度、生命周期、超时 |
| **Workflow Sandbox** | ✅ 已实现 | — | `workflow/sandbox.ts`，QuickJS 沙箱 |
| **Checkpoint 机制** | ✅ 已实现 | — | `session/checkpoint.ts`，快照与恢复 |
| **Goal 驱动的停止条件** | ✅ 已实现 | — | `session/goal.ts` |
| **Actor Spawn** | ✅ 已实现 | — | `actor/spawn.ts` |
| **同步屏障（Synchronization Barrier）** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §4.1，主智能体 `final` 前检查未完成的子智能体 |
| **编排钩子（Orchestration Hook）** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §4.1，`decompositionGate` 从 `stop-condition` 解耦 |
| **后台 Actor 统一调度器** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §4.1，管理 `auto-dream`、`auto-distill`、`decompositionGate` 的并发 |
| **结果通道带 ACK** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §4.2，子智能体结果不丢失 |
| **上下文合并语义** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §4.2，结构化 `MessageV2.Part` 注入而非 `system-reminder` text |
| **并发任务依赖锁** | 设计完成 | P2 | `loop_engineering_spec.md` §5.1，多包 Monorepo 并行开发 |
| **Token 预算控制与模型降级** | 设计完成 | P1 | `loop_engineering_spec.md` §5.2，简单任务降级到本地模型 |
| **Pre-flight Check** | 设计完成 | P0 | `docs/loop-preflight-design.md` §4，启动前信息收集 |
| **Cardinal Detection** | 设计完成 | P0 | `docs/loop-preflight-design.md` §5，运行时卡点检测 |
| **Deliverable Gate** | 设计完成 | P1 | `docs/loop-preflight-design.md` §6，终止前交付物确认 |
| **Test-Driven Healing Loop** | 部分实现 | P1 | `auto-loop.js` 已有 heal 循环，但缺乏 "Trace 日志注入 RCA" 和 "熔断机制" |
| **Snapshot & Rollback Tree** | 设计完成 | P1 | `loop_engineering_spec.md` §2.3，FSM 节点快照 |
| **Request_Goal_Revision 逃生舱** | ✅ 已实现 | — | `processor.ts` 已支持，允许模型在 Check 阶段修改目标 |

### 2.5 L4：可观测与干预（部分实现，待完善）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **BusEvent 系统** | ✅ 已实现 | — | `bus/bus-event.ts`，事件总线 |
| **Trace Reporter** | ✅ 已实现 | — | `observability/trace-reporter.ts` |
| **ProgressObserver** | ✅ 已实现 | — | 进度观察 |
| **Pre-flight 卡片 (UI)** | 设计完成 | P0 | `ide-ui-design.md` §5.9，消息流中可交互的启动前信息收集 |
| **Cardinal 指示器 (UI)** | 设计完成 | P0 | `ide-ui-design.md` §5.10，运行时卡点检测的卡片和状态栏 HUD |
| **FSM 状态可视化 (UI)** | 设计完成 | P1 | `ide-ui-design.md` §5.7，状态栏微型状态机 |
| **DPO 数据反馈 (UI)** | 设计完成 | P1 | `ide-ui-design.md` §5.8，👍/👎 反馈收集 |
| **成本预算 (UI)** | 设计完成 | P1 | `ide-ui-design.md` §5.6/4.10，Token 用量和预算进度 |
| **多模态全链路日志控制面板** | 设计完成 | P2 | `loop_engineering_spec.md` §4.1，UI 视角的思考链路追踪 |
| **熔断上报与决策悬挂** | 部分实现 | P1 | `loop_engineering_spec.md` §4.2，`Question` 工具已实现基础悬挂，但缺乏 "2-3 个备选方案" 结构化展示 |
| **三层成功定义** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §4.4：L0 执行成功、L1 任务成功、L2 价值成功 |

### 2.6 L5：高阶进化（设计阶段）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **元认知与指令自迭代** | 设计完成 | P2 | `loop_engineering_spec.md` §3.1，`Auto-Distill` 复盘 → 规则沉淀 → 动态注入 |
| **量化执行与测试报告** | 设计完成 | P2 | `loop_engineering_spec.md` §3.2，汇总 Trace 数据生成结构化验收报告 |
| **DPO 数据集导出** | ✅ 已实现 | — | `script/dogfooding/export_dpo.ts` |
| **规则生命周期管理** | 设计完成 | P2 | DPO 合并后从 `AGENTS.md` 中修剪过时规则 |
| **动态衰减与压缩知识引擎** | 设计完成 | P2 | `loop_engineering_spec.md` §5.3，基于 AST Hash 的置信度衰减 |
| **Map-Reduce 级联压缩** | 设计完成 | P2 | `loop_engineering_spec.md` §5.3，仅注入类型定义和接口契约 |
| **对抗性验证机制** | 设计完成 | P2 | `loop_engineering_spec.md` §5.2，`Judge Agent` 审查测试修改的合理性 |
| **动态智能体分解** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §3，`DecompositionGate` 自主评估是否分解 |
| **动态 Persona 生成** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §3，`DynamicAgent` 模型自主生成人设 |
| **AgentStats 统计层** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §3，记录完整行为轨迹 |
| **Judge 智能体协作** | 设计完成 | P0 | `dynamic-agent-ecosystem-v1.md` §3，分解决策后验、结果质量评估、Orchestrator 校准 |

### 2.7 L6：生态与集成（规划阶段）

| 能力 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| **Plugin / MCP 管理器 (UI)** | 设计完成 | P1 | `ide-ui-design.md` §5.6，展示/管理插件和 MCP Server |
| **Feishu Gateway** | ✅ 已实现 | — | `packages/feishu-gateway`，IM 集成 |
| **JavaScript SDK** | ✅ 已实现 | — | `packages/sdk/js` |
| **SWE-bench 适配模式** | 设计完成 | P2 | `ide-ui-design.md` §12，面向基准测试的自动化评估模式 |
| **多文件批量修改 (UI)** | 设计完成 | P2 | `ide-ui-design.md` §12，文件树面板中批量接受/拒绝 |
| **AGENTS.md 编辑器 (UI)** | 设计完成 | P2 | `ide-ui-design.md` §5.5，展示/编辑项目规则 |
| **记忆浏览器 (UI)** | 设计完成 | P2 | `ide-ui-design.md` §5.4，展示/管理记忆条目 |
| **权限面板 (UI)** | 设计完成 | P1 | `ide-ui-design.md` §5.1，展示/编辑 Agent 权限矩阵 |

---

## 三、核心设计决策

### 3.1 模式扩展：为什么必须引入 Mode Registry

**当前痛点**：
- 新增 `audit` 模式（安全审计）需要修改 `prompt.ts` 中至少 3 处逻辑
- 新增 `research` 模式（深度调研）需要复用 `deep-research.js` 工作流，但入口在 `tool/workflow.ts` 而非 `runLoop`
- 新增 `tdd` 模式（测试驱动）需要复用 `auto-loop.js` 的 test 阶段，但无法组合

**Registry 方案**：
- 模式 = Agent 配置 + Handler 逻辑 + UI 配置，三者解耦
- 内置模式（Build/Plan/Compose/Max）注册在系统初始化时
- 用户自定义模式通过 `mimocode.json` 的 `agents` 配置 + 可选的 `modeHandlers` 配置声明
- 第三方插件通过 `Plugin` 系统注册自定义 Handler

### 3.2 Loop 工程的优先级排序（按"用户可见性"拆分）

**P0a（Phase 2a, Week 3）**：Pre-flight MVP — 用户可见性高
- 仅 Build 模式，硬编码问题模板（轻量模型降级为规则匹配）
- 触发决策树（auto-learn + cooldown）
- 仅 external_dep Cardinal（Pause 等级，30s 降级）
- 不支持的：Plan/Compose/Max 模式、动态问题生成、test_failure Cardinal

**P0b（Phase 2b, Week 4）**：Cardinal MVP — 用户可见性高
- test_failure Cardinal（Block 等级，永不降级）
- 状态栏 HUD（Warn/Pause/Block 指示器）
- 无 Deliverable Gate（Phase 4 加入）
- 不支持的：ambiguity、token_budget、heal_exhausted

**P0c（Phase 3a, Week 5）**：同步屏障 + 编排钩子 — 用户可见性低
- 子智能体结果不丢失（ACK 机制）
- 编排钩子基础框架（decompositionGate）
- 不自动分解、不动态 Persona

**P0d（Phase 3b, Week 6）**：Mode Registry — 用户可见性中
- 内置模式注册（Build/Plan/Compose/Max）
- UI 配置外化（从 ModeUIConfig 动态读取）
- 不支持用户自定义 Handler、不支持第三方插件

**P0e（Phase 4, Week 7-8）**：动态分解 + 动态 Persona — 用户可见性中
- 显式触发分解（用户手动，不自动评估）
- AgentStats 记录完整行为轨迹
- Judge 智能体（后验评估，非实时）
- 不支持的：自动评估是否分解、自动 Persona 生成

**P1（下个迭代）**：
1. 动态上下文组装 + 项目探针
2. Token 预算控制与模型降级
3. FSM 状态可视化 + 成本预算 UI
4. 结果通道带 ACK + 上下文合并语义
5. Test-Driven Healing Loop 完善（Trace 注入 RCA + 熔断）

**P2（长期）**：
1. Docker/MicroVM 沙箱
2. AST 依赖图谱
3. 元认知与指令自迭代
4. 对抗性验证机制
5. SWE-bench 适配模式

---

## 四、与现有文档的衔接

| 现有文档 | 本文补充 |
|---------|---------|
| `docs/loop-preflight-design.md` | 将 Pre-flight/Cardinal/Deliverable 提升到模式注册表级别，支持按模式定制 |
| `docs/ide-ui-design.md` | 将模式 UI 配置从硬编码改为从 `ModeUIConfig` 动态读取 |
| `docs/architecture/loop_engineering_spec.md` | 补充 L0 层级（模式注册表），细化实施优先级 |
| `docs/architecture/dynamic-agent-ecosystem-v1.md` | 补充 Mode Registry 与动态分解的衔接：分解后的子智能体可指定模式 Handler |
| `docs/ide-execution-plan.md` | Phase 1 新增 "Mode Registry 基础框架"，Phase 2 新增 "同步屏障 + 编排钩子" |

---

*本文档作为 Loop 工程能力扩展的顶层设计，与现有 4 份设计文档形成互补闭环。实施时按 P0 → P1 → P2 优先级推进。*
