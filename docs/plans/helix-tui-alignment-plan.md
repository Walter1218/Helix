# Helix TUI 对齐 MiMo TUI 能力开发计划

> 生成日期: 2026-06-26
> 预估总工期: 3-4 周
> 目标: 在保留 Helix TUI Web UI 布局的前提下，对齐 MiMo TUI 的后端消费能力和数据流模式

---

## 重要发现：修正差距分析

经过深入代码审查，原任务描述中的 39 项差距分析**严重过时**。Helix TUI 实际拥有 **245 个源文件、56 个测试文件、20+ 上下文提供者**，远超描述中的"34 文件、4 个上下文提供者"。

### 已存在的能力（原分析误判为缺失）

| 编号 | 能力 | 实际位置 | 说明 |
|------|------|----------|------|
| 1 | SyncProvider | `context/sync.tsx` (619行) + `context/global-sync.tsx` (442行) + 17个子文件 | 完整的响应式数据存储 |
| 2 | EventProvider | `context/global-sdk.tsx` (256行) | SSE 事件流，批量/合并，心跳，重连 |
| 5 | Provider/Agent 加载 | `context/global-sync.tsx` → `GlobalSyncProvider` | 启动时从 API 加载 |
| 11 | Markdown 渲染 | `@mimo-ai/ui/markdown` + `context/marked.tsx` | 完整 Markdown 渲染 |
| 12 | Reasoning 显示 | i18n keys + settings | 已有推理摘要设置 |
| 15 | Diff 查看器 | `pages/session/review-tab.tsx` + layout diffStyle | 完整 diff 视图 |
| 16 | Undo/Redo | session.tsx 中的 revert/unrevert | 已实现 |
| 17 | Session 分享 | i18n keys + dialog 组件 | 已实现 |
| 19 | Session 压缩 | i18n keys + command 注册 | 已实现 |
| 20 | Session 分叉 | `components/dialog-fork.tsx` + i18n | 已实现 |
| 23 | 多行编辑 | `prompt-input.tsx` contenteditable | 已实现 |
| 25 | Slash 命令 | `prompt-input/slash-popover.tsx` | 已实现 |
| 27 | 命令面板 | `context/command.tsx` (434行) | 完整命令注册/匹配/快捷键 |
| 28 | Toast 通知 | `context/notification.tsx` (373行) | 完整通知系统 |
| 29 | i18n | `i18n/` 目录，16 种语言 | 完整国际化 |
| 30 | 快捷键配置 | `components/settings-keybinds.tsx` | 已实现 |
| 31 | 模型选择 | `dialog-select-model.tsx` + `context/models.tsx` | 已实现 |
| 36 | 剪贴板 | `PlatformProvider` | 已实现 |
| 37 | 权限 UI | `context/permission.tsx` (277行) | 自动应答 + 手动审批 |

### 真正缺失的能力（13 项）

| 编号 | 能力 | 优先级 | 依赖 |
|------|------|--------|------|
| 3 | KVProvider（持久化偏好） | P1 | 无 |
| 4 | 插件系统 + Slots | P3 | 无 |
| 6 | Todo/Task/Actor 同步 | P1 | SyncProvider |
| 8 | LSP/MCP/VCS 状态同步 | P1 | SyncProvider |
| 10 | Instructions 加载 | P2 | SyncProvider |
| 14 | 专用工具渲染器（14+ 类型） | P1 | 消息系统 |
| 21 | Session Timeline 对话框 | P2 | Session 数据 |
| 22 | 自动补全（文件/命令） | P2 | 命令系统 |
| 24 | Prompt Stash | P2 | 无 |
| 26 | 文件附件（从提示区） | P2 | 无 |
| 32 | Thinking 模式切换 | P2 | KVProvider |
| 33 | 工具详情切换 | P2 | KVProvider |
| 35 | 滚动条 | P3 | 无 |

---

## 阶段划分

### 第一阶段：数据层对齐（第 1 周）

