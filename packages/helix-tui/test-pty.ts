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

let stdout = "";
proc.stdout.on("data", (d) => {
  stdout += d.toString();
  process.stdout.write(d);
});

proc.stderr.on("data", (d) => {
  process.stderr.write(d);
});

// Type a message after TUI loads
setTimeout(() => {
  console.log("\n[SENDING INPUT: hello + Enter]");
  proc.stdin.write("hello\n");
}, 3000);

setTimeout(() => {
  console.log("\n[KILLING AFTER 10s]");
  proc.kill();
  console.log("\n--- STDOUT ---");
  console.log(stdout.slice(-2000));
}, 10000);
