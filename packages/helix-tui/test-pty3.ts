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

let stdoutData = "";
let stderrData = "";
proc.stdout.on("data", (d) => {
  stdoutData += d.toString();
});

proc.stderr.on("data", (d) => {
  const text = d.toString();
  stderrData += text;
  process.stderr.write(text);
});

setTimeout(() => { proc.stdin.write("2"); }, 2000);
setTimeout(() => { proc.stdin.write("hello"); }, 3000);
setTimeout(() => { proc.stdin.write("\r"); }, 4000);

setTimeout(() => {
  proc.kill();
  console.log("\n=== STDERR (contains console.log) ===");
  console.log(stderrData.slice(-2000));
  
  if (stderrData.includes("[DEBUG]")) {
    const idx = stderrData.indexOf("[DEBUG]");
    console.log("\n=== DEBUG LOG FOUND ===");
    console.log(stderrData.slice(idx, idx + 500));
  }
  
  if (stderrData.includes("undefined is not an object") || stdoutData.includes("undefined is not an object")) {
    console.log("\n=== ERROR FOUND ===");
  }
}, 8000);
