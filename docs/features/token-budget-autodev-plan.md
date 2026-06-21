# Token 预算驱动的自动开发功能实施计划

> 基于用户每日 token 上限，结合项目现状和终态目标，自动梳理需求并执行开发

---

## 功能概述

### 核心目标
1. **需求自动梳理**：分析项目现状，对比终态目标，识别和优先排序开发需求
2. **智能开发执行**：根据每日 token 预算，自动选择、执行和验证开发任务

### 核心价值
- 将 AI 辅助开发从"被动响应"升级为"主动规划"
- 实现 token 资源的最优分配
- 建立项目进展的量化追踪机制

---

## 阶段 1：基础框架搭建

### 1.1 扩展任务 Schema

**文件**: `packages/opencode/src/task/schema.ts`

```typescript
// 新增字段
export const TaskPriority = z.enum(["critical", "high", "medium", "low"])
export type TaskPriority = z.infer<typeof TaskPriority>

export const TaskComplexity = z.enum(["simple", "moderate", "complex", "epic"])
export type TaskComplexity = z.infer<typeof TaskComplexity>

export const Task = z.object({
  // 现有字段...
  id: TaskID,
  session_id: SessionID.zod,
  parent_task_id: TaskID.optional(),
  status: TaskStatus,
  summary: z.string(),
  owner: z.string().optional(),
  created_at: z.number(),
  last_event_at: z.number(),
  ended_at: z.number().optional(),
  cleanup_after: z.number().optional(),
  
  // 新增字段
  priority: TaskPriority.optional().default("medium"),
  complexity: TaskComplexity.optional().default("moderate"),
  estimated_tokens: z.number().optional(),
  actual_tokens: z.number().optional(),
  goal_alignment: z.number().min(0).max(1).optional(), // 与终态目标的对齐度
  tags: z.array(z.string()).optional(),
  blocked_by: z.array(TaskID).optional(),
})
```

### 1.2 Token 使用追踪

**新建文件**: `packages/opencode/src/token/tracker.ts`

```typescript
import { Context, Effect, Layer } from "effect"
import { Database } from "@/storage"
import { Config } from "@/config"

export interface TokenUsage {
  session_id: string
  task_id?: string
  model_id: string
  input_tokens: number
  output_tokens: number
  timestamp: number
  purpose: "planning" | "execution" | "review" | "testing"
}

export interface DailyBudget {
  date: string // YYYY-MM-DD
  total_budget: number
  used: number
  remaining: number
  allocated: Record<string, number> // task_id -> allocated tokens
}

export interface Interface {
  readonly recordUsage: (usage: TokenUsage) => Effect.Effect<void>
  readonly getDailyBudget: (date?: string) => Effect.Effect<DailyBudget>
  readonly allocateTokens: (taskId: string, amount: number) => Effect.Effect<boolean>
  readonly getTaskUsage: (taskId: string) => Effect.Effect<number>
  readonly getUsageStats: (days?: number) => Effect.Effect<UsageStats>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TokenTracker") {}
```

**数据库 Schema**: `packages/opencode/src/token/token.sql.ts`

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const TokenUsageTable = sqliteTable("token_usage", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  task_id: text(),
  model_id: text().notNull(),
  input_tokens: integer().notNull(),
  output_tokens: integer().notNull(),
  timestamp: integer().notNull(),
  purpose: text().notNull(), // planning | execution | review | testing
})

