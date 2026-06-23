# Helix 执行流程与独有能力分析

> 本文档描述一个用户指令在 Helix 中的完整流转路径，以及哪些环节是 Helix 独有的差异化能力。

---

## 一、执行流程全景

```
用户输入
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 1. 消息入队                                               │
│    用户文本 → MessageV2 存入 SQLite                        │
│    session.status → "busy"                                │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. runLoop 启动 (prompt.ts)                               │
│    - 加载历史消息 (msgs)                                   │
│    - 解析当前 mode (plan/build/ask/...)                    │
│    - 读取 EvolutionConfig (judgeEnabled, specDriven...)   │
│    - 构建系统提示 (system prompt + instructions + skills)  │
│    - OpenSpec: findSpec(userText) → 注入规范上下文         │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 3. LLM 调用                                               │
│    - streamText(model, messages, tools)                   │
│    - 流式输出 → 实时写入 assistant message parts            │
│    - LLM 决定：直接回复 or 调用工具                         │
└─────────────────────────────────────────────────────────┘
  │
  ├──────────────────── 直接回复 ────────────────────────┐
  │                                                       │
  ▼                                                       ▼
┌─────────────────────┐                    ┌──────────────────────┐
│ 4a. 无工具调用        │                    │ 4b. 有工具调用          │
│     finish → stop    │                    │     进入工具执行循环     │
│     → 跳到步骤 7      │                    └──────────────────────┘
└─────────────────────┘                              │
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │ 5. 工具执行 (processor.ts)     │
                                      │    - snapshot.track() 快照     │
                                      │    - 工具 dispatch + 执行      │
                                      │    - snapshot.patch() 比较     │
                                      │    - 写入 tool-result part     │
                                      │    - 如有文件变更 → patch part │
                                      │                              │
                                      │    工具类型：                  │
                                      │    ├ read/glob/grep → 只读    │
                                      │    ├ edit/write/multiedit → 写 │
                                      │    ├ bash → 执行命令          │
                                      │    ├ actor → 生成子代理       │
                                      │    └ task → 任务管理          │
                                      └──────────────────────────────┘
                                                     │
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │ 6. 每轮工具执行后检查          │
                                      │                              │
                                      │ 6a. Cardinal 运行时检查        │
                                      │     - 安全规则始终生效         │
                                      │     - eval/exec/密钥泄露 → block│
                                      │     - 过量改动/连续失败 → pause │
                                      │                              │
                                      │ 6b. Judge 代码质量检查         │
                                      │     (judgeEnabled && hasFileChanges)│
                                      │     - checkAssertionReduction │
                                      │     - checkStructuralChange   │
                                      │     - checkTrivialization     │
                                      │     - checkSecurity           │
                                      │     - checkRegressionRisk     │
                                      │     - checkConsistency        │
                                      │     - checkSpecCompliance     │
                                      │                              │
                                      │ 6c. OpenSpec 状态更新          │
                                      │     (hasFileChanges)           │
                                      │     - findSpec(userText)      │
                                      │     - findSpecByFiles(files)  │
                                      │     → updateSpec(success/fail) │
                                      └──────────────────────────────┘
                                                     │
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │ 7. 循环判断                    │
                                      │    - LLM 输出 stop → 退出循环 │
                                      │    - LLM 输出 continue → 回到 3│
                                      │    - 达到 max steps → 强制停止 │
                                      │    - Cardinal block → 强制停止 │
                                      └──────────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────┐
│ 8. 输出与持久化                                           │
│    - assistant message 写入 SQLite                       │
│    - 检查点写入 (checkpoint-writer)                      │
│    - session.status → "idle"                             │
│    - 响应流式输出到客户端 (SSE)                            │
└─────────────────────────────────────────────────────────┘
```

---

## 二、通用环节 vs Helix 独有环节

### 2.1 通用环节（所有 AI 编程助手都有）

