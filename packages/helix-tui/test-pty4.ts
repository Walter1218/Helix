import { spawn } from "child_process";

const proc = spawn("bun", [
  "run", "--conditions=browser", "dist/index.js"
], {
  env: {
    ...process.env,
    HELIX_URL: "http://localhost:3095",
    MIMOCODE_SERVER_PASSWORD: "test123",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let allOutput = "";
proc.stdout.on("data", (d) => { allOutput += d.toString(); });
proc.stderr.on("data", (d) => { allOutput += d.toString(); });

setTimeout(() => { proc.stdin.write("2"); }, 2000);
setTimeout(() => { proc.stdin.write("hello"); }, 3000);
setTimeout(() => { proc.stdin.write("\r"); }, 4000);

setTimeout(() => {
  proc.kill();
  
  // Look for the error and any debug output
  const lines = allOutput.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("[DEBUG]") || lines[i].includes("undefined is not")) {
      console.log("LINE", i, ":", lines[i].slice(-300));
    }
  }
  
  // Also check trace log file
  const fs = require("fs");
  try {
    const files = fs.readdirSync("/tmp/helix-tui");
    console.log("Trace files:", files);
    for (const f of files) {
      if (f.startsWith("trace-")) {
        const content = fs.readFileSync(`/tmp/helix-tui/${f}`, "utf-8");
        const lines2 = content.split("\n");
        for (const line of lines2) {
          if (line.includes("[DEBUG]") || line.includes("prompt data")) {
            console.log("TRACE:", line);
          }
        }
      }
    }
  } catch {}
}, 8000);
