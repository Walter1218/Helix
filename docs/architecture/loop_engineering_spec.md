# Helix: Loop 工程与自主智能体基建规范 (Development Specification)

## 0. 实现状态 (Implementation Status)

| 组件 | 状态 | 文件 |
|------|------|------|
| **Auto-Loop Workflow** | ✅ 已实现 | `packages/opencode/src/workflow/builtin/auto-loop.js` |
| **Workflow Runtime** | ✅ 已实现 | `packages/opencode/src/workflow/runtime.ts` |
| **Workflow Sandbox** | ✅ 已实现 | `packages/opencode/src/workflow/sandbox.ts` |
| **HybridFSM** | ✅ 已实现 | `packages/opencode/src/session/fsm/hybrid-fsm.ts` |
| **JudgeAgent** | ✅ 已实现 | `packages/opencode/src/agent/judge-agent.ts` |

**Auto-Loop 工作流已可用：**
```bash
export MIMOCODE_EXPERIMENTAL_WORKFLOW_TOOL=1
mimo run "Use the workflow tool to run auto-loop with args: '任务描述'"
```

---

## 1. 愿景与定位 (Vision & Positioning)

Helix (前身代号 FirstOrder，基于 MiMo Code 架构) 旨在成为一个**全自动化的 Loop 工程智能体**。
传统的 AI 辅助编程依赖于人类开发者在每一步（设计、编码、报错、修复）下达微观指令；而 Helix 的目标是：**用户只需设定阶段性宏观目标（如“开发 OpenCopilot 的智能体模块”），引擎即可自主驱动“Plan -> Execute -> Test -> Distill”双螺旋上升闭环，直至任务达到可交付的成功标准。**

为了支撑这一愿景，系统不仅需要执行沙箱，还需要具备与人类资深工程师相匹配的“基础设施认知与记忆”能力。

---

## 2. 终极基建开发需求梳理 (Infrastructure Roadmap)

我们将基建分为五个核心层级：**基础组装与记忆层（底座）**、**环境与认知层**、**调度与执行层**、**高阶进化层**、**观测与干预层**。

### 2.1 基础组装与记忆层 (Foundational Context & Memory Base)
目标：构建智能体对项目的空间感与时间感，这是所有高阶决策的基石。

*   **[需求 0.1] 动态上下文组装注入 (Dynamic Context Assembly)**
    *   **描述**：突破大模型 Context Window 限制，将项目级信息结构化拼装。
    *   **高阶设计**：基于现有的 FTS5 / Vector DB，在每次 LLM 调度前，动态组装“相关代码片段 + 历史类似任务的踩坑记录 + 架构规范”，实现精准的 Prompt 注入，而非全量输入。
*   **[需求 0.2] 持久化会话与项目永久记忆 (Episodic & Semantic Memory)**
    *   **描述**：将会话短记忆与项目长记忆剥离并持久化。
    *   **高阶设计**：
        *   *Episodic Memory (情景记忆)*：记录当前宏观目标下的 FSM 状态扭转、工具调用序列与报错重试链路（用于短时回溯）。
        *   *Semantic Memory (语义记忆)*：通过 `Auto-Dream` 后台服务，将成功的会话经验提炼为项目的永久知识库（领域术语、架构模式）。

### 2.2 环境与认知层 (Environment & Cognition)
目标：让智能体瞬间“读懂”一个全新项目，并精准预判修改带来的“爆炸半径”。

*   **[需求 1.1] 自动项目探针与约束生成 (Project Probing)**
    *   **描述**：启动新项目时，自动运行探针扫描项目元数据（`package.json`, `tsconfig.json`, `docker-compose.yml`, 构建工具、Linter 配置等）。
    *   **开发任务**：开发 `Probe Workflow`，将扫描结果抽象为**强约束规则**（如“必须使用 pnpm”，“遵守 ESLint 规则”），并自动注入到每次 LLM 调用的 System Prompt 中。
*   **[需求 1.2] 动态 AST 与依赖拓扑图谱 (Dependency Graph & Blast Radius)**
    *   **描述**：维护实时的代码依赖树。
    *   **开发任务**：在智能体决定修改某个文件前，强制通过图谱查询该文件的上游依赖与下游调用方。将受影响的关键文件自动提取到上下文 (Context) 中，避免“盲人摸象”式的局部修改。
