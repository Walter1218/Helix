# Helix Work 开发计划

> 基于 `docs/helix-work-ui-design.md` (v1.2) 制定的前端执行计划。
> 技术栈：SolidJS + TailwindCSS + Vite + Effect + Bun + SQLite。
> 目标：构建独立的桌面应用（Work 模式），与 IDE 模式零干扰。

---

## 一、总体节奏

| 阶段 | 内容 | 工期 | 可交付物 |
|------|------|------|----------|
| **Phase 1** | 基础底座：项目结构 + 主题 + 全局组件 + 布局骨架 | 2 周 | 可运行的空壳桌面应用，含导航和 15 个基础组件 |
| **Phase 2** | Dashboard：工作流管理首页 | 1.5 周 | Dashboard 完整页面，含 mock 数据 |
| **Phase 3** | Workflow Editor：DAG 可视化编排 | 3 周 | 可拖拽的 DAG 编辑器，支持节点/连线/属性配置 |
| **Phase 4** | Knowledge Base：文档与问答 | 1.5 周 | 文档上传、列表、问答界面 |
| **Phase 5** | Observability：可观测性面板 | 2 周 | Trace 树、时间线、Judge/AlignmentGuard 卡片 |
| **Phase 6** | 飞书会话：IM 聊天历史 | 1 周 | 会话列表 + 聊天详情，双向消息流 |
| **Phase 7** | 响应式、可访问性、性能优化、测试 | 1 周 | 全页面响应式适配、键盘导航、E2E 测试 |

**总计：12 周**（约 3 个月）。

**人员配置建议**：
- 1 名前端（SolidJS 方向，负责全部页面）
- 1 名后端（Effect + SQLite，负责 DAG API、任务队列、知识库索引）
- 1 名全栈（负责 Electron 集成、SSE 通信、与 Helix Core 桥接）

---

## 二、Phase 1：基础底座（2 周）

### 2.1 项目结构搭建（第 1-2 天）

**决策**：基于现有 `packages/desktop` 扩展，还是新建 `packages/work`？

建议：**新建 `packages/work`**，理由：
- Work 模式与 IDE 模式完全独立，不共享路由和页面结构
- 可避免 IDE 相关的依赖（如 LSP、MCP、OpenTUI）污染 Work 包
- 独立打包，可单独发版

```
packages/work/
├── src/
│   ├── main/              # Electron 主进程（参考 packages/desktop）
│   ├── renderer/          # 渲染进程（SolidJS 应用）
│   │   ├── index.tsx      # 入口
│   │   ├── App.tsx        # 根组件（路由 + 全局布局）
│   │   ├── stores/        # 全局状态（Sidebar, Theme, User）
│   │   ├── components/    # 全局组件（15 个基础组件）
│   │   ├── pages/         # 5 大页面
│   │   │   ├── Dashboard/
│   │   │   ├── WorkflowEditor/
│   │   │   ├── KnowledgeBase/
│   │   │   ├── Observability/
│   │   │   └── FeishuChat/
│   │   ├── hooks/         # 通用 Hooks（useBreakpoint, useKeyboardShortcut）
│   │   ├── utils/         # 工具函数
│   │   └── types/         # 全局类型定义
│   └── preload/           # Electron preload 脚本
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
```

**依赖清单**：
```json
{
  "dependencies": {
    "solid-js": "catalog:",
    "@solidjs/router": "catalog:",
    "@tanstack/solid-query": "5.91.4",
    "tailwindcss": "catalog:",
    "@kobalte/core": "catalog:",
    "effect": "catalog:",
    "zod": "catalog:",
    "luxon": "catalog:",
    "marked": "catalog:",
    "shiki": "catalog:",
    "virtua": "catalog:",
    "@thisbeyond/solid-dnd": "0.7.5"
  }
}
```

> **注意**：`@xyflow/react` 是 React 库，SolidJS 无法直接使用。需要调研替代方案：
> - 方案 A：使用 `solid-dag` 或自研 DAG 引擎（推荐，更可控）
> - 方案 B：使用 React 兼容层（`@solidjs/react` 或类似），但引入 React 运行时，包体积增大
> - 方案 C：在 Work 包中引入 React 仅用于 DAG 画布，其余用 SolidJS（混合架构，不推荐）
>
> **建议**：先评估方案 A 的可行性（如搜索 `solid-dag` 或 `solidjs flowchart`），若无法找到成熟方案，再考虑方案 B。

### 2.2 主题与 CSS 变量系统（第 3-4 天）

目标：完全实现 `§3` 的暗色主题，不跟随 VS Code 主题。

**文件**：`packages/work/src/renderer/styles/theme.css`

```css
@theme {
  /* 品牌色 */
  --hw-brand: #3b82f6;
  --hw-brand-light: #60a5fa;
  --hw-brand-dark: #1d4ed8;
  --hw-brand-10: rgba(59, 130, 246, 0.1);
  --hw-brand-20: rgba(59, 130, 246, 0.2);

  /* 背景色 */
  --hw-bg-base: #0f172a;
  --hw-bg-panel: #1e293b;
  --hw-bg-card: #334155;
  --hw-bg-nav: #0f172a;
  --hw-bg-input: #1e293b;
  --hw-bg-hover: #334155;
  --hw-bg-active: #3b82f6;

  /* 文字色 */
  --hw-fg-primary: #f1f5f9;
  --hw-fg-secondary: #cbd5e1;
  --hw-fg-muted: #94a3b8;
  --hw-fg-disabled: #64748b;

  /* 边框 */
  --hw-border: #334155;
  --hw-border-light: #475569;

  /* 状态色 */
  --hw-success: #22c55e;
  --hw-success-bg: rgba(34, 197, 94, 0.1);
  --hw-warning: #f59e0b;
  --hw-warning-bg: rgba(245, 158, 11, 0.1);
  --hw-error: #ef4444;
  --hw-error-bg: rgba(239, 68, 68, 0.1);
  --hw-info: #3b82f6;
  --hw-info-bg: rgba(59, 130, 246, 0.1);

  /* 字体 */
  --hw-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --hw-font-mono: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;

  /* 间距 */
  --hw-sidebar-width: 64px;
  --hw-topbar-height: 48px;
  --hw-statusbar-height: 28px;
  --hw-right-panel-width: 320px;
  --hw-border-radius: 6px;

  /* 动画 */
  --hw-transition-fast: 150ms ease;
  --hw-transition-normal: 250ms ease;
  --hw-transition-slow: 400ms ease;
}
```