| 环节 | Helix 实现 | 其他产品 | 差异 |
|------|-----------|---------|------|
| 消息入队 + 会话管理 | SQLite + MessageV2 | 各自实现 | 本质相同 |
| LLM 流式调用 | Vercel AI SDK streamText | 各家 API | 本质相同 |
| 工具执行循环 | edit/write/bash/glob/grep | 同类工具 | 本质相同 |
| 循环直到 LLM 停止 | max steps 兜底 | 同类逻辑 | 本质相同 |
| 结果输出 | SSE 流式 | 同类机制 | 本质相同 |

### 2.2 Helix 独有环节

#### ① Cardinal — 运行时动态阻塞

**其他产品**：无运行时安全拦截，LLM 想做什么就做什么。

**Helix**：4 级阻塞机制，安全规则始终生效（不受 mode 配置影响）。

| 级别 | 含义 | 触发条件 | 处理方式 |
|------|------|----------|----------|
| **block** | 严重风险 | eval/exec/密钥泄露 | 立即终止，飞书通知 |
| **pause** | 中等风险 | 改动文件数 > 预估×2 / 同一任务失败3次 | 暂停，等用户确认 |
| **stop** | 轻微风险 | AlignmentGuard 连续3次告警 | 停止，记录日志 |
| **warn** | 潜在风险 | 单任务 token 超预算20% | 警告，继续执行 |

**关键设计**：安全规则（block 级别）始终生效，其他规则按 `judgeEnabled` 配置。这意味着即使用户关闭了 Judge，eval/exec/密钥泄露仍然会被拦截。

#### ② Judge Agent — 7 层对抗审查

**其他产品**：无主动代码审查，靠用户自己检查代码变更质量。

**Helix**：每次代码变更后自动触发 7 项检查，由只读对抗节点执行。

| 检查项 | 检测内容 | 阻断级别 |
|--------|----------|----------|
| 断言保护 | 检测断言删除（>30% 减少） | 阻断 |
| 结构变更 | 检测测试用例删除 | 阻断 |
| 平庸化检测 | toBe → toBeTruthy 等降级 | 阻断 |
| 安全检查 | eval/exec/密钥泄露 | 阻断 |
| 回归风险 | DROP TABLE/COLUMN、导出 API 移除 | 阻断 |
| 一致性 | camelCase/snake_case 混用、import 风格 | 建议 |
| 规范合规 | 对照 spec.md 需求 | 建议 |

**触发条件**：`judgeEnabled && hasFileChanges`，其中 `hasFileChanges` 同时检测 patch parts 和工具调用（edit/write/multiedit/apply_patch）。

#### ③ OpenSpec — 规范驱动开发 + 自动回写

**其他产品**：无规范概念，任务做完就做完，没有需求-实现-验证的闭环。

**Helix**：基于 `openspec/specs/` 目录中的 spec.md 文件，实现需求驱动的开发闭环。

**任务执行前**：
- `findSpec(userText)` — 用户文本关键词匹配 spec 目录名
- `findSpecByFiles(changedFiles)` — 变更文件路径关键词匹配 spec 目录名
- 匹配成功 → 将 spec 内容注入系统提示

**任务执行后**：
- `updateSpec(specMatch, result)` — 自动回写执行状态
- 成功 → `**Status**: ✅ implemented (2026-06-23)`
- 失败 → `**Status**: ❌ failed (2026-06-23)` + 错误摘要

**双路匹配**：用户文本优先，文件路径兜底。确保即使用户描述模糊（如"把 P0-P1 收口"），只要修改了相关文件就能匹配到 spec。

#### ④ 模式感知的检查配置

**其他产品**：所有模式行为一致，无法按场景调整检查策略。

**Helix**：每个 mode 有独立的 `EvolutionConfig`，可配置不同的检查策略。

| 模式 | judgeEnabled | specDriven | traceExport | 用途 |
|------|-------------|------------|-------------|------|
| ask | ❌ | ❌ | ❌ | 纯对话，不触发任何检查 |
| build | ✅ | ✅ | ✅ | 标准开发，全量检查 |
| plan | ✅ | ✅ | ✅ | 规划模式，安全+相关性检查 |
| compose | ✅ | ✅ | ✅ | 组合模式，安全+完整性检查 |
| max | ✅ | ✅ | ✅ | 多候选模式，全量检查 |
| loop | ✅ | ✅ | ✅ | 循环模式，全量检查 |