*   **[需求 1.3] 外部知识挂载与策略漂移 (External Knowledge Acquisition & Strategy Drift)**
    *   **描述**：突破大模型训练数据的知识截止日期。当遇到未知的新框架（如 Taro 4.0）或罕见报错时，智能体能够自主学习并改变原有策略。
    *   **高阶设计**：赋予 `Plan` 节点和 `Check` 节点调用 `web_search` 和 `read_url` 的能力。
        *   当制定 Plan 时，如果涉及未知技术栈，自动触发一个类似于 `deep-research` 的子流程，先“现学现卖”生成一份迷你技术文档注入到 Context 中，再进行任务拆解。
        *   当修复报错时，若本地库与经验库均无法解决，自动将错误日志抛向 Google/StackOverflow 寻找 Workaround，并将搜到的新解法沉淀进 Semantic Memory。

### 2.3 调度与执行层 (Orchestration & Execution)
目标：驱动自主循环，保障探索的安全性与目标的一致性。

*   **[需求 2.1] 宏观目标驱动的状态机 (Goal-Driven FSM Task Engine)**
    *   **描述**：将用户的阶段性目标转化为可执行的闭环流。
    *   **高阶设计**：引入内置的 `auto-loop.js` 工作流 (或等效的 FSM 代码流)。在 `session/processor.ts` 中拦截宏大指令，调用 LLM 规划出 JSON 格式的 FSM 队列 (Task Decomposer)，随后通过 Pipeline 逐个推进状态节点。
*   **[需求 2.2] 基于 Trace 的强制测试与自愈闭环 (Test-Driven Healing Loop)**
    *   **描述**：任务完成的标准不是代码写完，而是核心测试通过。
    *   **高阶设计**：在每个执行节点后强制挂载验证节点。拦截 `bun test` 或 Linter 报错，提取 OpenTelemetry 的 Trace 日志，注入给大模型进行 RCA（根因分析），在沙箱内触发带熔断机制的 `while` 修复循环。
*   **[需求 2.3] 细粒度状态快照与回滚树 (Snapshot & Rollback Tree)**
    *   **描述**：为失败的自愈提供退路，保证探索的安全性。
    *   **高阶设计**：在执行每个 FSM 状态流转前，创建轻量级工作区快照。当自愈尝试超过阈值触发熔断时，状态机可安全切回“干净”的上一个可用节点。

### 2.4 高阶进化层 (Advanced Evolution)
目标：实现真正的“自主进化”，将踩过的坑内化为系统的底层规约。

*   **[需求 3.1] 元认知与指令自迭代 (Meta-Cognition & Prompt Evolution)**
    *   **描述**：将解决复杂 Bug 的过程转化为未来行为的准则，实现 Prompt 的自我迭代更新与动态修正。
    *   **高阶设计与运行机制**：
        1. **反思与提取 (Reflection & Distillation)**：当智能体在 Loop 中经历了一个高成本修复的 Bug 或复杂的试错链路后，后端的 `Auto-Distill`（自动蒸馏）服务会对这段执行链路进行复盘分析。
        2. **规则沉淀 (Semantic Memory Precipitation)**：自动提取出通用的防御规则或项目级约束（如“操作该 AST 节点必须先判断 null”，或“当前项目需遵循特定的前端框架写法”），并将其固化写入项目全局约束配置文件（如 `.mimocode/AGENTS.md`）。
        3. **Prompt 动态注入 (Dynamic Context Assembly)**：在下一次下发任务或状态机流转时，基建底层的 Context Assembly 模块会自动读取更新后的约束，将它们作为强化指令（Prompt）动态拼装注入到大模型的 System Prompt 中。从而让大模型的指令体系随着项目开发推进而自主进化。
*   **[需求 3.2] 量化执行与测试报告生成 (Quantified Report Generator)**
    *   **描述**：输出可验证的工程结果。
    *   **高阶设计**：闭环结束时，汇总 Trace 数据（通过率、重试次数、性能指标），生成结构化的验收报告写入 `docs/reports/`。

### 2.5 观测与干预层 (Observability & Human-in-the-loop)
目标：过程透明，允许用户在关键节点进行微调与决策。

*   **[需求 4.1] 多模态全链路日志控制面板 (Control Plane)**
    *   **描述**：暴露智能体的内心 OS。
    *   **开发任务**：基于现有的 OpenTelemetry 链路，提供 UI 视角的“思考链路追踪”。实时显示 FSM 节点状态（如 `Plan -> SubTask 2 -> Healing (1/3)`）。
*   **[需求 4.2] 熔断上报与决策悬挂 (Decision Suspension)**
    *   **描述**：当遇到无法跨越的障碍（如缺少 API 密钥、设计存在重大歧义）时。
    *   **开发任务**：暂停 FSM，挂起当前 Context，主动向用户提供 2-3 个备选方案供选择，选择后无缝恢复执行流。

