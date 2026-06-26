import { bootstrap } from "./bootstrap"
import * as trace from "./trace"

trace.emit("ui.init", "info", "Starting Helix TUI", { url: process.env["HELIX_URL"] ?? "http://localhost:3095" })
bootstrap({
  url: process.env["HELIX_URL"] ?? "http://localhost:3095",
  directory: process.cwd(),
}).catch(console.error)
