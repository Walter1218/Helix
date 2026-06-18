# Helix VS Code Extension — 完整执行方案

> 目标：将 Helix 核心引擎以 VS Code 扩展形式集成到 IDE 中，全面外化智能体模式与 Harness 层能力，实现从"能用的 Agent"到"可信的 Agent"的 UX 跃迁。
>
> 设计稿：`docs/ide-ui-design.md` | 视觉稿：`docs/assets/`（13 张 PNG）
>
> 版本：v2（2026-06-17）

---

## 一、项目概述

### 1.1 背景

Helix 当前的核心引擎（`packages/opencode`）提供完整的 Agent 能力（Ask/Build/Plan/Compose/Max 模式、权限、记忆、隔离、子智能体编排），但用户界面仅通过 CLI TUI 和 Web 浏览器访问。用户无法在 IDE 中直接获得 AI 辅助，导致：
- 上下文收集不精准（CLI 无法读取当前文件和选中代码）
- 代码修改无法直接应用（需要手动复制粘贴）
- Agent 能力不可见（权限、记忆、执行轨迹都是黑盒）

### 1.2 目标

| 层级 | 目标 |
|------|------|
| **L1 可用** | 在 VS Code 中打开 Helix 面板，进行对话、获取代码建议 |
| **L2 好用** | 一键应用代码修改、行内对话、上下文自动收集 |
| **L3 可信** | 权限透明、记忆可见、执行轨迹可追踪、成本可控 |
| **L4 智能** | 多模式切换、子智能体协作、DPO 飞轮持续优化 |

### 1.3 范围

- **包含**：VS Code 扩展面板、行内对话、代码 Diff 应用、上下文收集、模式切换、Harness 能力外化
- **不包含**：重写核心引擎（完全复用 `packages/opencode`）、Eclipse Theia 迁移（远期规划）、多 IDE 支持（远期规划）

---

## 二、技术架构

### 2.1 三层架构

```
┌─────────────────────────────────────────┐
│  Layer 3: VS Code 扩展 (packages/vscode-extension)  │
│  ┌──────────────┐  ┌──────────────┐    │
│  │  Extension   │  │  Webview UI  │    │
│  │  Host (TS)   │  │  (SolidJS)   │    │
│  │  - VS Code   │  │  - 消息流    │    │
│  │    API 封装  │  │  - 输入框    │    │
│  │  - 文件操作  │  │  - 模式切换  │    │
│  │  - 命令注册  │  │  - 面板标签  │    │
│  └──────────────┘  └──────────────┘    │
│         │                   │           │
│         └─────────┬─────────┘           │
│                   │ postMessage         │
└───────────────────┼─────────────────────┘
                    │
┌───────────────────┼─────────────────────┐
│  Layer 2: HTTP / WebSocket 通信层       │
│  - mimo serve (packages/opencode/src/server)│
│  - SSE 流式响应                         │
│  - Session / File / Event / Question API│
└───────────────────┼─────────────────────┘
                    │
┌───────────────────┼─────────────────────┐
│  Layer 1: Helix 核心引擎               │
│  (packages/opencode/src/)              │
│  - Agent 系统 (ask/build/plan/compose/max) │
│  - Memory 系统 (SQLite FTS5 + Vec)   │
│  - Permission 系统                     │
│  - Worktree 隔离                       │
│  - Skill / Plugin / MCP               │
│  - FSM / Bus / Trace                   │
└─────────────────────────────────────────┘
```

### 2.2 通信链路

```
VS Code Webview (SolidJS)          VS Code Extension Host (TS)
        │                                    │
        │  postMessage                       │
        │  (ui→host: 发送消息、请求文件)      │
        │  (host→ui: 流式响应、文件内容)     │
        │◄──────────────────────────────────►│
        │                                    │
        │         HTTP/SSE                   │
        │  (host→mimo serve: REST API)      │
        │  (mimo serve→host: SSE 流)        │
        │                                    │
        └──────────► mimo serve ◄───────────┘
                      (packages/opencode/src/server)
                      端口: 3095 (默认)
```

### 2.3 关键接口

