# Commit Review: 43e8635 — 执行层补全

> **Commit**: `43e86357e` feat: 执行层补全 — 指令遵循度检测 + 候选评分 + Judge inject 模式 + 测试修复
> **Date**: 2026-06-24
> **Reviewer**: MiMoCode (automated)
> **Scope**: 14 files, +1422 / -48 lines

---

## 一、Bug（会导致错误行为的缺陷）

### BUG-1: Judge 安全检查传入的是文件路径而非代码

**文件**: `packages/opencode/src/session/prompt.ts:2986`

```typescript
const review = judge.quickReview({
  ...
  originalTest: "",           // ← 空字符串
  suggestedChange: changedFiles.join("\n"),  // ← 文件路径，不是代码
  ...
})
```

`quickReview` 内部的 `checkSecurity()` 会扫描 `suggestedChange` 中的 `eval()`/`exec()`/密钥泄露，但传入的是 `["src/foo.ts", "src/bar.ts"]` 这样的文件路径拼接。路径中不会出现 `eval(` 或 `sk-`，因此 **安全检查永远不会触发**。

同理，`checkRegressionRisk()` 检测 `DROP TABLE` 等 SQL 关键词，在文件路径上也不会命中。

**修复方向**: 应该读取变更文件的实际 diff 内容传入，或者设计一个专门的 "变更审查" 接口而非复用 `ReviewRequest`。

---

### BUG-2: `originalTest` 为空导致断言保护检查被跳过

**文件**: `packages/opencode/src/session/prompt.ts:2985` + `packages/opencode/src/agent/judge-agent.ts:92`

```typescript
originalTest: "",  // 始终为空
```

`checkAssertionReduction` 在 `originalTest` 为空时：
- `extractAssertions("")` → `[]` → `originalAssertions.length === 0`
- 第 92 行 `if (originalAssertions.length === 0) return { valid: true }` → 直接通过

**断言保护检查被完全绕过。** 本次 commit 的目的是让 Judge 在 runLoop 中生效，但实际上断言保护形同虚设。

---

### BUG-3: `selectBestCandidate` 对所有候选共享同一份 `testResults`

**文件**: `packages/opencode/src/session/candidate-scorer.ts:101-113`

```typescript
export function selectBestCandidate(
  candidates: MaxCandidate[],
  judgeReviews: ReviewResult[],
  testResults: TestResult[],      // ← 单一数组，所有候选共享
  existingCodeStyle: unknown = {}
): CandidateScore | undefined {
  const scores = candidates.map((candidate, i) =>
    scoreCandidate(candidate, judgeReviews[i], testResults, existingCodeStyle)  // ← 同一份 testResults
  )
```

评分维度中"测试通过率"占 30% 权重，但所有候选拿到的是同一份测试结果。这意味着测试通过率维度对候选排序 **没有区分度**——一个候选如果测试全过，其他候选也一样。

**正确设计**: `testResults` 应该是 `TestResult[][]`，每个候选有独立的测试结果。

---

### BUG-4: `use_approach` 约束被提取但从未检查

**文件**: `packages/opencode/src/session/instruction-adherence.ts:66-75` (提取) vs `97-145` (检查)

`extractConstraints` 正确提取了"用方案 A"类约束，但 `checkAdherence` 的 `switch` 语句只处理了 `dont_modify`、`only_modify`、`scope` 三种类型，**没有 `use_approach` 分支**。该约束类型属于 `approach_mismatch` 偏离类型，但从未产生偏离报告。

用户说"用方案 A"、LLM 实际用了方案 B → 系统不会检测到任何问题。

---

### BUG-5: `lastUser` 变量在 inject 代码块中可能为 undefined

**文件**: `packages/opencode/src/session/prompt.ts:3006, 3059`

inject 模式中引用了 `lastUser.agentID`、`lastUser.agent`、`lastUser.model` 等属性。但在 diff 范围内，`lastUser` 的定义不可见（可能在外层定义）。如果 `lastUser` 的获取方式是 `msgs.findLast(m => m.info.role === "user")`，则理论上不应为空。但 **inject 代码块位于 `for await` 循环内部，依赖外层变量的生命周期**，如果 `msgs` 在某轮为空或不含 user 消息，会导致运行时错误。

更重要的是，注入的 `correctionMsg` 使用 `role: "user"` 身份，将系统纠正伪装成用户消息。这会污染对话历史，LLM 可能误认为是用户输入。

---

### BUG-6: 正则 `g` 标志与 `test()` 的状态残留

**文件**: `packages/opencode/src/agent/judge-agent.ts:161-166`

```typescript
const dangerousPatterns = [
  { pattern: /\beval\s*\(/g, desc: "eval() 调用" },
  { pattern: /\bnew\s+Function\s*\(/g, desc: "new Function() 调用" },
  { pattern: /\bexec\s*\(/g, desc: "exec() 调用" },
  { pattern: /\bchild_process\b/g, desc: "child_process 引用" },
]
```

