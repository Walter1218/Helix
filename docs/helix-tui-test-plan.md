# Helix TUI Phase 2-5 测试方案

> 测试哲学：输入输出黑盒。只通过 `mockInput` 模拟键盘输入，通过 `captureCharFrame()` 观察输出帧，**不动任何业务代码**。输出不符合预期时，根据 trace 埋点定位问题。

---

## 一、测试基础设施

### 1.1 已有工具

| 工具 | 说明 |
|------|------|
| `testRender` + `createCliRenderer` | TUI 渲染基础设施 |
| `createMockServer` | 场景化 Mock Server，支持 SSE 事件推送 |
| `captureCharFrame()` | 抓取终端输出帧（字符串形式） |
| `mockInput.typeText/pressEnter/pressKey` | 模拟键盘输入 |
| `assertFrameContains` | 帧断言工具 |
| `injectMockStorage` | localStorage mock |
| `waitForFrame` | 轮询等待帧匹配 |

### 1.2 新增测试工具（Phase 2-5 需要）

```ts
// test/utils/event-helpers.ts
export async function emitBusEvent(
  server: ReturnType<typeof createMockServer>,
  event: { type: string; properties: Record<string, any> },
  delay?: number,
) {
  server.emitSSE(event)
  if (delay) await new Promise((r) => setTimeout(r, delay))
  await result.renderOnce()
}

// test/utils/phase-assertions.ts
export function assertCardinalIndicator(
  frame: string,
  expected: { type: string; severity: "block" | "pause" | "warn" | "stop" },
) {
  // 验证 Cardinal 指示器出现在状态栏或消息流中
}

export function assertPreFlightCard(frame: string, expected: { questions: number; title: string }) {
  // 验证 Pre-flight 卡片出现在消息流中
}
```

---

## 二、Phase 2a — Pre-flight MVP 测试

### 2.1 测试场景

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 2a-1 | Pre-flight 卡片展示 | 用户发送消息 → Mock Server 发送 `preFlight.required` BusEvent | 帧中出现 "Pre-flight" 或 "启动前确认" 相关文本 | P0 |
| 2a-2 | 问题列表渲染 | Pre-flight 卡片包含 3 个快速选择问题 | 帧中同时出现 3 个问题文本 | P0 |
| 2a-3 | 快速选择交互 | 用户按数字键选择选项 | 选项被高亮/选中，帧中出现选中标记 | P0 |
| 2a-4 | 确认启动 | 用户选择选项后按 Enter | 帧中出现 "确认并启动" 或类似确认按钮，发送 reply 请求 | P0 |
| 2a-5 | 跳过启动 | 用户发送消息 → Pre-flight 出现 → 按 Escape/取消 | 卡片标记为 "已跳过"，Loop 正常启动 | P0 |
| 2a-6 | 模糊度低跳过 | 用户发送明确消息 → score < 0.6 | 不出现 Pre-flight 卡片，直接进入 Loop | P0 |
| 2a-7 | 配置模式切换 | `mimocode.json` 设置 `preFlight.mode = skip` | 任何消息都不触发 Pre-flight | P1 |
| 2a-8 | 多选问题 | Pre-flight 包含多选问题 | 帧中出现复选框样式，支持多选确认 | P1 |
| 2a-9 | 自由输入问题 | Pre-flight 包含自由输入问题 | 帧中出现输入框，支持文本输入 | P1 |
| 2a-10 | 连续失败降级 | 连续 3 次 Pre-flight 超时 | 自动降级为 skip 模式，帧中出现降级提示 | P2 |

### 2.2 Mock Server 场景扩展

```ts
export interface PreFlightScenario extends ScenarioBase {
  type: "preflight"
  score: number
  questions: Array<{
    id: string
    text: string
    type: "single" | "multi" | "text"
    options?: string[]
  }>
  mode?: "auto" | "ask" | "skip"
}
```

---

## 三、Phase 2b — Cardinal + Judge + AlignmentGuard 测试

