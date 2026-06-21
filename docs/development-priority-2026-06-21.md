# Helix 开发优先级规划（含真实功能盘点）

> 编制日期：2026-06-21
> 目标：从项目目标出发，结合当前核心能力与近期开发状态，明确执行优先级与关键决策

---

## 一、项目目标

Helix 的核心目标是**构建能自主执行复杂代码任务并持续自我进化的 AI 智能体**。

用户只需描述目标，Agent 会自动规划、执行、验证，从执行轨迹中学习并持续改进——无需人工干预。

---

## 二、需求与功能分层

按成熟度递进，分为三个阶段：

| 阶段 | 目标 | 需求描述 | 当前状态 | 阻塞度 |
|------|------|----------|----------|--------|
| **P0 可用** | 用户能在 IDE 中稳定使用 Helix 对话和执行任务 | 稳定的前端面板、守护进程管理、消息发送与流式响应 | 80% 完成——VS Code 扩展守护进程已重构，但前端稳定性仍存在问题 | 🔴 高 |
| **P1 可信** | 执行可观测、权限透明、错误可恢复、成本可控 | 执行轨迹追踪、脏数据过滤、偏离纠偏、权限诊断、错误降级 | 50% 完成——后端核心能力已就绪，但前端 UI 外化不足 | 🟡 中 |
| **P2 智能** | 动态智能体分解、自我进化飞轮闭环、模式可扩展 | 任务自主分解、动态 Persona 生成、进化数据闭环、模式可插拔 | 30% 完成——设计文档已就绪，核心代码未实现 | 🟢 低 |

---

## 三、真实功能盘点（代码级确认）

> 以下盘点基于对 `packages/opencode/src/` 实际代码的逐条确认，区分**已实现**、**部分实现**、**未实现**。

### 3.1 ✅ 已实现（后端有完整代码，可运行）

| 功能 | 代码位置 | 实现说明 | 前端 UI |
|------|----------|----------|---------|
| **TraceReporter** 执行树追踪 | `packages/opencode/src/observability/trace-reporter.ts` | 完整的 Effect Service，通过 Bus 发布/订阅 `TraceNodeEvent` 事件，支持 `emitTrace` 和 `getTraces`，已集成到 `app-runtime.ts` 默认 Layer | ❌ 无 |
| **HeuristicFilter** 脏数据过滤 | `packages/opencode/src/observability/heuristic-filter.ts` | `DIRTY_PATTERNS` 正则匹配（timeout/oom/signal），exit code 检查（137=OOM, 124=Timeout），提供 `evaluate` 和 `sanitize` API | ❌ 无 |
| **AlignmentGuard** 实时偏离纠偏 | `packages/opencode/src/observability/alignment-guard.ts` | 分心操作检测（curl/wget/open）、兔子洞检测（重复 install）、连续失败阈值、文件偏离关键词检测，可投递到 Actor 收件箱或广播 `AlignmentAlert` Bus 事件 | ❌ 无 |
| **混合记忆系统（FTS5 + Vector）** | `packages/opencode/src/memory/`（`service.ts`, `fts.sql.ts`, `vec.sql.ts`, `vec-store.ts`, `embedder.ts`, `reconcile.ts`） | 双路检索：`BM25 * 0.6 + Vector * 0.4`，双路命中 boost 1.3x，支持自动代谢 | ❌ 无 |
| **Shadow Worktree** | `packages/opencode/src/worktree/index.ts`, `gc.ts` | 完整的 git worktree 隔离系统，含 `create/remove/reset/head/isPristine/GC` | ❌ 无 |
| **ToolInterceptor** AST 级命令过滤 | `packages/opencode/src/tool/bash.ts:409-438` | 拦截 curl/wget/ssh，危险 rm 检测（`/` / `/*` / `*`），发布 `tool_interceptor_block` 事件 | ❌ 无 |
| **VFSOverlay** 内存沙箱 | `packages/opencode/src/workflow/vfs-sandbox.ts` | Copy-on-Write 内存覆盖层，`>=500MB` 项目自动启用，含 `read/write/delete/exists/readdir/stat` | ❌ 无 |
| **DPO 数据集导出** | `script/dogfooding/export_dpo.ts` | 读取 success/failed traces，内置 Judge 验证门（防删断言/代码缩水/差异过小），输出标准 JSONL | ❌ 无 |
| **进化飞轮自动化** | `script/dogfooding/beta_evolution_loop.ts` | `ProgressObserver` 进程守护（空闲/死循环/硬超时）→ 批量执行 → Ground Truth 验证 → 分类存储（success/failed/脏数据） | ❌ 无 |
| **飞书 Gateway** | `packages/feishu-gateway/src/index.ts` | Hono HTTP 服务器 + `FeishuWSClient` WebSocket 长连接，`MessageRouter` + `SessionManager` 多轮对话，独立运行（端口 3096） | ❌ 无 |
| **Judge Agent** | `packages/opencode/src/agent/judge-agent.ts` | 纯函数式裁判：断言删除检测、测试结构变更检测、LLM 深度审查，注册为 `read-only subagent` | ❌ 无（仅 subagent） |
| **Actor 系统** | `packages/opencode/src/actor/` | 完整的 Actor 生命周期：spawn/wait/turn/return，支持并发和消息收发 | ✅ 内部使用 |
| **HTTP API + SSE** | `packages/opencode/src/server/` | Hono 路由，Session/File/Event/Question API，SSE 流式响应 | ✅ 内部使用 |
| **MCP 基础** | `packages/opencode/src/mcp/` | MCP 协议实现，工具注册为 `Effect.Service` | ✅ 内部使用 |