export const DailyBudgetTable = sqliteTable("daily_budget", {
  date: text().primaryKey(), // YYYY-MM-DD
  total_budget: integer().notNull(),
  used: integer().notNull().default(0),
  config_json: text(), // 预算分配详情
})
```

### 1.3 配置扩展

**文件**: `packages/opencode/src/config/config.ts`

```typescript
// 在 InfoSchema 中新增
token_budget: Schema.optional(
  Schema.Struct({
    daily_limit: Schema.optional(Schema.Number).annotate({
      description: "每日 token 使用上限（输入+输出）",
    }),
    planning_ratio: Schema.optional(Schema.Number).annotate({
      description: "规划阶段 token 占比（0-1），默认 0.15",
    }),
    execution_ratio: Schema.optional(Schema.Number).annotate({
      description: "执行阶段 token 占比（0-1），默认 0.70",
    }),
    review_ratio: Schema.optional(Schema.Number).annotate({
      description: "审查阶段 token 占比（0-1），默认 0.10",
    }),
    reserve_ratio: Schema.optional(Schema.Number).annotate({
      description: "预留 token 占比（0-1），默认 0.05",
    }),
    auto_allocate: Schema.optional(Schema.Boolean).annotate({
      description: "是否自动分配 token 到任务，默认 true",
    }),
    rollover_unused: Schema.optional(Schema.Boolean).annotate({
      description: "是否将未使用 token 滚动到次日，默认 false",
    }),
  }),
).annotate({
  description: "Token 预算管理配置",
}),
```

**配置示例**: `~/.config/mimocode/mimocode.json`

```json
{
  "token_budget": {
    "daily_limit": 500000,
    "planning_ratio": 0.15,
    "execution_ratio": 0.70,
    "review_ratio": 0.10,
    "reserve_ratio": 0.05,
    "auto_allocate": true,
    "rollover_unused": false
  }
}
```

### 1.4 实施步骤

1. **数据库迁移**
   ```bash
   cd packages/opencode
   bun run db generate --name add-token-tracking
   ```

2. **实现 TokenTracker 服务**
   - 创建 `packages/opencode/src/token/` 目录
   - 实现 token 使用记录
   - 实现每日预算管理
   - 实现 token 分配逻辑

3. **集成到现有系统**
   - 在 LLM 调用处记录 token 使用
   - 在任务创建时关联 token 预估
   - 在配置系统中添加预算配置

### 1.5 验证方式

#### 单元测试

```bash
# 运行 Token 相关测试
cd packages/opencode
bun test test/token/tracker.test.ts
bun test test/token/budget.test.ts
```

**测试覆盖点：**
- [ ] Token 使用记录正确性
- [ ] 每日预算计算准确性
- [ ] Token 分配逻辑正确性
- [ ] 边界条件处理（超额、负数等）

#### 集成验证

```bash
# 验证数据库迁移
cd packages/opencode
bun run db migrate
bun run db verify

# 验证配置加载
MIMOCODE_CONFIG_CONTENT='{"token_budget":{"daily_limit":100000}}' bun run src/index.ts config show
```

**验证清单：**
- [ ] 数据库表正确创建
- [ ] 配置项正确加载
- [ ] Token 使用记录可查询
- [ ] 每日预算统计准确

#### 手动验证

```bash
# 1. 配置 token 预算
echo '{"token_budget":{"daily_limit":500000}}' > ~/.config/mimocode/mimocode.json

# 2. 执行一个简单任务
mimo run "创建一个 hello world 函数"

# 3. 查看 token 使用情况
mimo token status

# 4. 验证记录
sqlite3 ~/.local/share/mimocode/data.db "SELECT * FROM token_usage ORDER BY timestamp DESC LIMIT 10"
```

**验收标准：**
- ✅ Token 使用记录准确（误差 < 5%）
- ✅ 每日预算统计正确
- ✅ 配置变更即时生效
- ✅ 性能影响可忽略（< 10ms 额外延迟）

---

## 阶段 2：智能调度系统

### 2.1 需求分析器

**新建文件**: `packages/opencode/src/automation/requirement-analyzer.ts`

```typescript
export interface ProjectState {
  // 项目基本信息
  name: string
  root_path: string
  
  // 代码统计
  total_files: number
  total_lines: number
  languages: Record<string, number>
  
  // 测试覆盖
  test_coverage?: number
  test_files: number
  
  // 文档状态
  has_readme: boolean
  has_api_docs: boolean
  doc_coverage?: number
  
  // 依赖状态
  outdated_dependencies: number
  vulnerable_dependencies: number
  
  // 代码质量
  lint_errors: number
  type_errors: number
  
  // Git 状态
  open_issues: number
  pending_prs: number
  last_commit_days_ago: number
}

export interface ProjectGoal {
  // 终态目标描述
  description: string
  
  // 量化指标
  target_test_coverage?: number
  target_doc_coverage?: number
  target_code_quality?: "A" | "B" | "C"
  
  // 功能需求
  features: Array<{
    name: string
    priority: TaskPriority
    status: "pending" | "in_progress" | "done"
  }>
  
  // 非功能需求
  requirements: Array<{
    category: "performance" | "security" | "maintainability" | "scalability"
    description: string
    priority: TaskPriority
  }>
}

