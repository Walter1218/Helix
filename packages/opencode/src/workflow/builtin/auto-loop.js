export const meta = {
  name: 'auto-loop',
  description: 'Autonomous engineering loop — plans the task, executes code changes, runs tests to verify, and distills learnings. Iterates until the goal is achieved or max retries exhausted.',
  whenToUse: 'Use when the user wants a fully autonomous task execution with self-healing. The loop will plan, execute, test, and learn from failures automatically. Ideal for complex coding tasks where the agent should iterate until success.',
  phases: [
    { title: "Plan", detail: "Analyze the goal, explore the codebase, and create an execution plan" },
    { title: "Execute", detail: "Implement the planned code changes" },
    { title: "Test", detail: "Run tests and verify the changes work correctly" },
    { title: "Heal", detail: "If tests fail, diagnose and fix the issues" },
    { title: "Distill", detail: "Summarize what was learned and check if goal is achieved" },
  ],
}

// ─── Tunables ───
const MAX_ITERATIONS = 5      // max plan-execute-test cycles before giving up
const MAX_HEAL_ATTEMPTS = 3   // max fix attempts per test failure
const TEST_TIMEOUT_MS = 120000 // 2 min timeout for test runs

// ─── Structured-output shapes ───
const PLAN_SHAPE = {
  type: "object", required: ["goal_understanding", "steps", "risks"],
  properties: {
    goal_understanding: { type: "string" },
    steps: { type: "array", minItems: 1, maxItems: 10, items: {
      type: "object", required: ["id", "action", "files"],
      properties: {
        id: { type: "number" },
        action: { type: "string" },
        files: { type: "array", items: { type: "string" } },
        dependencies: { type: "array", items: { type: "number" } },
      },
    }},
    risks: { type: "array", items: { type: "string" } },
    test_strategy: { type: "string" },
  },
}

const EXECUTE_SHAPE = {
  type: "object", required: ["changes", "summary"],
  properties: {
    changes: { type: "array", items: {
      type: "object", required: ["file", "description"],
      properties: {
        file: { type: "string" },
        description: { type: "string" },
      },
    }},
    summary: { type: "string" },
    potential_issues: { type: "array", items: { type: "string" } },
  },
}

const TEST_RESULT_SHAPE = {
  type: "object", required: ["passed", "tests_run", "tests_passed", "tests_failed"],
  properties: {
    passed: { type: "boolean" },
    tests_run: { type: "number" },
    tests_passed: { type: "number" },
    tests_failed: { type: "number" },
    failures: { type: "array", items: {
      type: "object", required: ["test", "error", "file"],
      properties: {
        test: { type: "string" },
        error: { type: "string" },
        file: { type: "string" },
        line: { type: "number" },
      },
    }},
    warnings: { type: "array", items: { type: "string" } },
    execution_time_ms: { type: "number" },
  },
}