### 2.6 资源与并发调度层 (Resource & Concurrency Management)
目标：在复杂工程中，最大化利用计算资源并防止死锁。

*   **[需求 5.1] 并发任务依赖锁与隔离 (Dependency-Aware Concurrency)**
    *   **描述**：在执行多包 Monorepo 任务时，支持并行开发互不依赖的模块。
    *   **高阶设计**：基于 FSM 中的任务 DAG（有向无环图），智能体能够并行调度不相关的子任务（例如并行开发前端 UI 和后端 Schema），并在文件级或模块级加上读写锁，防止竞态条件。
*   **[需求 5.2] Token 预算控制与动态模型降级 (Budget Control & Model Degradation)**
    *   **描述**：长生命周期 Loop 极易耗尽 Token 预算或触碰 API 速率限制。
    *   **高阶设计**：监控当前会话的 Token 消耗速率。当简单的校验或日志分析任务到来时，自动降级调度到更小、更快的本地模型（如 Llama 3 8B）；当遇到核心算法设计时，才升维调用旗舰大模型，确保整体 Loop 的经济性与效率。

### 2.7 环境隔离与安全边界层 (Environment Isolation & Security Boundaries)
目标：防止自主智能体在执行不受信的命令或测试时对宿主机造成不可逆的破坏，并确保数据隔离。

*   **[需求 6.1] 执行沙箱与网络拦截 (Execution Sandbox & Network Egress)**
    *   **描述**：当智能体自主运行 `npm install`、跑测试甚至执行自己写的脚本时，不能直接裸跑在宿主机。
    *   **高阶设计**：引入容器级隔离（如基于 Docker 或 MicroVM），限制系统目录挂载；对出站网络请求进行拦截或白名单校验，防止凭证泄漏或下载恶意依赖。
*   **[需求 6.2] 数据环境逻辑隔离 (Data Environment Isolation)**
    *   **描述**：对应核心规则“生产环境和开发环境数据隔离务必遵守”。
    *   **高阶设计**：建立严格的 `Env Profile` 切换机制。在执行测试或模拟流量时，强制阻断对 `config/prod.yaml` 的访问，注入模拟的 Dev/Test 数据库和 API 凭证，并在每次任务后清理脏数据。

---

## 3. 架构分歧与批判性反思 (Architectural Divergences & Critical Reflections)

在将上述基建落地时，存在几个核心的工程路线分歧，需要在开发前达成共识：

### 分歧一：任务流引擎选择（纯 Prompt FSM vs. 代码态 Workflow）
*   **Prompt 流派**：把所有状态转换（Plan -> Do -> Check）都交给 LLM，通过庞大的 System Prompt 告诉它“如果你做完了 A，请自己做 B”。
    *   *缺点*：大模型存在“注意力漂移”，跑着跑着就会忘记处于哪个阶段，极易陷入死循环。
*   **代码态流派（Helix 方案）**：将 FSM 固化在宿主语言（TypeScript/JavaScript）中，如我们设想的 `auto-loop.js` 模式。大模型只负责在某个具体节点填空（如写代码、找 Bug）。
    *   *反思*：虽然我们选择了代码态，但**过度死板的 FSM 会扼杀智能体的创造力**。如果一个任务确实无法通过 `bun test`，死板的引擎会一直重试直到熔断。我们必须允许大模型在 Check 阶段有权限**修改测试用例本身**（如果它认定是测试写错了）。
*   **最终解决方案：带逃生舱的混合 FSM (Hybrid FSM with Escape Hatch)**
    *   主干流转由宿主代码严格控制（Plan 必须到 Do，Do 必须到 Check）。
    *   但在 Check（测试自愈）节点，赋予大模型一个特殊的工具调用权限 `Request_Goal_Revision`（请求修改目标/测试）。当模型判定“代码是对的，但测试用例断言过期了”时，它可以通过该工具挂起当前节点，进入 `Reflection`（反思）态，修改测试本身，然后重新恢复 Check 流程。

### 分歧二：快照回滚（文件系统快照 vs. Git Tree）
*   **微型快照流派**：在内存或临时目录保存每次修改前的文件拷贝。
    *   *缺点*：处理大型 Monorepo 时 I/O 开销极大，且无法保留语义化的变更历史。
*   **Git 驱动流派**：强依赖 Git。每次 FSM 节点流转，通过隐式的 `git commit` 保存状态，回滚就是 `git reset --hard`。
    *   *反思*：这要求智能体必须完美掌握 Git 的分支管理。而且根据用户规则：“在哪 git 分支开发就提交到哪个分支，合并 Master 分支得有我的指令”。如果我们在工作区疯狂产生内部用于回滚的脏 commit，会严重污染用户的 Git History。
