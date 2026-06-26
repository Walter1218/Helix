# Helix TUI 与 MiMo TUI 对齐分析

> 基于 2026-06-26 深度源码调研，覆盖 `packages/helix-tui/` 全部 34 个源文件和 `packages/opencode/src/cli/cmd/tui/` 完整目录。

---

## 1. 架构总览

### 1.1 共享后端

两个 TUI 共享同一个 Helix 引擎后端 (`packages/opencode/src/`)，通过 `@mimo-ai/sdk` 与 HTTP API + SSE 通信。底层 AI 能力零差距。

```
┌─────────────────────────────────────────────────────┐
│              Helix Core Engine (共享)                 │
│  server/ (Hono HTTP + SSE) │ acp/ │ tool/ │ agent/  │
│  memory/ │ mcp/ │ bus/ │ worktree/ │ storage/       │
└──────────┬──────────────────────┬────────────────────┘
           │ HTTP + SSE           │ HTTP + SSE
    ┌──────┴──────┐        ┌──────┴──────┐
    │  MiMo TUI   │        │  Helix TUI  │
    │  (first-party)       │  (独立客户端) │
    │  Worker+RPC  │        │  HTTP直连    │
    │  20+ providers│       │  4 providers │
    │  插件槽系统   │        │  文件插件系统 │
    └─────────────┘        └─────────────┘
```

### 1.2 技术栈对比

| 维度 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| 框架 | SolidJS + OpenTUI | SolidJS + OpenTUI |
| 状态管理 | SolidJS signals + `createStore` + `reconcile` | SolidJS `createSignal` / `createStore` |
| 通信 | Worker thread RPC → 内嵌 HTTP server | HTTP 直连 (`@mimo-ai/sdk`) |
| 包名 | `@mimo-ai/opencode` (内嵌) | `@mimo-ai/helix-tui` (独立包) |
| 入口 | `cli/cmd/tui/thread.ts` → Worker → `app.tsx` | `src/index.ts` → `bootstrap.tsx` → `app.tsx` |
| 语言 | TypeScript (strict) | TypeScript (strict) |
| 构建 | `Bun.build` + binary compile | `Bun.build` + ESM output |

**关键发现：两个 TUI 都使用 SolidJS + OpenTUI，技术栈完全一致。**

---

## 2. 功能差距详细对比

### 2.1 路由系统

| 维度 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| 路由类型 | 3 种: `home`, `session`, `plugin` | 6 种: `home`, `chat`, `project`, `monitor`, `settings`, `plugin` |
| Session 路由 | `sessionID` + `agentID` 精确定位 | `sessionID` 可选，默认自动恢复 |
| Plugin 路由 | ✅ 插件可注册自定义路由 | ✅ 有 plugin route 类型 |
| 路由导航 | `navigate()` + `reconcile()` | 数字键 `1-5` + `navigate()` |

**差距**: Helix TUI 路由更丰富（多了 project/monitor/settings），但 session 路由缺少 `agentID` 支持（无法查看子 agent 消息）。

### 2.2 Context Providers