**验收标准**：
- [ ] 所有 CSS 变量与 `§3.1` 表格完全一致
- [ ] 亮色/暗色切换（通过 `data-theme` 属性或 class）
- [ ] 与 IDE 模式配色对比验证（`§3.2` 表格）

### 2.3 全局布局骨架（第 5-6 天）

目标：实现 `§2.1` 的横向分栏布局。

**文件**：`packages/work/src/renderer/App.tsx` / `layouts/MainLayout.tsx`

```tsx
// 布局结构（伪代码）
<MainLayout>
  <SidebarNavigation />     {/* 64px 固定宽 */}
  <MainContent>
    <TopBar />              {/* 48px 固定高 */}
    <PageContent>           {/* 路由 outlet */}
      <Router />            {/* 5 大页面 */}
    </PageContent>
    <RightPanel />          {/* 320px，可折叠 */}
  </MainContent>
  <StatusBar />             {/* 28px 固定高 */}
</MainLayout>
```

**关键实现**：
- 路由配置：`@solidjs/router` 定义 `/dashboard`, `/workflows`, `/runs`, `/knowledge`, `/observability`, `/feishu`, `/settings`
- 状态管理：Sidebar 当前选中项（`useRoute` 自动推导）、RightPanel 展开/折叠状态（`createStore`）
- 响应式：窗口宽度变化时，Tablet 模式隐藏 RightPanel，Compact 模式隐藏 Sidebar（汉堡菜单）

**验收标准**：
- [ ] 6 个导航项正确路由跳转
- [ ] Sidebar 选中态高亮（左侧蓝条 + 图标品牌色）
- [ ] RightPanel 折叠/展开动画（250ms ease）
- [ ] 窗口尺寸变化时布局自适应（`useMediaQuery` 或 `@solid-primitives/media`）

### 2.4 全局组件库（第 7-10 天）

目标：实现 `§4` 的 15 个基础组件。

按优先级分组：

**高优先级（P0，所有页面都会用到）**：
1. `Button`（§4.6）— 4 种类型、3 种尺寸、Loading 态
2. `Input`（§4.7）— 文本/搜索/多行、前缀/后缀图标、错误态
3. `Badge`（§4.8）— 状态徽章、数字徽章、标签徽章
4. `Card`（§4.5）— 通用卡片、阴影、hover 态
5. `Modal`（§4.9）— 确认/表单/自定义内容、ESC 关闭、动画
6. `Toast`（§4.10）— 自动消失、进度条、多 Toast 堆叠
7. `Skeleton`（§4.13）— 脉冲动画、自定义行数/列数
8. `EmptyState`（§4.14）— 图标 + 标题 + 描述 + 操作按钮

**中优先级（P1，特定页面使用）**：
9. `ContextMenu`（§4.11）— 右键菜单、快捷键、子菜单
10. `ConfirmDialog`（§4.12）— 危险操作二次确认
11. `GlobalSearch`（§4.15）— `Cmd+K` / `Ctrl+K` 全局搜索面板

**低优先级（P2，可延后）**：
12. `TopBar`（§4.2）— 面包屑 + 操作按钮 + 搜索框
13. `StatusBar`（§4.3）— 连接状态 + 性能指标 + 版本号
14. `RightPanel`（§4.4）— 属性面板容器
15. `Sidebar`（§4.1）— 导航栏（已含在布局中）

**组件规范**：
- 每个组件一个文件：`packages/work/src/renderer/components/Button.tsx`
- 使用 `@kobalte/core` 作为基础（已提供 Headless UI 组件，如 Dialog、Menu、Toast）
- 所有组件支持 `class` prop（Tailwind 自定义）和 `style` prop
- 动画使用 CSS Transition/Keyframe（`§5.2` 定义），避免引入动画库

**验收标准**：
- [ ] 每个组件有 Storybook 故事（或至少一个独立测试文件）
- [ ] 所有组件状态（hover、active、disabled、loading、error）视觉正确
- [ ] 动画时序与 `§5.2` 一致（脉冲 2s、抖动 400ms 等）
- [ ] 可访问性：键盘导航、焦点样式、ARIA 属性

### 2.5 键盘快捷键与可访问性基础（第 11-12 天）

目标：实现 `§12.1` 的全局快捷键和 `§11.3` 的可访问性基础。

**实现**：
- 使用 `solid-primitives` 的键盘事件监听或自定义 `useKeyboardShortcut` hook
- 快捷键映射表（`§12.1` 22 项）：
  - `Ctrl+1~6`：页面切换
  - `Ctrl+K`：全局搜索
  - `Ctrl+Comma`：设置
  - `Ctrl+Shift+N`：新建工作流
  - `Ctrl+Shift+Enter`：运行工作流
  - `Delete` / `Backspace`：删除选中节点
  - `Ctrl+Z` / `Ctrl+Shift+Z`：撤销/重做
  - `Ctrl+A`：全选
  - `Ctrl+Shift+G`：自动布局
  - `Ctrl+Shift+E`：导出报告
  - `Ctrl+Shift+O`：导入工作流
  - `Ctrl+Shift+F`：搜索文档
  - `Ctrl+Shift+A`：搜索 Agent
  - `Ctrl+Shift+U`：上传文档
  - `F5` / `Ctrl+R`：刷新列表
  - `Ctrl+Shift+C`：复制节点
  - `Ctrl+Shift+V`：粘贴节点
  - `Ctrl+Shift+S`：保存工作流

**可访问性**：
- 焦点样式：`2px solid --hw-brand`，`outline-offset: 2px`
- 所有交互元素支持键盘操作（Tab、Enter、Space）
- 屏幕阅读器：关键区域添加 `aria-label`、`aria-live`、`role`

### 2.6 Phase 1 验收标准