**目标**: 让 Helix TUI 能消费 MiMo TUI 所消费的全部后端 API 数据

#### 1.1 KVProvider 持久化偏好

**开发任务**:
- 创建 `context/kv.tsx`，实现跨会话持久化 KV 存储
- 使用 localStorage + 文件同步（通过 SDK API）实现
- 与 MiMo TUI 的 `kv.json` + 文件锁模式对齐

**文件创建/修改**:
- `packages/app/src/context/kv.tsx` — 新建 KVProvider
- `packages/app/src/app.tsx` — 在 SettingsProvider 之前挂载 KVProvider
- `packages/app/src/context/settings.tsx` — 迁移部分设置到 KVProvider

**测试策略**:
- **单元测试**: `kv.test.ts` — 读写、迁移、并发安全
- **E2E 测试**: 验证设置在页面刷新后持久化

**验收标准**:
- [ ] KVProvider 支持 get/set/ready
- [ ] 跨页面刷新持久化
- [ ] 与 MiMo TUI 的 KV API 签名一致

#### 1.2 Todo/Task/Actor 数据同步

**开发任务**:
- 在 `SyncProvider` 中扩展 `todo`, `task`, `actor` 数据存储
- 订阅 `todo.updated`, `task.created`, `task.updated`, `actor.registered`, `actor.status` SSE 事件
- 实现 `sync.session.todo()`, `sync.session.task()`, `sync.session.actor()` 加载方法
- 在 `GlobalSyncProvider` 中添加 session_todo, session_task, session_actor 子存储

**文件修改**:
- `packages/app/src/context/sync.tsx` — 扩展 store 结构
- `packages/app/src/context/global-sync.tsx` — 添加子存储
- `packages/app/src/context/global-sync/event-reducer.ts` — 添加新事件处理器
- `packages/app/src/pages/session.tsx` — 添加 todo/task/actor 数据加载

**测试策略**:
- **单元测试**: `event-reducer.test.ts` — 新增 todo/task/actor 事件 reducer 测试
- **单元测试**: `session-cache.test.ts` — 缓存策略测试
- **E2E 测试**: 创建 session → 发送消息 → 验证 todo 列表实时更新

**验收标准**:
- [ ] `sync.data.todo[sessionID]` 返回正确的 Todo 列表
- [ ] `sync.data.task[sessionID]` 返回正确的 Task 列表
- [ ] `sync.data.actor[sessionID]` 返回正确的 Actor 列表
- [ ] SSE 事件实时更新上述数据
- [ ] 与 MiMo TUI 的 SyncProvider store 结构一致

#### 1.3 LSP/MCP/VCS 状态同步

**开发任务**:
- 在 `GlobalSyncProvider` 中扩展 `lsp`, `mcp`, `vcs` 数据
- 订阅 `lsp.updated`, `mcp.tools.changed` SSE 事件
- 实现 `sync.lsp.status()`, `sync.mcp.status()`, `sync.vcs.get()` 方法
- 添加 `GET /lsp`, `GET /mcp/`, `GET /vcs` API 调用

**文件修改**:
- `packages/app/src/context/global-sync.tsx` — 扩展 store
- `packages/app/src/context/global-sync/event-reducer.ts` — 新事件处理器
- `packages/app/src/context/global-sync/bootstrap.ts` — 非阻塞加载

**测试策略**:
- **单元测试**: LSP/MCP/VCS 事件 reducer 测试
- **E2E 测试**: 连接真实服务器 → 验证 LSP 状态显示

**验收标准**:
- [ ] `globalSync.data.lsp` 返回 LSP 服务器状态
- [ ] `globalSync.data.mcp` 返回 MCP 服务器状态
- [ ] `globalSync.data.vcs` 返回分支信息
- [ ] 事件驱动实时更新

#### 1.4 Instructions 加载

**开发任务**:
- 在 `SyncProvider` 中添加 instructions 数据
- 实现 `sync.instructions.load()` 方法
- 订阅 `tui.instructions.loaded` 事件