**配置覆盖**：支持 mimocode.json 全局配置、运行时参数、环境变量三级覆盖。

#### ⑤ HybridFSM — 可挂起的任务状态机

**其他产品**：简单的 while 循环控制执行流程。

**Helix**：10 态状态机，支持挂起/恢复和逃生舱。

```
idle → planning → executing → checking → distilling → completed
                ↑            ↓
                └── healing ←┘ (失败重试，最多3次)
                
checking → reflecting → healing (Goal Revision 逃生舱)

任意状态 → suspended → 恢复到挂起前状态
任意状态 → failed (ABORT)
```

**关键设计**：
- `Request_Goal_Revision` 逃生舱：在 Check 阶段允许修改测试用例（最多2次）
- `maxHealAttempts=3`：防止无限修复循环
- Deferred 挂起机制：支持外部信号恢复

#### ⑥ AlignmentGuard — 实时行为监控

**其他产品**：无行为监控，LLM 可能陷入死循环或偏离目标而无人干预。

**Helix**：通过 Bus 事件系统实时监控 Agent 行为。

| 监控项 | 检测内容 | 响应 |
|--------|----------|------|
| 死循环检测 | 重复 npm install/bun install/git clone | 注入纠正消息 |
| 偏离检测 | curl/wget/open/say 等无关操作 | 注入纠正消息 |
| 连续失败追踪 | 连续 N 次工具执行失败 | 注入纠正消息 |
| 文件漂移检测 | 修改了目标外的文件（>5个） | 注入纠正消息 |
| 阈值告警 | 累积告警 ≥ 3 | Cardinal stop |

**自动纠正**：通过 `tryDeliverToInbox()` 直接将纠正消息注入 Actor 的 inbox，无需用户干预。

#### ⑦ Shadow Worktree — Git 隔离沙箱

**其他产品**：直接在工作区操作，出错无法回滚。

**Helix**：通过 git worktree 创建隔离的工作副本，执行失败可丢弃。

- 自动创建 worktree 副本
- 在副本中执行任务
- 成功 → 合并回主分支
- 失败 → 丢弃 worktree，主分支不受影响
- GC 自动清理过期 worktree

#### ⑧ 进化飞轮 — 从执行中学习

**其他产品**：用完即弃，不从执行历史中学习。

**Helix**：3 阶段数据飞轮，将执行轨迹转化为模型改进。

```
Phase 1: Trace 收集
  执行轨迹 → TraceReporter → success/failed 目录
  
Phase 2: DSPy 优化
  失败轨迹 → LLM 分析 → 提取规则 → 写入 AGENTS.md
  
Phase 3: DPO 导出
  成功/失败轨迹配对 → Judge 验证门 → JSONL 数据集 → 模型微调
```

**关键设计**：
- `HeuristicFilter`：过滤低质量轨迹
- `Judge 验证门`：防止"删断言骗通过"的脏数据进入训练集
- `ProgressObserver`：检测死循环、空闲超时、硬超时

---

## 三、独有能力总结

| 能力 | 解决的问题 | 其他产品的现状 |
|------|-----------|---------------|
| **Cardinal** | LLM 执行危险操作时无人拦截 | 无拦截，靠用户事后发现 |
| **Judge Agent** | 代码变更质量无法保障 | 无主动审查，靠用户 review |
| **OpenSpec** | 需求-实现-验证无闭环 | 无规范概念，做完就做完 |
| **模式配置** | 所有场景一套检查策略 | 无法按场景调整 |
| **HybridFSM** | 执行流程不可控、不可挂起 | 简单循环，无法中断恢复 |
| **AlignmentGuard** | LLM 死循环/偏离目标无人干预 | 无监控，靠用户发现 |
| **Shadow Worktree** | 执行失败污染工作区 | 直接操作，无法回滚 |
| **进化飞轮** | 不从执行历史中学习 | 用完即弃 |

**一句话总结**：通用环节负责"能用"，独有环节负责"可靠、安全、可进化"。Helix 的核心差异化在于：执行有审查（Judge）、行为有监控（AlignmentGuard）、规范有驱动（OpenSpec）、经验可沉淀（进化飞轮）。