- [ ] 桌面应用可启动（`bun dev:work` 或 `bun run --cwd packages/work dev`）
- [ ] 侧边导航 6 个页面可切换，空页面占位符显示
- [ ] 主题切换按钮工作，所有页面背景色正确
- [ ] 全局搜索 `Ctrl+K` 可唤起
- [ ] 至少 8 个高优先级组件可用，有视觉演示
- [ ] 窗口resize时布局无断裂

---

## 三、Phase 2：Dashboard（1.5 周）

### 3.1 布局与统计卡片（第 1-2 天）

目标：实现 `§6.1` 和 `§6.2`。

**文件**：`packages/work/src/renderer/pages/Dashboard/`

```tsx
// Dashboard 布局（伪代码）
<DashboardLayout>
  <StatsRow>              {/* 4 个统计卡片 */}
    <StatCard icon="🔄" label="运行中" value={12} trend="+2" />
    <StatCard icon="✅" label="今日成功" value={48} trend="+15%" />
    <StatCard icon="❌" label="今日失败" value={3} trend="-2" />
    <StatCard icon="⏱️" label="平均耗时" value="2.3m" trend="-10%" />
  </StatsRow>
  <FilterBar />           {/* 筛选栏：搜索 + 状态 + 标签 + 排序 */}
  <WorkflowList />        {/* 工作流列表 */}
  <RunHistoryTable />     {/* 运行历史表格 */}
</DashboardLayout>
```

**统计卡片规格**：
- 尺寸：`180px × 96px`，背景 `--hw-bg-card`
- 图标：`24px`，颜色对应状态（运行中蓝、成功绿、失败红、耗时橙）
- 数值：`32px` 加粗 `--hw-fg-primary`
- 趋势：绿色 `↑` / 红色 `↓` + 百分比，12px
- 悬停：阴影加深，背景 `--hw-bg-panel`（250ms ease）
- 点击：跳转对应页面（如「运行中」跳转 `/runs`）

**数据**：mock 数据，从 Helix Core API 获取（Phase 1 后端接口）

### 3.2 工作流列表（第 3-4 天）

目标：实现 `§6.3` 和 `§6.4a`（标签系统）。

**列表项规格**：
- 高度：`72px`，背景 `--hw-bg-card`，圆角 `6px`
- 图标：`40px` 圆形，颜色根据类型（Agent/Workflow/Script）
- 标题：`14px` 加粗，描述 `13px` `--hw-fg-muted`
- 标签：`12px` pill，背景 `--hw-brand-10`，颜色 `--hw-brand`
- 运行按钮：悬浮显示（Play 图标），Primary 样式
- 右键菜单：运行、编辑、复制、导出、删除、查看日志
- 收藏：`⭐` 按钮，收藏后置顶

**筛选栏**：
- 搜索框：`300px` 宽，实时过滤（300ms debounce）
- 状态筛选：全部 / 运行中 / 成功 / 失败 / 草稿（pill 按钮）
- 标签筛选：多选标签，下拉菜单
- 排序：名称 / 最近运行 / 创建时间（升/降）
- 视图切换：列表 / 网格（可选，v1 可先只做列表）

### 3.3 运行历史表格（第 5-6 天）

目标：实现 `§6.5`。

**表格规格**：
- 表头：工作流名称、运行时间、触发方式、状态、耗时、操作
- 状态：运行中（蓝点脉冲）、成功（绿）、失败（红）、取消（灰）
- 行高：`48px`，hover 背景 `--hw-bg-hover`
- 分页：每页 20 条，底部页码导航
- 批量操作：多选后显示批量操作栏（重试、删除、导出）
- 行点击：展开运行详情（内嵌展开，非跳转）

### 3.4 空状态（第 7 天）

目标：实现 `§6.7`。

- 无工作流：图标 `📋`，标题「暂无工作流」，按钮「创建第一个工作流」
- 无运行历史：图标 `🔄`，标题「暂无运行记录」
- 搜索无结果：图标 `🔍`，标题「未找到匹配的工作流」

### 3.5 Phase 2 验收标准

- [ ] Dashboard 页面完整，mock 数据填充
- [ ] 统计卡片数值正确，趋势箭头方向正确
- [ ] 工作流列表筛选/排序/搜索工作正常
- [ ] 运行历史表格分页、批量操作正常
- [ ] 所有空状态正确显示
- [ ] 右键菜单和批量操作栏动画正确
- [ ] 响应式：Tablet 时列表宽度自适应，Compact 时隐藏统计卡片（或缩小）

---

## 四、Phase 3：Workflow Editor（3 周）

**这是整个项目最复杂的模块**，涉及 DAG 画布、节点系统、属性面板、运行控制等。

### 4.1 技术选型：DAG 引擎（第 1 天）

**关键决策**：SolidJS 的 DAG 库选择。

**调研任务**：
- 搜索 `solidjs dag` / `solidjs flowchart` / `solidjs graph editor`
- 评估 `@xyflow/react` 的 SolidJS 适配成本
- 若找不到成熟方案，考虑自研（基于 SVG + 事件系统，工作量较大但可控）

**建议方向**：
1. 先尝试用 React 兼容层（如 `solid-react-compat` 或 `preact/compat` 思路）让 `@xyflow/react` 在 SolidJS 中运行
2. 若不可行，基于 `@thisbeyond/solid-dnd` 和 SVG 自研简化版 DAG 引擎（仅支持节点拖拽、连线、基础布局）
3. 自研时参考 `@xyflow/core` 的算法（力导向布局、节点碰撞检测、连线路由）

> **风险控制**：若 1 周内无法让 DAG 画布正常工作，立即降级为「列表式编排」（节点列表 + 顺序配置），保证 Phase 3 不阻塞后续阶段。

### 4.2 节点面板（第 2-4 天）

目标：实现 `§7.2`。

**文件**：`packages/work/src/renderer/pages/WorkflowEditor/NodePanel.tsx`

**布局**：
- 左侧固定 `240px` 面板，背景 `--hw-bg-panel`
- 顶部搜索框（`36px`，实时过滤节点类型）
- 节点分类：Agent / 工具 / 条件 / 循环 / 输入 / 输出
- 每个节点：`64px` 高，图标 + 名称 + 描述，拖拽到画布