export interface Requirement {
  id: string
  title: string
  description: string
  category: "feature" | "bugfix" | "refactor" | "test" | "docs" | "dependency" | "infrastructure"
  priority: TaskPriority
  complexity: TaskComplexity
  estimated_tokens: number
  goal_alignment: number // 0-1
  prerequisites: string[] // 依赖的其他需求 ID
  acceptance_criteria: string[]
}

export interface Interface {
  readonly analyzeProject: (path: string) => Effect.Effect<ProjectState>
  readonly loadGoals: (path: string) => Effect.Effect<ProjectGoal>
  readonly identifyGaps: (state: ProjectState, goals: ProjectGoal) => Effect.Effect<Requirement[]>
  readonly prioritizeRequirements: (requirements: Requirement[]) => Effect.Effect<Requirement[]>
}
```

### 2.2 复杂度预估器

**新建文件**: `packages/opencode/src/automation/complexity-estimator.ts`

```typescript
export interface ComplexityFactors {
  // 代码因素
  files_affected: number
  lines_changed_estimate: number
  new_files_needed: number
  
  // 依赖因素
  external_dependencies: number
  internal_dependencies: number
  
  // 测试因素
  tests_needed: number
  test_complexity: "unit" | "integration" | "e2e"
  
  // 风险因素
  breaking_changes: boolean
  affects_core_logic: boolean
  requires_migration: boolean
}

export interface TokenEstimate {
  // 各阶段 token 预估
  planning: number      // 需求分析、方案设计
  implementation: number // 代码编写
  testing: number       // 测试编写和执行
  review: number        // 代码审查和修复
  total: number         // 总计
  
  // 置信度
  confidence: number    // 0-1
  
  // 历史参考
  similar_tasks: Array<{
    task_id: string
    actual_tokens: number
    similarity_score: number
  }>
}

export interface Interface {
  readonly analyzeComplexity: (requirement: Requirement, projectState: ProjectState) => Effect.Effect<ComplexityFactors>
  readonly estimateTokens: (factors: ComplexityFactors, modelId: string) => Effect.Effect<TokenEstimate>
  readonly calibrateFromHistory: (taskId: string, actualTokens: number) => Effect.Effect<void>
}
```

### 2.3 Token 调度器

**新建文件**: `packages/opencode/src/automation/token-scheduler.ts`

```typescript
export interface ScheduleInput {
  // 可用需求列表
  requirements: Requirement[]
  
  // 每日 token 预算
  daily_budget: number
  
  // 已使用 token
  used_today: number
  
  // 调度策略
  strategy: "priority_first" | "balance" | "quick_wins" | "custom"
  
  // 约束条件
  max_task_tokens?: number // 单任务最大 token
  min_task_tokens?: number // 单任务最小 token
  reserved_tokens?: number // 预留 token
}

export interface ScheduleOutput {
  // 选中的任务
  selected_tasks: Array<{
    requirement: Requirement
    allocated_tokens: number
    execution_order: number
  }>
  
  // 调度统计
  stats: {
    total_allocated: number
    remaining_budget: number
    tasks_selected: number
    tasks_deferred: number
  }
  
  // 调度说明
  rationale: string
}

export interface Interface {
  readonly schedule: (input: ScheduleInput) => Effect.Effect<ScheduleOutput>
  readonly adjustSchedule: (taskId: string, newAllocation: number) => Effect.Effect<ScheduleOutput>
  readonly getScheduleHistory: (days?: number) => Effect.Effect<ScheduleOutput[]>
}
```

### 2.4 项目目标配置

**新建文件**: `.mimocode/project-goals.json`

```json
{
  "version": "1.0",
  "description": "Helix 项目终态目标",
  
  "quantitative_goals": {
    "test_coverage": {
      "target": 80,
      "current": 45,
      "priority": "high"
    },
    "documentation": {
      "api_coverage": 90,
      "user_guide": true,
      "architecture_docs": true,
      "priority": "medium"
    },
    "code_quality": {
      "lint_errors": 0,
      "type_errors": 0,
      "complexity_score": "A",
      "priority": "high"
    }
  },
  
  "feature_goals": [
    {
      "name": "Token 预算管理",
      "description": "实现基于 token 的资源管理",
      "priority": "critical",
      "status": "pending",
      "estimated_tokens": 50000
    },
    {
      "name": "自动需求分析",
      "description": "自动识别项目开发需求",
      "priority": "high",
      "status": "pending",
      "estimated_tokens": 80000
    }
  ],
  
  "non_functional_goals": [
    {
      "category": "performance",
      "description": "响应时间 < 100ms",
      "priority": "medium",
      "metrics": {
        "p95_latency": 100,
        "p99_latency": 200
      }
    },
    {
      "category": "security",
      "description": "通过安全审计",
      "priority": "high",
      "metrics": {
        "vulnerabilities": 0,
        "security_score": "A"
      }
    }
  ],
  
  "constraints": {
    "max_daily_tokens": 500000,
    "preferred_complexity": ["simple", "moderate"],
    "avoid_areas": ["experimental-features"],
    "focus_areas": ["core-engine", "stability"]
  }
}
```

### 2.5 实施步骤

1. **实现需求分析器**
   - 创建项目状态扫描工具
   - 实现目标差距分析
   - 实现需求优先级排序

2. **实现复杂度预估器**
   - 基于历史数据训练预估模型
   - 实现多因素复杂度评估
   - 实现 token 消耗预估

3. **实现 Token 调度器**
   - 实现多种调度策略
   - 实现动态调整机制
   - 实现调度历史追踪

4. **集成测试**
   - 单元测试各个组件
   - 集成测试完整流程
   - 性能测试调度算法

### 2.6 验证方式

#### 单元测试

```bash
# 运行需求分析器测试
cd packages/opencode
bun test test/automation/requirement-analyzer.test.ts

