import { bootstrap } from "./bootstrap"

bootstrap({
  url: process.env["HELIX_URL"] ?? "http://localhost:3000",
  directory: process.cwd(),
}).catch(console.error)
