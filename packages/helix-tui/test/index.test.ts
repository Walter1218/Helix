import { describe, expect, test } from "bun:test"

describe("Helix TUI", () => {
  test("package structure", () => {
    // Verify the package can be imported
    const fs = require("fs")
    const path = require("path")
    
    const packagePath = path.join(__dirname, "..")
    const srcPath = path.join(packagePath, "src")
    
    // Check that source files exist
    expect(fs.existsSync(path.join(srcPath, "index.ts"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "app.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "bootstrap.tsx"))).toBe(true)
    
    // Check that context files exist
    expect(fs.existsSync(path.join(srcPath, "context", "route.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "context", "theme.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "context", "sdk.tsx"))).toBe(true)
    
    // Check that component files exist
    expect(fs.existsSync(path.join(srcPath, "component", "sidebar.tsx"))).toBe(true)
    
    // Check that route files exist
    expect(fs.existsSync(path.join(srcPath, "routes", "home.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "routes", "chat.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "routes", "project.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "routes", "monitor.tsx"))).toBe(true)
    expect(fs.existsSync(path.join(srcPath, "routes", "settings.tsx"))).toBe(true)
  })
})
