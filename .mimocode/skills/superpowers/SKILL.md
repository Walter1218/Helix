---
name: superpowers
description: Development workflow skills for planning, execution, and verification
---

# Superpowers

Development workflow skills for structured task execution.

## When to Use

**Only engage these skills when starting a fresh task.** If you're already mid-task with context, continue your current workflow.

## Skills

### superpowers:brainstorming

**Trigger:** Starting a new feature or complex task.

**Workflow:**
1. Clarify requirements - ask targeted questions
2. Identify constraints (tech stack, existing patterns, performance)
3. Explore codebase for similar patterns
4. Propose 2-3 approaches with tradeoffs
5. Get user alignment before proceeding

**Output:** Clear problem statement + chosen approach.

### superpowers:writing-plans

**Trigger:** After brainstorming, before implementation.

**Workflow:**
1. Break task into atomic, verifiable steps
2. Identify dependencies between steps
3. Flag risks and unknowns
4. Estimate complexity per step
5. Present plan for user approval

**Output:** Numbered implementation plan with dependencies noted.

### superpowers:executing-plans

**Trigger:** When executing a plan (your own or provided).

**Workflow:**
1. Follow plan steps sequentially
2. Verify each step before moving to next
3. Update plan status as you progress
4. Flag blockers immediately - don't wait
5. Request plan revision if assumptions break

**Output:** Completed steps with verification status.

### superpowers:subagent-driven-development

**Trigger:** Tasks with parallelizable independent steps.

**Workflow:**
1. Identify independent work streams
2. Spawn subagents for parallel execution
3. Provide each subagent clear, isolated context
4. Monitor progress and coordinate
5. Integrate results and verify consistency

**Output:** Coordinated parallel execution with integrated results.

### superpowers:verification-before-completion

**Trigger:** Before marking any work as complete.

**Workflow:**
1. Run typecheck (`bun typecheck`)
2. Run tests (`bun test` from package dir)
3. Run lint (`bun run lint`)
4. Verify implementation matches requirements
5. Check for edge cases and error handling

**Output:** Verified, passing implementation.

### superpowers:test-driven-development

**Trigger:** Features with clear expected behavior.

**Workflow:**
1. Write failing test that captures requirement
2. Run test to confirm it fails
3. Implement minimum code to pass
4. Run test to confirm it passes
5. Refactor if needed, keeping tests green

**Output:** Tested implementation with passing test suite.

## Decision Matrix

| Scenario | Skill to Use |
|----------|--------------|
| New feature, unclear requirements | brainstorming → writing-plans |
| New feature, clear requirements | writing-plans → executing-plans |
| Large task with parallel work | subagent-driven-development |
| Bug fix with known behavior | test-driven-development |
| Any completion | verification-before-completion |