### 3.1 Cardinal 测试

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 2b-1 | Cardinal Pause 卡片 | SSE 发送 `cardinal.detected` (type=external_dep, severity=pause) | 帧中出现黄色 Cardinal 卡片，包含 "暂停" 和倒计时 | P0 |
| 2b-2 | Cardinal Block 卡片 | SSE 发送 `cardinal.detected` (type=test_failure, severity=block) | 帧中出现红色 Cardinal 卡片，包含 "阻塞"，无倒计时 | P0 |
| 2b-3 | Cardinal Warn 状态栏 | SSE 发送 `cardinal.detected` (type=token_budget, severity=warn) | 帧状态栏出现黄色脉冲警告，不插入消息流卡片 | P0 |
| 2b-4 | Cardinal 用户允许 | Pause 卡片出现 → 用户按数字键选择 "允许" | 发送 reply 请求，卡片标记为 "已解决" | P0 |
| 2b-5 | Cardinal 自动降级 | Pause 卡片出现 → 30 秒无响应 | 帧中出现 "已自动跳过" 提示，Loop 继续 | P0 |
| 2b-6 | Cardinal 状态栏指示器 | 任意 Cardinal 激活时 | 状态栏出现彩色圆点 + 文字提示 | P0 |
| 2b-7 | 多 Cardinal 并发 | 同时发送 2 个 pause 事件 | 只展示最高优先级（Block > Pause）的卡片 | P1 |
| 2b-8 | Cardinal 误报降级 | 用户连续 3 次选择 "忽略" | 帧中出现 "该规则已降级为警告" 提示 | P1 |
| 2b-9 | Cardinal 详情展开 | 用户展开 Cardinal 卡片详情 | 帧中显示检测规则、上下文、建议操作 | P1 |
| 2b-10 | Stop 终止 | SSE 发送 `cardinal.detected` (severity=stop) | 帧中出现红色停止卡片，Loop 终止 | P1 |

### 3.2 Judge 测试

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 2b-11 | Judge 裁决卡片 | SSE 发送 `judge.verdict` (status=pass) | 帧中出现紫色 Judge 卡片，显示 "通过" | P0 |
| 2b-12 | Judge 驳回 | SSE 发送 `judge.verdict` (status=reject) | 帧中出现 Judge 卡片，显示 "驳回" + 原因 | P0 |
| 2b-13 | Judge 存疑 | SSE 发送 `judge.verdict` (status=question) | 帧中出现 Judge 卡片，显示 "存疑" + 检查项 | P0 |
| 2b-14 | Judge 非阻塞 | Judge 卡片出现时 | 用户仍可在输入框输入，不被阻塞 | P0 |
| 2b-15 | Judge 检查项列表 | Judge  verdict 包含多个检查项 | 帧中显示检查项列表，每项有 ✅/❌ 标记 | P1 |

### 3.3 AlignmentGuard 测试

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 2b-16 | 偏移警告状态栏 | SSE 发送 `alignment.drift` | 状态栏出现脉冲动画 + 偏移警告文字 | P0 |
| 2b-17 | 偏移警告卡片展开 | 用户点击状态栏偏移警告 | 帧中出现可展开的偏移警告卡片 | P0 |
| 2b-18 | 兔子洞检测 | SSE 发送 `alignment.rabbitHole` (rounds=15) | 帧中出现 "兔子洞警告" 卡片 | P0 |
| 2b-19 | 文件漂移检测 | SSE 发送 `alignment.fileDrift` | 帧中出现 "文件漂移" 提示 | P1 |
| 2b-20 | 分心操作检测 | SSE 发送 `alignment.distraction` | 帧中出现 "分心操作" 提示 | P1 |

### 3.4 Mock Server 场景扩展

