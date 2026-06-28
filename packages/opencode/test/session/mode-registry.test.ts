import { describe, expect, it } from "bun:test"
import type { EvolutionConfig, ModeHandler } from "../../src/session/mode-registry"

const DEFAULT_EVOLUTION_CONFIG: Record<string, EvolutionConfig> = {
  ask: {
    judgeEnabled: false,
    traceExportEnabled: false,
    evolutionEnabled: false,
    specDrivenEnabled: false,
  },
  build: {
    judgeEnabled: true,
    judgeAction: "inject",
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  plan: {
    judgeEnabled: true,
    judgeAction: "warn",
    judgeChecks: ["security", "relevance"],
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  compose: {
    judgeEnabled: true,
    judgeAction: "inject",
    judgeChecks: ["security", "completeness"],
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  max: {
    judgeEnabled: true,
    judgeAction: "block",
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
  loop: {
    judgeEnabled: true,
    judgeAction: "inject",
    traceExportEnabled: true,
    evolutionEnabled: true,
    specDrivenEnabled: true,
    specInjection: "on-match",
  },
}

describe("ModeRegistry", () => {
  describe("default evolution configs", () => {
    it("ask mode has judge disabled", () => {
      const cfg = DEFAULT_EVOLUTION_CONFIG.ask
      expect(cfg.judgeEnabled).toBe(false)
      expect(cfg.traceExportEnabled).toBe(false)
      expect(cfg.evolutionEnabled).toBe(false)
      expect(cfg.specDrivenEnabled).toBe(false)
    })

    it("build mode has all features enabled", () => {
      const cfg = DEFAULT_EVOLUTION_CONFIG.build
      expect(cfg.judgeEnabled).toBe(true)
      expect(cfg.judgeAction).toBe("inject")
      expect(cfg.traceExportEnabled).toBe(true)
      expect(cfg.evolutionEnabled).toBe(true)
      expect(cfg.specDrivenEnabled).toBe(true)
      expect(cfg.specInjection).toBe("on-match")
    })

    it("plan mode uses warn action with limited checks", () => {
      const cfg = DEFAULT_EVOLUTION_CONFIG.plan
      expect(cfg.judgeEnabled).toBe(true)
      expect(cfg.judgeAction).toBe("warn")
      expect(cfg.judgeChecks).toEqual(["security", "relevance"])
    })

    it("compose mode uses inject action with completeness check", () => {
      const cfg = DEFAULT_EVOLUTION_CONFIG.compose
      expect(cfg.judgeAction).toBe("inject")
      expect(cfg.judgeChecks).toEqual(["security", "completeness"])
    })

    it("max mode uses block action", () => {
      const cfg = DEFAULT_EVOLUTION_CONFIG.max
      expect(cfg.judgeAction).toBe("block")
    })

    it("loop mode uses inject action", () => {
      const cfg = DEFAULT_EVOLUTION_CONFIG.loop
      expect(cfg.judgeAction).toBe("inject")
    })

    it("all non-ask modes have specDrivenEnabled true", () => {
      for (const [mode, cfg] of Object.entries(DEFAULT_EVOLUTION_CONFIG)) {
        if (mode === "ask") {
          expect(cfg.specDrivenEnabled).toBe(false)
        } else {
          expect(cfg.specDrivenEnabled).toBe(true)
        }
      }
    })
  })

  describe("ModeHandler interface", () => {
    it("minimal handler has only id", () => {
      const handler: ModeHandler = { id: "custom" }
      expect(handler.id).toBe("custom")
      expect(handler.enabled).toBeUndefined()
      expect(handler.buildSystemPrompt).toBeUndefined()
      expect(handler.preprocess).toBeUndefined()
      expect(handler.execute).toBeUndefined()
      expect(handler.evolutionConfig).toBeUndefined()
    })

    it("handler with custom evolution config", () => {
      const customCfg: EvolutionConfig = {
        judgeEnabled: false,
        traceExportEnabled: true,
        evolutionEnabled: false,
        specDrivenEnabled: true,
        specInjection: "always",
      }
      const handler: ModeHandler = { id: "custom", evolutionConfig: customCfg }
      expect(handler.evolutionConfig?.specInjection).toBe("always")
    })
  })

  describe("fallback behavior", () => {
    it("unknown mode falls back to build config", () => {
      const unknown = DEFAULT_EVOLUTION_CONFIG["nonexistent"] ?? DEFAULT_EVOLUTION_CONFIG.build
      expect(unknown.judgeEnabled).toBe(true)
      expect(unknown.judgeAction).toBe("inject")
    })
  })
})