**文件修改**:
- `packages/app/src/context/sync.tsx` — 扩展
- `packages/app/src/context/global-sync/bootstrap.ts` — 非阻塞加载

**测试策略**:
- **单元测试**: instructions 加载测试
- **E2E 测试**: 验证 AGENTS.md 内容加载

**验收标准**:
- [ ] `sync.data.instructions` 返回项目指令内容
- [ ] 指令变更时自动刷新

---

### 第二阶段：消息渲染对齐（第 2 周前半）

**目标**: 实现 MiMo TUI 级别的消息渲染能力

#### 2.1 专用工具渲染器（14+ 类型）

**开发任务**:
- 创建 `pages/session/tool-renderers/` 目录
- 实现 14 种工具专用渲染器：

| 工具 | 渲染模式 | 说明 |
|------|----------|------|
| `bash` | BlockTool | 命令 + 可折叠输出 |
| `read` | InlineTool + 文件列表 | 加载的文件 |
| `write` | BlockTool + 语法高亮 | 代码 + 诊断 |
| `edit` | BlockTool + diff 视图 | 变更差异 |
| `apply_patch` | BlockTool + diff 视图 | 补丁差异 |
| `glob` | InlineTool | 匹配计数 |
| `grep` | InlineTool | 匹配计数 |
| `webfetch` | InlineTool | 网页抓取 |
| `codesearch` | InlineTool | 结果计数 |
| `websearch` | InlineTool | 结果计数 |
| `actor` | InlineTool + 可点击 | 子代理详情 |
| `task` | InlineTool | 工作项 |
| `question` | InlineTool | 问题 |
| `skill` | InlineTool | 技能 |
| (fallback) | InlineTool/BlockTool | 通用 |

**文件创建**:
- `packages/app/src/pages/session/tool-renderers/index.tsx` — 注册表
- `packages/app/src/pages/session/tool-renderers/bash.tsx`
- `packages/app/src/pages/session/tool-renderers/read.tsx`
- `packages/app/src/pages/session/tool-renderers/write.tsx`
- `packages/app/src/pages/session/tool-renderers/edit.tsx`
- `packages/app/src/pages/session/tool-renderers/apply-patch.tsx`
- `packages/app/src/pages/session/tool-renderers/glob.tsx`
- `packages/app/src/pages/session/tool-renderers/grep.tsx`
- `packages/app/src/pages/session/tool-renderers/webfetch.tsx`
- `packages/app/src/pages/session/tool-renderers/codesearch.tsx`
- `packages/app/src/pages/session/tool-renderers/websearch.tsx`
- `packages/app/src/pages/session/tool-renderers/actor.tsx`
- `packages/app/src/pages/session/tool-renderers/task.tsx`
- `packages/app/src/pages/session/tool-renderers/question.tsx`
- `packages/app/src/pages/session/tool-renderers/skill.tsx`
- `packages/app/src/pages/session/tool-renderers/generic.tsx`

**修改文件**:
- `packages/app/src/pages/session.tsx` — 集成工具渲染器分发

**测试策略**:
- **单元测试**: 每个渲染器的快照测试 + 状态变化测试
- **E2E 测试**: 发送包含 bash 工具调用的消息 → 验证命令/输出正确渲染
- **E2E 测试**: 发送包含 edit 工具调用的消息 → 验证 diff 视图渲染
- **E2E 测试**: 发送包含 actor 工具调用的消息 → 验证子代理详情显示

**验收标准**:
- [ ] 14 种工具类型全部有专用渲染器
- [ ] bash 工具显示命令 + 可折叠输出
- [ ] write/edit/apply_patch 显示语法高亮 diff
- [ ] actor 工具可点击导航到子代理
- [ ] 未知工具类型 fallback 到通用渲染器
- [ ] 渲染器与 MiMo TUI 的 PART_MAPPING 对齐

#### 2.2 Thinking 模式切换 + 工具详情切换

**开发任务**:
- 创建 `context/thinking.ts` — thinkingMode (show/hide) + KV 持久化
- 创建工具详情切换逻辑 — 控制工具输出的展开/折叠默认状态
- 在设置面板添加切换控件