*   **最终解决方案：影子工作树与 Git 内存树 (Shadow Worktree & Git In-Memory Object)**
    *   借助 `git worktree` 技术或基于 `packages/opencode/src/worktree`，为当前会话创建一个不可见的独立影子目录。
    *   智能体在这个影子树中进行无数次的脏 Commit 和 `git reset`（不污染主分支）。
    *   当宏观目标彻底达成并验证通过后，将最终的 `diff` 提取出来，在用户的工作区中执行一次性干净的 `Patch Apply` 或生成单个 `Squash Commit`。

### 分歧三：长记忆的存储介质（向量数据库 vs. 结构化 Markdown）
*   **纯 Vector DB**：把所有的经验、踩坑记录 Embedding 后存入向量库，每次用 Cosine Similarity 召回。
    *   *缺点*：“黑盒化”，人类无法审查智能体到底记住了什么，难以调试其“偏见”。
*   **Markdown + FTS 方案（MiMo 现有方案）**：将经验提炼为 `.md` 存入 `.mimocode/memory`，并通过全文检索 (FTS) 查询。
    *   *反思*：这非常棒（白盒且易于人工干预）。但对于“代码依赖关系”这种极度结构化的数据，Markdown 是低效的。我们需要在基建中混用图数据库（或基于 SQLite 的关系表）来存储依赖图谱，而将经验规则存在 Markdown 中。
*   **最终解决方案：分层异构存储 (Tiered Heterogeneous Storage)**
    *   **架构规范与行为经验**：存储为 `.mimocode/AGENTS.md` 和人类可读的 Markdown（继续沿用 FTS5），保障人类随时可审阅修改。
    *   **代码依赖与拓扑关系**：存储在本地 SQLite 的关系表中（如新增 `dependency_edges` 表）。当发生 AST 解析时，更新关系表。组装 Context 时，通过 SQL Join 快速查询爆炸半径，而非依赖低效的文本匹配。

---

## 4. 实施优先级 (Implementation Phases)

*   **Phase 1: 发动机点火 (Engine Ignition)**
    *   实现 **[需求 2.1] Auto-Loop 宏观状态机** 和 **[需求 2.2] 强制测试与错误自愈**。
    *   *产出*：一个可以接收指令、拆解任务、写代码并自我尝试修复的基础 Loop Workflow。
*   **Phase 2: 认知与防呆 (Cognition & Guardrails)**
    *   实现 **[需求 1.1] 自动项目探针** 与 **[需求 2.3] 快照回滚**。
    *   *产出*：智能体懂得遵守项目环境规约，且在改崩代码时能够安全撤退。
*   **Phase 3: 记忆与自进化 (Memory & Evolution)**
    *   深度整合 **[需求 3.1/3.2] 记忆沉淀与指令自迭代** 和 **[需求 1.2] AST 依赖图谱**。
    *   *产出*：智能体具备长期工作记忆，能够应对错综复杂的企业级代码库，真正实现“自主进化”。

---

## 5. 核心架构风险与长期收敛方案 (Architectural Risks & Long-term Solutions)

在对当前系统的落地过程进行批判性反思后，我们识别出智能体在自主执行中极易出现“边界失控”，并将其收敛为三大核心工程挑战。以下为确立的长期架构演进方案：

### 5.1 挑战一：执行环境的隔离与清理失控 (I/O & Sandbox)
*   **痛点**：当前依赖 `git worktree` 和宿主机的 `ChildProcessSpawner` 进行试错，一旦发生进程崩溃 (OOM/SIGKILL) 或大模型产生高危指令，极易导致影子树孤儿节点残留、Git 锁死以及宿主环境被破坏。
*   **长期收敛方案：绝对安全且可自愈的沙箱底座**
    *   **硬性垃圾回收 (Hard GC)**：除了依赖 `Effect.acquireRelease` 的软性清理外，在系统 Bootstrap 阶段引入守护进程级别的孤儿工作区（Orphan Worktree）扫描与抹除机制，确保每次启动环境绝对干净。
    *   **高危指令拦截 (Dry-Run Interceptor)**：对 Agent（如 `dream`, `distill` 等拥有 `bash` 权限的后台节点）强制引入 AST 级别的命令解析与白名单拦截，阻断 `rm -rf`、凭证外发 (`curl`/`wget`) 等高危逃逸行为，直至容器级 MicroVM 沙箱完全落地。