```ts
export interface CardinalScenario extends ScenarioBase {
  type: "cardinal"
  cardinalType: "ambiguity" | "external_dep" | "test_failure" | "tool_error" | "token_budget" | "heal_exhausted"
  severity: "block" | "pause" | "warn" | "stop"
  message: string
  autoDegrade?: boolean
  degradeTimeout?: number
}

export interface JudgeScenario extends ScenarioBase {
  type: "judge"
  status: "pass" | "reject" | "question" | "rollback"
  checks: Array<{ name: string; passed: boolean; detail?: string }>
  summary: string
}

export interface AlignmentScenario extends ScenarioBase {
  type: "alignment"
  alertType: "drift" | "rabbitHole" | "fileDrift" | "distraction"
  severity: "warning" | "critical"
  message: string
  metrics?: Record<string, number>
}
```

---

## 四、Phase 3a — 同步屏障 + 编排钩子 测试

### 4.1 测试场景

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 3a-1 | 子智能体执行卡片 | SSE 发送 `subagent.spawn` (name=explore) | 帧中出现可折叠的 "explore 执行中..." 卡片 | P0 |
| 3a-2 | 子智能体进度更新 | SSE 发送 `subagent.progress` (12/20) | 卡片中进度条更新为 "12/20" | P0 |
| 3a-3 | 子智能体完成 | SSE 发送 `subagent.complete` | 卡片折叠为简要结果，状态变为 "已完成" | P0 |
| 3a-4 | 子智能体终止 | 用户按快捷键终止子智能体 | 发送 `subagent.abort` 请求，卡片状态变为 "已终止" | P0 |
| 3a-5 | 编排钩子展示 | SSE 发送 `orchestration.decompositionGate` | 帧中出现编排钩子评估卡片 | P1 |
| 3a-6 | 同步屏障等待 | 主智能体 final 前，子智能体未全部完成 | 状态栏显示 "等待子智能体..." 提示 | P1 |
| 3a-7 | 结果通道 ACK | 子智能体完成 → 发送结果 → 确认 ACK | 卡片中显示 "结果已接收" 标记 | P1 |
| 3a-8 | 多子智能体并行 | 同时展示 3 个子智能体卡片 | 帧中正确渲染 3 个并行卡片，不重叠 | P1 |

### 4.2 Mock Server 场景扩展

```ts
export interface SubagentScenario extends ScenarioBase {
  type: "subagent"
  name: string
  status: "spawned" | "progress" | "complete" | "error" | "aborted"
  progress?: { current: number; total: number }
  result?: string
}
```

---

## 五、Phase 3b — Mode Registry 测试

### 5.1 测试场景

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 3b-1 | 模式切换 UI 外化 | 用户按 Tab 切换模式 | 帧中模式标签高亮变化，消息流模式色条变化 | P0 |
| 3b-2 | 模式配置动态读取 | Mock Server 返回 `mode.config` 事件 | 模式标识从配置动态渲染（图标/颜色/名称） | P0 |
| 3b-3 | 新模式注册 | 后端推送新模式的 `mode.registry` 事件 | 帧中出现新模式标签，可切换 | P1 |
| 3b-4 | 模式特定 Pre-flight | 切换到 Plan 模式 → 发送消息 → Pre-flight | 帧中出现 Plan 模式特有问题 | P1 |
| 3b-5 | 模式特定 Cardinal | Build 模式发送消息 → 工具错误 Cardinal | 帧中出现 Build 模式特定的 Cardinal 规则提示 | P1 |
| 3b-6 | 模式 UI 配置错误 | 后端推送错误的 ModeUIConfig | 帧中回退到默认渲染，不崩溃 | P2 |
| 3b-7 | 模式切换快捷键 | 按 Ctrl+Shift+A/B/P/O/L/M | 帧中对应模式高亮切换 | P2 |

### 5.2 Mock Server 场景扩展

```ts
export interface ModeConfigScenario extends ScenarioBase {
  type: "modeConfig"
  modes: Array<{
    id: string
    name: string
    icon: string
    color: string
    uiConfig: {
      statusMessage: string
      placeholder: string
    }
  }>
}
```