**文件创建/修改**:
- `packages/app/src/context/thinking.ts` — 新建
- `packages/app/src/context/kv.tsx` — 存储 thinking/tool 偏好
- `packages/app/src/components/settings-general.tsx` — 添加切换控件
- `packages/app/src/pages/session/tool-renderers/` — 响应 thinkingMode

**测试策略**:
- **单元测试**: thinking mode 切换 + 持久化测试
- **E2E 测试**: 切换 thinking mode → 刷新 → 验证设置持久化

**验收标准**:
- [ ] Thinking 模式可切换 (show/hide)
- [ ] 工具详情可切换 (展开/折叠)
- [ ] 设置持久化到 KV
- [ ] 与 MiMo TUI 的 useThinkingMode 行为一致

---

### 第三阶段：输入系统增强（第 2 周后半）

**目标**: 实现 MiMo TUI 级别的输入体验

#### 3.1 自动补全（文件/命令/Agent）

**开发任务**:
- 扩展 `prompt-input/slash-popover.tsx` 支持 `@` 文件补全和 `$` Agent 补全
- 实现 frecency 评分（参考 MiMo TUI 的 `prompt/frecency.tsx`）
- 集成 MCP 资源到 `@` 补全
- 实现模糊匹配（使用 fuzzysort 或类似库）

**文件修改**:
- `packages/app/src/components/prompt-input/slash-popover.tsx` — 扩展补全类型
- `packages/app/src/components/prompt-input.tsx` — 添加 `@` 和 `$` 触发器
- 新建 `packages/app/src/context/frecency.ts` — 文件 frecency 评分

**测试策略**:
- **单元测试**: 模糊匹配算法测试
- **单元测试**: frecency 评分测试
- **E2E 测试**: 输入 `@` → 验证文件列表弹出 → 选择文件 → 验证附件

**验收标准**:
- [ ] `@` 触发文件补全（支持 frecency 排序）
- [ ] `$` 触发 Agent 补全
- [ ] `/` 触发命令补全（已有，需验证完整性）
- [ ] MCP 资源出现在 `@` 补全中
- [ ] 键盘导航（Up/Down/Tab/Enter/Esc）

#### 3.2 Prompt Stash

**开发任务**:
- 实现 prompt 保存/恢复功能
- 快捷键绑定（参考 MiMo TUI）

**文件创建**:
- `packages/app/src/context/prompt-stash.ts` — 新建

**测试策略**:
- **单元测试**: stash save/pop 测试
- **E2E 测试**: 输入文本 → stash → 清空 → pop → 验证恢复

**验收标准**:
- [ ] Prompt 可暂存和恢复
- [ ] 快捷键绑定正确
- [ ] 与 MiMo TUI 的 PromptStashProvider 行为一致

#### 3.3 文件附件增强

**开发任务**:
- 增强 prompt-input 支持拖拽文件、粘贴图片/PDF
- 实现 MIME 类型检测和 base64 编码
- 虚拟文本显示（`[Image N]`/`[PDF N]`）

**文件修改**:
- `packages/app/src/components/prompt-input/attachments.ts` — 增强
- `packages/app/src/components/prompt-input/image-attachments.tsx` — 增强

**测试策略**:
- **单元测试**: MIME 检测、base64 编码测试
- **E2E 测试**: 粘贴图片 → 验证预览 → 发送 → 验证后端接收

**验收标准**:
- [ ] 支持拖拽文件附件
- [ ] 支持粘贴图片/PDF
- [ ] 虚拟文本正确显示
- [ ] 与 MiMo TUI 的 paste.ts 行为一致

---

### 第四阶段：Session 高级功能（第 3 周前半）

**目标**: 实现 MiMo TUI 的 session 管理能力

#### 4.1 Session Timeline 对话框

**开发任务**:
- 创建 timeline 对话框，显示 session 消息时间线
- 支持从特定消息点分叉
- 支持消息搜索和跳转