所有 pattern 都带 `g` 标志，且是在模块顶层定义的常量。当 `pattern.test(code)` 执行后，`lastIndex` 会前进。如果 `checkSecurity` 被多次调用（不同文件），`lastIndex` 不会重置，导致偶数次调用可能漏检。

同理，`checkRegressionRisk`（第 204-208 行）的 breakingMigrationPatterns 也有相同问题。

**修复**: 移除 `g` 标志（`test()` 不需要全局匹配），或每次调用时 `pattern.lastIndex = 0`。

---

## 二、设计问题（不会立即崩溃但架构/逻辑有问题）

### DESIGN-1: 指令遵循度检查缺少 `judgeEnabled` 门控

**文件**: `packages/opencode/src/session/prompt.ts:3041`

```typescript
// Instruction adherence check — detects deviation from user instructions
if (hasFileChanges) {   // ← 无 judgeEnabled 条件
```

Judge 代码质量检查有 `cardinalEvo.judgeEnabled && hasFileChanges` 门控，但指令遵循度检查只要 `hasFileChanges` 就触发。这意味着：

- `ask` 模式（`judgeEnabled: false`）下，纯对话也会触发遵循度检查
- 用户关闭 Judge 后，遵循度检查仍在运行
- 遵循度检查复用了 `cardinalEvo.judgeAction` 配置，但两者的启用条件不一致

**建议**: 为遵循度检查增加独立的配置项，或至少绑定到 `judgeEnabled`。

---

### DESIGN-2: `calculateStyleConsistency` 是空壳实现

**文件**: `packages/opencode/src/session/candidate-scorer.ts:47-51`

```typescript
function calculateStyleConsistency(_code: string, _existingStyle: unknown): number {
  return 0.8  // 固定值
}
```

风格一致性占 10% 权重，但始终返回 0.8，对所有候选一视同仁。这使得该维度实际上只贡献了 `0.8 * 0.1 = 0.08` 的固定分值，降低了总分的有效区分度。

既然尚未实现，应标注为 TODO 或暂时移除该维度（将权重分配给其他维度）。

---

### DESIGN-3: `checkAdherence` 的 `only_modify` 和 `dont_modify` 可能冲突

**文件**: `packages/opencode/src/session/instruction-adherence.ts:97-146`

用户说"只修改 login.ts，不要动 config.ts"时：
1. `dont_modify` 检测到 config.ts 被修改 → error
2. `only_modify` 检测到 utils.ts 超出范围 → error

但如果用户只修改了 config.ts（违反 dont_modify），同时 config.ts 又不在 only_modify 的允许范围内（也违反 only_modify），会报告两个偏离。语义上应该是 **dont_modify 优先级更高**，只报一个即可。

---

### DESIGN-4: 范围约束检测过于宽泛，容易误报

**文件**: `packages/opencode/src/session/instruction-adherence.ts:78-82`

```typescript
for (const [scope, patterns] of Object.entries(SCOPE_MAP)) {
  if (instruction.includes(scope)) {
    constraints.push({ type: "scope", targets: patterns, raw: scope })
  }
}
```

- "配置" 会匹配 "配置文件"、"配置项"、"配置管理" 等所有包含"配置"的指令
- "测试" 会匹配 "测试一下"、"测试环境" 等非范围约束的用法
- "脚本" 会匹配 "脚本化"、"脚本语言" 等

这些是 **语义级别的约束**，用 `String.includes` 检测会产生大量误报。

**建议**: 至少需要更精确的模式（如"只改前端"、"前端相关"），或仅在检测到明确的范围限定词（"只"、"仅"）时才触发范围检查。

---

### DESIGN-5: Judge inject 模式缺乏防抖机制

**文件**: `packages/opencode/src/session/prompt.ts:3001-3036`

每轮工具执行后，如果 Judge 发现问题且 `judgeAction === "inject"`，会注入一条纠正消息。但 LLM 收到纠正后可能在下一轮做出相同行为（因为它不理解"纠正"的语境），再次触发 Judge，再次注入——形成 **无限注入循环**。

没有：
- 最大注入次数限制
- 注入间隔控制
- 注入内容去重（相同 rationale 不重复注入）

---

### DESIGN-6: `parseReviewResponse` 的 JSON 提取过于简单

**文件**: `packages/opencode/src/agent/judge-agent.ts:465`

```typescript
const jsonMatch = response.match(/\{[\s\S]*\}/)
```

这是贪婪匹配。如果 LLM 响应包含多个 JSON 对象（如示例 + 结论），会匹配从第一个 `{` 到最后一个 `}` 的全部内容，可能包含非 JSON 文本。

**建议**: 使用非贪婪 `\{[\s\S]*?\}` 或从内向外逐层匹配。

---

## 三、未实现/空壳逻辑