### 3.2 ⚠️ 部分实现（前端有 UI，后端未实现）

| 功能 | 前端位置 | 后端状态 | 差距说明 |
|------|----------|----------|----------|
| **Mode Registry** 模式注册表 | `packages/app/src/context/mode-registry.tsx`（6 种模式：Ask/Build/Plan/Compose/Loop/Max） | ❌ 无后端实现 | 模式逻辑仍硬编码在 `session/prompt.ts`，新增模式需修改 2-3 处 |
| **Pre-flight** 启动前检查 | `packages/app/src/pages/session/preflight-panel.tsx`（TrustLevel、CheckItem、操作按钮） | ❌ 无后端检查逻辑 | 只有展示面板，无实际检查实现。文档 `docs/loop-preflight-design.md` 设计了 `session/preflight.ts` 但未编码 |
| **Cardinal** 阻塞等级 | `packages/app/src/pages/session/cardinal-intervention-panel.tsx`（block/pause/stop/warn 四级） | ❌ 无后端阻塞逻辑 | 只有展示面板和操作按钮，无实际拦截/降级实现。`sdks/vscode/media/helix-welcome.html` 中有大量 mock 数据 |
| **Judge 裁决 UI** | `packages/app/src/pages/session/judge-verdict-card.tsx` | ✅ 后端有 `judge-agent.ts`，但无 UI 触发集成 | 前端有展示卡片，但缺少与后端 Judge 的调用链路和结果展示 |

### 3.3 ❌ 未实现（仅文档设计，无代码）

| 功能 | 文档位置 | 状态说明 |
|------|----------|----------|
| **DecompositionGate** 编排钩子 | `docs/dynamic-agent-ecosystem-v1.md` | 双层判断（规则 + 模型），独立评估子智能体分解。前端 `judge-verdict-card.tsx` 中仅有 `decompositionQuality` 展示字段，无后端逻辑 |
| **DynamicAgent** 动态 Persona | `docs/dynamic-agent-ecosystem-v1.md` | 模型自主生成 Persona，内存注入，不持久化。无代码 |
| **AgentStats** 三层成功定义 | `docs/dynamic-agent-ecosystem-v1.md` | L0（物理成功）/ L1（功能成功）/ L2（价值成功）。无代码 |
| **AlignmentGuard UI 外化** | `docs/ide-ui-design.md` §5.13 | 状态栏脉冲 + 可展开卡片，检测文件漂移/兔子洞/分心操作。后端有检测逻辑，前端只有简单面板 |
| **TraceReporter UI 外化** | `docs/ide-ui-design.md` §5.8 | 执行树可视化、节点状态、耗时。后端有数据，前端无展示 |
| **Permission 权限诊断** | `docs/ide-ui-design.md` §5.7 | 辅助功能/屏幕录制/自动化/完全磁盘访问权限检查。有 `/api/v1/system/permissions` 接口（2026-06-02 实现），但前端无 UI |

### 3.4 总结：代码与文档的 Gap