**文件创建**:
- `packages/app/src/components/dialog-timeline.tsx` — 新建

**文件修改**:
- `packages/app/src/context/command.tsx` — 注册 timeline 命令

**测试策略**:
- **单元测试**: timeline 数据排序/过滤测试
- **E2E 测试**: 打开 timeline → 搜索消息 → 点击跳转

**验收标准**:
- [ ] Timeline 对话框显示消息时间线
- [ ] 支持消息搜索
- [ ] 支持从特定消息点分叉
- [ ] 与 MiMo TUI 的 DialogForkFromTimeline 对齐

#### 4.2 Session 导出

**开发任务**:
- 实现 session 导出功能（Markdown/JSON 格式）
- 支持选择性导出（包含/排除 thinking、工具详情）
- 参考 MiMo TUI 的 `formatTranscript()`

**文件创建**:
- `packages/app/src/utils/transcript.ts` — 导出格式化

**文件修改**:
- `packages/app/src/context/command.tsx` — 注册 export 命令

**测试策略**:
- **单元测试**: transcript 格式化测试
- **E2E 测试**: 导出 session → 验证文件内容

**验收标准**:
- [ ] 支持 Markdown 和 JSON 导出
- [ ] 可选择性包含/排除 thinking 和工具详情
- [ ] 与 MiMo TUI 的 formatTranscript 输出一致

---

### 第五阶段：UI 细节对齐（第 3 周后半）

**目标**: 实现 MiMo TUI 的 UI 细节

#### 5.1 滚动条

**开发任务**:
- 为消息列表、侧边栏添加自定义滚动条
- 支持滚动条拖拽跳转

**文件修改**:
- `packages/app/src/pages/session.tsx` — 消息列表滚动条
- `packages/app/src/pages/layout.tsx` — 侧边栏滚动条

**测试策略**:
- **E2E 测试**: 长会话 → 验证滚动条出现 → 拖拽跳转

**验收标准**:
- [ ] 消息列表显示滚动条
- [ ] 滚动条可拖拽
- [ ] 与主题颜色一致

#### 5.2 Timestamps 切换

**开发任务**:
- 添加消息时间戳显示切换
- 使用 KVProvider 持久化偏好

**文件修改**:
- `packages/app/src/pages/session.tsx` — 时间戳显示
- `packages/app/src/components/settings-general.tsx` — 切换控件

**测试策略**:
- **E2E 测试**: 切换时间戳 → 验证显示/隐藏

**验收标准**:
- [ ] 时间戳可切换显示
- [ ] 设置持久化

---

### 第六阶段：插件系统（第 4 周，可选）

**目标**: 实现 MiMo TUI 的插件架构（低优先级）

#### 6.1 Slot 系统

**开发任务**:
- 实现 SolidSlotRegistry（参考 MiMo TUI 的 `plugin/slots.tsx`）
- 定义命名 Slot：`home_logo`, `home_prompt`, `session_prompt`, `sidebar_content`, `app`
- 实现插件注册/注销生命周期

**文件创建**:
- `packages/app/src/plugin/index.ts` — 插件系统入口
- `packages/app/src/plugin/slots.tsx` — Slot 注册表
- `packages/app/src/plugin/api.tsx` — 插件 API
- `packages/app/src/plugin/runtime.ts` — 插件生命周期

**测试策略**:
- **单元测试**: Slot 注册/渲染测试
- **单元测试**: 插件生命周期测试

**验收标准**:
- [ ] Slot 注册/渲染正常
- [ ] 插件可激活/停用
- [ ] 与 MiMo TUI 的 TuiPluginApi 兼容

---

## 测试基础设施增强

### 现有测试基础设施

Helix TUI 已有：
- 56 个单元测试文件（`bun:test` + happydom）
- Playwright E2E 配置（`e2e/todo.spec.ts` 占位）
- Mock 服务（`services/mock/`）

### 需要增强的部分

#### T1: Mock Server 增强

