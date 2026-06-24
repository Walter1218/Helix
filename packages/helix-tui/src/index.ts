#!/usr/bin/env bun

import { bootstrap } from "./bootstrap"

const url = process.env["HELIX_URL"] ?? "http://localhost:3000"
const directory = process.cwd()

console.log("Starting Helix TUI...")
console.log(`URL: ${url}`)
console.log(`Directory: ${directory}`)

bootstrap({ url, directory }).catch((error) => {
  console.error("Failed to start Helix TUI:", error)
  process.exit(1)
})
