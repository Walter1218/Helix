import { run as runTui } from "./app"
import type { TuiInput } from "./app"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input)
}
