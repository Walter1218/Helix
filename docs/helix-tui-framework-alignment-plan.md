# Helix TUI 框架层对齐改造方案

> 目标：框架层 (Context/Store/Plugin/i18n/Toast/Keybind) 与 MiMo TUI 对齐，UI 外观保持 Helix 风格。
>
> 基于 2026-06-26 更新：helix-tui 源码 (34 文件, 4565 行)、MiMo TUI 源码 (27086 行)、后端 API (58 模块, 100+ 路由, 60+ SSE 事件) 深度对比。

---

## 改造总览

### 依赖关系图

```
Phase 0: 基础设施 (无依赖)
├── createSimpleContext  (已有, 需增强)
├── ToastProvider         (新建)
├── KVProvider            (新建)
└── i18n 框架 + 语言文件   (新建)

Phase 1: 数据层 (依赖 Phase 0)
├── SyncProvider          (新建, 核心)
├── LocalProvider         (新建)
├── EventProvider         (新建)
└── ExitProvider          (新建)

Phase 2: 插件系统 (依赖 Phase 0+1)
├── Slot 系统             (新建)
├── Plugin API            (新建)
├── Plugin Runtime        (改造现有)
└── 内置插件              (新建)

Phase 3: 交互增强 (依赖 Phase 0+1)
├── KeybindProvider       (新建)
├── Command Palette       (新建)
├── Prompt 增强           (改造现有)
└── Voice 增强            (改造现有)

Phase 4: 路由增强 (依赖 Phase 1+2)
├── AgentID 路由支持       (改造)
├── Plugin 路由渲染        (新建)
└── Session Fork/Timeline  (新建)
```

---

## Phase 0: 基础设施 (1-2 天)

### 0.1 增强 createSimpleContext

现有 `src/context/helper.tsx` 已实现基础版本，需确认支持 `ready` guard。

**文件**: `src/context/helper.tsx` — 检查并补齐

### 0.2 ToastProvider

**新建文件**: `src/ui/toast.tsx`

从 MiMo TUI 的 `packages/opencode/src/cli/cmd/tui/ui/toast.tsx` 移植，适配：
- 移除 `useLanguage` 依赖 (Phase 0 时 i18n 还没就绪，先硬编码英文)
- 保留 `useTheme` 依赖 (已有)
- API: `useToast()` → `{ show(options), error(err), currentToast }`
- ToastOptions: `{ title?, message, variant: "info"|"warning"|"error"|"success", duration? }`

**改造**: `src/bootstrap.tsx` — 在 DialogProvider 外层加 ToastProvider

### 0.3 KVProvider

**新建文件**: `src/context/kv.tsx`

从 MiMo TUI 的 `packages/opencode/src/cli/cmd/tui/context/kv.tsx` 移植，适配：
- 将 `Global.Path.state/kv.json` 改为 `~/.config/helix-tui/state/kv.json`
- 移除 `Flock` 依赖 (helix-tui 是单进程，不需要跨进程锁)
- 保留 `createStore` + file persistence 模式
- API: `useKV()` → `{ ready, store, signal(name, default), get(key), set(key, value) }`

**改造**: `src/bootstrap.tsx` — 在 SDKProvider 外层加 KVProvider

### 0.4 i18n 框架

**新建文件**:
- `src/i18n/locales.ts` — 复制 MiMo TUI 的 7 语言定义 (en/zh/zht/ja/es/fr/ru)
- `src/i18n/en.ts` — 精简版英文翻译 (~100 个 key，覆盖 helix-tui 现有 UI 文案)
- `src/i18n/zh.ts` — 精简版中文翻译
- `src/context/language.tsx` — 从 MiMo TUI 移植，适配：
  - 移除 `useKV` 依赖改为 `useKV` (Phase 0.3 已就绪)
  - 移除 `@mimo-ai/ui` 的 I18nProvider 桥接 (helix-tui 不用 ui 包)
  - 保留 `@solid-primitives/i18n` 的 translator 模式
  - API: `useLanguage()` → `{ preference, effective, t(key, params?), setLocale(next), locales, label(locale) }`

**改造**: `src/bootstrap.tsx` — KVProvider 之后加 LanguageProvider
**改造**: 所有硬编码英文文案替换为 `t()` 调用

### 0.5 Provider 树更新

**改造**: `src/bootstrap.tsx`

```tsx
<SDKProvider url={url} directory={config?.directory} headers={authHeader}>
  <KVProvider>
    <LanguageProvider>
      <ThemeProvider>
        <ToastProvider>
          <DialogProvider>
            <RouteProvider>
              <App />
            </RouteProvider>
          </DialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </LanguageProvider>
  </KVProvider>
</SDKProvider>
```

