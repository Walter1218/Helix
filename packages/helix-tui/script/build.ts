#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

console.log("Building @mimo-ai/helix-tui...")

// Clean dist directory
await $`rm -rf dist`

// Build with Bun and SolidJS plugin
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: false,
  sourcemap: "external",
  splitting: true,
  plugins: [createSolidTransformPlugin()],
  external: [
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
    "effect",
    "@mimo-ai/sdk",
    "@mimo-ai/shared",
    "zod",
  ],
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`Build successful! ${result.outputs.length} files generated`)

// Copy package.json to dist
await $`cp package.json dist/`

console.log("Done!")