**节点类型定义**：
```ts
type NodeType = 
  | 'agent'      // 调用 Agent
  | 'bash'       // 执行 Bash 命令
  | 'condition'  // 条件分支
  | 'loop'       // 循环节点
  | 'input'      // 用户输入
  | 'output'     // 输出结果
  | 'human'      // 人工审批（Phase 6）
  | 'browser'    // 浏览器操作（Phase 6）
  | 'api'        // HTTP 请求（Phase 6）
  | 'mcp'        // MCP 工具（Phase 6）
```

### 4.3 DAG 画布（第 5-10 天）

目标：实现 `§7.3` 和 `§7.3a`。

**核心交互**：
- 画布拖拽：空白处拖拽平移（抓手光标）
- 节点拖拽：从节点面板拖拽到画布，或画布内节点移动
- 连线：拖拽节点输出端点到另一节点输入端点
- 连线样式：贝塞尔曲线，颜色 `--hw-border`，选中时 `--hw-brand`
- 网格：20px 网格点，节点吸附
- 缩放：`Ctrl+滚轮` 缩放，缩放范围 50%~200%
- 选中：单击节点选中，显示边框高亮；框选多选（`Shift+拖拽`）
- 删除：选中后 `Delete` 或右键菜单删除
- 撤销/重做：`Ctrl+Z` / `Ctrl+Shift+Z`（命令模式实现，见 4.5）

**节点渲染**：
- 默认尺寸：`180px × 60px`，圆角 `8px`
- 背景：默认 `--hw-bg-card`，选中 `--hw-brand-20`，运行中 `--hw-info-bg`
- 图标：左侧 `20px`，类型对应颜色
- 名称：居中 `14px` 加粗
- 输入/输出端口：圆点 `8px`，hover 放大到 `12px`

**状态可视化**（`§7.5`）：
- 未运行：默认态
- 运行中：边框 `--hw-info` 脉冲动画（2s infinite）
- 成功：边框 `--hw-success`，背景 `--hw-success-bg`
- 失败：边框 `--hw-error`，背景 `--hw-error-bg`，图标抖动动画（400ms）
- 等待：边框 `--hw-warning` 虚线

### 4.4 属性面板（第 11-13 天）

目标：实现 `§7.4`。

**文件**：`packages/work/src/renderer/pages/WorkflowEditor/PropertyPanel.tsx`

**布局**：
- 右侧 `320px` 面板，背景 `--hw-bg-panel`
- 节点未选中：显示「选择一个节点查看属性」EmptyState
- 节点选中：显示节点配置表单

**表单字段**（按节点类型动态）：
- Agent 节点：选择 Agent（下拉）、Prompt 输入（多行）、Temperature 滑块、Max Tokens 数字输入
- Bash 节点：命令输入（多行）、环境变量（键值对列表）、超时时间
- Condition 节点：条件表达式输入、True/False 分支配置
- Loop 节点：循环变量、迭代列表、最大迭代次数
- 通用：节点名称（文本）、描述（多行）、标签（多选）、是否启用（开关）

**输入组件**：
- 文本输入：`<Input />`
- 多行输入：`<Textarea />`（最小 3 行，最大 10 行）
- 下拉选择：`<Select />`（搜索、分组、多选）
- 滑块：`<Slider />`（min/max/step，显示当前值）
- 开关：`<Switch />`（Kobalte）
- 键值对：动态增删行

### 4.5 撤销/重做与命令模式（第 14-15 天）

目标：实现 `§7.7`。

**设计**：命令模式（Command Pattern）

```ts
interface Command {
  type: 'addNode' | 'removeNode' | 'moveNode' | 'addEdge' | 'removeEdge' | 'updateProperty'
  payload: unknown
  undo: () => void
  redo: () => void
}

// 使用栈管理
const history = createStack<Command>({ maxSize: 50 })
```

**实现**：
- 每次用户操作（添加节点、删除节点、移动节点、修改属性）生成一个 Command 对象
- `history.push(command)`
- `Ctrl+Z`：`history.undo()`
- `Ctrl+Shift+Z`：`history.redo()`
- 状态自动同步到画布（SolidJS 响应式）

### 4.6 运行控制面板（第 16 天）

目标：实现 `§7.6`。

**布局**：画布上方固定栏，高度 `48px`

- 左侧：工作流名称（编辑）+ 保存状态（已保存/未保存）
- 中间：运行按钮（`▶ 运行`）、调试按钮（`🐛 调试`）、停止按钮（`⏹`）
- 右侧：导出（`📤`）、导入（`📥`）、设置（`⚙️`）
- 运行中：显示进度条、当前节点名称、日志入口

### 4.7 自动布局与 DAG 检查（第 17-18 天）

目标：实现 `§7.8` 和 `§7.9`。

**自动布局**：
- 算法：分层布局（Sugiyama）或力导向布局（Fruchterman-Reingold）
- 触发：`Ctrl+Shift+G` 或右键菜单「自动布局」
- 节点间距：水平 `80px`，垂直 `60px`
- 动画：节点移动过渡 `400ms ease`

**DAG 合法性检查**：
- 检查项：环检测、孤立节点、未连接端口、节点数量超限（100 节点）
- 显示：底部状态栏红色提示，错误节点边框红色
- 运行前：必须检查通过才能运行

### 4.8 变量与数据流面板（第 19 天）

目标：实现 `§7.10`。

**变量面板**：
- 工作流级变量：名称、类型、默认值、描述
- 节点间数据流：连线时显示数据类型匹配提示（绿色=匹配，红色=不匹配）
- 输入面板：节点输入来自上游节点的哪个输出字段

### 4.9 空状态与模板选择（第 20-21 天）

目标：实现 `§7.11` 和 `§7.11a`。

- 空画布：提示「拖拽节点到此处开始编排」或「查看示例」
- 模板选择 Modal：分类（数据处理 / AI 对话 / 自动化测试 / 自定义）、搜索、最近使用
- 模板加载：点击后自动填充节点和连线到画布

### 4.10 Phase 3 验收标准