| 接口 | 协议 | 用途 | 现有实现 |
|------|------|------|---------|
| `POST /api/v1/session` | HTTP | 创建会话 | ✅ `server/routes/instance` |
| `GET /api/v1/session/:id` | HTTP | 获取会话状态 | ✅ |
| `POST /api/v1/session/:id/message` | SSE | 发送消息，流式响应 | ✅ |
| `GET /api/v1/file/*` | HTTP | 读取文件内容 | ✅ |
| `POST /api/v1/file/*` | HTTP | 写入文件 | ✅ |
| `GET /api/v1/project` | HTTP | 获取项目上下文 | ✅ |
| `POST /api/v1/question` | HTTP | 权限确认 | ✅ |
| `GET /api/v1/agent` | HTTP | 获取 Agent 列表 | ✅ |
| `GET /api/v1/skill` | HTTP | 获取 Skills 列表 | ✅ |
| `GET /api/v1/memory` | HTTP | 查询记忆（需新增） | ⚠️ 需暴露 |
| `GET /api/v1/permission` | HTTP | 获取权限矩阵（需新增） | ⚠️ 需暴露 |
| `GET /api/v1/worktree` | HTTP | 获取 Worktree 状态（需新增） | ⚠️ 需暴露 |

---

## 三、现有资产复用清单

### 3.1 直接复用（零改造）

| 资产 | 位置 | 复用方式 | 说明 |
|------|------|---------|------|
| `mimo serve` HTTP API | `packages/opencode/src/server` | 扩展直接调用 | 已有完整 session/file/event/question 路由 |
| `Agent` 系统 | `packages/opencode/src/agent` | 通过 API 调用 | Ask/Build/Plan/Compose/Max 原生支持 |
| `Memory` 存储 | `packages/opencode/src/memory` | 通过 API 调用 | SQLite FTS5 + sqlite-vec，需暴露 API |
| `Permission` 系统 | `packages/opencode/src/permission` | 通过 API 调用 | 需暴露当前权限矩阵查询 |
| `Worktree` 隔离 | `packages/opencode/src/worktree` | 通过 API 调用 | 需暴露状态查询 |
| `Skill` 系统 | `packages/opencode/src/skill` | 通过 API 调用 | 已有 `available` 接口 |
| `Bus` 事件系统 | `packages/opencode/src/bus` | 通过 SSE 订阅 | 流式推送事件到 Webview |
| `Trace` 记录 | `packages/opencode/src/trace` | 后台复用 | 自动记录，扩展无感知 |

### 3.2 改造复用（调整样式/布局）

| 资产 | 位置 | 改造点 | 工作量 |
|------|------|--------|--------|
| `MessageTimeline` | `packages/app/src/pages/session/message-timeline.tsx` | 适配窄面板 + 模式色条 + 子智能体卡片 | 中等 |
| `PromptInput` | `packages/app/src/components/prompt-input.tsx` | 压缩工具栏 + 模式快捷栏 + 动态占位符 | 中等 |
| `FileTree` | `packages/app/src/components/file-tree.tsx` | 字体缩小 + 修改指示 + 多标签面板 | 小 |
| `SessionReviewTab` | `packages/app/src/pages/session/review-tab.tsx` | 紧凑布局 + 窄面板适配 | 小 |
| `Diff` 渲染 | `packages/app/src/components/diff.tsx` | 使用 `--vscode-*` 变量 | 小 |
| `dialog-*` 组件 | `packages/app/src/components/dialog-*.tsx` | 复用弹窗样式 | 小 |

### 3.3 新建组件

| 组件 | 用途 | 工作量 |
|------|------|--------|
| `ModeSwitcher` | 标题栏 + 输入框的模式切换器 | 小 |
| `ModeIndicator` | 消息气泡的模式标识 | 小 |
| `MaxProgress` | Max 候选进度指示 | 中等 |
| `ContextBar` | 上下文条（文件附件） | 中等 |
| `PermissionPanel` | 权限面板（🔒 标签） | 中等 |
| `MemoryExplorer` | 记忆浏览器（🧠 标签） | 中等 |
| `SubagentCard` | 子智能体执行卡片 | 中等 |
| `WorktreeIndicator` | 隔离状态指示器 | 小 |
| `AgentsMdEditor` | AGENTS.md 编辑器（📋 标签） | 中等 |
| `PluginManager` | 插件管理器（🔌 标签） | 中等 |
| `FsmVisualizer` | FSM 状态可视化 | 小 |
| `DpoFeedback` | DPO 反馈按钮 | 小 |
| `CostBudget` | 成本预算指示 | 小 |
| `SidePanel` | 多标签文件树面板 | 中等 |

