import { describe, test, expect } from "bun:test"
import { Util } from "../src/util"

describe("Util", () => {
  test("can be instantiated", () => {
    const util = new Util()
    expect(util).toBeInstanceOf(Util)
  })

  describe("truncate", () => {
    test("returns text unchanged when shorter than maxLength", () => {
      expect(Util.truncate("hello", 10)).toBe("hello")
    })

    test("truncates text exceeding maxLength with default suffix", () => {
      expect(Util.truncate("hello world", 8)).toBe("hello...")
    })

    test("truncates with custom suffix", () => {
      expect(Util.truncate("hello world", 8, "…")).toBe("hello w…")
    })

    test("returns exact-length text unchanged", () => {
      expect(Util.truncate("hello", 5)).toBe("hello")
    })
  })
})