- [ ] DAG 画布可正常渲染，节点可拖拽、连线
- [ ] 节点面板搜索过滤正常
- [ ] 属性面板根据节点类型动态显示表单字段
- [ ] 撤销/重做至少支持 50 步历史
- [ ] 运行控制面板按钮状态正确（运行中禁用编辑、停止可用）
- [ ] 自动布局后节点排列整齐，无重叠
- [ ] DAG 检查能检测环和孤立节点
- [ ] 模板选择 Modal 可用，至少 3 个预设模板
- [ ] 响应式：Tablet 时节点面板折叠为图标栏，Compact 时全屏画布

---

## 五、Phase 4：Knowledge Base（1.5 周）

### 5.1 文档上传与列表（第 1-3 天）

目标：实现 `§8.1` `§8.2` `§8.3`。

**文件**：`packages/work/src/renderer/pages/KnowledgeBase/`

**上传区**：
- 拖拽区域：虚线边框，hover 时品牌色高亮
- 支持格式：PDF、DOCX、XLSX、TXT、Markdown（图标区分）
- 上传中：进度条 + 取消按钮
- 上传后：自动解析、分块、索引（后端异步任务）

**文档列表**：
- 布局：左侧 `320px` 文档列表，右侧详情/问答
- 列表项：`72px` 高，图标 + 文件名 + 大小 + 状态 + 时间
- 状态：处理中（脉冲）、已索引（绿）、失败（红）
- 搜索：按文件名、内容搜索
- 筛选：按类型、状态、时间筛选
- 批量操作：多选后删除、重新索引、导出

### 5.2 问答界面（第 4-6 天）

目标：实现 `§8.4`。

**布局**：右侧区域，类似 ChatGPT 界面
- 顶部：知识库名称 + 当前文档范围
- 中部：消息流（用户问题 + Bot 回答，交替显示）
- 底部：输入框 + 发送按钮

**消息气泡**：
- 用户：右侧，品牌蓝背景，白色文字
- Bot：左侧，卡片背景，支持 Markdown、代码块、引用来源
- 引用来源：Bot 消息底部显示「来源：[文档名]」链接，点击跳转文档预览

**输入框**：
- 多行文本，最小 2 行，最大 6 行
- `Ctrl+Enter` 发送
- 发送中：Loading Spinner

### 5.3 文档预览与分块（第 7-8 天）

目标：实现 `§8.5` `§8.6`。

- 文档预览：点击文档后右侧显示文档内容（PDF 用 `pdf.js`，文本直接渲染）
- 分块预览：展开显示文档的分块结果，每块有编号、内容摘要、向量状态
- 高亮：问答中引用的分块在预览中高亮显示

### 5.4 问答历史与空状态（第 9-10 天）

目标：实现 `§8.7` `§8.9`。

- 问答历史：左侧侧边栏可切换显示「文档列表」或「问答历史」
- 历史项：问题摘要 + 时间，点击恢复对话上下文
- 空状态：无文档时显示上传提示，无问答历史时显示欢迎语

### 5.5 Phase 4 验收标准

- [ ] 文档上传成功，列表正确显示状态
- [ ] 问答界面可输入问题，Bot 返回 Markdown 回答（mock 数据）
- [ ] 引用来源可点击跳转文档预览
- [ ] 文档预览支持 PDF 和文本
- [ ] 问答历史可保存和恢复
- [ ] 批量删除和重新索引工作正常

---

## 六、Phase 5：Observability（2 周）

### 6.1 Trace 树（第 1-4 天）

目标：实现 `§9.2` `§9.3`。

**文件**：`packages/work/src/renderer/pages/Observability/`

**Trace 树**：
- 左侧 `400px` 固定区域，可折叠
- 树形结构：Session → Run → Step → Tool Call
- 节点样式：图标 + 名称 + 耗时 + 状态（颜色标识）
- 展开/折叠：单击节点展开子节点，支持全部展开/折叠
- 选中：点击节点后右侧显示详情
- 搜索：按节点名称、工具名称过滤

**数据结构**（mock，后端 Trace API 提供）：
```ts
interface TraceNode {
  id: string
  type: 'session' | 'run' | 'step' | 'tool'
  name: string
  status: 'running' | 'success' | 'failed' | 'waiting'
  duration: number        // ms
  startTime: string      // ISO 8601
  children: TraceNode[]
  metadata: {
    model?: string
    tokens?: number
    cost?: number
  }
}
```

### 6.2 时间线（第 5-6 天）

目标：实现 `§9.4`。

**布局**：右侧详情区域顶部，横向时间轴
- 时间轴：按时间顺序排列节点，宽度表示耗时比例
- 节点：颜色表示状态，hover 显示名称和耗时
- 缩放：`Ctrl+滚轮` 缩放时间轴
- 点击：选中时间轴节点，同步左侧树选中态

### 6.3 Judge 与 AlignmentGuard 卡片（第 7-9 天）

目标：实现 `§9.5` `§9.6`。

**Judge 裁决卡片**（紫色边框）：
- 位置：消息流中（在 Trace 详情中作为事件卡片插入）
- 内容：裁决结果（通过/驳回/存疑/强制回滚）、理由、置信度
- 展开：点击展开查看完整裁决详情
- 关联：点击跳转到对应步骤

**AlignmentGuard 告警卡片**（状态栏脉冲 + 可展开）：
- 位置：状态栏右侧显示脉冲图标（检测到漂移时）
- 展开：点击后弹出卡片，显示文件漂移、兔子洞、分心操作检测
- 详情：受影响文件、建议操作、忽略按钮

### 6.4 日志查看器与实时运行（第 10-12 天）

目标：实现 `§9.7` `§9.8`。

**日志查看器**：
- 类似终端的滚动日志，支持 ANSI 颜色码
- 过滤：按级别（INFO/WARN/ERROR/DEBUG）、按关键词搜索
- 自动滚动：新日志到达时自动滚动到底部（可暂停）
- 导出：导出为 `.log` 文件

**实时运行视图**：
- 运行中的工作流实时显示当前步骤、进度、输出
- SSE 推送：后端通过 EventSource 推送实时状态
- 暂停/继续/停止按钮

### 6.5 性能指标与导出报告（第 13-14 天）

目标：实现 `§9.9` `§9.10`。