---

## 四、详细实施计划

### 4.1 Phase 1: 骨架 + 模式外显（Week 1-2）

**目标**：初始化扩展项目，打通 Webview → Host → mimo serve 链路，实现模式外显的基础 UI。

#### 任务清单

| 编号 | 任务 | 工时 | 验收标准 | 依赖 |
|------|------|------|---------|------|
| P1-1 | 初始化 `packages/vscode-extension/` 标准项目结构 | 0.5d | 包含 `package.json`、`tsconfig.json`、`webpack.config.js`、`src/extension.ts` | 无 |
| P1-2 | 配置 `mimo serve` 自动发现（扫描端口或读取配置） | 0.5d | 扩展能自动连接本地 `mimo serve`（端口 3095） | P1-1 |
| P1-3 | 实现 Webview 加载 `packages/app` 构建产物 | 1d | Webview 能正确加载 `packages/app` 的 HTML/JS/CSS | P1-1 |
| P1-4 | 实现 `postMessage` 双向通信（Webview ↔ Host） | 1d | Host 能接收 Webview 消息，Webview 能接收 Host 消息 | P1-3 |
| P1-5 | 实现 Webview → Host → mimo serve 的 HTTP 请求转发 | 1d | 通过 Host 代理调用 mimo serve API，CORS 问题解决 | P1-4 |
| P1-6 | 实现 SSE 流式响应从 mimo serve → Host → Webview | 1.5d | 消息流能实时逐字渲染，不丢包 | P1-5 |
| P1-7 | 实现标题栏模式切换器（Ask/Build/Plan/Compose/Max） | 1d | 五个模式按钮可切换，高亮当前模式 | P1-6 |
| P1-8 | 实现消息流模式标识（每条 Agent 消息带模式色条） | 0.5d | 消息气泡左侧 2px 色条跟随模式 | P1-7 |
| P1-9 | 实现输入框模式快捷栏 + 动态占位符 | 0.5d | 占位符随模式切换变化 | P1-7 |
| P1-10 | 实现 Max 状态指示器（标题栏 + 状态栏） | 1d | 显示候选进度 "N/M → 状态" | P1-7 |
| P1-11 | 快捷键绑定（`Ctrl+Shift+A/B/P/O/M`） | 0.5d | 快捷键可切换模式 | P1-7 |
| P1-12 | 编写 Phase 1 测试 | 1d | 10 个测试用例通过 | 全部 |

**Phase 1 总工时：约 9.5 天（2 周）**

**验收标准**：
- [ ] 在 VS Code 中打开 Helix 面板，能看到模式切换器
- [ ] 发送消息，消息流实时展示，每条 Agent 消息带正确模式标识
- [ ] Max 模式显示候选进度（即使后端还未实现 Max 模式，前端先 mock 展示）
- [ ] 输入框模式切换即时生效，占位符正确变化
- [ ] 快捷键可切换模式

---

### 4.2 Phase 2: 通信 + 上下文 + 权限（Week 3-4）

**目标**：实现精准的上下文收集、权限面板和代码修改应用。

#### 任务清单

