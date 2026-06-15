# 🧠 Helix 智能体核心架构设计白皮书 (Agent Core Architecture)

本文档从现代 AI Agent（智能体）的四大核心维度——**记忆 (Memory)**、**规划 (Planning)**、**动作 (Action)** 与 **自我进化 (Evolution)** 出发，深度解构 Helix 的底层工程实现。

同时，我们明确界定了哪些能力是继承自前身 **MiMoCode 原生底座**，哪些是 **Helix 独创** 为了解决“全自动化与长周期任务”而量身定制的硬核基建。

---

## 1. 记忆中枢 (Memory System) & 上下文组装

大模型的上下文窗口（Context Window）是稀缺资源。Helix 通过分层记忆机制，解决了大模型在复杂代码库中“盲人摸象”和“记忆污染”的问题。

### 1.1 短期工作记忆 (Short-Term Memory)
- **MiMo 原生基础**：基于会话的历史 Message 队列，以及简单的当前文件读取缓存。
- **Helix 独创增强 - AST 动态依赖图谱**：
  - **设计初衷**：传统的全文搜索无法理解代码的“爆炸半径”。修改一个接口可能导致全项目几百处报错。
  - **核心机制**：在每次调度 LLM 前，触发 `ProjectProbe` 与 AST 解析。提取目标文件的上游依赖和下游调用方。
  - **Map-Reduce 压缩**：为防止 Context 溢出，仅将依赖文件的“类型签名 (Type Signatures)”注入 Prompt，折叠具体实现细节。

### 1.2 长期持久化记忆 (Long-Term Memory)
- **MiMo 原生基础 (Episodic & Semantic)**：将会话经验提炼为 Markdown，通过 SQLite FTS5 进行全文检索注入。
- **Helix 独创增强 - 基于语义 Hash 的记忆代谢**：
  - **设计初衷**：长记忆库“只进不出”，随着代码库迭代，过期的规则（如旧 API 的用法）会变成毒药记忆，误导模型。
  - **核心机制**：写入记忆时绑定文件的 AST Hash。在组装 Context 时，若 Hash 已变更，则对该规则“置信度降权”。连续未命中的僵尸规则将被彻底代谢（Memory GC）。

---

## 2. 规划与状态引擎 (Planning & State Engine)

这是 Helix 与普通交互式 AI 助手的**最核心区别**。

### 2.1 从纯 Prompt 到宿主状态机
- **MiMo 原生基础 - ReAct 循环**：依赖大模型自身的 `Reason -> Act` 思维链进行下一步决策。
- **Helix 独创增强 - 混合状态机 (Hybrid FSM)**：
  - **设计初衷**：纯 Prompt 驱动的智能体极易发生“注意力漂移”，在多次修复 Bug 后忘记最初的宏观目标，甚至陷入死循环。
  - **核心机制**：将 FSM（如 Plan -> Execute -> Test -> Check）固化在 TypeScript 宿主代码中，形成 Task DAG（有向无环图）。大模型被降维成“节点执行器”，流转大权由代码引擎控制。配合 `gate.ts` 中的 `MAX_TASK_GATE_MAIN_REACT` 熔断参数，触碰红线立刻掐断并强制回滚。

### 2.2 裁判机制与对抗网络
- **Helix 独创增强 - Judge Agent (裁判智能体)**：
  - **设计初衷**：大模型有"惰性避难"倾向。当代码一直报错修不好时，它可能会动歪心思去"篡改测试用例"来骗过测试（TDD 腐化）。
  - **核心机制**：执行智能体被硬隔离了"修改测试用例"的权限。若它认为测试有问题，必须挂起当前 FSM，申请 `Request_Goal_Revision`。此时系统唤起具备只读权限的 **Judge Agent**，根据原始的宏观目标评估该请求。若发现投机取巧，直接驳回并处分。

### 2.3 任务偏离观测与通讯 (Alignment Observer)
- **Helix 独创增强 - AlignmentGuard (任务偏离观测者)**：
  - **设计初衷**：在全自动执行中，主智能体可能在多轮 ReAct 循环后逐渐"跑偏"——开始修改与原始目标无关的文件、盲目安装不必要的依赖、或陷入无效的重试循环。用户需要一种**非侵入式的观测通道**，在被通知后决定是否干预。
  - **核心机制**：
    1. **实时轨迹监听**：通过订阅全局 Event Bus (`message.part.delta` + `observability.trace_node`)，实时感知智能体的每一次工具调用（写文件、编辑、bash）及其执行结果。
    2. **偏离检测**：
       - **文件漂移检测**：当 Agent 修改的文件路径与注册的宏观 `Goal` 关键词完全不匹配时，触发 warning。
       - **兔子洞检测**：当 Agent 连续执行 N 次包安装/克隆操作，或连续 M 个工具调用全部失败，触发 critical。
       - **分心操作检测**：当 Agent 突然执行与代码无关的操作（如 `curl`、`say`），立刻告警。
    3. **异步通讯协议 (`AlignmentAlert`)**：偏离事件通过 Event Bus 以 `observability.alignment_alert` 事件广播。外部程序（OpenCopilot、TUI、CI）可订阅该事件，以弹窗/消息/日志形式通知用户："Agent 似乎偏离了目标，需要您的关注。"
    4. **Inbox 自我纠偏**：AlignmentGuard 同时利用 Helix 现有的 `actor send` / inbox 机制，将纠正消息直接投递到主智能体的 inbox。主智能体在下一轮 ReAct 循环中即可看到 `<alignment-guard notification="true">...</alignment-guard>` 提示，实现"自我监测-自我纠偏"的元认知闭环——不需要人类干预也能自主调头。
  - **优势**：与 ProgressObserver 不同，AlignmentGuard 不直接 kill 进程，而是作为一个**旁路观测者**将判断权交还给用户（或通过 inbox 交还给主智能体自身），实现了"人机协作"与"自主纠偏"的最佳平衡。