---

## Phase 1: 数据层 (2-3 天)

### 1.1 SyncProvider (核心)

**新建文件**: `src/context/sync.tsx`

这是最大的工作量。从 MiMo TUI 的 828 行 `sync.tsx` 移植，需要：

**保留的核心逻辑**:
- `createStore` 数据结构 (session/message/part/permission/question/todo/task/actor/workflow)
- SSE 事件订阅 (~25 种事件类型)
- `Binary.search` 用于有序数组插入
- `produce`/`reconcile` 用于不可变更新
- `bucketMessages` 消息分组
- 两阶段加载 (blocking: providers/agents/config; non-blocking: sessions/commands/lsp/mcp)

**需要适配的部分**:
- 移除 `useProject` 依赖 → 使用 helix-tui 的 `directory` prop
- 移除 `useEvent` 依赖 → 直接使用 `useSDK().subscribe`
- 移除 `useArgs` 依赖 → 使用 helix-tui 的 config props
- 移除 `useExit` 依赖 → 使用 onCleanup
- `Snapshot` 类型 → 从 `@mimo-ai/sdk/v2` 导入或本地定义
- `Binary` → 从 `@mimo-ai/shared/util/binary` 导入 (已是 workspace 依赖)

**API**:
```ts
useSync() → {
  data,           // 原始 store
  status,         // "loading" | "partial" | "complete"
  session: {
    get(id),      // 获取 session
    refresh(),    // 刷新列表
    status(id),   // 获取 session 状态
    sync(id),     // 同步 session 数据 (messages/parts/todo/diff/actors)
  },
  bootstrap(),    // 重新加载所有数据
}
```

**改造**: `src/routes/chat.tsx` — 从 `useSync()` 读取 session/message/part 数据，替代当前的手动 `loadSessions()`/`addMessage()` 模式

### 1.2 LocalProvider

**新建文件**: `src/context/local.tsx`

从 MiMo TUI 移植，适配：
- 模型偏好持久化 → 使用 Phase 0.3 的 `useKV` 替代 `Global.Path.state/model.json`
- 移除 `useArgs` 依赖
- 移除 `useSDK` 中的 provider 列表 → 从 `useSync().data.provider` 获取
- API: `useLocal()` → `{ model: { current, cycle, set, parsed, ... }, agent: { list, current, set, move, color } }`

**改造**: `src/app.tsx` — 包裹 LocalProvider
**改造**: `src/routes/chat.tsx` — 使用 `useLocal().model` 替代当前的 `currentModel` signal

### 1.3 EventProvider

**新建文件**: `src/context/event.ts`

从 MiMo TUI 移植，适配：
- 使用 `useSDK().subscribe` 作为事件源
- 按 directory/workspace 过滤事件
- API: `useEvent()` → `{ subscribe(handler), on(type, handler) }`

### 1.4 ExitProvider

**新建文件**: `src/context/exit.tsx`

从 MiMo TUI 移植，简化版：
- 监听 `onCleanup` 确保 renderer 正确销毁
- 重置终端状态
- API: `useExit()` → `{ exit() }`

---

## Phase 2: 插件系统 (3-5 天)

### 2.1 Slot 系统

**新建文件**: `src/plugin/slots.tsx`

从 MiMo TUI 的 `slots.tsx` 移植，适配：
- 使用 `@opentui/solid` 的 `createSlot` + `createSolidSlotRegistry`
- 定义 helix-tui 的 slot map:
  ```ts
  type HelixSlotMap = {
    sidebar_title: object
    sidebar_content: object
    sidebar_footer: object
    home_header: object
    home_content: object
    home_footer: object
    chat_header: object
    chat_footer: object
    app: object
  }
  ```
- API: `setupSlots(api)` → `HostSlots` (含 `register(plugin)` 方法)

### 2.2 Plugin API

**新建文件**: `src/plugin/api.tsx`

从 MiMo TUI 的 `api.tsx` 移植，适配 helix-tui 的 context:
- `Input` 聚合 helix-tui 已有的: `sdk`, `sync`, `theme`, `dialog`, `toast`, `kv`, `route`, `keybind`, `language`
- 返回 `TuiPluginApi` 对象，包含: `command`, `route`, `ui`, `keybind`, `kv`, `state`, `client`, `event`, `theme`, `slots`, `plugins`, `lifecycle`

### 2.3 Plugin Runtime 改造

**改造文件**: `src/plugin/manager.ts`

将现有的简单文件系统插件管理器升级为完整的 runtime：
- 保留文件系统扫描发现
- 增加: slot 注册、生命周期超时、abort-based cleanup、enabled 状态持久化 (via KV)
- 增加: 内置插件加载 (从 `src/plugin/internal.ts`)
- 增加: `installPlugin(spec)` 热安装
- 移除: 现有的简单 `Permission` 模型 → 使用 MiMo TUI 的 scope-based 权限