| 位置 | 内容 | 状态 |
|------|------|------|
| `candidate-scorer.ts:47-51` | `calculateStyleConsistency` 始终返回 0.8 | 空壳，标注为"简化实现" |
| `instruction-adherence.ts:66-75` | `use_approach` 约束提取 | 提取了但未检查 |
| `instruction-adherence.ts` | `approach_mismatch` 偏离类型 | 定义了类型但从未产生 |
| `judge-agent.ts:217-226` | `checkRegressionRisk` 的导出移除检测 | 依赖 diff 格式（`^-\s*export`），但传入的是文件路径 |
| `spec.md` | Judge Action 模式文档 | spec 中有 76 行空行，未写入实际规范 |

---

## 四、测试覆盖问题

### TEST-1: 测试通过但实际逻辑未被验证

`judge-agent-integration.test.ts` 中的安全检查测试：

```typescript
test("eval() 调用应被驳回", () => {
  const request = createRequest({
    suggestedChange: `test("example", () => {
  expect(1 + 1).toBe(2)
  eval("alert(1)")       // ← eval 在 suggestedChange 中
})`,
  })
  const result = judge.quickReview(request)
  expect(result.approved).toBe(false)
})
```

测试通过是因为 `suggestedChange` 中直接包含了 `eval("alert(1)")` 代码。但在 **实际 runLoop 中**，`suggestedChange` 传入的是文件路径（见 BUG-1），安全检查不会触发。

**测试覆盖了函数本身，但未覆盖集成场景。**

### TEST-2: 候选评分测试未验证 `selectBestCandidate` 的集成行为

测试只验证了 `scoreCandidate` 单函数，没有测试 `selectBestCandidate` 的多候选排序。而 `selectBestCandidate` 的 bug（共享 testResults）在单函数测试中不可见。

### TEST-3: 指令遵循度测试未覆盖 `use_approach` 检查

测试只验证了 `dont_modify`、`only_modify`、`scope` 三种约束，没有 `use_approach` 的检查测试——因为它根本没有实现。

---

## 五、Commit Message 与实际变更的偏差

Commit message 声明："指令遵循度检测 + 候选评分 + Judge inject 模式 + 测试修复"

| 声明 | 实际 |
|------|------|
| 指令遵循度检测 | ✅ 实现了，但 `use_approach` 未检查，范围约束误报率高 |
| 候选评分 | ✅ 框架在，但 `testResults` 共享 bug + 风格一致性空壳 |
| Judge inject 模式 | ⚠️ 代码在，但集成调用传参错误（BUG-1, BUG-2），实际不生效 |
| 测试修复 | ✅ 测试通过，但未覆盖集成场景的真实行为 |

---

## 六、严重度汇总

| ID | 类型 | 严重度 | 影响 |
|----|------|--------|------|
| BUG-1 | Bug | **高** | Judge 安全检查在 runLoop 中完全失效 |
| BUG-2 | Bug | **高** | 断言保护检查在 runLoop 中完全失效 |
| BUG-3 | Bug | 中 | 候选评分的测试通过率维度无区分度 |
| BUG-4 | Bug | 中 | `use_approach` 约束检测不工作 |
| BUG-5 | Bug | 中 | inject 消息伪造用户身份 + 潜在空引用 |
| BUG-6 | Bug | 中 | 正则 `g` 标志导致偶发漏检 |
| DESIGN-1 | 设计 | 中 | 遵循度检查缺少门控，ask 模式也会触发 |
| DESIGN-2 | 设计 | 低 | 风格一致性空壳，降低评分区分度 |
| DESIGN-3 | 设计 | 低 | 约束冲突时重复报告 |
| DESIGN-4 | 设计 | 中 | 范围约束误报率高 |
| DESIGN-5 | 设计 | 中 | inject 模式可能无限循环 |
| DESIGN-6 | 设计 | 低 | JSON 解析可能匹配过宽 |

---

## 七、建议修复优先级

1. **P0** (立即): BUG-1 + BUG-2 — Judge 在 runLoop 中名存实亡，需要重新设计 runLoop 中的 Judge 调用方式，传入实际代码 diff 而非文件路径
2. **P0** (立即): BUG-6 — 移除模块顶层 regex 的 `g` 标志
3. **P1** (本迭代): BUG-3 — `selectBestCandidate` 接受 `TestResult[][]` 而非 `TestResult[]`
4. **P1** (本迭代): BUG-4 — 实现 `use_approach` 约束检查
5. **P1** (本迭代): DESIGN-5 — 增加 inject 防抖（最大次数 + 去重）
6. **P2** (下迭代): DESIGN-1 — 遵循度检查增加独立配置
7. **P2** (下迭代): DESIGN-4 — 优化范围约束的匹配精度
8. **P3** (有空): DESIGN-2 — 实现或移除风格一致性评分
9. **P3** (有空): DESIGN-6 — 改进 JSON 解析的正则