**性能指标面板**：
- 折线图：Token 消耗、响应时间、成本趋势
- 柱状图：工具调用频率、错误率
- 饼图：模型使用分布
- 使用图表库：
  - 轻量级：`chart.js` 或 `apexcharts`
  - 极简自研：SVG 手绘风格（若包体积敏感）

**导出报告**：
- 格式：PDF / Markdown / JSON
- 内容：Trace 树、时间线、性能指标、日志摘要
- 触发：顶部「导出」按钮，ConfirmDialog 确认

### 6.6 Phase 5 验收标准

- [ ] Trace 树可渲染多层嵌套结构，展开/折叠正常
- [ ] 时间轴与树节点双向联动
- [ ] Judge 卡片正确显示裁决结果和置信度
- [ ] AlignmentGuard 告警在状态栏正确显示
- [ ] 日志查看器实时滚动，ANSI 颜色正确渲染
- [ ] 实时运行视图通过 SSE 接收数据并更新 UI
- [ ] 性能指标图表正确渲染（至少折线图和柱状图）
- [ ] 报告可导出为 PDF 和 Markdown

---

## 七、Phase 6：飞书会话（1 周）

### 7.1 会话列表（第 1-2 天）

目标：实现 `§10.2`。

**文件**：`packages/work/src/renderer/pages/FeishuChat/`

**布局**：左侧 `280px` 会话列表
- 搜索框：实时过滤（300ms debounce）
- 筛选标签：`全部` / `单聊` / `群聊`
- 列表项：`72px` 高，头像/图标 + 名称 + 最后消息 + 时间 + 未读徽章
- 排序：按最后消息时间倒序
- 加载：首次 Skeleton，滚动分页
- 右键菜单：复制 chat_id、跳转 Session、标记已读、删除记录、导出记录

**数据**：从飞书 Gateway 数据库读取（或后端 API `/api/v1/feishu/chats`）

### 7.2 聊天详情（第 3-4 天）

目标：实现 `§10.3`。

**布局**：右侧自适应区域
- 标题栏：头像/图标 + 名称 + chat_id + 类型 Badge + 关联 Session 链接
- 消息流：虚拟滚动（超过 100 条启用），消息分组按日期
- 消息气泡：
  - 用户：右对齐，品牌蓝背景，白色文字，圆角 `12px 12px 2px 12px`
  - Bot：左对齐，卡片背景，圆角 `12px 12px 12px 2px`
  - 系统：居中，透明背景
- 支持内容：Markdown、代码块、图片缩略图、文件下载按钮
- Session 上下文：Bot 消息底部可展开，显示 session_id、运行时间、模型、工具调用摘要

### 7.3 输入与筛选（第 5-6 天）

目标：实现 `§10.4` `§10.5`。

**输入区**：
- 多行输入框，最小 `48px`，最大 `120px`
- `Ctrl+Enter` 发送，`Shift+Enter` 换行
- 发送提示：「回复将发送到飞书 ${chat_name}」
- 离线禁用：Gateway 未连接时显示警告条，输入区禁用

**筛选与搜索**：
- 全局搜索 `Ctrl+F`：搜索当前会话消息内容，高亮匹配，显示计数
- 时间筛选：日期选择器，跳转对应日期消息
- 消息类型筛选：全部/文本/图片/文件/系统

### 7.4 右键菜单与空状态（第 7 天）

目标：实现 `§10.6` `§10.8`。

**消息右键菜单**：复制文本、复制 chat_id、跳转 Session、查看原始 JSON、删除
**会话列表右键菜单**：复制 chat_id、跳转 Session、标记已读、导出记录、删除记录
**空状态**：
- 无会话：提示「暂无飞书会话」，按钮「检查 Gateway 配置」
- 无消息：提示「暂无消息」
- Gateway 未连接：顶部警告条 + 重试按钮

### 7.5 Phase 6 验收标准

- [ ] 会话列表正确显示，搜索/筛选/排序工作正常
- [ ] 聊天详情消息气泡样式正确（用户右蓝、Bot 左灰）
- [ ] Markdown、代码块、图片、文件正确渲染
- [ ] Session 上下文可展开折叠，跳转正常
- [ ] 输入框发送正常，离线时禁用
- [ ] 全局搜索高亮匹配，计数正确
- [ ] 右键菜单功能正常
- [ ] 3 种空状态正确显示

---

## 八、Phase 7：响应式、可访问性、测试（1 周）

### 8.1 响应式适配（第 1-2 天）

目标：实现 `§11` 全部断点规则。

**断点**：
- Desktop：`> 1024px`，完整布局
- Tablet：`768px ~ 1024px`，右侧面板折叠，侧边导航保留图标
- Compact：`< 768px`，侧边导航隐藏（汉堡菜单），全屏页面

**各页面适配**：
- Dashboard：Tablet 时统计卡片缩小，Compact 时隐藏统计卡片
- Workflow Editor：Tablet 时节点面板折叠，Compact 时全屏画布
- Knowledge Base：Tablet 时文档列表缩至 `240px`，Compact 时仅显示文档列表
- Observability：Tablet 时时间线隐藏，Compact 时仅 Trace 树
- 飞书会话：Tablet 时列表缩至 `240px`，Compact 时仅显示列表，点击后全屏聊天

### 8.2 可访问性（第 3-4 天）

目标：实现 `§11.3`。

- 键盘导航：所有交互元素支持 Tab 焦点、Enter/Space 激活
- 焦点样式：`2px solid --hw-brand`，`outline-offset: 2px`
- ARIA：
  - 消息流：`role="log"` + `aria-live="polite"`
  - 导航：`role="navigation"`，当前项 `aria-current="page"`
  - 对话框：`role="dialog"` + `aria-modal="true"`
  - 按钮：`aria-label`（图标按钮必须）
- 屏幕阅读器：关键操作后播报（如「工作流已保存」）
- 减少动画：`prefers-reduced-motion` 时禁用脉冲/抖动/滑入动画
- 对比度：所有文字对比度 >= 4.5:1（WCAG AA）

### 8.3 性能优化（第 5 天）