| Provider | MiMo TUI | Helix TUI | 说明 |
|----------|----------|-----------|------|
| SDK (HTTP+SSE) | ✅ `SDKProvider` | ✅ `SDKProvider` | 基本对齐 |
| Route | ✅ `RouteProvider` | ✅ `RouteProvider` | Helix 更丰富 |
| Theme | ✅ `ThemeProvider` (30+ 主题) | ✅ `ThemeProvider` (1 cyber 主题) | **差距: 主题数量** |
| Dialog | ✅ `DialogProvider` | ✅ `DialogProvider` | 基本对齐 |
| Sync (核心数据) | ✅ `SyncProvider` (~828行) | ❌ 无 | **关键差距** |
| Args | ✅ `ArgsProvider` | ❌ 无 | CLI 参数传递 |
| Language (i18n) | ✅ `LanguageProvider` (17 语言) | ❌ 无 | **关键差距** |
| Keybind | ✅ `KeybindProvider` | ❌ 无 | 快捷键配置 |
| KV Store | ✅ `KVProvider` | ❌ 无 | 持久化键值存储 |
| Event Bus | ✅ `EventProvider` | ❌ 无 | 事件总线桥接 |
| Local State | ✅ `LocalProvider` | ❌ 无 | 模型/agent 循环 |
| Project | ✅ `ProjectProvider` | ❌ 无 | 项目管理 |
| Exit | ✅ `ExitProvider` | ❌ 无 | 优雅退出 |
| Prompt Ref | ✅ `PromptRefProvider` | ❌ 无 | Prompt 引用共享 |
| Prompt Stash | ✅ `PromptStashProvider` | ❌ 无 | Prompt 暂存 |
| Prompt History | ✅ `PromptHistoryProvider` | ❌ 无 | Prompt 历史 (SQL) |
| Frecency | ✅ `FrecencyProvider` | ❌ 无 | 文件频率排序 |
| Thinking | ✅ `ThinkingProvider` | ❌ 无 | 推理显示控制 |
| TuiConfig | ✅ `TuiConfigProvider` | ❌ 无 | TUI 配置 |
| Toast | ✅ `ToastProvider` | ❌ 无 | Toast 通知 |

**总计: MiMo TUI 20+ providers, Helix TUI 4 providers。差距 16 个。**

### 2.3 数据同步层 (最关键差距)

MiMo TUI 的 `SyncProvider` 是整个应用的数据中枢，管理以下状态：

| 数据域 | MiMo TUI (`SyncProvider`) | Helix TUI | 差距 |
|--------|--------------------------|-----------|------|
| Session 列表 | ✅ 实时同步 + 增量更新 | ✅ `loadSessions()` 手动加载 | 实时性 |
| Message/Part | ✅ 二分插入 + 增量 delta | ✅ `addMessage()` 追加 | 效率 |
| Provider 列表 | ✅ 启动时阻塞加载 | ❌ 无 | 缺失 |
| Agent 列表 | ✅ 启动时阻塞加载 | ❌ 无 | 缺失 |
| Command 列表 | ✅ 非阻塞加载 | ❌ 无 | 缺失 |
| Permission | ✅ 实时事件驱动 | ✅ SSE 事件处理 | 基本对齐 |
| Question | ✅ 实时事件驱动 | ✅ SSE 事件处理 | 基本对齐 |
| Todo | ✅ 实时同步 | ❌ 无 | 缺失 |
| Task | ✅ 实时同步 | ❌ 无 | 缺失 |
| Session Status | ✅ busy/idle 实时跟踪 | ✅ `isLoading` signal | 简化版 |
| Session Goal | ✅ 实时同步 | ❌ 无 | 缺失 |
| Session Diff | ✅ 文件变更列表 | ❌ 无 | 缺失 |
| Session CWD | ✅ 实时同步 | ❌ 无 | 缺失 |
| Actor (子 agent) | ✅ 注册 + 状态跟踪 | ✅ `subAgents` signal | 简化版 |
| LSP Status | ✅ 实时同步 | ❌ 无 | 缺失 |
| MCP Status | ✅ 实时同步 | ❌ 无 | 缺失 |
| VCS Info | ✅ 分支信息 | ❌ 无 | 缺失 |
| Instructions | ✅ 指令文件加载 | ❌ 无 | 缺失 |
| Formatter | ✅ 格式化器状态 | ❌ 无 | 缺失 |
| Workflow | ✅ 工作流运行状态 | ❌ 无 | 缺失 |
| Config | ✅ 完整配置 | ✅ `ConfigManager` | 独立实现 |

### 2.4 插件系统

| 维度 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| 插件来源 | npm 包 + 本地文件 | 文件系统目录扫描 |
| 内置插件 | 13 个 (sidebar/home/system) | 无内置插件 |
| Slot 系统 | ✅ 命名 slot (`sidebar_content`, `home_logo` 等) | ❌ 无 |
| 插件 API | 完整: command/route/ui/keybind/kv/state/event/theme/slots | 基础: communication/theme/voice/ui/config/events |
| 生命周期 | load → activate → deactivate → dispose (带超时) | load → activate → deactivate → destroy |
| 权限模型 | ❌ 无 | ✅ 5 种权限 (network/filesystem/system/voice/clipboard) |
| 插件管理 UI | ✅ `/plugins` 命令打开管理界面 | ❌ 无 |