---

## 六、Phase 4 — 动态分解 + 动态 Persona 测试

### 6.1 测试场景

| # | 测试名称 | 输入 | 预期输出 | 优先级 |
|---|---------|------|----------|--------|
| 4-1 | 动态分解触发 | SSE 发送 `decomposition.required` | 帧中出现 "任务分解" 卡片，展示子任务列表 | P0 |
| 4-2 | 动态 Persona 展示 | SSE 发送 `persona.generated` | 帧中出现临时 Persona 信息卡片 | P0 |
| 4-3 | AgentStats 面板 | SSE 发送 `agent.stats` | 帧中出现统计卡片（成功率/耗时等） | P0 |
| 4-4 | 分解结果汇总 | 子智能体全部完成 → 发送 `decomposition.complete` | 帧中出现汇总卡片，展示各子任务结果 | P0 |
| 4-5 | 分解失败处理 | 子智能体返回错误 → 发送 `decomposition.failed` | 帧中出现错误卡片，提供重试选项 | P1 |
| 4-6 | Persona 不持久化 | 刷新页面后 | 动态 Persona 信息消失，不写入 localStorage | P1 |
| 4-7 | 分解决策树 | SSE 发送 `decomposition.decision` (shouldDecompose=true) | 帧中展示分解决策原因和置信度 | P1 |
| 4-8 | 统计数据趋势 | 连续发送 3 次 `agent.stats` | 帧中展示趋势图或对比数据 | P2 |

### 6.2 Mock Server 场景扩展

```ts
export interface DecompositionScenario extends ScenarioBase {
  type: "decomposition"
  status: "required" | "complete" | "failed" | "decision"
  subtasks?: Array<{ id: string; name: string; status: string }>
  confidence?: number
}

export interface PersonaScenario extends ScenarioBase {
  type: "persona"
  name: string
  description: string
  temporary: true
  injected: boolean
}

export interface AgentStatsScenario extends ScenarioBase {
  type: "agentStats"
  successRate: number
  avgDuration: number
  totalTasks: number
  level: "L0" | "L1" | "L2"
}
```

---

## 七、测试执行流程

### 7.1 开发 → 测试 → 修复 闭环

```
1. 开发功能：实现业务代码（不动测试）
2. 编写测试：在对应 Phase 的测试文件中添加用例
3. 运行测试：cd packages/helix-tui && bun test test/phase-2a.test.tsx
4. 输出分析：如果失败，captureCharFrame() 输出实际帧内容
5. 定位问题：根据帧内容差异 + trace 埋点定位代码段
6. 修复问题：修改业务代码，不修改测试断言
7. 重新测试：直到全部通过
```

### 7.2 测试文件结构

```
test/
  blackbox.test.tsx          # Phase 1 已有测试（15 pass + 7 skip）
  e2e-phase1.test.tsx        # Phase 1 真实 LLM 测试（6 pass）
  phase-2a.test.tsx          # Phase 2a: Pre-flight MVP
  phase-2b.test.tsx          # Phase 2b: Cardinal + Judge + AlignmentGuard
  phase-3a.test.tsx          # Phase 3a: 同步屏障 + 编排钩子
  phase-3b.test.tsx          # Phase 3b: Mode Registry
  phase-4.test.tsx           # Phase 4: 动态分解 + 动态 Persona
  utils/
    mock-server.ts           # 场景化 Mock Server（已有）
    event-helpers.ts         # 新增：事件发送辅助
    phase-assertions.ts      # 新增：Phase 专用断言
    frame-assert.ts          # 已有
```

### 7.3 测试运行命令

```bash
# 运行单个 Phase 测试
cd packages/helix-tui && bun test test/phase-2a.test.tsx

# 运行全部黑盒测试
cd packages/helix-tui && bun test test/blackbox.test.tsx test/phase-2a.test.tsx test/phase-2b.test.tsx

# 带覆盖率
cd packages/helix-tui && bun test --coverage
```

