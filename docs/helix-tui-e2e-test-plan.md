# Helix TUI 真实 LLM E2E 测试方案

> 真实 E2E 测试定义：启动真实后端（`mimo serve`）→ 调用真实 LLM 推理 → 通过 TUI 帧断言验证端到端功能。禁止使用 Mock Server。
>
> 黑盒测试（`blackbox.test.tsx`）使用 Mock Server，用于 CI 快速验证，**不替代 E2E**。

## 现有真实 E2E 测试（`test/e2e-tui-llm.test.tsx`）

已覆盖 Phase 1 核心能力（13 个测试）：

| # | 测试名称 | 验证功能 | 是否真实 LLM |
|---|---------|---------|------------|
| 1 | end-to-end message flow | 用户输入 → 会话创建 → LLM 响应 → TUI 渲染 | 是 |
| 2 | multi-turn conversation | 多轮对话上下文保持 | 是 |
| 3 | tool call rendering | bash 工具调用 + 状态卡片渲染 | 是 |
| 4 | input history | Up/Down 键回退历史 | 是 |
| 5 | mode switch | Tab 键切换模式 | 是（UI 交互） |
| 6 | model switch | F2 切换模型 | 是（UI 交互） |
| 7 | shift+enter | Shift+Enter 换行不发送 | 是（UI 交互） |
| 8 | ask mode scope | Ask 模式不调用文件修改工具 | 是 |
| 9 | plan mode scope | Plan 模式读允许、写禁止 | 是 |
| 10 | backend error catch | 后端返回 error 时前端显示 LLM provider timeout | 边界测试（拦截 fetch） |
| 11 | missing parts | handleSend 处理缺失 parts 不崩溃 | 边界测试（拦截 fetch） |
| 12 | empty parts | handleSend 处理空 parts 数组 | 边界测试（拦截 fetch） |
| 13 | loadMessages skip | 加载消息时跳过缺失 parts 的消息 | 边界测试（拦截 fetch） |

**结论：Phase 1 的 E2E 测试已覆盖核心聊天、多轮、工具、历史、模式、边界场景。但以下 Phase 1 功能尚未被 E2E 覆盖：**

- Session 新建/重命名/删除（话题管理）
- Dialog 交互（权限确认、问题选择）
- 三栏布局（宽屏/窄屏切换）
- 会话自动恢复（localStorage）
- Retry 按钮重试
- 快速连击竞态
- 超长消息/超窄屏边界

---

## Phase 2: 底层链路补全（需要补充的 E2E 测试）

| 测试 ID | 名称 | 输入序列 | 预期断言（帧内容） | 真实 LLM 需求 |
|---------|------|----------|-------------------|-------------|
| P2-E01 | plan_enter 自动切换 | 切换到 Plan 模式 → 发送 "请帮我规划一个 todo 应用" | 帧中出现 `[Plan]` 高亮，后续出现规划内容 | 是 |
| P2-E02 | ReadTool 渲染 | Build 模式下发送 "请读取 README.md 的内容" | 帧中出现 `read` 工具卡片，显示文件路径和内容片段 | 是 |
| P2-E03 | WriteTool 渲染 | Build 模式下发送 "请创建一个 test.txt 文件，内容为 hello" | 帧中出现 `write` 工具卡片，显示文件路径和写入状态 | 是 |
| P2-E04 | EditTool 渲染 | Build 模式下发送 "请编辑 test.txt，将 hello 改为 world" | 帧中出现 `edit` 工具卡片，显示修改范围 | 是 |
| P2-E05 | BashTool 渲染 | Build 模式下发送 "请运行 ls -la 命令" | 帧中出现 `bash` 工具卡片，显示命令和输出 | 是 |
| P2-E06 | Loop 进度条 | Max 模式下发送 "请优化这个函数" | 帧中出现进度条（如 `1/5`）和候选评分 | 是 |
| P2-E07 | 多工具并发 | 发送一个触发多个工具调用的复杂请求 | 帧中同时出现多个工具卡片，状态各自更新 | 是 |

---

## Phase 3: Helix 独有能力外化（需要补充的 E2E 测试）

> **前提条件**：后端必须先实现 Judge/Cardinal/Pre-flight/AlignmentGuard 的事件推送（当前没有 BusEvent，需要先实现）。