**差距**: MiMo TUI 插件系统更成熟（slot 系统 + 13 个内置插件），Helix TUI 有权限模型但功能更简单。

### 2.5 UI 组件

| 组件 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| Dialog 系统 | ✅ Alert/Confirm/Prompt/Select/ExportOptions/Help | ✅ Alert/Confirm/Prompt/Select |
| Toast | ✅ 完整 toast 系统 | ❌ 无 |
| Command Palette | ✅ `Ctrl+P` 命令面板 | ❌ 无 (计划中) |
| Model Selector | ✅ 对话框选择 | ✅ `F2` 循环 |
| Agent Selector | ✅ 对话框选择 | ❌ 无 |
| Session Browser | ✅ 对话框列表 | ✅ 侧边栏列表 |
| Theme Picker | ✅ 对话框选择 | ❌ 无 |
| Sidebar | ✅ 插件 slot 驱动 (42 字符宽) | ✅ 固定导航 (16/3 字符宽) |
| Session Info | ✅ 侧边栏插件 | ✅ `SessionInfoPanel` (36 字符宽) |
| Status Footer | ✅ 目录/LSP/MCP/权限信息 | ✅ 快捷键 + 路由名 |
| Logo | ✅ ASCII art + 自定义图片 | ✅ ASCII art |
| Starry Background | ✅ 动画星空背景 | ❌ 无 |
| Spinner | ✅ 加载动画 | ❌ 无 |
| Link | ✅ 超链接组件 | ❌ 无 |

### 2.6 会话管理

| 功能 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| 创建会话 | ✅ | ✅ |
| 切换会话 | ✅ | ✅ |
| 重命名会话 | ✅ 对话框 | ✅ 对话框 |
| 删除会话 | ✅ 对话框 + 确认 | ✅ 确认 |
| 自动恢复 | ✅ `--continue` 参数 | ✅ 自动恢复上次会话 |
| Fork 会话 | ✅ 从时间线分叉 | ❌ 无 |
| Timeline | ✅ 消息时间线导航 | ❌ 无 |
| Undo/Redo | ✅ 消息 + 文件变更回滚 | ❌ 无 |
| Share | ✅ 公开分享链接 | ❌ 无 |
| Export | ✅ Markdown 导出 (带选项) | ❌ 无 |
| Compact/Summarize | ✅ 长会话压缩 | ❌ 无 |
| Transcript | ✅ 格式化转录 | ❌ 无 |

### 2.7 输入系统

| 功能 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| 文本输入 | ✅ 完整 textarea | ✅ 基础 textarea |
| @-文件补全 | ✅ 自动补全 + frecency 排序 | ❌ 无 |
| Prompt 历史 | ✅ SQL 持久化 + frecency | ✅ 内存 (max 50) |
| Prompt 暂存 | ✅ stash/restore | ❌ 无 |
| 语音输入 | ✅ VAD + MiMo ASR (WASM) | ✅ 浏览器 SpeechRecognition |
| Shell 模式 | ✅ 命令执行 | ❌ 无 |
| 文件附件 | ✅ 拖拽 + 粘贴 | ❌ 无 |
| 图片附件 | ✅ 图片协议 | ❌ 无 |
| 外部编辑器 | ✅ `$EDITOR` 集成 | ❌ 无 |

### 2.8 高级功能

