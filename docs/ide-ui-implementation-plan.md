# Helix IDE UI 实现规划

> 版本：v3（2026-06-18）
> 基于：`docs/ide-ui-design.md` v3 + `docs/loop-engineering-extension-roadmap.md` P0a-P0e
> 范围：前端 UI 层（Phase 0 → Phase 6）
> 更新：v2 新增第 10 章「交互设计审查与修复」；v3 更新 Phase 6 后端接入完成状态（SSE 流式、事件驱动、权限/提问交互、真实数据加载均已在离线原型完成）

---

## 目录

1. [总体策略](#1-总体策略)
2. [Phase 0：欢迎页面与极简模式](#2-phase-0-欢迎页面与极简模式)
3. [Phase 1：Mode Registry 前端层](#3-phase-1-mode-registry-前端层)
4. [Phase 2：Side Panel 扩展](#4-phase-2-side-panel-扩展)
5. [Phase 3：消息流增强](#5-phase-3-消息流增强)
6. [Phase 4：状态栏 + 干预面板](#6-phase-4-状态栏--干预面板)
7. [Phase 5：Mock Service Layer](#7-phase-5-mock-service-layer)
8. [Phase 6：接入 Agent 后端（后续迭代）](#8-phase-6-接入-agent-后端后续迭代)
9. [现有代码分析](#9-现有代码分析)
10. [交互设计审查与修复](#10-交互设计审查与修复2026-06-18)
11. [文件清单](#11-文件清单)

---

## 1. 总体策略

### 1.1 核心原则

- **UI 先行**：所有 UI 组件先完成视觉和交互，再接入后端
- **Mock 驱动**：每个 UI 组件配套 Mock Service，可独立演示
- **边做边 mock**：每做完一个 UI 组件，立即写它的 mock 逻辑，避免最后一次性兼容问题
- **Mode Registry 为底座**：Phase 1 必须先完成，后续所有 UI 组件从 Registry 读取模式配置
- **与路线图对齐**：按 P0a → P0b → P0c → P0d → P0e 顺序接入后端

### 1.2 执行顺序

| 阶段 | 周期 | 核心产出 | 对应路线图 |
|------|------|---------|----------|
| **Phase 0** | 0.5 天 | 欢迎页面 Logo 调亮、简洁模式、可折叠面板 | — |
| **Phase 1** | 3-4 天 | Mode Registry 前端、6 模式切换器 | P0d 前端层 |
| **Phase 2** | 4-5 天 | Task List Panel、Checkpoint Panel | P0b/c 前端层 |
| **Phase 3** | 3-4 天 | 消息流模式色条、Judge/AlignmentGuard 卡片 | P0b 前端层 |
| **Phase 4** | 3-4 天 | 状态栏 HUD、Pre-flight/Cardinal/Zen 面板 | P0a/b 前端层 |
| **Phase 5** | 3-4 天 | Mock Service Layer、完整 demo | — |
| **Phase 6** | 2-3 周 | 接入全部后端 API | P0a-P0e 后端层 |

### 1.3 技术栈

- **框架**：SolidJS（与现有 `packages/app` 一致）
- **UI 库**：`@mimo-ai/ui`（已提供的组件库）
- **状态管理**：SolidJS `createStore` + `createSignal` + `createMemo`
- **样式**：TailwindCSS（项目已有）
- **Mock**：TypeScript 接口 + 模拟数据生成器
- **数据流**：Props drilling + Context（与现有代码风格一致）

---

## 2. Phase 0：欢迎页面与极简模式（2026-06-18 已实现）

### 2.1 目标

在核心功能开发前，先完成两个基础 UX 改进：欢迎页面品牌感增强、极简模式（参考 CodeBuddy/Trae 的 IDE 极简 AI 对话体验）。

### 2.2 欢迎页面 Logo 调亮

**改造文件**：`packages/app/src/pages/home.tsx`

- 欢迎页面中央放置 Helix 双螺旋 Logo（`packages/ui/src/components/logo.tsx`）
- Logo 透明度从 `opacity-12`（几乎不可见）调到 `opacity-60`，确保品牌标识清晰可见
- 保持原有响应式布局：`md:w-xl` 在大屏幕下放大

### 2.3 简洁模式（Minimal Mode）

**参考**：CodeBuddy、Qoder、Trae 的 IDE 极简 AI 对话体验。

**改造文件**：
- `packages/app/src/context/layout.tsx`：persisted store 新增 `minimalMode: boolean`，返回对象新增 `minimalMode` API（`enabled`/`enable`/`disable`/`toggle`）
- `packages/app/src/pages/layout/sidebar-shell.tsx`：在 sidebar-rail 底部（Home 和 Settings 之间）添加简洁模式切换按钮（`expand`/`collapse` 图标）
- `packages/app/src/pages/layout.tsx`：传入 `minimalMode` 状态，切换时自动关闭 `sidebar` 和 `fileTree`
- `packages/app/src/pages/session/session-side-panel.tsx`：最外层 `<Show>` 添加 `&& !layout.minimalMode.enabled()` 条件，简洁模式下完全隐藏右侧 review/file/tasks 面板

**`sdks/vscode` 离线原型（`helix-welcome.html`）**：
- 在 `mode-bar` 右侧添加简洁模式切换按钮（⬛/⬜ 图标）
- 添加 CSS `.minimal-mode` 规则：
  - 隐藏 `.sidebar-right`（右侧 Side Panel）
  - 隐藏 `.status-bar`（底部状态栏）
  - 压缩顶部 `mode-bar` 为图标-only（隐藏 `.mode-label`）
- 简洁模式下隐藏 `welcome-screen` 里的 `mode-cards`（6 张模式卡片）

### 2.4 输入框下方 Mode 选择条

**目标**：参考大多数 AI IDE（如 CodeBuddy），在聊天输入框下方提供常驻的模式切换入口，替代欢迎页面的大卡片。

**`sdks/vscode` 离线原型**：
- 在 `input-area` 下方新增 `mode-selector` 容器，包含 6 个模式按钮（Ask/Build/Plan/Compose/Loop/Max）
- 每个按钮显示模式图标 + 模式名，与顶部 `mode-bar` 同步 `active` 状态
- 点击按钮调用 `switchMode()`，与顶部切换逻辑一致
- 简洁模式下压缩为图标-only（隐藏 `.mode-label`，缩小 padding）

### 2.5 极简模式可折叠任务/文件面板（输入框上方）

**目标**：当极简模式隐藏了右侧 Side Panel 后，任务列表和文件变更列表需要以紧凑形式出现在输入框上方，参考主流 AI IDE 的上下文提示栏设计。

**`sdks/vscode` 离线原型**：
- 在 `messages` 和 `input-area` 之间新增 `collapsible-panels` 容器，仅在极简模式下显示
- 两个可折叠 section：
  - `✅ Tasks`：显示任务数量 badge（如 `2/5`），展开后显示紧凑树形任务列表（状态图标 + 标题 + 进度百分比）
  - `📋 Changes`：显示文件变更数量 badge（如 `3`），展开后显示文件列表（类型图标 + 文件名 + 变更行数）
- 展开/折叠：点击 header 切换 `▶/▼`，通过 `expandedCollapsible` Set 管理状态
- 样式：最大高度 200px、可滚动、深色背景、紧凑字号（11px-12px）
- 实时同步：在 `renderTaskList()`、`renderCheckpoint()`、`toggleMinimalMode()` 中自动刷新

### 2.6 验收标准

- [x] 欢迎页面 Logo 清晰可见（opacity-60）
- [x] 简洁模式切换按钮在 sidebar-rail 可用
- [x] 简洁模式下：右侧 Side Panel、底部状态栏、欢迎页面 mode-cards 全部隐藏
- [x] 输入框下方 mode-selector 可切换 6 个模式，与顶部 mode-bar 同步
- [x] 极简模式下输入框上方出现可折叠 Tasks/Changes 面板，badge 实时更新
- [x] 所有改动不依赖后端，纯前端实现

---

## 3. Phase 1：Mode Registry 前端层

### 3.1 目标

把现有硬编码的 4 模式（Build/Plan/Compose/Max）改造成可扩展的 6 模式体系（新增 Ask + Loop），所有 UI 组件从 Registry 读取配置。

### 3.2 具体工作

#### 3.2.1 建立前端 `ModeRegistry`

**新建文件**：`packages/app/src/context/mode-registry.tsx`

```typescript
export interface ModeUIConfig {
  id: string
  name: string
  color: string
  icon: string
  placeholder: string
  shortcut: string
  description: string
  experimental?: boolean
}

const BUILTIN_MODES: ModeUIConfig[] = [
  { id: "ask", name: "Ask", color: "#4a9eff", icon: "💬", placeholder: "💬 Ask: 描述你的问题，我来解答...", shortcut: "Ctrl+Shift+A", description: "基础问答与咨询，不修改代码" },
  { id: "build", name: "Build", color: "#fb8147", icon: "🛠️", placeholder: "🛠️ Build: 描述你的需求，我生成代码...", shortcut: "Ctrl+Shift+B", description: "代码生成与文件编辑" },
  { id: "plan", name: "Plan", color: "#c7e2a8", icon: "📋", placeholder: "📋 Plan: 描述你的目标，我分解任务...", shortcut: "Ctrl+Shift+P", description: "任务分解与计划制定" },
  { id: "compose", name: "Compose", color: "#a7a3d8", icon: "🎼", placeholder: "🎼 Compose: 描述你的重构需求...", shortcut: "Ctrl+Shift+O", description: "多文件重构与组合" },
  { id: "loop", name: "Loop", color: "#007acc", icon: "🔄", placeholder: "🔄 Loop: 描述你的任务，我将迭代执行并自动反馈...", shortcut: "Ctrl+Shift+L", description: "迭代执行与自动反馈循环" },
  { id: "max", name: "Max", color: "#e85d75", icon: "⚡", placeholder: "⚡ Max: 描述你的任务，多路径推理选择最佳方案...", shortcut: "Ctrl+Shift+M", description: "最大能力模式，并行多 Agent 推理", experimental: true },
]
```

#### 3.2.2 改造模式切换器

**新建文件**：`packages/app/src/components/mode-switcher.tsx`

- 从 `prompt-input.tsx` 中抽离模式切换逻辑（注意：现有 `mode` 是 "normal" | "shell"，属于输入模式，与 Agent 模式不同；Agent 模式选择通过 `@agent` 语法实现，需要新增独立的模式切换 UI）
- 5 个横向图标按钮：Ask(蓝)、Build(橙)、Plan(绿)、Compose(紫)、Loop(蓝)、Max(红)
- 按钮高度 `22px`，圆角 `4px`，内边距 `0 8px`，字号 `11px`
- 激活态：背景 `--helix-bg-tertiary` + 模式色边框 `border-left: 3px solid {color}`
- 切换动画：scale 1.05 → 1
- 快捷键：全局注册 `Ctrl+Shift+A/B/P/O/L/M`

#### 3.2.3 输入框模式感知

**改造文件**：`packages/app/src/components/prompt-input.tsx`

- 占位符文案从 `ModeRegistry` 动态读取
- 输入框底部模式色条
- 提交时附加当前模式 ID

#### 3.2.4 新增 CSS 变量

```css
::root {
  --helix-mode-build: #fb8147;
  --helix-mode-plan: #c7e2a8;
  --helix-mode-compose: #a7a3d8;
  --helix-mode-loop: #007acc;
  --helix-mode-max: #e85d75;
}
```

### 3.3 验收标准

- [x] ~~切换 6 个模式，UI 颜色、图标、文案实时变化~~（离线原型已实现：Ask/Build/Plan/Compose/Loop/Max）
- [x] ~~快捷键 `Ctrl+Shift+A/B/P/O/L/M` 可切换模式~~（离线原型已实现）
- [x] ~~输入框占位符随模式变化~~（离线原型已实现）
- [x] ~~不依赖后端，纯前端实现~~（离线原型已实现）
- [ ] 新增模式只需在 `BUILTIN_MODES` 数组中添加一项（待 SolidJS 实现时）

---

## 4. Phase 2：Side Panel 扩展

### 4.1 目标

落地 §4.7 任务列表面板 + §4.8 文件检查点/变更审查面板。

### 4.2 具体工作

#### 4.2.1 Side Panel 标签栏重构

**改造文件**：`packages/app/src/pages/session/session-side-panel.tsx`

新增标签：
- [✅] 任务列表（TaskListPanel）
- [📋] 变更审查（CheckpointPanel）

#### 4.2.2 新建 Task List Panel

**新建文件**：`packages/app/src/pages/session/task-list-panel.tsx`

```
树形层级：Task Group → Task → Sub-task
状态图标：✅ 完成、🔄 进行中、⏳ 未开始、❌ 失败、⏸ 暂停
底部：进度统计条（0-30% 红、30-70% 黄、70-100% 绿）
```

#### 4.2.3 新建 Checkpoint Panel

**新建文件**：`packages/app/src/pages/session/checkpoint-panel.tsx`

三标签：Changes / Staged / History
- Changes：文件列表（复选框 + 类型 ●/+/− + 行数）+ Diff 预览（复用 `SessionReview`）+ [Keep][Revert][Stage]
- Staged：已 Stage 文件 + [Unstage][Commit][Reset]
- History：检查点列表 + [恢复][对比][删除]

### 4.3 验收标准

- [x] ~~Side Panel 4+ 个标签可切换~~（离线原型已实现：Tasks/Changes 两个标签 + 可折叠面板）
- [x] ~~Task List：树形结构、状态图标、进度统计~~（离线原型已实现：含任务组、进度条、右键菜单）
- [x] ~~Checkpoint：三标签、文件列表、Diff 预览、检查点操作~~（离线原型已实现：Changes/Staged/History + 确认对话框）
- [ ] Diff 复用现有 `review-tab.tsx`（待 SolidJS 实现时复用）

---

## 5. Phase 3：消息流增强

### 5.1 目标

消息流展示结构化信息（模式色条、任务标记、Judge 卡片、AlignmentGuard 警告）。

### 5.2 具体工作

#### 5.2.1 消息气泡模式色条

**改造文件**：`packages/app/src/pages/session/message-timeline.tsx`

- 左上角：`[模式图标] [模式名] · [Agent 名]`，字号 `11px`
- 左侧 `2px` 边框颜色跟随模式色

#### 5.2.2 任务标记解析

- 从消息文本中提取 `<!-- task: id="1" status="in_progress" ... -->`
- 同步到 Task List Panel

#### 5.2.3 新建 Judge 裁判卡片

**新建文件**：`packages/app/src/pages/session/judge-verdict-card.tsx`

- 紫色边框，展示：分解质量/结果质量/价值成功（通过/存疑/驳回）
- 非阻塞，可折叠/展开

#### 5.2.4 新建 AlignmentGuard 偏移警告

**新建文件**：`packages/app/src/pages/session/alignment-drift-alert.tsx`

- 黄色/橙色脉冲动画
- 展示：文件漂移/兔子洞/分心操作
- [Recalibrate] 按钮

### 5.3 验收标准

- [x] ~~消息流有色条和标识~~（离线原型已实现：AI/系统消息带模式色条和模式标签）
- [x] ~~任务标记解析并同步到 Task List~~（离线原型已实现：`parseTaskMarkers` 支持更新和创建新任务）
- [ ] Judge 卡片可渲染（待实现）
- [x] ~~AlignmentGuard 卡片可渲染~~（离线原型已实现：偏移警告脉冲动画 + Recalibrate/Dismiss）

---

## 6. Phase 4：状态栏 + 干预面板

### 6.1 目标

完成 §5 系统级 UI 外化。

### 6.2 具体工作

#### 6.2.1 状态栏 HUD 改造

**改造文件**：`packages/app/src/components/status-popover.tsx`

- 当前模式指示器（颜色点 + 模式名）
- Token 成本估算
- Cardinal 干预状态：Block(红) / Pause(橙) / Stop(黄) / Warn(蓝)
- 偏移警告指示灯

#### 6.2.2 新建 Pre-flight 检查面板

**新建文件**：`packages/app/src/pages/session/preflight-panel.tsx`

- 检查清单：环境检查、权限检查、上下文收集、信任评估
- 触发决策树展示
- Loop 模式启动前自动展开

#### 6.2.3 新建 Cardinal 四级阻塞面板

**新建文件**：`packages/app/src/pages/session/cardinal-intervention-panel.tsx`

- 四卡片垂直堆叠：Block(红) / Pause(橙) / Stop(黄) / Warn(蓝)
- 每个卡片：触发原因 + 建议操作 + 降级策略

#### 6.2.4 新建 Zen Mode

**新建文件**：`packages/app/src/pages/session/zen-mode-toggle.tsx`

- 四级滑动条：L1 Alert / L2 Normal / L3 Focused / L4 Zen Mode
- Zen Mode：侧边栏收缩为极简进度指示器

### 6.3 验收标准

- [ ] 状态栏显示所有系统级指示器
- [ ] Pre-flight/Cardinal/Zen 面板可手动触发并展示

---

## 7. Phase 5：Mock Service Layer

### 7.1 目标

所有 UI 组件不依赖真实后端，用 mock 数据走完整流程。

### 7.2 具体工作

#### 7.2.1 建立 Mock Service 层

**新建目录**：`packages/app/src/services/mock/`

```
mock-mode-service.ts      // 模式切换 mock
mock-task-service.ts       // 任务列表 mock
mock-checkpoint-service.ts // 检查点 mock
mock-intervention-service.ts // 干预 mock
mock-message-service.ts    // 消息流 mock
```

#### 7.2.2 模式切换 mock
- 模拟 `POST /api/v1/session/:id/mode`
- 返回模拟会话状态

#### 7.2.3 任务列表 mock
- `GET /api/v1/plan` → mock 任务树
- `GET /api/v1/loop/steps` → mock 迭代步骤
- 模拟 SSE 推送：⏳ → 🔄 → ✅

#### 7.2.4 文件检查点 mock
- 生成 3-5 个 mock 文件的 diff
- 模拟自动检查点（每 30 秒）
- 模拟 [Keep] / [Revert] 操作

#### 7.2.5 干预 mock
- 手动触发 Cardinal：模拟 test_failure → Block
- 模拟 Judge 超时 → fallback 卡片
- 模拟 AlignmentGuard 偏移 → 漂移警告

### 7.3 验收标准

- [x] ~~所有 UI 功能（模式切换、任务流转、文件变更、干预触发）纯前端可演示~~（离线原型 `helix-welcome.html` 已实现完整 demo）
- [x] ~~可以录制一个完整的 demo 视频~~（离线原型支持完整交互流程：发送消息 → 任务流转 → 文件变更 → 检查点操作）

> **注**：离线原型 (`sdks/vscode/src/webview/helix-welcome.html`) 已覆盖 Phase 0/2/3/5 的核心功能，并已完成 Phase 6 的核心后端接入（SSE 流式渲染、6 类事件监听、权限/提问交互、真实 task/todo 加载）。可作为完整功能验证使用。正式 SolidJS 迁移可参考其事件处理和 part 渲染逻辑。

---

## 8. Phase 6：接入 Agent 后端

> **更新（2026-06-18）**：Phase 6 的核心后端接入已在 `helix-welcome.html` 离线原型中完成，无需等待 SolidJS 迁移。以下为完成状态。

| 步骤 | 后端能力 | 前端对应 | 状态 |
|------|---------|---------|------|
| 1 | SSE 流式渲染 | reasoning/tool/text part 按 SSE 事件顺序流式渲染 | ✅ 已完成 |
| 2 | session.status 事件 | 事件驱动 finishGeneration（删除轮询） | ✅ 已完成 |
| 3 | permission.asked 事件 | 权限对话框自动弹出，调 /permission/:id/reply | ✅ 已完成 |
| 4 | question.asked 事件 | 提问对话框，调 /question/:id/reply + reject | ✅ 已完成 |
| 5 | session.error / retry 事件 | 错误和重试实时展示 | ✅ 已完成 |
| 6 | session.diff 事件 | Changes 面板实时更新 | ✅ 已完成 |
| 7 | task.updated / todo.updated | 真实 task/todo 从 API 拉取 | ✅ 已完成 |
| 8 | P0a Pre-flight API | Pre-flight Panel 接真实数据 | ⏳ 待实现 |
| 9 | P0b Cardinal + Judge + AlignmentGuard | 干预面板接真实事件 | ⏳ 待实现（UI 已有 mock） |
| 10 | P0c 同步屏障 + 编排钩子 | 任务列表接真实分解数据 | ⏳ 待实现 |
| 11 | P0d Mode Registry 后端 | 前端 Registry 接后端配置 | ⏳ 待实现 |
| 12 | P0e 动态分解 + 动态 Persona | 任务列表接动态任务树 | ⏳ 待实现 |

---

## 9. 现有代码分析

### 9.1 关键文件

| 文件 | 作用 | 需要改造的点 |
|------|------|------------|
| `prompt-input.tsx` | 输入框组件 | 新增模式切换 UI、占位符动态化 |
| `message-timeline.tsx` | 消息流渲染 | 新增模式色条、任务标记解析、Judge/AlignmentGuard 卡片 |
| `session-side-panel.tsx` | 右侧边面板 | 新增 Task List 和 Checkpoint 标签 |
| `review-tab.tsx` | Diff 审查面板 | 复用 Diff 组件到 Checkpoint Panel |
| `session-composer-region.tsx` | 作曲区域 | 接入 Mode Registry |
| `status-popover.tsx` | 状态栏 | 新增模式/干预/成本指示器 |
| `session-todo-dock.tsx` | Todo 浮动 dock | 与 Task List Panel 区分：dock 是浮动的，panel 是常驻的 |

### 9.2 注意点

- `prompt-input.tsx` 中的 `mode` 是 "normal" | "shell"（输入模式），与 Agent 模式（Build/Plan/Compose/Loop/Max）是**不同概念**
- Agent 模式目前通过 `@agent` 语法选择，需要新增独立的模式切换 UI（不替换现有输入模式）
- 现有 `SessionTodoDock` 是作曲区域的浮动 dock，与新的 Task List Panel（Side Panel 常驻标签）是不同组件

---

## 10. 交互设计审查与修复（2026-06-18）

### 10.1 审查范围

对 `sdks/vscode/src/webview/helix-welcome.html` 离线原型进行全面交互审查，覆盖：
- 数据流与状态同步
- 确认与安全机制
- UX 体验问题
- 渲染与状态管理
- 无障碍访问

### 10.2 修复清单

#### P0（数据安全）

| # | 问题 | 修复方案 |
|---|------|---------|
| 1 | `stageSelected()` forEach+splice 导致数组变异跳过偶数位文件 | 改用倒序 for 循环 splice |
| 2 | `resetStaged()` 无确认直接清空所有 staged 文件 | 添加确认对话框 |
| 3 | `revertAllChanges()` / `deleteCheckpoint()` / `restoreCheckpoint()` 无确认 | 添加确认对话框，复用 confirm-dialog 样式 |

#### P1（功能缺陷）

| # | 问题 | 修复方案 |
|---|------|---------|
| 4 | `showWelcome()` 销毁所有聊天记录 | 改为 CSS `display:none` 隐藏，发消息时恢复 |
| 5 | `keepChange()` 只输出消息不执行操作 | 从 `mockChanges` 中移除已接受的变更 |
| 6 | `parseTaskMarkers()` 忽略不存在的任务 ID | 自动创建新任务到第一个任务组 |
| 7 | `switchMode()` 生成中可切换导致状态不一致 | 检查 `isGenerating`，拒绝切换并提示 |
| 8 | `contextAction('fail')` / `contextAction('skip')` 无确认 | 添加确认对话框，使用通用 `showConfirmDialog` 辅助函数 |

#### P2（体验优化）

| # | 问题 | 修复方案 |
|---|------|---------|
| 9 | 右键菜单溢出视口 | 计算 `innerWidth`/`innerHeight` 做边界修正 |
| 10 | Keep/Revert/Stage 按钮只有 hover 可见 | 文件 `checked` 时自动显示（`opacity:1`） |
| 11 | 用户消息缺少模式标签 | 添加与 AI/系统消息一致的模式标签 |
| 12 | 快捷键 `Cmd+K/A/S` 与 VS Code 原生冲突 | 改用 `Alt` 修饰键（Alt+A/K/R/S） |
| 13 | 任务项无键盘导航 | 添加 `onkeydown`：Enter/Space 跳转，Shift+F10 上下文菜单 |
| 14 | 右键菜单缺少 ARIA | 添加 `role="menu"`/`role="menuitem"` |
| 15 | `lastClickedChangeId` 悬空引用 | staging/removing 后重置，Shift+Click 检测 stale 时降级 |

#### Bug 修复

| # | 问题 | 修复方案 |
|---|------|---------|
| 16 | `saveSettings` 消息格式不一致（`command` vs `type`） | 统一为 `type`，与 panel.ts 的 `message.type` 检查一致 |
| 17 | panel.ts 缺少 `saveSettings` 处理 | 添加 handler，将设置持久化到 VS Code 配置 |
| 18 | `MODE_CONFIG` 缺少 `icon` 属性 | 补全 6 个模式的 icon 定义 |

### 10.3 新增通用能力

- **`showConfirmDialog(title, message, onConfirm, opts)`**：通用确认对话框辅助函数，支持自定义按钮样式，避免重复创建 overlay 的样板代码
- **`handleTaskKeydown(e, taskId)`**：任务项键盘导航处理器

### 10.4 验收标准更新

- [x] 所有危险操作（Revert All、Delete Checkpoint、Restore、Reset Staged、Mark Failed、Skip）均有确认对话框
- [x] 文件 staging/removing 后状态引用正确清理
- [x] 快捷键不与 VS Code 原生冲突
- [x] 任务项支持键盘导航（Enter/Space/Shift+F10）
- [x] 右键菜单有 ARIA 标记
- [x] 消息格式与 panel.ts 处理逻辑一致

---

## 11. 文件清单

### 10.1 新建文件

```
packages/app/src/
├── context/
│   └── mode-registry.tsx              # Phase 1: Mode Registry Context
├── components/
│   └── mode-switcher.tsx              # Phase 1: 模式切换器
├── pages/session/
│   ├── task-list-panel.tsx            # Phase 2: 任务列表面板
│   ├── checkpoint-panel.tsx           # Phase 2: 文件检查点面板
│   ├── judge-verdict-card.tsx         # Phase 3: Judge 裁判卡片
│   ├── alignment-drift-alert.tsx      # Phase 3: AlignmentGuard 偏移警告
│   ├── preflight-panel.tsx            # Phase 4: Pre-flight 检查面板
│   ├── cardinal-intervention-panel.tsx # Phase 4: Cardinal 四级阻塞面板
│   └── zen-mode-toggle.tsx            # Phase 4: Zen Mode 切换
├── services/mock/
│   ├── mock-mode-service.ts
│   ├── mock-task-service.ts
│   ├── mock-checkpoint-service.ts
│   ├── mock-intervention-service.ts
│   └── mock-message-service.ts
└── styles.css                         # Phase 1: CSS 变量
```

### 10.2 改造文件

```
packages/app/src/
├── components/prompt-input.tsx        # Phase 1: 占位符动态化、模式色条
├── pages/session/message-timeline.tsx # Phase 3: 模式色条、任务标记、卡片
├── pages/session/session-side-panel.tsx # Phase 2: 新增标签
├── pages/session/review-tab.tsx       # Phase 2: 复用 Diff 组件
├── components/status-popover.tsx      # Phase 4: 状态栏增强
└── pages/session/session-composer-region.tsx # Phase 1: 接入 Mode Registry
```

---

*文档完成。按此严格执行。*