| 编号 | 任务 | 工时 | 验收标准 | 依赖 |
|------|------|------|---------|------|
| P2-1 | 暴露 `GET /api/v1/memory` 接口（查询记忆） | 1d | 可查询当前会话的记忆列表 | 无 |
| P2-2 | 暴露 `GET /api/v1/permission` 接口（获取权限矩阵） | 1d | 可获取当前 Agent 的权限配置 | 无 |
| P2-3 | 暴露 `GET /api/v1/worktree` 接口（获取隔离状态） | 0.5d | 可获取 Shadow Worktree 状态 | 无 |
| P2-4 | 实现上下文收集（当前文件 + 选中代码） | 1d | 从 `window.activeTextEditor` 获取文件路径和选区 | P1-6 |
| P2-5 | 实现上下文条（ContextBar）组件 | 1d | 显示文件 pill，可删除/添加 | P2-4 |
| P2-6 | 实现代码 Diff 应用（接受/拒绝/Diff） | 1.5d | 点击接受后文件内容修改，拒绝后忽略 | P2-5 |
| P2-7 | 实现权限面板（🔒 标签） | 2d | 展示工具/文件权限矩阵，可切换 allow/ask/deny | P2-2 |
| P2-8 | 权限确认弹窗优化（显示权限上下文） | 0.5d | 弹窗显示当前权限策略和已授权次数 | P2-7 |
| P2-9 | 实现行内对话（Inline Chat）基础版 | 1.5d | 悬浮面板，模式选择条，接受/拒绝 | P1-9 |
| P2-10 | 实现文件树面板多标签（📁/🔍/🔒） | 1d | 三个标签可切换，审查标签展示修改文件 | P2-7 |
| P2-11 | 编写 Phase 2 测试 | 1.5d | 15 个测试用例通过 | 全部 |

**Phase 2 总工时：约 11.5 天（2 周）**

**验收标准**：
- [ ] 打开文件并选中代码，上下文条自动显示文件和选区
- [ ] 发送消息，Agent 返回代码修改，消息流显示 Diff 卡片
- [ ] 点击"接受"，文件内容被修改；点击"拒绝"，修改被忽略
- [ ] 打开权限面板，能看到当前权限矩阵，可切换工具权限
- [ ] 切换权限后，下一条消息的权限生效
- [ ] 选中代码按 `Ctrl+K`，弹出 Inline Chat 面板，可交互
- [ ] 权限请求弹窗显示当前策略和已授权次数

---

### 4.3 Phase 3: 深度集成 + 记忆 + 执行轨迹（Week 5-6）

**目标**：实现记忆浏览器、子智能体执行全景、Shadow Worktree 状态、Skills 面板。

#### 任务清单

| 编号 | 任务 | 工时 | 验收标准 | 依赖 |
|------|------|------|---------|------|
| P3-1 | 实现记忆浏览器（🧠 标签） | 2d | 展示记忆列表，支持搜索、删除、标记重要 | P2-1 |
| P3-2 | 实现记忆语义搜索（向量相似度） | 1d | 在记忆浏览器中支持语义搜索 | P3-1 |
| P3-3 | 实现子智能体执行卡片（explore/judge/general） | 2d | 消息流中显示可折叠执行卡片，展示实时进度 | P1-6 |
| P3-4 | 实现 SSE 推送子智能体执行状态 | 1d | 通过 Bus 系统推送执行事件到 Webview | P3-3 |
| P3-5 | 实现 Shadow Worktree 状态指示器（🌲） | 1d | 标题栏显示隔离状态，点击展开面板 | P2-3 |
| P3-6 | 实现 Worktree 合并/丢弃操作 | 1d | 面板中可合并到主分支或丢弃 | P3-5 |
| P3-7 | 实现 Skills 面板（🎼 标签） | 1.5d | 展示 Compose 可用 skills，支持触发 | P1-6 |
| P3-8 | 实现行内对话完整版（Diff 应用、代码替换） | 1.5d | 接受后可直接替换选中代码 | P2-9 |
| P3-9 | 实现右键快捷操作（解释/修复/测试） | 1d | 在编辑器右键菜单增加 Helix 操作 | P3-8 |
| P3-10 | 编写 Phase 3 测试 | 1.5d | 15 个测试用例通过 | 全部 |

**Phase 3 总工时：约 12.5 天（2 周）**

**验收标准**：
- [ ] 打开记忆浏览器，能看到当前会话的记忆条目，可搜索和删除
- [ ] 发送消息触发 explore 子智能体，消息流中显示执行卡片，可展开查看扫描进度
- [ ] 点击标题栏 🌲 图标，展开 Shadow Worktree 面板，显示差异和操作按钮
- [ ] 切换到 Compose 模式，Skills 面板显示可用技能，点击触发
- [ ] 选中代码右键 → "Helix: 解释这段代码"，弹出 Inline Chat 并执行
- [ ] 行内对话接受后，选中代码被替换为新内容

---