### 5.2 挑战二：测试驱动开发的腐化 (Testing & Healing)
*   **痛点**：混合 FSM 逃生舱虽然赋予了 LLM 修改测试用例的权限（`Request_Goal_Revision`）以防死锁，但由于大模型的“惰性避难”倾向，它可能通过删减断言来“骗过”测试，导致业务逻辑遭到隐性破坏。
*   **长期收敛方案：基于职责分离的对抗性验证机制 (Adversarial Verification)**
    *   **引入裁判智能体 (Judge Agent)**：将“编写代码”和“审查测试”的权限硬隔离。剥夺执行 Agent（如 `build`）直接覆写测试的权限。
    *   **对抗性工作流**：当 `build` 认为测试本身有问题并申请 Revision 时，必须将请求抛给具有独立只读权限的 `Judge Agent`。裁判根据原始的**宏观目标**评估该修改的合理性；若发现“投机取巧”则强行驳回，并给予处分惩罚（强制退回 Plan 阶段重新拆解）。

### 5.3 挑战三：记忆的熵增与上下文过载 (Memory & Context)
*   **痛点**：`dream` 和 `distill` 提取的经验持续写入 Semantic Memory（如 `.mimocode/AGENTS.md`），只进不出。过期的历史经验会变成误导模型的“毒药”；同时全量注入 AST 图谱易引发 Token 熔断和幻觉。
*   **长期收敛方案：动态衰减与压缩的知识引擎 (Dynamic Knowledge Engine)**
    *   **基于语义 Hash 的记忆代谢 (Memory GC)**：在写入记忆时，绑定所关联文件的 AST Hash 签名。在组装 Context 时，若探测到关联文件 Hash 已变更，不对记忆做粗暴删除，而是触发“置信度衰减 (Confidence Decay)”。衰减超过阈值的记忆将被归档，不再自动注入 Prompt。
    *   **Map-Reduce 级联压缩**：在提取爆炸半径代码时，不再原文透传。引入中间层过滤，仅注入相关的类型定义 (Type Signatures) 和接口契约 (Interface Contracts)，对实现细节（Implementation Details）进行折叠压缩。

---

## 6. 乐高积木式开发路线图 (Pluggable Kernel Roadmap)

为了实现上述终极解决方案，我们将系统抽象为一条**中央总线 (Global Event Bus + FSM)**，并将核心能力设计为**无状态的可插拔插件 (Effect Services)**。开发将自下而上分为 4 个层级 (L0-L3) 展开：

### L0 层（底板）：安全沙箱与环境自愈 (Safety & Sandbox)
*目标：构建绝对坚固的宿主防线。*
*   **模块 1: `WorktreeGC` (工作区清道夫)**
    *   在工作区创建时注入 PID 与 Runtime ID 追踪。
    *   编写守护进程，当探测到孤儿进程或 Fiber 熔断时，自动抹除临时 `git worktree` 和相关锁文件。
*   **模块 2: `ToolInterceptor` (工具防火墙)**
    *   在 `bash` 工具执行前引入 AST 级的 `Dry-Run` 分析器。
    *   基于黑白名单拦截高危系统指令和网络外发操作。

### L1 层（数据总线）：语义记忆与代谢引擎 (Cognition & Memory)
*目标：构建动态衰减、不过载的上下文引擎。*
*   **模块 3: `SemanticHash` (语义签名生成器)**
    *   提取代码的结构契约（函数签名、依赖关系），忽略格式与注释，生成稳定的语义 Hash。
*   **模块 4: `MemoryDecay` (记忆衰减器)**
    *   在组装 Prompt 时，对比历史经验关联的语义 Hash。不匹配的经验触发置信度降级，直至被 GC 回收。

### L2 层（控制中枢）：混合 FSM 与对抗网络 (Orchestration & Adversarial)
*目标：打破死循环，引入“裁判”机制。*
*   **模块 5: `HybridFSM` (可挂起的任务状态机)**
    *   重构现有 FSM，实现状态的序列化悬挂 (`Suspend`) 与恢复 (`Resume`)。
*   **模块 6: `JudgeAgent` (裁判智能体)**
    *   引入只读权限的对抗节点。接管测试用例修改权限，审批并驳回执行智能体的“偷懒/破坏性”修改请求。引入与 `build` 的多轮博弈后抛出 `Decision Suspension` 的熔断机制。

### L3 层（外观面）：多模态全链路观测 (Observability & UI)
*目标：将黑盒决策过程白盒化。*
*   **模块 7: `TraceReporter` (链路渲染协议)**
    *   基于 OpenTelemetry 与 Event Bus，将各层积木的拦截与流转日志（如“裁判驳回”、“记忆衰减”）实时同步至控制台 UI 进行树状渲染。