- 虚拟滚动：长列表（工作流、文档、消息、Trace 树）使用 `virtua`
- 懒加载：页面级路由懒加载（`@solidjs/router` `lazy`）
- 缓存：`@tanstack/solid-query` 配置合理的 staleTime 和 cacheTime
- 防抖：搜索框、输入框使用 `300ms` debounce
- 节流：窗口 resize、滚动事件使用 `100ms` throttle

### 8.4 端到端测试（第 6-7 天）

目标：实现 `§8` 测试策略。

**测试覆盖**：
- 页面导航：6 个页面切换、快捷键跳转
- Dashboard：筛选、搜索、批量操作
- Workflow Editor：拖拽节点、连线、修改属性、运行工作流
- Knowledge Base：上传文档、问答、查看历史
- Observability：Trace 树展开、时间线缩放、日志查看
- 飞书会话：发送消息、搜索消息、切换会话

**测试工具**：Playwright（已存在于 `packages/app`）

```ts
// 示例测试
import { test, expect } from '@playwright/test'

test('Dashboard workflow list', async ({ page }) => {
  await page.goto('http://localhost:3000/dashboard')
  await expect(page.locator('[data-testid="workflow-list"]')).toBeVisible()
  await page.fill('[data-testid="search-input"]', 'test')
  await expect(page.locator('[data-testid="workflow-item"]')).toHaveCount(1)
})
```

### 8.5 Phase 7 验收标准

- [ ] Desktop/Tablet/Compact 三种宽度下布局正常
- [ ] 所有页面键盘导航可用，焦点样式正确
- [ ] 屏幕阅读器能正确播报页面标题和关键操作
- [ ] `prefers-reduced-motion` 时动画禁用
- [ ] Lighthouse 可访问性评分 >= 90
- [ ] Playwright E2E 测试全部通过（至少覆盖核心流程）
- [ ] 性能指标：首屏加载 < 2s，虚拟滚动列表 1000 条不卡顿

---

## 九、后端 API 接口规划（并行开发）

前端各 Phase 需要后端提供 mock 数据，以下是关键接口规划，由后端同学并行开发：

| 接口 | 方法 | 路径 | 前端依赖 Phase |
|------|------|------|---------------|
| 获取统计指标 | GET | `/api/v1/work/dashboard/stats` | Phase 2 |
| 获取工作流列表 | GET | `/api/v1/work/workflows` | Phase 2 |
| 创建工作流 | POST | `/api/v1/work/workflows` | Phase 2 |
| 获取工作流详情 | GET | `/api/v1/work/workflows/:id` | Phase 3 |
| 更新工作流 | PUT | `/api/v1/work/workflows/:id` | Phase 3 |
| 删除工作流 | DELETE | `/api/v1/work/workflows/:id` | Phase 2 |
| 运行工作流 | POST | `/api/v1/work/workflows/:id/run` | Phase 3 |
| 获取运行历史 | GET | `/api/v1/work/workflows/:id/runs` | Phase 2 |
| 获取运行详情 | GET | `/api/v1/work/runs/:id` | Phase 5 |
| 获取 Trace 树 | GET | `/api/v1/work/traces/:sessionId` | Phase 5 |
| 获取日志 | GET | `/api/v1/work/runs/:id/logs` | Phase 5 |
| 上传文档 | POST | `/api/v1/work/knowledge/documents` | Phase 4 |
| 获取文档列表 | GET | `/api/v1/work/knowledge/documents` | Phase 4 |
| 文档问答 | POST | `/api/v1/work/knowledge/ask` | Phase 4 |
| 获取问答历史 | GET | `/api/v1/work/knowledge/history` | Phase 4 |
| 获取飞书会话列表 | GET | `/api/v1/work/feishu/chats` | Phase 6 |
| 获取飞书消息 | GET | `/api/v1/work/feishu/chats/:id/messages` | Phase 6 |
| 发送飞书消息 | POST | `/api/v1/work/feishu/chats/:id/messages` | Phase 6 |

**mock 策略**：
- Phase 1~2：前端使用本地 mock 数据（JSON 文件或 MSW）
- Phase 3 开始：后端提供真实 API，前端逐步替换

---

## 十、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| **SolidJS DAG 库不成熟** | Phase 3 阻塞 | ① 提前调研（Phase 1 第 1 天）；② 若不可行，降级为列表式编排；③ 或引入 React 兼容层（包体积增加 ~100KB） |
| **Electron 与 Helix Core 进程通信复杂** | Phase 1 阻塞 | ① 复用 `packages/desktop` 的 IPC 架构；② 使用 SSE 而非 WebSocket（更稳定）；③ 独立守护进程模式（参考 VSCode 扩展的 daemon 方案） |
| **长时间任务状态同步** | Phase 5 稳定性 | ① 使用 SQLite 持久化任务队列；② SSE 心跳保活；③ 前端定期轮询（fallback） |
| **Trace 数据量大** | Phase 5 性能 | ① Trace 树分页加载；② 时间线懒渲染；③ 日志虚拟滚动 |
| **文档解析格式兼容性** | Phase 4 阻塞 | ① 优先支持 PDF/TXT/Markdown；② DOCX/XLSX 使用成熟库（`mammoth`/`xlsx`）；③ 不支持时降级为纯文本提取 |
| **飞书 Gateway 离线** | Phase 6 功能缺失 | ① 设计离线禁用态（输入区禁用 + 警告条）；② 前端缓存历史消息；③ 重连后自动同步 |
| **团队人手不足** | 整体延期 | ① 按 Phase 裁剪功能（如 Phase 6 飞书会话可延后）；② 外包部分前端组件；③ 使用低代码工具生成 Dashboard 和 KB 的基础 CRUD 界面 |

---

## 十一、里程碑与检查点

| 周次 | 里程碑 | 检查点 |
|------|--------|--------|
| **第 2 周末** | Phase 1 完成 | 桌面应用可启动，6 个页面空壳，8 个基础组件可用 |
| **第 4 周末** | Phase 2 完成 | Dashboard 完整，mock 数据填充，筛选/搜索/批量操作可用 |
| **第 7 周末** | Phase 3 完成 | DAG 编辑器可拖拽连线，撤销/重做，运行控制可用 |
| **第 9 周末** | Phase 4 完成 | 文档上传、问答、预览完整，mock 数据可用 |
| **第 11 周末** | Phase 5 完成 | Trace 树、时间线、Judge 卡片、日志查看器可用 |
| **第 12 周末** | Phase 6 完成 | 飞书会话列表、聊天详情、消息发送可用 |
| **第 13 周末** | Phase 7 完成 | 响应式适配、可访问性、E2E 测试通过 |
| **第 14 周末** | 集成测试 & 发布 | 全链路测试、性能优化、文档更新、打包发布 |