const DIAGNOSIS_SHAPE = {
  type: "object", required: ["root_cause", "fix_strategy"],
  properties: {
    root_cause: { type: "string" },
    affected_files: { type: "array", items: { type: "string" } },
    fix_strategy: { type: "string" },
    fix_steps: { type: "array", items: {
      type: "object", required: ["file", "change"],
      properties: {
        file: { type: "string" },
        change: { type: "string" },
      },
    }},
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
}

const DISTILL_SHAPE = {
  type: "object", required: ["goal_achieved", "summary"],
  properties: {
    goal_achieved: { type: "boolean" },
    achievement_pct: { type: "number" },
    summary: { type: "string" },
    files_modified: { type: "array", items: { type: "string" } },
    learnings: { type: "array", items: { type: "string" } },
    remaining_work: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
  },
}

// ─── Helpers ───
const GOAL = (typeof args === "string" && args.trim()) || ""
if (!GOAL) {
  return { error: "No goal provided. Pass the task description as args." }
}

let iteration = 0
let healAttempts = 0
let lastTestResult = null
let lastPlan = null
const allModifiedFiles = new Set()
const learnings = []

// ─── Main Loop ───
while (iteration < MAX_ITERATIONS) {
  iteration++
  log(`\n${'='.repeat(60)}`)
  log(`Iteration ${iteration}/${MAX_ITERATIONS}`)
  log(`${'='.repeat(60)}`)

  // ─── PHASE 1: PLAN ───
  phase("Plan")
  const planContext = iteration === 1
    ? `You are planning the implementation of a coding task.
      
## Goal
${GOAL}

## Instructions
1. First, explore the codebase to understand the relevant files and structure
2. Break down the goal into concrete, executable steps
3. Identify risks and dependencies
4. Define how to verify success (test strategy)

Use the available tools (read, glob, grep, bash) to explore the codebase before planning.
Return a structured execution plan.`
    : `You are re-planning after iteration ${iteration - 1} failed.

## Original Goal
${GOAL}

## Previous Attempt Summary
${lastTestResult ? `Tests: ${lastTestResult.tests_passed}/${lastTestResult.tests_run} passed` : 'Execution failed'}
${lastTestResult?.failures?.length ? `Failures:\n${lastTestResult.failures.map(f => `- ${f.test}: ${f.error}`).join('\n')}` : ''}
${learnings.length ? `\n## Learnings So Far\n${learnings.join('\n')}` : ''}

## Instructions
1. Analyze what went wrong
2. Adjust the plan to address the failures
3. Focus on fixing the specific issues, not rewriting everything

Return an updated execution plan.`

  const plan = await agent(planContext, {
    label: "plan",
    schema: PLAN_SHAPE,
  })

  if (!plan) {
    return { error: "Planning failed — could not create execution plan." }
  }
  lastPlan = plan
  log(`Plan: ${plan.steps.length} steps, risks: ${plan.risks.length}`)

  // ─── PHASE 2: EXECUTE ───
  phase("Execute")
  const executeContext = `You are implementing code changes based on the plan.

## Goal
${GOAL}

## Plan
${JSON.stringify(plan, null, 2)}

## Instructions
1. Execute each step in the plan sequentially
2. Use the available tools to read, write, and edit files
3. After each change, verify the file is syntactically correct
4. Track all files you modify

IMPORTANT: Actually make the code changes using the write/edit tools. Do not just describe what to do.
After completing all changes, return a summary of what was done.`

  const execution = await agent(executeContext, {
    label: "execute",
    schema: EXECUTE_SHAPE,
  })

  if (!execution) {
    log("Execution produced no output — continuing to test anyway")
  } else {
    log(`Execution: ${execution.changes?.length || 0} files changed`)
    execution.changes?.forEach(c => allModifiedFiles.add(c.file))
  }

  // ─── PHASE 3: TEST ───
  phase("Test")
  const testContext = `You are running tests to verify the code changes.

## Goal
${GOAL}

## Files Modified
${[...allModifiedFiles].join('\n') || 'Unknown'}

## Instructions
1. First, determine what test commands are appropriate (check package.json, existing test scripts)
2. Run the relevant tests using bash
3. Also run type checking if available (tsc --noEmit or similar)
4. If no tests exist, create a simple verification script
5. Report the results accurately

Run the actual test commands and return the results.`

  const testResult = await agent(testContext, {
    label: "test",
    schema: TEST_RESULT_SHAPE,
  })

  lastTestResult = testResult
  log(`Tests: ${testResult ? `${testResult.tests_passed}/${testResult.tests_run} passed` : 'no result'}`)

  // ─── PHASE 4: HEAL (if tests failed) ───
  if (testResult && !testResult.passed && testResult.failures?.length > 0) {
    phase("Heal")

    while (healAttempts < MAX_HEAL_ATTEMPTS && testResult && !testResult.passed) {
      healAttempts++
      log(`Heal attempt ${healAttempts}/${MAX_HEAL_ATTEMPTS}`)

      // Diagnose
      const diagnosis = await agent(`You are diagnosing test failures.

## Goal
${GOAL}

## Test Failures
${testResult.failures.map(f => `### ${f.test}
File: ${f.file}${f.line ? `:${f.line}` : ''}
Error: ${f.error}`).join('\n\n')}

## Instructions
1. Read the failing test files and the source files they test
2. Identify the root cause of each failure
3. Determine if the issue is in the implementation or the test itself
4. Provide a concrete fix strategy

Return a diagnosis with fix steps.`, {
        label: "diagnose",
        schema: DIAGNOSIS_SHAPE,
      })

      if (!diagnosis) {
        log("Diagnosis failed — skipping heal")
        break
      }

      log(`Diagnosis: ${diagnosis.root_cause} (confidence: ${diagnosis.confidence})`)

      // Apply fix
      const fixResult = await agent(`You are fixing test failures based on the diagnosis.

## Goal
${GOAL}

## Diagnosis
${JSON.stringify(diagnosis, null, 2)}

## Instructions
1. Apply the fix steps from the diagnosis
2. Use the available tools to edit the affected files
3. Make minimal, targeted changes — don't rewrite everything
4. After fixing, the changes will be re-tested automatically

Actually make the code changes using the edit tools.`, {
        label: "fix",
        schema: EXECUTE_SHAPE,
      })

      if (fixResult) {
        fixResult.changes?.forEach(c => allModifiedFiles.add(c.file))
      }

      // Re-test
      const retestResult = await agent(`You are re-running tests after the fix.

## Goal
${GOAL}

## Files Modified
${[...allModifiedFiles].join('\n')}

## Instructions
1. Run the same tests as before
2. Verify the failures are fixed
3. Check for any new failures introduced

Return the test results.`, {
        label: "retest",
        schema: TEST_RESULT_SHAPE,
      })

      if (retestResult) {
        lastTestResult = retestResult
        log(`Re-test: ${retestResult.tests_passed}/${retestResult.tests_run} passed`)
        if (retestResult.passed) break
      }
    }

    if (healAttempts >= MAX_HEAL_ATTEMPTS && lastTestResult && !lastTestResult.passed) {
      learnings.push(`Iteration ${iteration}: Failed after ${healAttempts} heal attempts`)
    }
  }

  // ─── PHASE 5: DISTILL ───
  phase("Distill")
  const distill = await agent(`You are evaluating the task completion.

## Original Goal
${GOAL}

## Current State
- Iteration: ${iteration}/${MAX_ITERATIONS}
- Tests: ${lastTestResult ? `${lastTestResult.tests_passed}/${lastTestResult.tests_run} passed` : 'unknown'}
- Files modified: ${[...allModifiedFiles].join(', ') || 'none'}
- Heal attempts: ${healAttempts}

${learnings.length ? `## Previous Learnings\n${learnings.join('\n')}` : ''}

## Instructions
1. Evaluate if the original goal has been achieved
2. Assess what percentage of the goal is complete
3. Identify any remaining work or blockers
4. Extract learnings for future iterations

Return a completion assessment.`, {
    label: "distill",
    schema: DISTILL_SHAPE,
  })

  if (distill) {
    log(`Goal achieved: ${distill.goal_achieved} (${distill.achievement_pct}%)`)
    distill.learnings?.forEach(l => learnings.push(l))

    if (distill.goal_achieved) {
      log(`\n${'='.repeat(60)}`)
      log(`SUCCESS after ${iteration} iteration(s)`)
      log(`${'='.repeat(60)}`)

      return {
        status: "completed",
        iterations: iteration,
        heal_attempts: healAttempts,
        files_modified: [...allModifiedFiles],
        summary: distill.summary,
        learnings: distill.learnings,
      }
    }

    if (distill.blockers?.length > 0) {
      log(`Blockers: ${distill.blockers.join(', ')}`)
    }
  }

  // Reset heal attempts for next iteration
  healAttempts = 0
}

// ─── Exhausted iterations ───
log(`\n${'='.repeat(60)}`)
log(`FAILED after ${MAX_ITERATIONS} iterations`)
log(`${'='.repeat(60)}`)

return {
  status: "failed",
  iterations: MAX_ITERATIONS,
  heal_attempts: healAttempts,
  files_modified: [...allModifiedFiles],
  summary: `Failed to achieve goal after ${MAX_ITERATIONS} iterations`,
  learnings,
  last_test_result: lastTestResult,
  last_plan: lastPlan,
}
