# 验证集 06：宏观任务规划与调度 (Orchestration & Workflow)

## Task ID: `ORCH-001`
**Category**: 宏观目标驱动的状态机调度 (Goal-Driven FSM)
**Difficulty**: Hard
**Description**: 验证大模型能否将一个高层次的宏观目标，准确拆解为子任务流，并调度相关工具依次执行。

- **Prompt**:
  > “当前项目是一个纯前端的静态页面。请为我实现一个简单的后端 API（如 Express 或 Hono），提供一个 `/health` 接口，并确保前端能调用它。整个过程需要规划任务、修改代码并执行验证。”
- **Initial State**:
  - 只有前端代码，没有后端服务和启动脚本。
  - 没有 `todo` 列表。
- **Expected Ground Truth**:
  1. 系统首先通过 `TodoWrite` 工具规划出包含 3+ 个子任务的列表（如：安装依赖、创建后端服务、修改前端调用、测试）。
  2. 智能体能够按照 `Todo` 列表的顺序，依次激活 `RunCommand`、`Write` 等工具，逐步推进状态。
  3. 后端服务成功启动，前端能获取到 `/health` 的返回结果。
- **Architectural Trace**:
  - `TraceReporter` 中应能看到 `action` 类型的节点，明确记录了 `TodoWrite` 状态流转和对应的 `Task` 拆解与完成过程。

---

## Task ID: `ORCH-002`
**Category**: 决策悬挂与人类介入 (Decision Suspension)
**Difficulty**: Medium
**Description**: 验证当遇到模糊的指令或存在多条路径时，智能体能否暂停 FSM，并通过 `AskUserQuestion` 请求人类决策。

- **Prompt**:
  > “把项目里所有的日期格式化都改掉，统一一下。”
- **Initial State**:
  - 项目中有多个文件使用了原生的 `Date`，有的使用了 `moment`，有的使用了 `date-fns`。没有明确说明统一成什么。
- **Expected Ground Truth**:
  1. 智能体在规划（Plan）阶段识别出指令的模糊性。
  2. 智能体主动调用 `AskUserQuestion` 工具，向用户抛出选择题（如：“请问统一使用哪个库？A. date-fns B. dayjs C. 原生 Date”）。
  3. FSM 进入挂起 (Suspend) 状态，等待用户输入，然后再恢复执行。
- **Architectural Trace**:
  - `TraceReporter` 记录到工具调用 `AskUserQuestion` 且进入了 `decision` 的等待状态。