```
基础设施层（可观测性、沙箱、记忆、Gateway、飞轮） → 后端已实现 ✅
                    ↓
编排层（Mode Registry、Pre-flight、Cardinal） → 后端缺失，前端有 UI ⚠️
                    ↓
智能层（DecompositionGate、DynamicAgent、AgentStats） → 完全未实现 ❌
                    ↓
UI 外化层（Trace、AlignmentGuard、Judge、Permission） → 后端有数据，前端无展示 ❌
```

**核心结论**：Helix 是一个**基础设施完备但编排层和 UI 外化层未完成**的 Agent 系统。它能执行、能观测、能进化，但用户还看不到这些能力，且不能自主分解任务。

---

## 四、优先级矩阵（基于真实状态修正）

### 4.1 🔴 P0 — 立即修复（阻塞使用）

| 编号 | 任务 | 详细描述 | 预计工期 | 关键产出 |
|------|------|----------|----------|----------|
| **P0-1** | **VS Code 扩展前端稳定性** | 当前 `helix-welcome.html`（6000+ 行内联 JS）存在变量重复声明、函数未定义、DOM 操作错误。已修复 `isOnlineMode`/`currentSessionId`/`connectionState` 重复声明和 `applyToolVisibility` 未定义问题，但页面结构复杂，后续 bug 风险高。建议：先止血（修复已知错误），然后迁移到 `packages/app`（SolidJS）构建 webview，获得类型检查和组件复用。 | 3-5 天 | 稳定的前端面板，零白屏/崩溃 |
| **P0-2** | **端到端自动化测试** | 用户明确要求"不要用 mock 验证"。为 VS Code 扩展编写 Playwright/VS Code Test API 自动化测试，覆盖：扩展激活 → 守护进程启动 → 前端渲染 → 发送消息 → 接收流式响应 → 断开重连 的完整链路。已有一个 `test-daemon-auto.js`（29/29 通过），但覆盖的是扩展后端进程管理，缺少前端测试。 | 2-3 天 | 自动化测试套件，CI 通过 |
| **P0-3** | **提交当前工作区变更** | 当前工作区有 `feishu-gateway`（`api-router.ts`、`message-router.ts`）和 `auto-dev`（`scheduler.ts`、`com.helix.auto-dev.plist`、`setup.sh`）的未提交修改，以及新增的 `start-services.sh`。这些修改已持续一段时间，建议先完成 commit，避免工作丢失。 | 0.5 天 | 干净的工作区，变更可追溯 |

### 4.2 🟡 P1 — 近期重点（1-2 周）

| 编号 | 任务 | 详细描述 | 预计工期 | 关键产出 |
|------|------|----------|----------|----------|
| **P1-1** | **可观测性 UI 外化** | TraceReporter、AlignmentGuard、HeuristicFilter 后端已就绪，但前端用户看不到。按 `docs/ide-ui-design.md` v3 实现：§5.8 执行轨迹树、§5.12 Judge 裁判卡片、§5.13 AlignmentGuard 偏移警告、§6.9 容错降级。目标是让用户"看到 Agent 在想什么"。**优先级高于模式注册表**——因为后端能力已存在，只需要前端对接。 | 3-5 天 | 可观测性面板，用户可追踪执行轨迹 |
| **P1-2** | **模式注册表后端实现** | 前端已有 `packages/app/src/context/mode-registry.tsx`（6 种模式），但后端逻辑仍硬编码在 `session/prompt.ts` 中。按 `docs/loop-engineering-extension-roadmap.md` §1.2 设计，实现 `packages/opencode/src/session/mode-registry.ts` + `ModeHandler` 接口，让新模式可插拔。 | 5-7 天 | 可插拔模式系统，新增模式零侵入 `prompt.ts` |
| **P1-3** | **Pre-flight + Cardinal 后端实现** | 前端已有展示面板（`preflight-panel.tsx`、`cardinal-intervention-panel.tsx`），但后端无检查/拦截逻辑。实现 `session/preflight.ts` 和 `session/cardinal.ts` 两个 Effect Service，与前端对接。 | 3-5 天 | 启动前检查 + 运行时阻塞降级 |
| **P1-4** | **飞书 Gateway + Auto-Dev 闭环** | 当前 `feishu-gateway` 和 `auto-dev` 有未提交修改，且 auto-dev 调度器是进化飞轮的关键基础设施。完成：飞书消息路由 → 自动任务触发 → 执行 → 报告回传 的完整闭环。同时实现 `start-services.sh` 一键启动所有服务。 | 3-5 天 | 完整的 IM 集成闭环，一键启动 |

### 4.3 🟢 P2 — 中期目标（2-4 周）

