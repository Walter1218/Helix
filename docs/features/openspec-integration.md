# OpenSpec × Helix 集成方案

## 定位

| 层 | 负责 | 工具 |
|----|------|------|
| 规划层 | 需求定义、spec 维护、变更追踪 | OpenSpec |
| 执行层 | 任务调度、代码执行、验证、提交 | Helix Auto-Dev |
| 反馈层 | 执行结果回写 spec、进化飞轮 | Helix Observability |

## 集成架构

```
OpenSpec specs/          Helix roadmap.json         Helix Pipeline
┌──────────────┐        ┌──────────────┐          ┌──────────────┐
│ auth/spec.md │───────→│ M5-T1        │─────────→│ Execute      │
│ cart/spec.md │        │ M5-T2        │          │ Judge Review │
│ pay/spec.md  │        │ M5-T3        │          │ Build/Test   │
└──────────────┘        └──────────────┘          │ Git Commit   │
       ↑                                          └──────┬───────┘
       │                                                 │
       └─────────────── 回写执行结果 ─────────────────────┘
```

## 具体集成点

### 1. Spec → Roadmap (规划层→执行层)

**converter.ts**: 扫描 `openspec/specs/` 目录，提取待办需求，生成 roadmap 任务

```ts
// script/auto-dev/spec-converter.ts
function specsToRoadmap(specsDir: string): RoadmapTask[] {
  // 读取 openspec/specs/*/spec.md
  // 提取 "## Requirement" 段落
  // 检查是否已有对应实现（grep 代码库）
  // 生成 roadmap 任务
}
```

**触发时机**: scheduler 启动时自动扫描，发现新 spec 时追加到 roadmap

### 2. Roadmap → Execute (执行层)

现有 pipeline 不变：
```
scheduler.ts → 选任务 → Gateway 执行 → Judge 审查 → Git 提交
```

新增：任务执行时读取对应 spec 作为上下文

### 3. Execute → Spec (反馈层)

任务完成后，自动更新 spec：
- 执行成功 → spec 标记 `status: implemented`
- 执行失败 → spec 追加 `## Implementation Notes` 记录失败原因
- Judge 审查结果 → spec 追加 `## Review Notes`

### 4. Spec Delta → 变更追踪

OpenSpec 的核心价值是 spec delta（需求变更追踪）。集成方式：
- 每次任务执行前，生成 spec delta
- 执行后，对比 delta 与实际变更
- 不一致时，通过飞书通知用户

## 实施步骤

| 步骤 | 内容 | 工作量 |
|------|------|--------|
| 1 | 安装 OpenSpec CLI (`npm install -g @fission-ai/openspec`) | 0.5h |
| 2 | 在项目中初始化 `openspec/specs/` 目录 | 0.5h |
| 3 | 为现有功能创建初始 spec（auth-session, auto-dev 等） | 2h |
| 4 | 实现 `spec-converter.ts`：spec → roadmap 任务 | 3h |
| 5 | 修改 scheduler：执行时读取 spec 上下文 | 2h |
| 6 | 实现 spec 回写：执行结果更新 spec | 2h |
| 7 | 飞书通知：spec delta 变更提醒 | 1h |

## 关键决策

1. **Spec 格式**: 遵循 OpenSpec 的 markdown 格式（Requirement + Scenario）
2. **存储位置**: `openspec/specs/` 目录，与代码一起提交
3. **同步策略**: 单向 spec→roadmap，不自动反向（避免循环）
4. **触发方式**: scheduler 每日启动时扫描一次 spec 变更

## 收益

- **需求可追溯**: 每个代码变更都有对应 spec
- **上下文持久**: Agent 每次执行都能读取完整 spec，不依赖聊天记录
- **变更可审查**: spec delta 比 git diff 更容易理解意图
- **团队协作**: 新人通过 spec 了解系统设计，而非代码