---

## 八、Trace 埋点规范

每个 Phase 功能必须在 `trace.ts` 中添加对应埋点，用于测试失败时定位问题。

### 8.1 Phase 2a 埋点

```ts
trace.emit("preflight.check", "info", "Pre-flight check triggered", { score, mode })
trace.emit("preflight.card", "info", "Pre-flight card rendered", { questionCount })
trace.emit("preflight.answer", "info", "User answered preflight question", { questionId, answer })
trace.emit("preflight.skip", "warn", "Pre-flight skipped", { reason })
```

### 8.2 Phase 2b 埋点

```ts
trace.emit("cardinal.detected", "warn", "Cardinal detected", { type, severity })
trace.emit("cardinal.card", "info", "Cardinal card rendered", { type })
trace.emit("cardinal.action", "info", "User cardinal action", { action, type })
trace.emit("cardinal.degrade", "warn", "Cardinal auto degraded", { type, action })
trace.emit("judge.verdict", "info", "Judge verdict received", { status, checkCount })
trace.emit("judge.card", "info", "Judge card rendered", { status })
trace.emit("alignment.drift", "warn", "Alignment drift detected", { alertType })
```

### 8.3 Phase 3a 埋点

```ts
trace.emit("subagent.spawn", "info", "Subagent spawned", { name, parentSession })
trace.emit("subagent.progress", "info", "Subagent progress", { name, current, total })
trace.emit("subagent.complete", "info", "Subagent completed", { name, result })
trace.emit("barrier.wait", "warn", "Synchronization barrier waiting", { pendingSubagents })
trace.emit("barrier.release", "info", "Synchronization barrier released")
```

### 8.4 Phase 3b 埋点

```ts
trace.emit("mode.registry.load", "info", "Mode registry loaded", { modeCount })
trace.emit("mode.switch", "info", "Mode switched", { from, to })
trace.emit("mode.config.apply", "info", "Mode UI config applied", { modeId })
```

### 8.5 Phase 4 埋点

```ts
trace.emit("decomposition.decision", "info", "Decomposition decision", { shouldDecompose, confidence })
trace.emit("decomposition.spawn", "info", "Subtasks spawned", { taskCount })
trace.emit("persona.generate", "info", "Dynamic persona generated", { name, model })
trace.emit("agent.stats.update", "info", "Agent stats updated", { level, metrics })
```

---

## 九、测试通过标准

### 9.1 单个 Phase 标准

| 标准 | 要求 |
|------|------|
| 功能测试 | 所有 P0 测试用例通过 |
| 边界测试 | 所有 P1 测试用例通过 |
| 降级测试 | P2 测试用例通过或标记为 skip（有合理理由） |
| 不崩溃 | 任意输入组合下 TUI 不崩溃 |
| 帧一致性 | 相同输入在相同场景下产生相同输出帧（确定性） |

### 9.2 全量回归标准

每完成一个 Phase，运行全部已有测试，确保无回归：

```bash
cd packages/helix-tui && bun test
```

必须满足：
- Phase 1 测试：15 pass + 7 skip（保持）
- 新增 Phase 测试：全部 P0 通过
- 无新增 fail

---

## 十、实施计划

| Phase | 测试编写 | 开发实现 | 测试运行 | 回归验证 |
|-------|---------|---------|---------|---------|
| 2a | 1 天 | 3 天 | 1 天 | 1 天 |
| 2b | 1 天 | 4 天 | 1 天 | 1 天 |
| 3a | 1 天 | 3 天 | 1 天 | 1 天 |
| 3b | 1 天 | 3 天 | 1 天 | 1 天 |
| 4 | 1 天 | 4 天 | 1 天 | 1 天 |

**总计**：约 5 周（含缓冲）

---

*本文档作为 Helix TUI Phase 2-5 的测试开发总纲，所有功能开发必须遵循"先写测试用例 → 实现功能 → 运行测试通过 → 提交"的 TDD 流程。*
