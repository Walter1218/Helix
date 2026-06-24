import { bootstrap } from "./bootstrap"

bootstrap({
  url: process.env["HELIX_URL"] ?? "http://localhost:3095",
  directory: process.cwd(),
}).catch(console.error)