| 编号 | 任务 | 详细描述 | 预计工期 | 关键产出 |
|------|------|----------|----------|----------|
| **P2-1** | **动态智能体生态系统** | 按 `docs/dynamic-agent-ecosystem-v1.md` 实现：① DecompositionGate（编排钩子，独立评估 + 双层判断）；② DynamicAgent（动态 Persona，模型自主生成，内存注入，不持久化）；③ AgentStats（L0/L1/L2 三层成功定义）；④ Judge 协作审计（分解决策后验、结果质量评估、Orchestrator 校准）。这是"自我进化"的核心能力。 | 10-14 天 | 动态智能体系统，自动分解与审计 |
| **P2-2** | **进化飞轮自动化** | 当前 `setup_local_cron.sh` 需要手动配置 `launchd`。实现：Docker 化/守护进程化飞轮、自动 DPO 数据集导出（`export_dpo.ts`）、回归测试自动触发（`beta_evolution_loop.ts`）、失败率自动告警。目标：无人值守的 nightly 进化循环。 | 5-7 天 | 自动化进化管道，nightly 运行 |
| **P2-3** | **多 IDE 支持** | Desktop 应用已接入（2026-06-21 提交 `feat(desktop): Desktop 应用接入 Helix 定制 GUI`），可在此基础上抽象 IDE 适配层，支持 JetBrains 系列（远期）。 | 7-10 天 | IDE 适配层抽象，JetBrains 插件原型 |

### 4.4 🔵 P3 — 长期布局（4 周+）

| 编号 | 任务 | 详细描述 | 预计工期 | 关键产出 |
|------|------|----------|----------|----------|
| **P3-1** | **MCP Server 生态** | 扩展工具注册表，支持外部 MCP Server 动态接入。当前 `packages/opencode/src/mcp/` 已有基础实现，需完善协议兼容和动态发现。 | 7-10 天 | MCP 生态接入，工具动态扩展 |
| **P3-2** | **模型微调管道** | 将 DPO 数据集导出（`export_dpo.ts`）与模型微调（SFT/DPO）打通，实现真正的"自我进化"。需要评估本地模型训练成本与收益。 | 14-21 天 | 自动化模型微调管道 |
| **P3-3** | **分布式执行** | 多工作区并行、多 Agent 协作的分布式任务调度。当前 Actor 系统已支持并发，但缺少跨进程/跨机器的协调。 | 21-30 天 | 分布式任务调度器 |

---

## 五、本周执行计划（2026-06-21 至 2026-06-28）

| 日期 | 任务 | 产出 | 验收标准 |
|------|------|------|----------|
| **6.21 (今天)** | 提交当前工作区变更 | Git commit `chore: 提交飞书网关和 auto-dev 调度器更新` | `git status` 无未提交变更 |
| **6.23-6.24** | P0-1: 前端稳定性修复（内联 HTML） | 修复所有已知 JS 错误，确保 `Developer: Reload Window` 后 Helix 面板正常显示 | 手动测试 3 次 Reload 无错误 |
| **6.25-6.26** | P0-2: 编写端到端测试（VS Code Test API） | 测试文件：`sdks/vscode/test/extension.e2e.test.ts` | 测试覆盖：激活、启动、对话、断开 |
| **6.27-6.28** | P1-1: 可观测性 UI 外化（Trace/AlignmentGuard） | 在 VS Code 扩展面板中展示执行轨迹和偏离告警 | 用户能看到 Trace 树和 AlignmentAlert 卡片 |

---

## 六、关键决策点

### 决策 1：前端是否迁移出内联 HTML？

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **A: 继续维护内联 HTML** | 快速迭代，无需构建步骤 | 无类型检查，维护困难，bug 风险高 | ❌ 不推荐（短期止血可用） |
| **B: 用 `packages/app`（SolidJS）构建** | 类型安全，组件复用，与现有 Web UI 共享 | 需要构建管道，增加复杂度 | ✅ 推荐，P1 阶段执行 |
| **C: 用 Vanilla JS + TypeScript 构建** | 类型安全，构建简单 | 缺少组件框架，重复造轮子 | 中期备选 |

**决策**：先完成 P0 的稳定性修复（方案 A 的补救），然后启动方案 B 的迁移（P1 阶段）。

### 决策 2：先实现可观测性 UI 还是模式注册表？