# 运行复杂度预估器测试
bun test test/automation/complexity-estimator.test.ts

# 运行 Token 调度器测试
bun test test/automation/token-scheduler.test.ts
```

**测试覆盖点：**
- [ ] 项目状态扫描准确性
- [ ] 需求识别完整性
- [ ] 优先级排序合理性
- [ ] 复杂度预估准确度（误差 < 30%）
- [ ] Token 分配算法正确性
- [ ] 调度策略有效性

#### 集成验证

```bash
# 创建测试项目
mkdir -p /tmp/test-project && cd /tmp/test-project
git init
echo '{"name":"test"}' > package.json
echo 'console.log("hello")' > index.js

# 运行需求分析
mimo auto-dev analyze --path /tmp/test-project

# 验证输出
cat .mimocode/requirements.json | jq '.requirements | length'
```

**验证清单：**
- [ ] 需求分析输出格式正确
- [ ] 优先级排序符合预期
- [ ] Token 预估在合理范围
- [ ] 调度计划可执行

#### 准确性验证

```bash
# 使用历史任务验证预估准确性
mimo auto-dev calibrate --from-history --days 7

# 查看校准报告
mimo auto-dev report --type calibration
```

**校准指标：**
- [ ] Token 预估误差 < 30%
- [ ] 复杂度分类准确率 > 80%
- [ ] 优先级排序与实际完成顺序相关性 > 0.7

#### 性能验证

```bash
# 测试分析性能
time mimo auto-dev analyze --path /path/to/large/project

# 测试调度性能
time mimo auto-dev schedule --budget 500000
```

**性能指标：**
- [ ] 项目分析 < 30 秒（1000 文件项目）
- [ ] 需求生成 < 10 秒
- [ ] 调度计算 < 5 秒

**验收标准：**
- ✅ 需求识别覆盖主要开发方向
- ✅ 优先级排序符合工程实践
- ✅ Token 预估误差在可接受范围
- ✅ 调度计划合理且可执行

---

## 阶段 3：自动化闭环实现

### 3.1 自动开发工作流

**新建文件**: `packages/opencode/src/automation/auto-dev-workflow.ts`

```typescript
export interface AutoDevConfig {
  // 启用配置
  enabled: boolean
  auto_start: boolean // 是否自动开始
  schedule: string // cron 表达式
  
  // 执行配置
  max_concurrent_tasks: number
  auto_commit: boolean
  auto_test: boolean
  require_approval: boolean // 是否需要人工审批
  
  // 通知配置
  notify_on_complete: boolean
  notify_on_failure: boolean
  notification_channel?: string
}

export interface AutoDevSession {
  session_id: string
  date: string
  start_time: number
  
  // 预算执行情况
  budget: DailyBudget
  tasks_planned: number
  tasks_completed: number
  tasks_failed: number
  
  // 成果统计
  lines_added: number
  lines_removed: number
  files_changed: number
  tests_added: number
  
  // 状态
  status: "planning" | "executing" | "reviewing" | "completed" | "failed"
  current_task_id?: string
}

