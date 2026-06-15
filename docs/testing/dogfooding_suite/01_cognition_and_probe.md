# 验证集 01：环境与探针认知 (Cognition & Probe)

## Task ID: `COG-001`
**Category**: 环境认知 / Project Probing
**Difficulty**: Easy
**Description**: 验证智能体能否在无需用户显式告知的情况下，通过自动探针识别项目的包管理器并执行正确的安装命令。

- **Prompt**:
  > “为当前项目安装 `lodash` 库，并写一个脚本 `src/utils/math.ts` 使用它的 `chunk` 方法。”
- **Initial State**:
  - 当前目录下存在 `bun.lockb` 和 `package.json`。
  - 不存在 `pnpm-lock.yaml` 或 `yarn.lock`。
- **Expected Ground Truth**:
  1. 智能体**必须**调用 `bun add lodash`（或使用内置 npm tool 执行 bun 逻辑）。
  2. 智能体**绝对不能**调用 `npm install`、`pnpm add` 或 `yarn add`。
  3. `src/utils/math.ts` 文件被成功创建并正确使用了 lodash。
- **Architectural Trace**:
  - `TraceReporter` 中应出现 `ProjectProbe` 生成的 System Prompt 约束日志：“This project uses bun. You MUST use 'bun'...”。

---

## Task ID: `COG-002`
**Category**: 框架与 Lint 规约认知
**Difficulty**: Medium
**Description**: 验证智能体能否识别前端框架与代码格式化工具，并在生成代码时遵循相应的强约束。

- **Prompt**:
  > “写一个通用的按钮组件 `src/components/Button`。”
- **Initial State**:
  - `package.json` 中包含 `react` 依赖。
  - 项目根目录存在 `biome.json`。
- **Expected Ground Truth**:
  1. 智能体生成的代码必须是 React 函数式组件及 Hooks 写法，不能是 Vue 或原生 Web Components。
  2. 智能体在完成代码后，必须通过调用或验证 `biome check` / `biome format` 确保代码风格合规。
- **Architectural Trace**:
  - System Prompt 组装阶段，`Instruction.system` 返回的上下文中包含 React 与 Biome 的项目约束。