**开发任务**:
- 创建 `test/helpers/mock-server.ts` — 可配置的 mock HTTP/SSE 服务器
- 支持 16+ 场景类型（参考任务描述中的 `createMockServer()`）
- 支持 SSE 事件注入

**文件创建**:
- `packages/app/test/helpers/mock-server.ts`
- `packages/app/test/helpers/sse-broker.ts`
- `packages/app/test/helpers/fixtures.ts`

#### T2: Real LLM E2E 测试框架

**开发任务**:
- 创建 `test/e2e/real-server.ts` — 连接真实运行服务器的 E2E 测试
- 创建 `test/e2e/helpers.tsx` — 测试辅助工具（渲染、断言、等待）
- 创建 `test/e2e/frame-assert.ts` — UI 帧断言工具

**文件创建**:
- `packages/app/test/e2e/real-server.ts`
- `packages/app/test/e2e/helpers.tsx`
- `packages/app/test/e2e/frame-assert.ts`
- `packages/app/test/e2e/session-flow.test.tsx` — 完整 session 流程 E2E

#### T3: 对齐 MiMo TUI 测试模式

**开发任务**:
- 引入 TestLLMServer 模式（队列式 mock LLM）
- 引入 ScriptedLLMServer 模式（脚本式响应序列）
- 参考 `packages/opencode/test/lib/llm-server.ts` 和 `scripted-llm-server.ts`

**文件创建**:
- `packages/app/test/helpers/test-llm-server.ts`
- `packages/app/test/helpers/scripted-llm-server.ts`

---

## 验收矩阵

| 阶段 | Mock 测试 | Real LLM E2E | 验收项数 |
|------|-----------|--------------|----------|
| 1: 数据层 | 12 个单元测试 | 4 个 E2E | 16 |
| 2: 消息渲染 | 20 个单元测试 | 6 个 E2E | 14 |
| 3: 输入系统 | 8 个单元测试 | 4 个 E2E | 12 |
| 4: Session 高级 | 4 个单元测试 | 3 个 E2E | 8 |
| 5: UI 细节 | 2 个单元测试 | 2 个 E2E | 4 |
| 6: 插件系统 | 6 个单元测试 | 0 个 E2E | 3 |
| **总计** | **52 个测试** | **19 个 E2E** | **57** |

---

## 依赖关系图

```
Phase 1.1 (KVProvider)
    ├── Phase 2.2 (Thinking/Tool toggle)
    ├── Phase 3.2 (Prompt Stash)
    └── Phase 5.2 (Timestamps toggle)

Phase 1.2 (Todo/Task/Actor sync)
    └── Phase 4.1 (Timeline dialog)

Phase 1.3 (LSP/MCP/VCS sync)
    └── (独立，无下游依赖)

Phase 2.1 (Tool renderers)
    └── (独立，无下游依赖)

Phase 3.1 (Autocomplete)
    └── (独立，无下游依赖)

Phase 6 (Plugin system)
    └── Phase 1.1 (KVProvider) — 可选依赖
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| MiMo TUI API 签名变更 | 高 | 使用 SDK 类型定义，编译时检查 |
| SSE 事件 schema 变更 | 高 | 使用 Zod 验证，添加运行时检查 |
| 工具渲染器性能 | 中 | 虚拟化长输出，懒加载 |
| 插件系统复杂度 | 低 | 作为可选阶段，不影响核心功能 |

---

## 关键架构决策

1. **数据流一致性**: Helix TUI 的 `SyncProvider` + `GlobalSyncProvider` 模式与 MiMo TUI 对齐，通过 SSE 事件驱动更新
2. **组件复用**: 工具渲染器使用 `packages/ui` 共享组件，保持视觉一致性
3. **测试策略**: 三层测试（单元 → Mock → Real E2E），确保业务逻辑正确性
4. **渐进增强**: 每个阶段独立可交付，不阻塞其他阶段
5. **KV 持久化**: 统一使用 KVProvider 存储用户偏好，替代分散的 localStorage 调用