export interface Interface {
  readonly startSession: (config?: Partial<AutoDevConfig>) => Effect.Effect<AutoDevSession>
  readonly pauseSession: () => Effect.Effect<void>
  readonly resumeSession: () => Effect.Effect<void>
  readonly stopSession: () => Effect.Effect<void>
  readonly getSessionStatus: () => Effect.Effect<AutoDevSession | null>
  readonly getSessionHistory: (days?: number) => Effect.Effect<AutoDevSession[]>
}
```

### 3.2 进度追踪与报告

**新建文件**: `packages/opencode/src/automation/progress-tracker.ts`

```typescript
export interface ProgressReport {
  // 报告时间
  generated_at: number
  period: "daily" | "weekly" | "monthly"
  
  // Token 使用统计
  token_stats: {
    total_used: number
    total_budget: number
    utilization_rate: number
    by_purpose: Record<string, number>
    by_task: Array<{ task_id: string; tokens: number }>
  }
  
  // 任务完成统计
  task_stats: {
    total_completed: number
    total_failed: number
    success_rate: number
    by_priority: Record<TaskPriority, number>
    by_category: Record<string, number>
  }
  
  // 项目进展
  project_progress: {
    goals_achieved: string[]
    goals_in_progress: string[]
    goals_blocked: string[]
    overall_completion: number // 0-100%
  }
  
  // 质量指标
  quality_metrics: {
    test_coverage_change: number
    lint_errors_change: number
    type_errors_change: number
    code_quality_trend: "improving" | "stable" | "declining"
  }
  
  // 建议
  recommendations: Array<{
    type: "budget" | "priority" | "focus" | "process"
    description: string
    impact: "high" | "medium" | "low"
  }>
}

export interface Interface {
  readonly generateReport: (period: "daily" | "weekly" | "monthly") => Effect.Effect<ProgressReport>
  readonly getTrend: (metric: string, days?: number) => Effect.Effect<TrendData>
  readonly exportReport: (report: ProgressReport, format: "json" | "markdown" | "html") => Effect.Effect<string>
}
```

### 3.3 CLI 命令集成

**文件**: `packages/opencode/src/cli/commands/auto-dev.ts`

```typescript
export const autoDevCommand = {
  name: "auto-dev",
  description: "Token 预算驱动的自动开发",
  subcommands: {
    // 初始化配置
    init: {
      description: "初始化自动开发配置",
      action: async () => {
        // 交互式配置向导
        // 1. 设置每日 token 预算
        // 2. 配置项目目标
        // 3. 设置调度策略
      }
    },
    
    // 查看状态
    status: {
      description: "查看当前自动开发状态",
      action: async () => {
        // 显示：
        // - 今日 token 使用情况
        // - 当前执行的任务
        // - 进度统计
      }
    },
    
    // 手动触发
    run: {
      description: "手动触发自动开发",
      options: {
        "--budget": "覆盖每日预算",
        "--strategy": "指定调度策略",
        "--dry-run": "仅显示计划，不执行",
      },
      action: async (options) => {
        // 1. 分析项目状态
        // 2. 识别需求
        // 3. 生成调度计划
        // 4. 执行开发任务
      }
    },
    
    // 查看报告
    report: {
      description: "生成进展报告",
      options: {
        "--period": "报告周期 (daily/weekly/monthly)",
        "--format": "输出格式 (json/markdown/html)",
      },
      action: async (options) => {
        // 生成并显示报告
      }
    },
    
    // 配置管理
    config: {
      description: "管理自动开发配置",
      subcommands: {
        "set-budget": "设置每日 token 预算",
        "set-goals": "配置项目目标",
        "set-strategy": "设置调度策略",
        "show": "显示当前配置",
      }
    }
  }
}
```

### 3.4 MCP Tool 集成

**文件**: `packages/opencode/src/mcp/tools/auto-dev-tools.ts`

```typescript
export const autoDevTools = [
  {
    name: "auto_dev_analyze",
    description: "分析项目状态和识别开发需求",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string", description: "项目路径" },
        include_goals: { type: "boolean", description: "是否包含目标分析" },
      },
    },
    handler: async (input) => {
      // 返回项目状态和需求列表
    }
  },
  
  {
    name: "auto_dev_schedule",
    description: "生成基于 token 预算的开发计划",
    inputSchema: {
      type: "object",
      properties: {
        daily_budget: { type: "number", description: "每日 token 预算" },
        strategy: { type: "string", enum: ["priority_first", "balance", "quick_wins"] },
        focus_areas: { type: "array", items: { type: "string" } },
      },
    },
    handler: async (input) => {
      // 返回调度计划
    }
  },
  
  {
    name: "auto_dev_execute",
    description: "执行自动开发计划",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string", description: "计划 ID" },
        dry_run: { type: "boolean", description: "是否仅模拟执行" },
        require_approval: { type: "boolean", description: "是否需要审批" },
      },
    },
    handler: async (input) => {
      // 执行开发计划
    }
  },
  
  {
    name: "auto_dev_report",
    description: "生成进展报告",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["daily", "weekly", "monthly"] },
        format: { type: "string", enum: ["json", "markdown"] },
      },
    },
    handler: async (input) => {
      // 返回进展报告
    }
  }
]
```

### 3.5 实施步骤

1. **实现自动开发工作流**
   - 创建会话管理
   - 实现任务执行循环
   - 实现错误处理和恢复

2. **实现进度追踪**
   - 创建指标收集系统
   - 实现报告生成
   - 实现趋势分析

3. **CLI 命令集成**
   - 实现 auto-dev 命令组
   - 添加交互式向导
   - 实现状态显示

4. **MCP Tool 集成**
   - 注册 auto-dev 相关 tools
   - 实现 tool handler
   - 添加权限控制

5. **端到端测试**
   - 测试完整工作流
   - 测试异常场景
   - 性能和稳定性测试

### 3.6 验证方式

#### 单元测试

```bash
# 运行自动开发工作流测试
cd packages/opencode
bun test test/automation/auto-dev-workflow.test.ts