### 4.4 Phase 4: 高级 + 治理 + 飞轮（Week 7-8）

**目标**：实现 AGENTS.md 编辑器、Plugin 管理器、FSM 可视化、DPO 反馈、成本预算。

#### 任务清单

| 编号 | 任务 | 工时 | 验收标准 | 依赖 |
|------|------|------|---------|------|
| P4-1 | 实现 AGENTS.md 编辑器（📋 标签） | 2d | 展示规则列表，支持增删改，来源标注 | 无 |
| P4-2 | 实现 AGENTS.md 实时保存到文件 | 0.5d | 修改后自动写入项目根目录 `AGENTS.md` | P4-1 |
| P4-3 | 实现 Plugin/MCP 管理器（🔌 标签） | 2d | 展示已加载插件，支持启用/禁用/配置 | 无 |
| P4-4 | 实现 FSM 状态可视化（状态栏） | 1d | 显示微型状态机流程图，当前状态高亮 | 无 |
| P4-5 | 实现 DPO 数据反馈（👍/👎） | 1d | 每条 Agent 消息底部显示反馈按钮，点击后收集 | 无 |
| P4-6 | 实现 DPO 数据导出接口 | 1d | 复用 `export_dpo.ts`，暴露为 API 端点 | P4-5 |
| P4-7 | 实现成本预算指示器 | 1d | 状态栏显示预算进度，超限预警 | 无 |
| P4-8 | 实现多文件批量修改（全部接受/拒绝） | 1.5d | 文件树面板底部显示批量操作按钮 | P3-6 |
| P4-9 | 实现 SWE-bench 适配模式 | 1.5d | 在设置中开启 SWE-bench 模式，禁用用户交互 | 无 |
| P4-10 | 编写 Phase 4 测试 | 1.5d | 15 个测试用例通过 | 全部 |
| P4-11 | 端到端集成测试 + 性能优化 | 2d | 8 个场景全部通过，面板启动 < 2s | 全部 |

**Phase 4 总工时：约 13 天（2 周）**

**验收标准**：
- [ ] 打开 AGENTS.md 编辑器，能看到项目规则，可添加新规则，保存后下条消息生效
- [ ] 打开 Plugin 管理器，能看到已加载的 MCP Server，可禁用/重启
- [ ] 状态栏显示 FSM 状态流转（idle → thinking → tool_calling → idle）
- [ ] 点击 Agent 消息的 👍/👎，显示确认反馈，累计数显示在状态栏
- [ ] 状态栏显示成本预算进度，超过 80% 变黄，超过 95% 变红
- [ ] 文件树面板可批量接受/拒绝所有修改
- [ ] 端到端测试全部通过

---

## 五、项目结构

```
packages/vscode-extension/
├── package.json              # 扩展配置、命令、快捷键、Webview 入口
├── tsconfig.json             # TypeScript 配置
├── webpack.config.js         # 打包配置
├── .vscodeignore             # 打包忽略列表
├── src/
│   ├── extension.ts          # 扩展入口（activate/deactivate）
│   ├── webview/
│   │   ├── panel.ts          # Webview Panel 创建与管理
│   │   ├── inlineChat.ts     # 行内对话面板
│   │   └── statusBar.ts      # 状态栏贡献
│   ├── host/
│   │   ├── api.ts            # mimo serve HTTP API 客户端
│   │   ├── sse.ts            # SSE 流式响应处理
│   │   ├── context.ts        # VS Code 上下文收集（文件、选区）
│   │   ├── file.ts           # 文件操作（读取、写入、Diff）
│   │   ├── command.ts        # 命令注册（Helix: 打开面板、行内对话）
│   │   └── mode.ts           # 模式切换逻辑
│   ├── shared/
│   │   └── types.ts          # 共享类型定义
│   └── test/
│       ├── extension.test.ts # 扩展测试
│       └── integration.test.ts # 集成测试
├── webview-ui/               # Webview UI 源码（从 packages/app 复用）
│   ├── src/
│   │   ├── index.tsx         # Webview 入口
│   │   ├── components/       # UI 组件
│   │   │   ├── mode-switcher.tsx      # 模式切换器
│   │   │   ├── mode-indicator.tsx     # 模式标识
│   │   │   ├── max-progress.tsx       # Max 进度指示
│   │   │   ├── context-bar.tsx        # 上下文条
│   │   │   ├── subagent-card.tsx     # 子智能体执行卡片
│   │   │   ├── permission-panel.tsx  # 权限面板
│   │   │   ├── memory-explorer.tsx   # 记忆浏览器
│   │   │   ├── worktree-indicator.tsx # 隔离状态
│   │   │   ├── agents-md-editor.tsx # AGENTS.md 编辑器
│   │   │   ├── plugin-manager.tsx   # 插件管理器
│   │   │   ├── fsm-visualizer.tsx    # FSM 可视化
│   │   │   ├── dpo-feedback.tsx      # DPO 反馈
│   │   │   └── cost-budget.tsx       # 成本预算
│   │   ├── pages/
│   │   │   └── session.tsx   # 主会话面板
│   │   └── hooks/
│   │       ├── useApi.ts     # API 调用 Hook
│   │       ├── useSse.ts     # SSE 订阅 Hook
│   │       ├── useMode.ts    # 模式状态 Hook
│   │       └── useContext.ts # 上下文收集 Hook
│   ├── package.json          # Webview UI 依赖
│   └── vite.config.ts        # Webview UI 构建配置
└── media/
    └── icon.svg              # 扩展图标
```