| 测试 ID | 名称 | 输入序列 | 预期断言（帧内容） | 真实 LLM 需求 |
|---------|------|----------|-------------------|-------------|
| P3-E01 | Judge 通过 | 发送一个简单正确请求 | 帧中出现紫色边框 Judge 卡片，显示 "通过" | 是 |
| P3-E02 | Judge 驳回 | 发送一个明显错误请求（如 rm -rf /） | 紫色卡片显示 "驳回" 和原因，**不阻塞**后续流 | 是 |
| P3-E03 | Cardinal Block | 发送危险命令 | 红色 Block 卡片，渲染暂停，有 Continue/Stop 按钮 | 是 |
| P3-E04 | Cardinal Pause | 发送可疑命令 | 黄色 Pause 卡片，点击 Continue 后恢复 | 是 |
| P3-E05 | Cardinal Warn | 发送可能出问题的请求 | 橙色 Warn 卡片，不阻塞，可 Dismiss | 是 |
| P3-E06 | Pre-flight 模糊度分析 | 进入 Max 模式发送模糊请求 | 出现 Pre-flight 卡片，显示模糊度选项 | 是 |
| P3-E07 | Pre-flight 快速选择 | 在 Pre-flight 卡片中选择选项 | 卡片消失，继续执行 | 是（UI 交互） |
| P3-E08 | AlignmentGuard 文件漂移 | 长时间对话后偏离原始任务 | 状态栏脉冲圆点，展开显示漂移文件列表 | 是 |
| P3-E09 | AlignmentGuard 兔子洞 | 深入多层子任务 | 卡片显示 "兔子洞警告"，建议返回 | 是 |
| P3-E10 | 多卡片叠加 | 同时触发 Judge + Cardinal + AlignmentGuard | 三个卡片独立渲染，不重叠，各自可交互 | 是 |

---

## Phase 4: 执行可视化与统计（需要补充的 E2E 测试）

| 测试 ID | 名称 | 输入序列 | 预期断言（帧内容） | 真实 LLM 需求 |
|---------|------|----------|-------------------|-------------|
| P4-E01 | AgentStats 实时展示 | 运行一个复杂任务 | 信息面板显示 L0/L1/L2 三层成功率 | 是 |
| P4-E02 | 满意度评估 | 任务完成后点击 👍/👎 | 消息旁出现 👍/👎，点击后 trace 中有反馈记录 | 是 |
| P4-E03 | FSM 状态流转 | 运行一个包含 planning → executing → verifying 的任务 | 状态栏文本依次变化：planning → executing → verifying | 是 |
| P4-E04 | Shadow Worktree 激活 | 运行需要隔离的任务 | 状态栏显示 🌲 高亮，点击展开显示工作区路径 | 是 |
| P4-E05 | Shadow Worktree 清理 | 任务完成后 | 🌲 图标变灰，展开显示 "已清理" | 是 |
| P4-E06 | DPO 反馈写入 | 点击 👍 后检查 trace | trace 日志中验证 `feedback.dpo` 记录存在 | 是（需后端验证） |
| P4-E07 | Stats 动态更新 | 运行任务过程中 | 面板数字从低成功率平滑过渡到高成功率 | 是 |

---

## Phase 5: 高级交互（需要补充的 E2E 测试）

| 测试 ID | 名称 | 输入序列 | 预期断言（帧内容） | 真实 LLM 需求 |
|---------|------|----------|-------------------|-------------|
| P5-E01 | 记忆浏览器检索 | 点击 🧠 标签 → 输入 "test" | 面板显示检索结果列表，含相关性分数 | 是（UI 交互） |
| P5-E02 | FTS5 结果展示 | 检索结果含 FTS5 匹配 | 显示高亮匹配片段 | 是（UI 交互） |
| P5-E03 | Vector 结果展示 | 检索结果含 Vector 匹配 | 显示相似度分数（如 0.92） | 是（UI 交互） |
| P5-E04 | AGENTS.md 查看 | 点击 AGENTS.md 按钮 | 新面板显示规则文本，可滚动 | 是（UI 交互） |
| P5-E05 | AGENTS.md 编辑保存 | 修改规则 → 点击 Save | 后端收到 reload 事件，内容更新 | 是（UI 交互） |
| P5-E06 | 主题切换 | 切换主题 → 捕获帧 | 两次帧的颜色码 ANSI 序列不同 | 是（UI 交互） |
| P5-E07 | 插件注册 | 加载插件 → 查看菜单 | 插件命令出现在菜单中 | 是（UI 交互） |
| P5-E08 | 图片渲染 | 发送图片相关请求 | 终端发送 Kitty 图像序列，帧中出现图像占位符 | 是 |
| P5-E09 | 语音输入 | 点击 🎤 按钮 → 录制 | 文本填入 textarea，可发送 | 是（UI 交互） |

---

## Phase 6: Mimo 通用功能补齐（需要补充的 E2E 测试）