# 运行进度追踪测试
bun test test/automation/progress-tracker.test.ts

# 运行 CLI 命令测试
bun test test/cli/auto-dev.test.ts
```

**测试覆盖点：**
- [ ] 工作流状态机转换正确
- [ ] 任务执行循环稳定性
- [ ] 错误处理和恢复机制
- [ ] 进度指标计算准确性
- [ ] 报告生成完整性
- [ ] CLI 命令响应正确

#### 端到端验证

```bash
# 完整工作流测试
mimo auto-dev run --budget 100000 --dry-run

# 验证调度计划
cat .mimocode/auto-dev-plan.json | jq '.selected_tasks | length'

# 实际执行（小预算）
mimo auto-dev run --budget 50000

# 查看执行结果
mimo auto-dev status
mimo auto-dev report --period daily
```

**验证清单：**
- [ ] 工作流完整执行
- [ ] Token 使用在预算内
- [ ] 任务正确完成
- [ ] 进度正确追踪
- [ ] 报告准确生成

#### 异常场景验证

```bash
# 测试预算超限
mimo auto-dev run --budget 1000 --force

# 测试任务失败恢复
mimo auto-dev run --simulate-failure

# 测试中断恢复
mimo auto-dev run &
kill -9 $!
mimo auto-dev resume
```

**异常场景覆盖：**
- [ ] Token 预算超限处理
- [ ] 任务执行失败恢复
- [ ] 进程中断后恢复
- [ ] 依赖服务不可用
- [ ] 网络异常处理

#### 性能和稳定性验证

```bash
# 长时间运行测试
mimo auto-dev run --budget 1000000 --timeout 3600

# 并发测试
for i in {1..5}; do
  mimo auto-dev run --budget 100000 &
done
wait

# 内存泄漏检测
mimo auto-dev run --budget 500000 &
PID=$!
while kill -0 $PID 2>/dev/null; do
  ps -o rss= -p $PID
  sleep 60
done
```

**性能指标：**
- [ ] 连续运行 24 小时无崩溃
- [ ] 内存使用稳定（无泄漏）
- [ ] CPU 使用合理（< 50% 平均）
- [ ] Token 追踪延迟 < 100ms

#### CLI 命令验证

```bash
# 测试所有子命令
mimo auto-dev init --help
mimo auto-dev status
mimo auto-dev run --help
mimo auto-dev report --help
mimo auto-dev config show

# 测试交互式向导
mimo auto-dev init
```

**CLI 验证清单：**
- [ ] 所有命令有帮助信息
- [ ] 参数验证正确
- [ ] 输出格式一致
- [ ] 错误信息清晰

#### MCP Tool 验证

```bash
# 启动 MCP Server
mimo serve --port 3095