| 功能 | MiMo TUI | Helix TUI |
|------|----------|-----------|
| Phase 2b (Cardinal/Judge/Alignment) | ✅ | ✅ SSE 事件处理 |
| Phase 3a (SubAgent) | ✅ 子 agent 导航 + 状态 | ✅ 简化版 |
| Phase 3b (Mode Registry) | ✅ 动态 mode 注册 | ✅ SSE mode 更新 |
| Phase 4 (Decomposition/Persona/Stats) | ✅ | ✅ SSE 事件处理 |
| i18n | ✅ 17 语言 | ❌ 无 |
| 快捷键配置 | ✅ KeybindProvider + leader key | ❌ 固定快捷键 |
| 声音通知 | ✅ 完成/错误提示音 | ❌ 无 |
| 滚动加速 | ✅ 可配置 | ❌ 无 |
| Thinking 模式 | ✅ 显示/隐藏推理过程 | ❌ 无 |
| Tool 详情 | ✅ 显示/隐藏工具执行 | ❌ 无 |
| 时间戳 | ✅ 显示/隐藏 | ❌ 无 |
| Scrollbar | ✅ 可切换 | ❌ 无 |

### 2.9 Helix TUI 独有功能

| 功能 | 说明 |
|------|------|
| **Project 路由** | 项目浏览器 (Projects/Tasks/Files 标签) |
| **Monitor 路由** | 系统监控仪表盘 (CPU/Memory/Disk/Network, 5s 刷新) |
| **Settings 路由** | 设置面板 (General/Theme/Network/Plugins/Voice) |
| **Cyberpunk 组件** | GlowButton, NeonText, Panel, ProgressBar, Gauge |
| **Communication 适配器** | 可插拔 HTTP/WebSocket/gRPC 适配器架构 |
| **Plugin 权限模型** | 5 种权限粒度控制 |
| **Voice 服务** | 浏览器原生语音识别 + 合成 |
| **Config Manager** | 独立配置系统 (`~/.config/helix-tui/config.json`) |
| **Trace 系统** | 65+ 事件类型的结构化追踪 |

---

## 3. 对齐规划

### Phase 0: 基础设施 (1-2 天)

**目标**: 建立与 MiMo TUI 等价的 context 基础设施。

| 任务 | 说明 | 优先级 |
|------|------|--------|
| `SyncProvider` | 核心数据同步 store，对标 MiMo TUI 的 828 行实现 | P0 |
| `ToastProvider` | Toast 通知系统 | P1 |
| `LanguageProvider` + i18n | 国际化框架 + 至少 en/zh 两种语言 | P1 |
| `LocalProvider` | 模型/agent 循环状态 | P1 |
| `KeybindProvider` | 可配置快捷键 | P2 |

### Phase 1: 数据层对齐 (2-3 天)

**目标**: 通过 SSE 事件驱动实现实时数据同步。

| 任务 | 说明 | 优先级 |
|------|------|--------|
| SSE 事件扩展 | 处理 todo/task/session_goal/session_diff/session_cwd/lsp/mcp/vcs/workflow 等事件 | P0 |
| Message 二分插入 | 替代当前的追加方式，提升大量消息场景性能 | P1 |
| Provider/Agent/Command 加载 | 启动时从 API 获取并缓存 | P0 |
| Session Diff 跟踪 | 实时显示文件变更列表 | P1 |
| Session Goal 显示 | 在 sidebar 显示当前目标 | P2 |

### Phase 2: 插件系统对齐 (3-5 天)

**目标**: 实现 slot 系统，将 UI 组件化为可插拔插件。

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Slot 系统 | 命名 slot + 渲染优先级 + single_winner 模式 | P0 |
| 内置 sidebar 插件 | context/cwd/files/instructions/lsp/mcp/goal/task/todo | P0 |
| 内置 home 插件 | footer/tips | P1 |
| Plugin Manager UI | `/plugins` 命令管理界面 | P2 |
| 插件 API 扩展 | command/route/ui/keybind/kv/state/event/theme/slots | P1 |

### Phase 3: 交互功能对齐 (3-5 天)

**目标**: 补齐用户直接感知的交互功能。

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Toast 通知 | 替代当前的 console.log | P0 |
| Command Palette | `Ctrl+K` 命令面板 | P0 |
| Agent Selector | 对话框选择 agent | P1 |
| Theme Picker | 对话框切换主题 (30+ 内置) | P1 |
| 会话 Fork | 从时间线分叉 | P2 |
| Timeline | 消息时间线导航 | P2 |
| Undo/Redo | 消息 + 文件回滚 | P2 |
| Export/Share | Markdown 导出 + 分享链接 | P2 |

