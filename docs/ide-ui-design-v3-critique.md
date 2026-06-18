# 设计稿 v3 批判性改进方案

> 基于对 `ide-ui-design.md` v3 和 `loop-engineering-extension-roadmap.md` 的系统性审查，识别出 8 个结构性风险，提出修正方案。本方案聚焦**可执行性**，区分"必须修正"、"设计补充"、"长期规划"三个层级。

---

## 一、风险清单（收敛后的 8 个问题）

| # | 风险 | 严重度 | 影响 | 修正成本 |
|---|------|--------|------|---------|
| 1 | **高频打断流失**：Pre-flight 对 Loop 高频用户重复阻塞 | 高 | 用户关闭功能 | 低（配置项） |
| 2 | **调度矛盾**：Cardinal `pause` 永远挂起 vs 后台调度器"无人值守推进" | 高 | P0 目标互斥 | 中（阻塞等级） |
| 3 | **Handler 安全**：自定义 Handler 可执行任意代码，无隔离 | 高 | 安全漏洞 | 中（Sandbox） |
| 4 | **UI 过载**：面板太多，300px Webview 认知爆炸 | 中 | 用户放弃使用 | 低（注意力等级） |
| 5 | **P0 过载**：一次迭代塞 5 个大项，无 MVP 边界 | 中 | 迭代失败 | 低（拆分清单） |
| 6 | **缺少失败模式**：正常流程丰满，异常流程空白 | 中 | 线上故障 | 低（补充章节） |
| 7 | **缺少北极星指标**：无验收标准，无法判断上线后是否成功 | 中 | 功能不可度量 | 低（定义指标） |
| 8 | **代码割裂**：文档假设的底层组件尚未实现 | 低 | 实施受阻 | 低（依赖清单） |

---

## 二、修正方案

### 2.1 高频打断：Pre-flight 渐进式信任机制

**问题**：用户每天用 Build 模式 20 次，每次被问"目标优先级？"会关闭功能。

**方案**：
```
┌────────────────────────────────────────┐
│  Pre-flight 触发决策树                   │
├────────────────────────────────────────┤
│  1. 项目历史 → 是否同类型任务？           │
│     ├─ 是 → 复用上次回答，直接启动        │
│     └─ 否 → 进入 2                        │
│  2. 用户偏好 → 是否配置 auto-learn？      │
│     ├─ 是 → 自动填充，3 秒倒计时启动     │
│     └─ 否 → 进入 3                        │
│  3. 模糊度 score ≥ 0.6？                  │
│     ├─ 是 → 展示 Pre-flight 卡片（完整） │
│     └─ 否 → 直接启动                      │
└────────────────────────────────────────┘
```

**新增配置**：
```json
// mimocode.json
{
  "loop": {
    "intervention": {
      "preFlight": {
        "mode": "auto",           // auto / ask / skip
        "autoLearn": true,         // 学习用户偏好
        "cooldownMinutes": 10,     // 同类型任务冷却期
        "maxQuestionsPerDay": 5    // 每日最多打断次数
      }
    }
  }
}
```

**对文档的修改**：在 `ide-ui-design.md` §5.9 规格中补充"触发时机"子项，增加上述决策树和配置。

---

### 2.2 调度矛盾：Cardinal 阻塞等级

**问题**：Cardinal `pause` 30 秒不继续 vs 后台调度器"无人值守推进"目标互斥。

**方案**：定义三级阻塞，而非一级 `pause`：

| 等级 | 条件 | 行为 | 超时策略 | 示例 |
|------|------|------|---------|------|
| **Block** | 安全相关（rm, git push, write 生产配置） | 永远等待用户 | 无超时 | rm -rf, 写 secrets |
| **Pause** | 信息不足（安装依赖、目标模糊） | 等待用户，但可降级 | 30s → 保守方案 | 安装 pytest |
| **Warn** | 预算预警（token 80%） | 不阻塞，状态栏提示 | 立即降级 | token 预算 |

**新增降级策略**：
```ts
// cardinal.ts 规则定义
const DEGRADE_POLICY: Record<CardinalType, DegradeAction> = {
  external_dep: { after: 30_000, action: "skip_with_log" },      // 超时后跳过并记录
  ambiguity:    { after: 30_000, action: "continue_with_warning" }, // 超时后继续并警告
  test_failure: { after: null,  action: "wait_forever" },        // 安全相关，永不降级
  // ...
}
```

**对文档的修改**：在 `ide-ui-design.md` §5.10 卡片变体表格中增加"阻塞等级"列，在 §6.8.2 交互细节中补充降级策略。

---

### 2.3 Handler 安全：配置式 vs 代码式隔离

**问题**：自定义 Handler 可执行代码，等于开后门。

**方案**：双轨注册表：

