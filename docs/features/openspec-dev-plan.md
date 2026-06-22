# OpenSpec × Helix 集成开发计划

> 独立开发，不纳入自动调度，预计 3 天完成

## 实现状态

| 组件 | 状态 | 文件 |
|------|------|------|
| OpenSpec CLI | ✅ 已安装 | `@fission-ai/openspec@latest` |
| specs 目录 | ✅ 已创建 | `openspec/specs/` |
| spec-converter.ts | ✅ 已实现 | `script/auto-dev/spec-converter.ts` |
| spec-writer.ts | ✅ 已实现 | `script/auto-dev/spec-writer.ts` |
| judge-enhanced.ts | ✅ 已实现 | `script/auto-dev/judge-enhanced.ts` |
| scheduler.ts 集成 | ✅ 已完成 | `script/auto-dev/scheduler.ts` |
| 集成测试 | ✅ 全部通过 | `script/auto-dev/test-openspec-integration.ts` |

## 核心问题

当前 Judge 和开发 Agent **完全独立，没有共享上下文**：

```
开发 Agent: 执行任务 → 产出 git diff
Judge:      只看 git diff → 判断违规

Judge 不知道: 任务是什么、要改哪些文件、改动的预期效果
```

结果：Judge 只能做启发式检查（断言删除、危险文件），无法判断"改得对不对"。

## 解决方案

**OpenSpec 提供共享上下文**：

```
spec.md (需求) ──→ 开发 Agent: 知道要做什么
               └──→ Judge: 知道预期是什么，对比实际改动
```

## Day 1 (6.26): 基础搭建 + Converter

### 上午: 环境准备 (2h)

```bash
# 1. 安装 OpenSpec CLI
npm install -g @fission-ai/openspec@latest

# 2. 初始化项目
cd /Users/onetwo/Documents/trae_projects/Helix
openspec init

# 3. 为现有功能创建初始 spec
openspec create auth-session
openspec create auto-dev
openspec create feishu-gateway
openspec create judge-agent
```

产出: `openspec/specs/` 目录，4 个 spec.md 文件

### 下午: spec-converter.ts (4h)

**文件**: `script/auto-dev/spec-converter.ts`

**功能**:
1. 扫描 `openspec/specs/*/spec.md`
2. 解析 `## Requirement` 段落
3. 检查代码库是否已有实现 (grep)
4. 生成 roadmap 任务格式

**接口**:
```ts
interface SpecTask {
  specPath: string        // openspec/specs/auth-session/spec.md
  requirement: string     // "Session expiration"
  status: "pending" | "implemented" | "failed"
  estimatedTokens: number
}

function scanSpecs(specsDir: string): SpecTask[]
function mergeIntoRoadmap(tasks: SpecTask[], roadmap: Roadmap): Roadmap
```

**验证**:
```bash
bun run script/auto-dev/spec-converter.ts --dry-run
# 预期输出: 扫描到 N 个需求，生成 M 个任务
```

---

## Day 2 (6.27): 回写 + 通知

### 上午: Spec 回写 (3h)

**文件**: `script/auto-dev/spec-writer.ts`

**功能**: 任务执行后更新 spec 状态

```ts
function updateSpecStatus(
  specPath: string,
  requirement: string,
  result: { success: boolean; output: string; tokensUsed: number }
): void
```

**写入格式**:
```markdown
### Requirement: Session expiration
The system SHALL support configurable session expiration periods.

**Status**: ✅ implemented (2026-06-27)
**Tokens**: 12,345
**Notes**: 冷启动优化到 450ms
```

**集成到 scheduler**:
```ts
// scheduler.ts pipeline 末尾
if (task.specPath) {
  stepSpecWriteback(task, pipeline)
}
```

### 下午: 飞书通知 + 验证 (3h)

**新增通知**: spec 变更时推送到飞书

```ts
function notifySpecChange(chatId: string, changes: SpecChange[]) {
  // 格式: "📝 Spec 更新: auth-session (3 requirements implemented)"
}
```

**端到端验证**:
1. 创建测试 spec → 自动识别为任务
2. 任务执行 → spec 标记 implemented
3. 飞书收到变更通知

---

## 文件结构

```
script/auto-dev/
├── scheduler.ts          # 已有，新增 spec 回写调用
├── spec-converter.ts     # 新增: spec → roadmap
├── spec-writer.ts        # 新增: 执行结果 → spec
└── setup.sh              # 已有

openspec/
└── specs/
    ├── auth-session/spec.md
    ├── auto-dev/spec.md
    ├── feishu-gateway/spec.md
    └── judge-agent/spec.md
```

## 验收标准

| 检查项 | 验证方式 |
|--------|----------|
| spec 扫描 | `bun run script/auto-dev/spec-converter.ts --dry-run` 输出任务列表 |
| 任务执行 | scheduler 选中 spec 任务并执行 |
| spec 回写 | 执行后 spec.md 出现 `Status: ✅ implemented` |
| 飞书通知 | spec 变更推送到飞书 |
| 不影响现有流程 | M4-M6 任务正常执行 |
| Judge 上下文注入 | Judge 能访问任务描述和 spec |