# 测试 tool 调用
curl -X POST http://localhost:3095/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool":"auto_dev_analyze","input":{"project_path":"/path/to/project"}}'
```

**MCP 验证清单：**
- [ ] Tool 正确注册
- [ ] 输入验证正确
- [ ] 输出格式符合 schema
- [ ] 错误处理得当

#### 验收标准

**功能验收：**
- ✅ 完整工作流可自动执行
- ✅ Token 使用在预算范围内（误差 < 10%）
- ✅ 任务完成质量符合预期
- ✅ 进度报告准确完整
- ✅ 异常场景处理得当

**性能验收：**
- ✅ 单任务执行延迟 < 5 秒
- ✅ 支持并发任务执行
- ✅ 资源使用合理稳定

**用户体验验收：**
- ✅ CLI 命令直观易用
- ✅ 错误信息清晰有帮助
- ✅ 进度反馈及时准确
- ✅ 配置灵活可定制

---

## 技术架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户接口层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ CLI 命令 │  │ MCP Tool │  │ HTTP API │  │  飞书 Bot │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
┌───────▼─────────────▼─────────────▼─────────────▼───────────────┐
│                      自动开发引擎层                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 AutoDevWorkflow                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ 需求分析 │  │ 优先排序 │  │ Token调度│  │ 任务执行 │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Requirement  │  │  Complexity  │  │   Progress   │         │
│  │  Analyzer    │  │  Estimator   │  │   Tracker    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                      核心服务层                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Task    │  │  Token   │  │  Memory  │  │ Workflow │      │
│  │ Registry │  │ Tracker  │  │  System  │  │  Engine  │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Config  │  │  Agent   │  │ Provider │  │   Bus    │      │
│  │  System  │  │  System  │  │  System  │  │  System  │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└───────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                      数据持久层                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    SQLite + Drizzle ORM                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │  Tasks   │  │  Tokens  │  │  Memory  │  │ Sessions │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 风险与缓解

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Token 预估不准确 | 预算超支或浪费 | 基于历史数据校准，保留 10-20% 缓冲 |
| 需求分析不准确 | 优先级错误 | 人工审核机制，渐进式信任 |
| 自动执行出错 | 代码质量下降 | Shadow Worktree 隔离，自动回滚 |
| 调度算法效率低 | 响应延迟 | 缓存优化，异步处理 |

### 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 用户不信任自动执行 | 采用率低 | 渐进式授权，详细日志 |
| 配置复杂 | 使用门槛高 | 交互式向导，智能默认值 |
| 成本不可控 | 用户意外支出 | 预算告警，每日上限 |

---

## 里程碑计划

### M1：基础框架（2 周）
- [ ] 扩展任务 Schema
- [ ] 实现 TokenTracker 服务
- [ ] 添加配置支持
- [ ] 基础单元测试

**验证里程碑 V1：**
- [ ] 单元测试通过率 > 90%
- [ ] Token 记录误差 < 5%
- [ ] 配置加载正确
- [ ] 数据库迁移成功

### M2：智能调度（3 周）
- [ ] 实现需求分析器
- [ ] 实现复杂度预估器
- [ ] 实现 Token 调度器
- [ ] 集成测试

**验证里程碑 V2：**
- [ ] 需求分析覆盖主要开发方向
- [ ] Token 预估误差 < 30%
- [ ] 调度计划合理可执行
- [ ] 性能指标达标

### M3：自动化闭环（3 周）
- [ ] 实现自动开发工作流
- [ ] 实现进度追踪
- [ ] CLI 命令集成
- [ ] MCP Tool 集成
- [ ] 端到端测试

**验证里程碑 V3：**
- [ ] 完整工作流可自动执行
- [ ] Token 使用在预算内（误差 < 10%）
- [ ] 异常场景处理得当
- [ ] CLI 命令直观易用

### M4：优化与稳定（2 周）
- [ ] 性能优化
- [ ] 用户体验优化
- [ ] 文档编写
- [ ] 发布准备

**验证里程碑 V4：**
- [ ] 连续运行 24 小时无崩溃
- [ ] 内存使用稳定（无泄漏）
- [ ] 用户文档完整
- [ ] 发布检查清单通过

---

## 总结

本实施计划将 Token 预算驱动的自动开发功能分为三个阶段，逐步构建从需求分析到自动执行的完整闭环。通过复用 Helix 现有的任务系统、工作流引擎和记忆系统，可以高效实现这一功能，将 AI 辅助开发提升到新的水平。