### Phase 4: 输入增强 (2-3 天)

**目标**: 提升输入体验。

| 任务 | 说明 | 优先级 |
|------|------|--------|
| @-文件补全 | 文件路径自动补全 + frecency 排序 | P0 |
| Prompt 暂存 | stash/restore 草稿 | P1 |
| Shell 模式 | 命令执行模式 | P2 |
| 外部编辑器 | `$EDITOR` 集成 | P2 |
| 文件附件 | 拖拽 + 粘贴 | P2 |
| 语音增强 | 从浏览器 API 迁移到 VAD + MiMo ASR | P2 |

### Phase 5: UX 精细化 (2-3 天)

**目标**: 对齐细节体验。

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Thinking 模式 | 显示/隐藏推理过程 | P1 |
| Tool 详情折叠 | 显示/隐藏工具执行细节 | P1 |
| 时间戳显示 | 可切换 | P2 |
| Scrollbar | 可切换 | P2 |
| 声音通知 | 完成/错误提示音 | P2 |
| 滚动加速 | 可配置加速度 | P2 |
| Starry Background | 动画星空背景 | P3 |
| Spinner | 加载动画 | P3 |

---

## 4. 优先级总览

```
紧急度 ↑
  │
  │  ★ P0: SyncProvider + SSE 扩展 + Slot 系统 + Toast + Command Palette
  │  ★ P1: i18n + 内置插件 + @-补全 + Theme Picker + Agent Selector
  │  ★ P2: Fork/Timeline/Undo + Shell + Export + Thinking 模式
  │  ★ P3: Starry Background + Spinner + 声音通知
  │
  └──────────────────────────────────────→ 影响范围
        基础设施        核心体验        精细化
```

| Phase | 工作量 | 用户感知 |
|-------|--------|----------|
| Phase 0 | 1-2 天 | 不直接可见 |
| Phase 1 | 2-3 天 | 数据实时性提升 |
| Phase 2 | 3-5 天 | UI 模块化，可扩展性 |
| Phase 3 | 3-5 天 | **用户直接感知** |
| Phase 4 | 2-3 天 | 输入体验提升 |
| Phase 5 | 2-3 天 | 细节打磨 |

**总计: 约 3-4 周可完成核心对齐。**

---

## 5. 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 状态管理 | SolidJS signals + `createStore` | 与 MiMo TUI 技术栈一致 |
| SSE 解析 | 复用 `@mimo-ai/sdk` + 扩展事件处理 | 避免重复造轮子 |
| 插件系统 | 保留 Helix 的文件系统插件 + 增加 slot 系统 | 兼容现有插件 |
| i18n | 复用 MiMo TUI 的 `@solid-primitives/i18n` + 语言文件 | 避免翻译重复 |
| 主题 | 保留 cyber 主题 + 导入 MiMo TUI 的 30+ 主题 | 丰富选择 |
| 语音 | 保留浏览器 API + 可选 VAD+ASR | 渐进增强 |

---

## 6. 验收标准

- [ ] `SyncProvider` 实现，所有数据域实时同步
- [ ] SSE 事件覆盖 MiMo TUI 全部 25+ 事件类型
- [ ] Slot 系统实现，sidebar/home 组件可插拔
- [ ] i18n 支持 en/zh 两种语言
- [ ] Toast 通知系统正常工作
- [ ] Command Palette (`Ctrl+K`) 可用
- [ ] @-文件补全可用
- [ ] 主题切换可用 (30+ 主题)
- [ ] Agent 选择器可用
- [ ] 会话 Fork/Timeline 可用
- [ ] Thinking 模式可切换
- [ ] 语音输入正常 (VAD+ASR)

---

*文档更新时间：2026-06-26*
*基于：`packages/helix-tui/` 全量源码 + `packages/opencode/src/cli/cmd/tui/` 全量源码深度调研*