---

## 十二、开发规范

### 12.1 代码结构

```
packages/work/src/renderer/
├── components/           # 全局基础组件（15 个）
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── ...
├── pages/               # 页面级组件（5 大页面）
│   ├── Dashboard/
│   │   ├── index.tsx
│   │   ├── StatsRow.tsx
│   │   ├── WorkflowList.tsx
│   │   ├── ...
│   ├── WorkflowEditor/
│   │   ├── index.tsx
│   │   ├── Canvas.tsx
│   │   ├── NodePanel.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── ...
│   ├── KnowledgeBase/
│   ├── Observability/
│   └── FeishuChat/
├── stores/              # 全局状态（SolidJS Stores）
│   ├── uiStore.ts       # Sidebar, RightPanel, Theme
│   ├── workflowStore.ts # 当前工作流、DAG 状态
│   └── sessionStore.ts  # 用户会话、登录状态
├── hooks/               # 通用 Hooks
│   ├── useBreakpoint.ts
│   ├── useKeyboardShortcut.ts
│   ├── useVirtualList.ts
│   └── useDebounce.ts
├── utils/               # 工具函数
│   ├── cn.ts            # className 合并（clsx + tailwind-merge）
│   ├── format.ts        # 时间、大小、数字格式化
│   └── dag.ts           # DAG 算法（拓扑排序、环检测）
├── types/               # 全局类型
│   └── index.ts
├── styles/              # 全局样式
│   ├── theme.css
│   └── animations.css
└── App.tsx              # 根组件（路由 + 布局）
```

### 12.2 命名规范

- 组件：PascalCase（`WorkflowList.tsx`）
- 文件：与组件名一致
- 类型：PascalCase + `Type` 后缀（如 `WorkflowType`）
- 接口：PascalCase（如 `Workflow`）
- 常量：UPPER_SNAKE_CASE（如 `MAX_NODE_COUNT = 100`）
- Hooks：camelCase + `use` 前缀（如 `useBreakpoint`）
- 工具函数：camelCase（如 `formatDuration`）
- Store：camelCase + `Store` 后缀（如 `uiStore`）

### 12.3 测试规范

- 组件：每个组件至少一个 `.test.tsx`（使用 `happy-dom` + `bun test`）
- 页面：关键用户流程 Playwright E2E 测试
- 覆盖率：核心组件 >= 80%，页面流程 >= 60%
- 测试原则：**不使用 mock 验证业务逻辑**，用真实数据和交互验证

### 12.4 状态管理策略

- **全局 UI 状态**：SolidJS `createStore`（Sidebar 展开、主题、全局搜索）
- **服务器状态**：`@tanstack/solid-query`（工作流列表、文档列表、Trace 数据）
- **本地表单状态**：`createSignal` / `createStore`（属性面板表单、筛选条件）
- **DAG 状态**：自定义 Store（命令模式 + 响应式同步）
- **全局通信**：Event Bus（已有的 `packages/opencode/src/bus/`）或 Context API

---

## 十三、附录

### 13.1 参考文档

- `docs/helix-work-ui-design.md` — UI 设计规范（v1.2）
- `docs/helix-work-implementation-plan.md` — 技术实施方案
- `docs/helix-work-ui-design-review.md` — UI 审查记录
- `AGENTS.md` — 项目架构和风格指南
- `packages/desktop/` — 现有 Electron 桌面应用（参考结构）
- `packages/app/` — 现有 Web UI（SolidJS + Tailwind + Vite，参考配置）
- `packages/opencode/src/server/` — 后端 API（Hono + Effect）

### 13.2 关键依赖版本

| 依赖 | 版本 | 用途 |
|------|------|------|
| `solid-js` | 1.9.10 | 前端框架 |
| `@solidjs/router` | 0.15.4 | 路由 |
| `@tanstack/solid-query` | 5.91.4 | 服务器状态管理 |
| `tailwindcss` | 4.1.11 | 样式 |
| `@kobalte/core` | 0.13.11 | Headless UI 组件 |
| `effect` | 4.0.0-beta.48 | 后端函数式编程 |
| `zod` | 4.1.8 | Schema 验证 |
| `virtua` | 0.42.3 | 虚拟滚动 |
| `@thisbeyond/solid-dnd` | 0.7.5 | 拖拽（DAG） |
| `marked` | 17.0.1 | Markdown 渲染 |
| `shiki` | 3.20.0 | 代码高亮 |
| `luxon` | 3.6.1 | 日期处理 |
| `drizzle-orm` | 1.0.0-beta.19 | 数据库 ORM |
| `hono` | 4.10.7 | HTTP 服务器 |

### 13.3 设计稿截图索引

| 设计图 | 文件名 | 对应章节 |
|--------|--------|----------|
| Dashboard | `work-dashboard-v1.png` | §6 |
| Workflow Editor | `work-workflow-editor-v1.png` | §7 |
| Knowledge Base | `work-knowledge-base-v1.png` | §8 |
| Observability | `work-observability-v1.png` | §9 |
| 飞书会话 | `work-feishu-chat-v1.png` | §10 |
| 全局组件 | `work-components-v1.png` | §4 |
| 主题配色 | `work-theme-v1.png` | §3 |
| 响应式 | `work-responsive-v1.png` | §11 |
| 快捷键 | `work-shortcuts-v1.png` | §12 |
| 对比表 | `work-comparison-v1.png` | §13 |

> 设计图位于 `docs/assets/` 或 `generated-images/` 目录，开发时以实际设计稿为准，本文档中的 ASCII 图仅为结构示意。

---

> **文档版本**：v1.0 | 2026-06-22
> **基于设计稿**：`docs/helix-work-ui-design.md` v1.2
> **作者**：CodeBuddy
> **状态**：草案，待评审后执行