---

## Judge 增强计划

### 当前 Judge 能力

| 检查项 | 状态 |
|--------|------|
| 断言删除检测 | ✅ |
| 测试用例删除检测 | ✅ |
| 断言简化检测 | ✅ |
| 危险文件修改检测 | ✅ |
| 大量代码删除检测 | ✅ |

### 需要新增的检查项

| 检查项 | 说明 | 依赖 |
|--------|------|------|
| **相关性检查** | 变更文件是否在任务范围内 | 任务描述 |
| **过量改动检测** | 改了 10 个文件但任务只需 2 个 | 任务描述 |
| **安全性检查** | 新依赖、eval()、exec()、密钥泄露 | 代码 diff |
| **完整性检查** | 任务目标是否真的实现了 | spec.md |
| **回归风险检查** | 公共 API 是否有破坏性变更 | 代码 diff |
| **一致性检查** | 命名规范、代码风格 | 项目规范 |
| **Trace 覆盖检查** | 新增功能是否有 trace 埋点 | 代码 diff |

### 实现方式

**Day 3 (6.28): Judge 增强**

```ts
// script/auto-dev/judge-enhanced.ts

interface JudgeContext {
  task: {
    id: string
    title: string
    description: string
    specPath?: string
  }
  spec?: string  // spec.md 内容
  diff: string   // git diff
  changedFiles: string[]
}

function judgeWith context(ctx: JudgeContext): JudgeVerdict {
  const issues: string[] = []
  
  // 1. 相关性检查
  const relevantFiles = extractRelevantFiles(ctx.task.description)
  const irrelevantFiles = ctx.changedFiles.filter(f => !relevantFiles.some(r => f.includes(r)))
  if (irrelevantFiles.length > 0) {
    issues.push(`变更了任务范围外的文件: ${irrelevantFiles.join(", ")}`)
  }
  
  // 2. 过量改动检测
  if (ctx.changedFiles.length > 5 && ctx.task.description.length < 100) {
    issues.push(`改动文件过多 (${ctx.changedFiles.length})，超出任务复杂度预期`)
  }
  
  // 3. 安全性检查
  if (ctx.diff.includes("eval(") || ctx.diff.includes("exec(")) {
    issues.push("检测到 eval/exec 调用，存在安全风险")
  }
  
  // 4. 完整性检查 (需要 spec)
  if (ctx.spec) {
    const requirements = extractRequirements(ctx.spec)
    const implemented = requirements.filter(r => ctx.diff.includes(r.keyword))
    if (implemented.length < requirements.length * 0.5) {
      issues.push("大部分需求未在本次变更中实现")
    }
  }
  
  // 5. Trace 覆盖检查
  const newFiles = ctx.changedFiles.filter(f => f.includes("src/") && !f.includes(".test."))
  for (const file of newFiles) {
    const content = readFileSync(file, "utf-8")
    const hasTrace = content.includes("TraceNodeEvent") || content.includes("bus.publish") || content.includes("TraceReporter")
    if (!hasTrace && content.length > 500) {
      issues.push(`新增文件 ${file} 缺少 trace 埋点，需要补充 TraceNodeEvent 或 bus.publish`)
    }
  }
  
  return { approved: issues.length === 0, issues }
}
```

### Judge 上下文注入

```ts
// scheduler.ts pipeline 中

async function stepJudgeReview(task: RoadmapTask): Promise<StepResult> {
  // 读取任务对应的 spec
  const specPath = task.specPath
  const spec = specPath ? readFileSync(specPath, "utf-8") : undefined
  
  // 构建 Judge 上下文
  const ctx: JudgeContext = {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      specPath,
    },
    spec,
    diff: getGitDiff(),
    changedFiles: getChangedFiles(),
  }
  
  // 使用增强版 Judge
  const verdict = judgeWithContext(ctx)
  
  return { name: "Judge审查", success: verdict.approved, output: verdict.issues.join("; ") }
}
```

---

## 完整架构

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenSpec × Helix 集成                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  openspec/specs/                                              │
│  ├── auth-session/spec.md ──┐                                │
│  ├── auto-dev/spec.md ──────┤                                │
│  ├── feishu-gateway/spec.md ─┼──→ spec-converter ──→ roadmap  │
│  └── judge-agent/spec.md ───┘                                │
│                                                              │
│  .mimocode/roadmap.json                                       │
│  └── M7-T1: auth-session remember-me ──→ scheduler           │
│                                                              │
│  scheduler.ts                                                 │
│  ├── 读取 spec.md 作为任务上下文                              │
│  ├── 通过 Gateway 执行任务                                    │
│  ├── Judge 审查 (对比 spec + diff)                            │
│  ├── 编译 → 测试 → Lint                                      │
│  ├── spec-writer 回写执行结果                                 │
│  └── 飞书通知                                                 │
│                                                              │
│  输出:                                                       │
│  ├── git commit: "auto-dev: M7-T1 - remember me"             │
│  ├── spec.md: "Status: ✅ implemented"                       │
│  └── 飞书: "✅ auth-session 完成, 45K tokens"                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