**新建文件**: `src/plugin/internal.ts`

定义 helix-tui 内置插件:
- `internal:sidebar-context` — Token/TPS/Cost 面板
- `internal:sidebar-cwd` — 工作目录
- `internal:sidebar-files` — 变更文件列表
- `internal:sidebar-task` — Task 列表
- `internal:sidebar-todo` — Todo 列表
- `internal:sidebar-goal` — 目标显示
- `internal:home-footer` — 版本信息
- `internal:home-tips` — 使用提示

### 2.4 Sidebar 改造

**改造文件**: `src/component/sidebar.tsx`

从固定导航改为 slot 驱动:
```tsx
<box width={42} height="100%">
  <scrollbox>
    <Slot name="sidebar_title" mode="single_winner" />
    <Slot name="sidebar_content" />
  </scrollbox>
  <box flexShrink={0}>
    <Slot name="sidebar_footer" mode="single_winner" />
  </box>
</box>
```

保留 Helix 的导航功能，但移到 sidebar 顶部的固定区域，下方给插件 slot。

---

## Phase 3: 交互增强 (2-3 天)

### 3.1 KeybindProvider

**新建文件**: `src/context/keybind.tsx`

从 MiMo TUI 移植，适配：
- 使用 `useTuiConfig()` 或 helix-tui 的 `useKV` 存储快捷键配置
- Leader key 模式
- API: `useKeybind()` → `{ all, leader, parse(evt), match(key, evt), print(key) }`

### 3.2 Command Palette

**新建文件**: `src/component/dialog-command.tsx`

从 MiMo TUI 移植，适配：
- 命令注册源: 从 `useSync().data.command` + 插件注册获取
- 快捷键: `Ctrl+K` 打开
- 支持 slash 命令补全
- API: `CommandProvider` + `useCommandDialog()` → `{ show(), register(cb), trigger(name), slashes() }`

**改造**: `src/app.tsx` — 包裹 CommandProvider，移除硬编码的 `Ctrl+K` 提示

### 3.3 Prompt 增强

**改造文件**: `src/routes/chat.tsx` 的输入区域

- 输入历史: 从内存 max 50 → SQL 持久化 (可选，先保留内存版)
- Prompt 暂存: 基于 KV 的 stash/restore
- @-文件补全: 需要 `useSync().data.session_cwd` + 文件系统扫描 (较复杂，可后置)

### 3.4 Voice 增强

**改造文件**: `src/voice/service.ts`

从浏览器 SpeechRecognition 迁移到 MiMo TUI 的 VAD + Whisper 方案:
- 移植 `packages/opencode/src/cli/cmd/tui/util/voice.ts`
- 移植 `packages/opencode/src/cli/cmd/tui/util/vad.ts` (WASM VAD)
- 需要: `sox`/`rec`/`arecord` 检测 + Whisper API 调用

---

## Phase 4: 路由增强 (2-3 天)

### 4.1 AgentID 路由

**改造文件**: `src/context/route.tsx`

```ts
type ChatRoute = {
  type: "chat"
  sessionID?: string
  agentID?: string  // 新增: 子 agent 消息查看
}
```

**改造文件**: `src/routes/chat.tsx`
- 支持 `agentID` 切换查看子 agent 消息
- 从 `useSync().data.message[sessionID]` 按 agentID 分桶读取

### 4.2 Plugin 路由渲染

**改造文件**: `src/app.tsx`

在 `<Switch>` 之后渲染插件注册的路由:
```tsx
<Switch>
  <Match when={route.data.type === "home"}><Home /></Match>
  <Match when={route.data.type === "chat"}><Chat /></Match>
  <Match when={route.data.type === "project"}><Project /></Match>
  <Match when={route.data.type === "monitor"}><Monitor /></Match>
  <Match when={route.data.type === "settings"}><Settings /></Match>
</Switch>
{pluginRoutes()}
<Slot name="app" />
```

### 4.3 Session Fork/Timeline

**新建文件**:
- `src/routes/dialog-timeline.tsx` — 消息时间线导航
- `src/routes/dialog-fork-from-timeline.tsx` — 从时间线分叉

需要 `useSync()` 的 message/part 数据 + SDK 的 `session.fork` API。

---

## 文件变更清单

### 新建文件 (15 个)