---

## 六、测试策略

### 6.1 测试原则
- 遵循用户规则：**通过 Mock 方式的测试不算测试通过，必须完整调用业务代码**
- 使用真实 `mimo serve` 实例进行集成测试
- 测试在 `packages/vscode-extension` 目录下运行，不在根目录运行

### 6.2 测试分层

| 层级 | 测试类型 | 数量 | 运行方式 |
|------|---------|------|---------|
| 单元测试 | 组件渲染、Hook 逻辑 | 20+ | `vscode-test` + `vitest` |
| 集成测试 | Webview ↔ Host ↔ mimo serve 链路 | 15+ | 启动真实 mimo serve |
| 端到端测试 | 完整用户场景 | 8 | VS Code 测试宿主 |

### 6.3 测试场景（端到端）

1. 打开 Helix 面板，发送消息，收到流式响应
2. 切换模式（Ask → Build → Plan → Compose → Max），验证 UI 反馈
3. 选中代码，打开行内对话，获取建议并应用修改
4. Agent 返回代码修改，点击接受，文件内容被修改
5. 打开权限面板，切换 `bash` 权限为 `deny`，发送消息验证权限生效
6. 打开记忆浏览器，删除一条记忆，发送消息验证记忆已删除
7. 触发 explore 子智能体，验证消息流中显示执行卡片
8. 使用 Max 模式，验证候选进度指示和 Judge 评分展示

---

## 七、风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| `mimo serve` API 不兼容 | 中 | 高 | 在 Phase 1 先做 API 探测和版本适配，设计适配层 |
| Webview 与 Host 通信延迟 | 低 | 中 | 使用 SSE 而非轮询，消息流优化为增量更新 |
| VS Code 主题变量不一致 | 中 | 低 | 兜底配色方案（深色/浅色各一套固定色值） |
| Max 模式后端未就绪 | 高 | 中 | 前端先 mock 展示，等后端实现后替换真实数据 |
| 权限面板改动破坏配置 | 低 | 高 | 修改前备份 `mimocode.json`，提供"重置默认"按钮 |
| 文件树面板性能差（大项目） | 中 | 中 | 使用虚拟滚动（`@tanstack/react-virtual`），限制初始加载深度 |
| 跨平台兼容（Windows/Mac/Linux） | 中 | 中 | 使用 VS Code 标准 API，避免平台特定代码，CI 覆盖三平台 |
| 成本预算接口缺失 | 中 | 低 | 先在前端计算（Token 数 × 单价），后端补充后对接 |

---

## 八、里程碑与交付物