| 方案 | 依据 | 建议 |
|------|------|------|
| **A: 先可观测性 UI** | 后端 Trace/AlignmentGuard/HeuristicFilter 已就绪，只需前端对接，工作量小，用户感知明显 | ✅ **推荐**。让用户先"看到"Agent 的能力 |
| **B: 先模式注册表** | 是后续所有功能扩展的基础，技术债务大 | 可并行，但优先级次于可观测性 UI |

**决策**：P1-1 优先做可观测性 UI 外化（后端已有数据），同时 P1-2 并行启动模式注册表设计。

### 决策 3：Auto-Dev 是否容器化？

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **A: 继续本地 cron/launchd** | 简单，macOS 原生 | 不可移植，多环境配置困难 | ❌ 不推荐 |
| **B: Docker Compose 统一部署** | 可移植，环境隔离，易于扩展 | 需要 Docker 依赖，macOS 有性能损耗 | ✅ 推荐，P2 阶段执行 |
| **C: 集成到 mimo serve 作为后台任务** | 单进程管理，无需额外服务 | 与核心引擎耦合，资源竞争 | 备选 |

**决策**：P1-4 阶段先完成 `start-services.sh` 一键启动（脚本级统一），P2-2 阶段再迁移到 Docker Compose。

### 决策 4：动态智能体生态系统的实施顺序

按 `docs/dynamic-agent-ecosystem-v1.md` 的建议：

1. **H1**（先完成 Harness）：同步屏障、三层成功定义、资源配额、决策审计 → 这是基础
2. **H5**（后台调度器）：独立调度器，支持并发和超时 → 释放主线程
3. **B1**（分解业务）：DecompositionGate + 动态 Persona → 核心功能
4. **B4**（结果质量评估）：AgentStats L2 + Judge → 质量闭环

**Judge 在 B3 后并行引入**，作为可信第三方审计。

---

## 七、风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| VS Code 扩展前端 bug 持续涌现 | 高 | 高（阻塞 P0） | 尽快启动迁移到 SolidJS 构建（P1-1 并行） |
| 可观测性 UI 与后端数据格式不匹配 | 中 | 中（延迟 P1-1） | 先确认 Trace/AlignmentGuard 的事件 schema，再设计 UI 组件 |
| 模式注册表重构范围扩大 | 中 | 中（延迟 P1-2） | 限定范围：先迁移 Ask/Build，Plan/Compose/Max 后续 |
| Auto-Dev 调度器与核心引擎冲突 | 中 | 中 | 保持进程隔离，通过 HTTP API 通信 |
| 动态智能体分解质量不稳定 | 高 | 低（P2 阶段） | 不过滤、允许犯错，靠数据驱动迭代（DPO） |

---

## 八、参考文档

| 文档 | 路径 | 用途 |
|------|------|------|
| IDE UI 设计稿 v3 | `docs/ide-ui-design.md` | P1-1 可观测性 UI 外化 |
| Loop 工程扩展路线图 | `docs/loop-engineering-extension-roadmap.md` | P1-2 模式注册表重构 |
| 动态智能体生态系统 v1 | `docs/dynamic-agent-ecosystem-v1.md` | P2-1 动态智能体 |
| VS Code 扩展执行方案 | `docs/ide-execution-plan.md` | P0-1/P0-2 扩展开发 |
| 代码审查报告 | `docs/code-review-vscode-connection.md` | P0-1 已知问题参考 |
| 项目架构指南 | `AGENTS.md` | 全局技术规范 |

---

## 九、总结

**核心原则：先让 P0 稳定，再推进 P1 外化，最后实现 P2 智能。**

**当前真实状态**：
- 后端基础设施（观测、沙箱、记忆、Gateway、飞轮）**已完备** ✅
- 前端可观测性 UI（Trace、AlignmentGuard、Judge）**完全缺失** ❌
- 编排层（Mode Registry、Pre-flight、Cardinal）**后端缺失** ❌
- 智能层（DecompositionGate、DynamicAgent）**完全未实现** ❌

当前用户卡在 P0 的稳定性上（VS Code 扩展启动失败、前端白屏），这是最高优先级。建议本周内完成：

1. 提交当前工作区变更
2. 修复前端所有已知 JS 错误
3. 编写端到端测试确保回归

然后启动 P1-1 可观测性 UI 外化——让后端已就绪的能力被用户看见，这是性价比最高的下一步。

> 备注：本优先级规划应根据实际执行中的 blocker 和发现的新问题动态调整，建议每周末回顾一次。