| 文件 | Phase | 说明 |
|------|-------|------|
| `src/ui/toast.tsx` | 0 | Toast 通知组件 |
| `src/context/kv.tsx` | 0 | 持久化 KV 存储 |
| `src/i18n/locales.ts` | 0 | 17 语言定义 |
| `src/i18n/en.ts` | 0 | 英文翻译 |
| `src/i18n/zh.ts` | 0 | 中文翻译 |
| `src/context/language.tsx` | 0 | i18n Provider |
| `src/context/sync.tsx` | 1 | 核心数据同步 |
| `src/context/local.tsx` | 1 | 模型/Agent 状态 |
| `src/context/event.ts` | 1 | 事件总线桥接 |
| `src/context/exit.tsx` | 1 | 优雅退出 |
| `src/plugin/slots.tsx` | 2 | Slot 系统 |
| `src/plugin/api.tsx` | 2 | Plugin API 工厂 |
| `src/plugin/internal.ts` | 2 | 内置插件定义 |
| `src/context/keybind.tsx` | 3 | 可配置快捷键 |
| `src/component/dialog-command.tsx` | 3 | 命令面板 |

### 改造文件 (6 个)

| 文件 | Phase | 改动 |
|------|-------|------|
| `src/bootstrap.tsx` | 0-1 | Provider 树扩展 (KV → Language → Toast → Sync → Local → Keybind → Command) |
| `src/app.tsx` | 2-4 | Provider 包裹 + Slot 渲染 + Plugin 路由 + Command palette |
| `src/plugin/manager.ts` | 2 | 升级为完整 runtime (slot/lifecycle/内置插件) |
| `src/component/sidebar.tsx` | 2 | 固定导航 → slot 驱动 + 固定导航区 |
| `src/routes/chat.tsx` | 1,4 | 从 useSync() 读数据 + agentID 支持 + prompt 增强 |
| `src/voice/service.ts` | 3 | 浏览器 API → VAD + MiMo ASR |

---

## 估算

| Phase | 工作量 | 交付物 |
|-------|--------|--------|
| Phase 0 | 1-2 天 | Toast + KV + i18n + Provider 树 |
| Phase 1 | 2-3 天 | SyncProvider + LocalProvider + EventProvider |
| Phase 2 | 3-5 天 | Slot 系统 + Plugin API + 内置插件 + Sidebar 改造 |
| Phase 3 | 2-3 天 | Keybind + Command Palette + Voice 增强 |
| Phase 4 | 2-3 天 | AgentID 路由 + Plugin 路由 + Fork/Timeline |

**总计: 10-16 天**

---

## 关键依赖

| 依赖 | 来源 | 状态 |
|------|------|------|
| `@mimo-ai/sdk/v2` | workspace | ✅ 已有 |
| `@mimo-ai/shared/util/binary` | workspace | ✅ 已有 |
| `@solid-primitives/i18n` | npm | ⚠️ 需安装 |
| `@opentui/solid` (createSlot) | catalog | ✅ 已有 |
| `@mimo-ai/plugin/tui` | workspace | ⚠️ 需确认 helix-tui 可引用 |

## 后端 API 参考

SyncProvider 需要消费的后端 API 端点（详见 `packages/opencode/src/server/routes/`）:

| 数据域 | API 端点 | SSE 事件 |
|--------|----------|----------|
| Session | `GET /session/`, `POST /session/` | `session.status`, `session.error`, `session.diff` |
| Message | `GET /session/:id/message` | `message.part.delta`, `message.updated`, `message.removed` |
| Permission | `GET /permission/` | `permission.asked`, `permission.replied` |
| Question | `GET /question/` | `question.asked`, `question.replied`, `question.rejected` |
| Todo | `GET /session/:id/todo` | `session.todo.updated` |
| Task | `GET /session/:id/task` | `task.created`, `task.updated` |
| Actor | `GET /session/:id/actors` | `actor.registered`, `actor.statusChanged` |
| Provider | `GET /provider/` | — |
| Agent | `GET /agent` | — |
| Command | `GET /command` | — |
| Config | `GET /config/` | — |
| LSP | `GET /lsp` | `lsp.updated`, `lsp.diagnostics` |
| MCP | `GET /mcp/` | `mcp.toolsChanged` |
| VCS | `GET /vcs` | `project.vcs.branchUpdated` |
| Workflow | `GET /workflows/` | `workflow.started`, `workflow.phase`, `workflow.finished` |
| Global SSE | `GET /global/event` | 所有实例事件的全局转发 |

完整事件列表见 `packages/opencode/src/server/event.ts` 和各模块的 BusEvent 定义。

---

*文档时间: 2026-06-26 (更新)*
*基于: packages/helix-tui (34 文件, 4565 行) + packages/opencode/src/cli/cmd/tui/ (27086 行) + packages/opencode/src/server/ (58 模块, 100+ 路由) 深度源码调研*