| 里程碑 | 时间 | 交付物 | 验收标准 |
|--------|------|--------|---------|
| M1 | Week 2 结束 | 可运行的扩展骨架 + 模式外显 | 能打开面板、切换模式、发送消息、显示模式标识 |
| M2 | Week 4 结束 | 上下文收集 + 代码修改 + 权限面板 | 能精准收集上下文、应用代码修改、管理权限 |
| M3 | Week 6 结束 | 记忆 + 子智能体 + 隔离状态 | 能查看记忆、追踪执行、感知隔离 |
| M4 | Week 8 结束 | 完整扩展 + 治理 + 飞轮 | 所有功能可用，测试通过，可发布到 VS Code 市场 |

---

## 九、设计稿索引

所有设计稿保存在 `docs/assets/` 目录，共 21 张：

| 文件名 | 内容 | 版本 |
|--------|------|------|
| `VS_Code_extension_AI_coding_as_2026-06-17T05-12-29.png` | 主面板（含模式切换器） | v2 |
| `VS_Code_inline_chat_UI_mockup__2026-06-17T05-12-21.png` | 行内对话（含模式选择条） | v2 |
| `VS_Code_sidebar_panel_showing__2026-06-17T05-12-26.png` | Max 候选比较面板 | v2 |
| `VS_Code_extension_permission_d_*.png` | 权限面板 | v2 |
| `VS_Code_extension_memory_explo_*.png` | 记忆浏览器 | v2 |
| `VS_Code_extension_subagent_exe_*.png` | 子智能体执行全景 | v2 |
| `VS_Code_extension_shadow_workt_*.png` | Shadow Worktree 状态 | v2 |
| `VS_Code_extension_AGENTS_md_ed_*.png` | AGENTS.md 编辑器 | v2 |
| `VS_Code_extension_plugin_MCP_m_*.png` | Plugin/MCP 管理器 | v2 |
| `VS_Code_extension_status_bar_w_*.png` | 状态栏（模式+成本+DPO） | v2 |
| `VS_Code_Extension_main_panel_U_2026-06-17T15-50-09.png` | 主面板 6 模式（含 Ask + Loop） | v3 |
| `VS_Code_Extension_UI_mockup_sh_2026-06-17T15-50-20.png` | 综合模式概览 6 模式 | v3 |
| `VS_Code_inline_chat_UI_mockup__2026-06-17T15-50-21.png` | 行内对话（含 6 模式选择条） | v3 |
| `VS_Code_Extension_UI_Design____2026-06-17T13-14-52.png` | Pre-flight 检查 | v3 |
| `VS_Code_Extension_UI_Design____2026-06-17T13-14-54.png` | Cardinal 四级阻塞 | v3 |
| `VS_Code_Extension_UI_Design____2026-06-17T13-14-58.png` | Judge 裁判卡片 | v3 |
| `VS_Code_Extension_UI_Design____2026-06-17T13-15-01.png` | AlignmentGuard 偏移警告 | v3 |
| `VS_Code_Extension_UI_Design____2026-06-17T13-15-43.png` | 注意力等级与 Zen Mode | v3 |
| `VS_Code_Extension_UI_Design____2026-06-17T13-15-49.png` | 容错与降级 | v3 |

共 19 张（v2 10 张 + v3 9 张，其中 3 张已更新为 6 模式）。

---

## 十、关键决策记录

| 决策 | 内容 | 理由 |
|------|------|------|
| 复用 `packages/app` 而非重写 | Webview UI 基于 `packages/app` 的 SolidJS 组件 | 最小开发量，保持一致性 |
| 复用 `mimo serve` HTTP API | 不新建通信协议，使用现有 Hono 路由 | 后端零改动，前端只需适配 |
| 权限面板直接修改 `mimocode.json` | 前端切换后实时写入配置文件 | 持久化，与 CLI 一致 |
| 记忆浏览器仅展示不修改后端 | 前端调用 `memory` 查询接口，删除/标记通过 API | 不侵入记忆存储逻辑 |
| 子智能体执行通过 Bus 事件推送 | 复用现有 `Bus` 系统，新增 SSE 流 | 最小后端改动 |
| 成本预算前端先计算 | Token 数 × 单价，后端补充后对接 | 不阻塞前端进度 |
| 先不做 WebSocket 改用 SSE | 现有 `mimo serve` 已支持 SSE，WebSocket 需新增 | 最快路径 |

---

*方案基于 Helix 现有资产最大化复用，4 阶段 8 周交付，从"能用的 Agent"到"可信的 Agent"。*
