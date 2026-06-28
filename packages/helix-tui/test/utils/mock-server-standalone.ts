/**
 * Standalone mock server (no test code) for headless controller imports.
 * Re-exports from mock-server.ts after stripping test runner code.
 */

// Re-export types and factory from the main mock-server
export { createMockServer, createMockFetch } from "./mock-server"
export type {
  Scenario,
  DirectScenario,
  StreamingScenario,
  ErrorScenario,
  ToolScenario,
  PermissionScenario,
  QuestionScenario,
  CustomScenario,
  PreFlightScenario,
  CardinalScenario,
  JudgeScenario,
  AlignmentScenario,
  SubagentScenario,
  ModeConfigScenario,
  DecompositionScenario,
  PersonaScenario,
  AgentStatsScenario,
} from "./mock-server"