---

## 3. 动作与执行组件 (Action & Function Calling)

智能体如何与真实世界（宿主操作系统）安全交互。

### 3.1 Function Calling 注册与路由
- **MiMo 原生基础**：在 `packages/opencode/src/tool/` 下以 `Effect.Service` 的形式注册了大量原子工具（如 `bash`, `read`, `write`, `edit`）。

### 3.2 绝对安全的防爆破沙箱
- **Helix 独创增强 - ToolInterceptor (指令防火墙)**：
  - **核心机制**：在执行 `bash` 命令前，接入 `web-tree-sitter` 进行 AST 级 Dry-Run 分析。拦截黑名单操作（如 `rm -rf /`, `curl`, `ssh` 等外发或高危指令）。
- **Helix 独创增强 - Shadow Worktree (影子工作树)**：
  - **设计初衷**：全自动模式下，大模型可能会把代码改得面目全非。
  - **核心机制**：基于 `git worktree` 开辟不可见的影子目录。所有的工具调用（写文件、跑测试）全在影子目录中发生。执行崩溃时由 `WorktreeGC` (守护进程) 抹除孤儿树；只有宏观验证完美通过，才向用户真实工作区输出干净的 Patch。
- **Helix 独创增强 - ProgressObserver (智能进程观测者)**：
  - **设计初衷**：`--daily-expand` 自动生成的对抗性用例质量可能参差不齐（如 prompt 与 stub 不一致），导致智能体在沙箱中陷入无限 ReAct 循环。简单的固定超时太粗暴——任务如果在正常执行中（如跑 npm install），倒计时一到就被误杀。
  - **核心机制**：类似于 Judge Agent 的观测者模式。`ProgressObserver` 通过实时捕获子进程的 stdout/stderr 输出流，动态判断进程健康状态：
    1. **空闲检测**：N 秒无任何新输出 → 判定为卡死，主动 kill。
    2. **死循环检测**：滑动窗口内最近 N 条输出完全相同 → 判定为陷入重复操作，主动 kill。
    3. **硬超时兜底**：按类别设绝对上限（30min ~ 5min），作为最终安全网。
  - **优势**：只要进程持续产出有意义的输出（如不同文件、不同报错行），观测者会不断重置空闲计时，绝不误杀。

---

## 4. 提示词组装流水线 (Prompt Design)

Helix 的 Prompt 不是静态字符串，而是一个动态编译的树状结构：

1. **System Prompt (系统层)**：
   - **基础人设 (Persona)**：高级全栈工程师，强制并行工具调用。
   - **探针约束 (Project Constraints)**：运行时扫描提取（如“当前是 Vue3 项目，包管理器为 pnpm”）。
   - **演进规则注入**：从 `AGENTS.md` 动态读取大模型之前通过数据飞轮自己总结出来的经验教训。
2. **User Prompt (任务层)**：
   - **宏观目标 (Macro Goal)**：用户下达的原始需求，全局置顶。
   - **微观上下文 (Micro Task)**：FSM 当前节点下发的具体指令与报错 Trace。

---

## 5. 终极能力：自我学习与演进 (Evolution & Learning)

Helix 的数据飞轮（Phase 1~3）是其最强大的护城河，让智能体实现了从"Prompt 依赖"到"模型内化"的升维。

- **Phase 1: 坚壁清野 (可观测与过滤)**
  - `TraceReporter` 收集全链路调用树。全量埋点覆盖 `processor.ts`（工具调用+FSM流转）、`bash.ts`（防火墙拦截）、`worktree`（影子树创建）、`memory-decay`（规则代谢）。
  - `ProgressObserver` 空闲检测 + 死循环检测 + 硬超时兜底，确保飞轮不被卡死。
  - `HeuristicFilter`（启发式网关）**物理剔除**因网络超时 (124)、OOM (137) 等非逻辑因素引起的失败 Trace，防止大模型产生因果倒置的"毒药记忆"。
- **Phase 2: 敏捷进化 (DSPy 离线优化器)**
  - 夜间定时触发 `optimize_prompt.ts`。读取 Phase 1 过滤后的高质量错题本，触发大模型进行 Meta-Cognition（元认知）反思。将提取出的通用工程策略追加到 `AGENTS.md`。