```
┌────────────────────────────────────────┐
│  Mode Registry                          │
│  ├─ Built-in Handlers (系统内置)        │
│  │   Ask, Build, Plan, Compose, Max      │
│  │   运行在主线程，有完整权限            │
│  ├─ Config Handlers (用户配置)         │
│  │   仅允许 prompt + toolAllowlist     │
│  │   + cardinalRules + uiConfig        │
│  │   不执行代码，仅配置覆盖              │
│  └─ Plugin Handlers (第三方插件)       │
│      必须运行在 QuickJS Sandbox        │
│      声明权限清单，超范围调用拦截         │
└────────────────────────────────────────┘
```

**新增限制**：
```json
// mimocode.json
{
  "modeHandlers": {
    "audit": {
      "type": "config",              // config / plugin
      "prompt": "You are a security auditor...",
      "toolAllowlist": ["read", "grep"],
      "permissions": ["read", "grep"],  // Plugin 必须声明
      "sandbox": true                   // Plugin 强制沙箱
    }
  }
}
```

**对文档的修改**：在 `loop-engineering-extension-roadmap.md` §1.2 中补充 Handler 类型安全规则，§3.1 中补充安全分析。

---

### 2.4 UI 过载：注意力等级 + Zen Mode

**问题**：300px 面板塞了 12 个功能，认知爆炸。

**方案**：

```
┌────────────────────────────────────────┐
│  注意力等级模型                          │
├────────────────────────────────────────┤
│  L1 核心 (始终可见)                       │
│  ├─ 消息流 (Timeline)                    │
│  ├─ 输入框 (Composer)                    │
│  └─ 当前模式指示器 (Mode Badge)           │
│                                          │
│  L2 触发式 (事件驱动，用完即走)            │
│  ├─ Pre-flight 卡片 (启动前触发)         │
│  ├─ Cardinal 卡片 (卡点时触发)           │
│  └─ Deliverable Gate (终止前触发)        │
│                                          │
│  L3 工具式 (Side Panel 标签，默认折叠)     │
│  ├─ AGENTS.md 编辑器 (📋)                │
│  ├─ Plugin 管理器 (🔌)                   │
│  ├─ 记忆浏览器 (🧠)                      │
│  └─ 权限面板 (🔒)                        │
│                                          │
│  L4 静默式 (后台运行，异常才显式)          │
│  ├─ 成本预算 (状态栏数字)                 │
│  ├─ DPO 反馈 (消息底部，小按钮)           │
│  ├─ 记忆衰减 (无 UI，自动执行)            │
│  └─ Shadow Worktree (仅图标变色)          │
└────────────────────────────────────────┘
```

**新增 Zen Mode**：
```
┌────────────────────────────────────────┐
│  [Zen Mode 开启]  ────────────────────  │
│  消息流                                  │
│  ─────────────────────────────────────  │
│  输入框                                  │
│  [模式: Build] [Token: 12K]             │  ← 状态栏最小化
└────────────────────────────────────────┘
```
- 快捷键：`Ctrl+Shift+Z` 切换 Zen Mode
- 隐藏所有 L3 面板和 L4 静默项
- 仅保留 L1 核心 + L2 触发式（发生时自动展开）

**对文档的修改**：在 `ide-ui-design.md` 新增 §5.11 注意力等级与 Zen Mode，在 §5.1-5.10 的每个组件规格中标注其注意力等级。

---

### 2.5 P0 拆分：定义 MVP 边界和"不做"清单

**问题**：5 个大项全部 P0，但 4 周迭代塞不下。

**方案**：按"用户可见性"拆分，先上 UI，后补引擎：

| 迭代 | 目标 | 内容 | 用户可见性 | 不做清单 |
|------|------|------|-----------|---------|
| **Phase 2a (Week 3)** | Pre-flight MVP | Build 模式硬编码问题模板、轻量模型降级为规则匹配、仅 external_dep Cardinal | 高 | 不支持 Ask/Plan/Compose/Max 模式、不支持动态问题生成 |
| **Phase 2b (Week 4)** | Cardinal MVP | test_failure + external_dep 两种卡点、状态栏 HUD、无 Deliverable Gate | 高 | 不支持 ambiguity/token_budget/heal_exhausted |
| **Phase 3a (Week 5)** | 同步屏障 | 子智能体结果不丢失、编排钩子基础框架 | 低 | 不自动分解、不动态 Persona |
| **Phase 3b (Week 6)** | Mode Registry | 内置模式注册（Ask/Build/Plan/Compose/Max）、UI 配置外化 | 中 | 不支持用户自定义 Handler、不支持第三方插件 |
| **Phase 4 (Week 7-8)** | 动态分解 | 显式触发分解（用户手动）、AgentStats 记录 | 中 | 不自动评估是否分解、不动态 Persona |

**对文档的修改**：在 `loop-engineering-extension-roadmap.md` §3.2 中替换现有 P0/P1/P2，使用上述拆分后的表格。

---

### 2.6 失败模式：容错与降级章节

**问题**：正常流程丰满，异常流程空白。

**方案**：在 `ide-ui-design.md` 新增 §6.9 容错与降级：

