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
proc.stdout.on("data", (d) => {
  allOutput += d.toString();
});

proc.stderr.on("data", (d) => {
  const text = d.toString();
  allOutput += text;
  process.stderr.write(text);
});

setTimeout(() => {
  console.log("[SENDING: 2 -> Chat]");
  proc.stdin.write("2");
}, 2000);

setTimeout(() => {
  console.log("[SENDING: hello]");
  proc.stdin.write("hello");
}, 3000);

setTimeout(() => {
  console.log("[SENDING: Enter]");
  proc.stdin.write("\r");
}, 4000);

setTimeout(() => {
  console.log("[KILLING]");
  proc.kill();
  
  // Check for error message
  if (allOutput.includes("undefined is not an object") || allOutput.includes("TypeError")) {
    console.log("\n=== FOUND ERROR IN OUTPUT ===");
    const idx = allOutput.indexOf("undefined is not an object");
    if (idx >= 0) {
      console.log(allOutput.slice(Math.max(0, idx - 200), idx + 100));
    }
    const tidx = allOutput.indexOf("TypeError");
    if (tidx >= 0) {
      console.log(allOutput.slice(Math.max(0, tidx - 200), tidx + 200));
    }
  } else {
    console.log("\n=== No 'undefined is not an object' error found in output ===");
  }
}, 8000);