- **Phase 3: 微调降本 (DPO 偏好对齐)**
  - 当轨迹积累到万级时，运行 `export_dpo.ts`。将同源任务下，失败重试的轨迹标记为 `Rejected`，最终修复成功的轨迹标记为 `Chosen`，打包输出 JSONL。
  - 用于微调端侧专属小模型，将外挂规则内化为权重。微调后清理 `AGENTS.md`，完成知识代谢。

## 6. 记忆中枢增强：Vector RAG (混合检索)

### 6.1 双引擎检索架构

```
用户查询
    │
    ├── FTS5 BM25 关键词检索 → 精确匹配（函数名/ID/错误码）
    │       │                        │
    │       └── Top N ───────────────┤
    │                                ├── 合并分数(BM25×0.6 + Vector×0.4) → 重排序 → Top K
    └── embedding(查询) → vec0 KNN ──┘
```

### 6.2 实现细节
- **Embedding 模型**：LM Studio 本地 `nomic-embed-text-v1.5`（768 维，38ms/条，支持多语言）。
- **向量存储**：`sqlite-vec` 虚拟表 `vec0`，与 FTS5 通过 `memory_fts.rowid` 关联，不重复存储原文。
- **写入流程**：`reconcile` 索引时自动批量生成 embedding → `onNewIndex` 回调 → `vec0 INSERT`。
- **区分度**：高相似组平均 0.78，低相似组平均 0.44，差距 0.34，余弦阈值 0.45。
- **配置方式**：`mimocode.json` 中 `memory.vector.enabled` 控制开关，默认关闭，不影响现有 BM25 行为。

## 7. 多模型 Provider 体系

Helix 基于 Vercel AI SDK，支持任何 `/v1/chat/completions` 协议的模型服务。

### 7.1 三层回退链

```
model.provider?.npm → provider.npm → modelsDev[providerID]?.npm → "@ai-sdk/openai-compatible"
```

### 7.2 配置示例

```json
{
  "provider": {
    "deepseek": {
      "env": ["DEEPSEEK_API_KEY"],
      "options": { "baseURL": "https://api.deepseek.com/v1", "apiKey": "${DEEPSEEK_API_KEY}" },
      "models": { "deepseek-chat": { "limit": { "context": 65536, "output": 8192 } } }
    }
  }
}
```

**不需要重新编译**。启动时从 `mimocode.json` + `models.dev` 动态组装 Provider，运行时热切换。

## 8. 飞书 IM Gateway

Helix 提供独立的 `packages/feishu-gateway/` 包，通过飞书 WebSocket 长连接（outbound，无需公网 IP）接入：

```
飞书用户 → 飞书服务器 → WebSocket push → Gateway → Helix HTTP API → Shadow Worktree 自主执行
                                                                       │
                                ┌──────────────────────────────────────┘
                                ▼
飞书卡片 ← Bot API ← Gateway ← AlignmentAlert / AskUserQuestion / Result
```

支持 4 条消息流：下发任务 / 偏离告警 / 中途追问 / 结果推送。详见 [设计文档](docs/integration/feishu_gateway_design.md)。

## 9. Trace 全链路埋点体系

| 模块 | 埋点位置 | Trace 事件 |
|------|---------|-----------|
| processor.ts | tool-call 入口 | `type:"action" name:"{toolName}" status:"pending"` |
| processor.ts | tool-result | `type:"action" name:"tool_result" status:"success"` |
| processor.ts | tool-error | `type:"error" name:"{toolName}" status:"failed"` |
| processor.ts | FSM 流转 | `type:"decision" name:"fsm_transition"` |
| bash.ts | 防火墙拦截 | `type:"action" name:"tool_interceptor_block"` |
| worktree/index.ts | 影子树创建 | `type:"node_end" name:"shadow_worktree_create"` |
| memory-decay.ts | 规则代谢 | `trace_type:"memory_decay"` |

所有事件通过 `bus.publish(TraceNodeEvent, ...)` 发布到中央 Event Bus，`TraceReporter` 收集后由 `HeuristicFilter` 净化，输入数据飞轮。

---

## 总结：从 MiMoCode 到 Helix 的升维

| 核心维度 | MiMoCode 原生底座 | Helix 架构升维 | 解决的核心痛点 |
| :--- | :--- | :--- | :--- |
| **状态控制** | 纯 LLM Prompt 路由 | 宿主混合状态机 (Hybrid FSM) + 裁判智能体 | 解决注意力漂移、死循环与 TDD 测试腐化。 |
| **执行环境** | 直接在真实工作区执行 | 影子工作树 (Shadow Worktree) + 指令防火墙 | 解决恶意/越界操作污染宿主环境和 Git 历史。 |
| **上下文机制** | 基础 FTS5 全文搜索 | AST 图谱 + Map-Reduce 折叠 + 记忆代谢 | 解决“盲人摸象”导致的改崩，突破 Token 上限与记忆老化。 |
| **自我进化** | 手动 `/distill` 命令 | 全自动三阶数据飞轮 (网关过滤 -> 蒸馏 -> DPO) | 解决长期运行后的“过拟合”与“记忆污染”，实现模型微调降本。 |