| 场景 | 检测 | 降级行为 | UI 表现 | 日志 |
|------|------|---------|---------|------|
| Pre-flight 轻量模型超时 | 500ms 无响应 | 直接启动，标记为 "Pre-flight 不可用" | 状态栏黄色提示 | `warn: preflight timeout` |
| Pre-flight 分析失败 | 返回非 JSON | 跳过分析，直接启动 | 状态栏黄色提示 | `warn: preflight parse error` |
| Cardinal 误报 | 用户连续 [忽略] 3 次 | 自动降级该规则为 warn | 消息流插入 "已忽略，下次仅警告" | `warn: cardinal rule suppressed` |
| 多 Cardinal 并发 | 同一时刻 2+ 个 pause | 优先级队列：stop > pause > warn | 只展示最高优先级卡片 | `info: cardinal deduped` |
| Deliverable Gate 循环依赖 | 依赖图中存在环 | 展示环状文件列表，要求用户手动选择 | 交付物卡片增加红色警告 | `error: dependency cycle detected` |

**对文档的修改**：在 `ide-ui-design.md` 新增 §6.9 容错与降级，包含上述表格。

---

### 2.7 北极星指标：验收标准与退出条件

**问题**：无验收标准，无法判断功能是否成功。

**方案**：定义上线后 2 周的数据验收标准：

| 功能 | 北极星指标 | 目标值 | 低于阈值 | 退出动作 |
|------|-----------|--------|---------|---------|
| Pre-flight | 确认率 | ≥ 70% | < 50% | 降级为 warn-only |
| Pre-flight | 平均回答时间 | ≤ 8 秒 | > 15 秒 | 减少问题数量 |
| Cardinal | 误报率 | ≤ 10% | > 25% | 暂停该规则并 Review |
| Cardinal | 暂停后 30s 响应率 | ≥ 60% | < 40% | 增加自动降级策略 |
| Deliverable | 未确认修改导致的回滚率 | 下降 ≥ 30% | 上升 | 检查 Gate 触发时机 |

**对文档的修改**：在 `ide-ui-design.md` 新增 §10.2 上线验收标准。

---

### 2.8 依赖清单：文档与代码的对齐

**问题**：文档假设了未实现的底层组件。

**方案**：在 `ide-ui-design.md` 新增 §13 依赖清单：

| UI 功能 | 依赖的引擎 API | 状态 | 阻塞度 |
|--------|---------------|------|--------|
| Pre-flight 卡片 | `PreFlightRequired` BusEvent | 未设计 | 阻塞 |
| Pre-flight 卡片 | `mimo-lite` 模型（轻量分析） | 未实现 | 可降级为规则匹配 |
| Pre-flight 卡片 | `mimocode.json` `loop.intervention.preFlight` | 未设计 | 阻塞 |
| Cardinal 卡片 | `cardinal.ts` 规则引擎 | 未设计 | 阻塞 |
| Cardinal 卡片 | `CardinalDetected` BusEvent | 未设计 | 阻塞 |
| Cardinal 状态栏 | `CardinalWarn` BusEvent | 未设计 | 阻塞 |
| Deliverable Gate | `DeliverableGate` 检查逻辑 | 未设计 | 非阻塞（可先跳过） |
| FSM 可视化 | `FSMStateChange` BusEvent | 未设计 | 非阻塞 |

**对文档的修改**：在 `ide-ui-design.md` 新增 §13 依赖清单与实施阻塞分析。

---

## 三、实施优先级

### 必须修正（文档层面，本周完成）
1. §5.9 补充 Pre-flight 渐进式信任机制（§2.1）
2. §5.10 补充 Cardinal 阻塞等级（§2.2）
3. §6.9 新增容错与降级章节（§2.6）
4. §13 新增依赖清单（§2.8）
5. `loop-engineering-extension-roadmap.md` §3.2 替换 P0 拆分（§2.5）

### 设计补充（文档层面，下周完成）
6. §5.11 新增注意力等级与 Zen Mode（§2.4）
7. §10.2 新增上线验收标准（§2.7）
8. `loop-engineering-extension-roadmap.md` §1.2 补充 Handler 安全规则（§2.3）

### 长期规划（代码层面，Phase 3 后）
9. 实现 Zen Mode 前端组件
10. 实现 Pre-flight 渐进式信任后端逻辑
11. 实现 Cardinal 降级策略引擎
12. 实现 Plugin Handler QuickJS 沙箱

---

## 四、核心修正原则

1. **默认自动，可选人工**：Agent 默认自主执行，只在安全/成本相关决策时请求用户。Pre-flight 的默认值是 `auto` 而非 `ask`。
2. **渐进式信任**：新用户多确认，老用户少确认。系统通过学习用户习惯自动减少干预，不是等用户手动配置。
3. **沉默是金**：L4 能力（成本、记忆、轨迹）后台静默运行，只在异常时显式通知。Zen Mode 是默认而非高级功能。
4. **先做 UI 后补引擎**：用户能看到 Pre-flight 卡片和 Cardinal 卡片比底层引擎完美更重要。先上 MVP，后迭代。