| 测试 ID | 名称 | 输入序列 | 预期断言（帧内容） | 真实 LLM 需求 |
|---------|------|----------|-------------------|-------------|
| P6-E01 | i18n 切换中文 | 切换语言 → 重新渲染 | 帧中出现中文菜单项和提示文本 | 是（UI 交互） |
| P6-E02 | i18n 切换日语 | 切换语言 → 重新渲染 | 帧中出现日语字符，不方框乱码 | 是（UI 交互） |
| P6-E03 | Timeline Fork | 发送消息 A → 点击 Fork → 发送消息 B | 时间线面板显示两个分支节点 | 是（UI 交互） |
| P6-E04 | Timeline 回退 | 点击分支 1 节点 | 消息区恢复到分支 1 状态 | 是（UI 交互） |
| P6-E05 | Frecency 排序 | 输入 3 条历史 → 按 Up | 按频率排序显示历史 | 是（UI 交互） |
| P6-E06 | Stash 保存提示词 | 输入提示词 → 按 Stash 快捷键 → 命名 | Stash 列表出现命名项，点击自动填入 | 是（UI 交互） |
| P6-E07 | 状态栏 Model 对话框 | 点击状态栏 Model 区域 | 弹出模型选择框，选择后状态栏更新 | 是（UI 交互） |
| P6-E08 | 子智能体 Footer | 发送触发子智能体的请求 | Footer 显示子智能体名称和进度条 | 是 |
| P6-E09 | 子智能体完成 | 子智能体任务完成 | Footer 中状态变绿，5 秒后消失 | 是 |
| P6-E10 | 子智能体失败 | 子智能体任务失败 | Footer 中状态变红，可展开错误日志 | 是 |

---

## E2E 测试基础设施（已存在，无需重复建设）

`e2e-tui-llm.test.tsx` 已提供以下基础设施：

| 组件 | 功能 | 状态 |
|------|------|------|
| 后端自动启动 | `beforeAll` 检测并启动 `mimo serve` | 已存在 |
| 后端自动停止 | `afterAll` kill 进程 | 已存在 |
| 健康检查 | 连接前检测 `/global/health` | 已存在 |
| 真实 LLM 调用 | 通过 SDK `session.prompt` 发送真实请求 | 已存在 |
| 帧断言 | `waitForFrame` + `captureCharFrame` | 已存在 |
| 输入模拟 | `mockInput.typeText` / `pressKey` / `pressEnter` | 已存在 |
| 超时控制 | 每个测试 60-90s 超时 | 已存在 |
| 环境变量 | `HELIX_URL` / `MIMOCODE_SERVER_PASSWORD` | 已存在 |

**新增基础设施需求（仅针对后续 Phase）：**

| 需求 | 用途 | 优先级 |
|------|------|--------|
| 后端事件注入（非 mock） | 某些场景（如 Cardinal）需要后端主动发送事件，而非 LLM 触发 | 高 |
| 竞态测试循环 | 快速重复操作 50 次验证稳定性 | 中 |
| 帧区域断言 | 精确断言某个区域（如状态栏、信息面板）的内容 | 中 |
| 内存泄漏检测 | 长时间运行后检查内存占用 | 低 |

---

## 测试执行策略

### 分层执行

| 层级 | 测试文件 | 执行方式 | 频率 | 阻塞 CI |
|------|---------|----------|------|--------|
| L1 单元测试 | `*.test.ts` / `*.test.tsx` | `bun test` | 每次提交 | 是 |
| L2 黑盒测试 | `blackbox.test.tsx` | `bun test`（Mock Server） | 每次提交 | 是 |
| L3 真实 E2E | `e2e-tui-llm.test.tsx` | `HELIX_URL=... bun test` | 每日/PR 合并前 | 否（有后端时运行） |
| L4 真实 API | `e2e-real.test.ts` | `HELIX_URL=... bun test` | 每日/PR 合并前 | 否（有后端时运行） |

### 真实 E2E 运行命令

```bash
# 方式 1：手动启动后端
cd packages/opencode && bun run src/index.ts serve --port 3095
# 另一终端
cd packages/helix-tui && HELIX_URL=http://localhost:3095 MIMOCODE_SERVER_PASSWORD=test123 bun test test/e2e-tui-llm.test.tsx

# 方式 2：自动启动后端
cd packages/helix-tui && bun test test/e2e-tui-llm.test.tsx
# 测试会自动检测并启动 mimo serve
```

---

## 当前状态

- **Phase 1 E2E**：13 个测试已存在，覆盖核心聊天、多轮、工具、历史、模式、边界
- **Phase 1 E2E 盲区**：Session 管理、Dialog 交互、三栏布局、自动恢复、Retry、竞态、边界尺寸
- **Phase 2-6 E2E**：尚未实现，需等后端功能完成后编写
- **Phase 3 阻塞**：Judge/Cardinal/Pre-flight/AlignmentGuard 后端没有 BusEvent，需先实现后端事件推送

---

## 下一步行动

1. **Phase 1 E2E 补测**：为 Session 管理、Dialog 交互、三栏布局、自动恢复、Retry 编写真实 E2E 测试
2. **Phase 2 E2E**：等后端实现工具独立渲染和 Loop 进度后，编写 P2-E01 ~ P2-E07
3. **Phase 3 E2E**：**先实现后端 BusEvent**（Judge/Cardinal/Pre-flight/AlignmentGuard），再编写 P3-E01 ~ P3-E10
4. **Phase 4-6 E2E**：等对应功能实现后编写

> 规则：每个 Phase 的 E2E 测试只能在**后端功能实现后**编写，不能提前写。但可以先设计测试方案。
