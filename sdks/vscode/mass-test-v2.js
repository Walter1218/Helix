/**
 * 大规模测试运行器 v2
 * 策略：
 * - build/plan/compose: 异步端点，验证消息存储
 * - ask/loop/max: 同步端点，验证状态码 200
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const B = "http://localhost:3095";
const TIMEOUT = 60000;
const ASYNC_WAIT = 12000;
const RETRY = 2;
const RETRY_DELAY = 1500;

const MODES = ["ask", "build", "plan", "compose", "loop", "max"];
const COMPLEXITY = ["simple", "medium", "complex"];
const TASKS_PER_LEVEL = 5;

// Async modes: verify via message storage
const ASYNC_MODES = ["build", "plan", "compose"];
// Sync modes: verify via status code
const SYNC_MODES = ["ask", "loop", "max"];

const results = { total: 0, passed: 0, failed: 0, details: [] };

function req(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const timeoutId = setTimeout(() => reject(new Error("timeout")), TIMEOUT);
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts && opts.method || "GET", headers: { "Content-Type": "application/json" } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          clearTimeout(timeoutId);
          try { resolve({ s: res.statusCode, d: JSON.parse(d) }); } catch { resolve({ s: res.statusCode, d }); }
        });
      }
    );
    r.on("error", (e) => { clearTimeout(timeoutId); reject(e); });
    if (opts && opts.body) r.write(JSON.stringify(opts.body));
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reqRetry(url, opts) {
  let last;
  for (let i = 1; i <= RETRY; i++) {
    try {
      const r = await req(url, opts);
      if (r.s === 409) { await sleep(RETRY_DELAY); continue; }
      return r;
    } catch (e) {
      last = e;
      if (i < RETRY) await sleep(RETRY_DELAY);
    }
  }
  throw last;
}

async function getAIResponse(sid) {
  try {
    const r = await req(B + "/session/" + sid + "/message");
    if (r.s === 200 && Array.isArray(r.d)) {
      const assistantMsgs = r.d.filter((m) => m.info && m.info.role === "assistant");
      if (assistantMsgs.length > 0) {
        const last = assistantMsgs[assistantMsgs.length - 1];
        const textPart = last.parts && last.parts.find((p) => p.type === "text");
        const toolParts = last.parts ? last.parts.filter((p) => p.type === "tool") : [];
        return {
          text: textPart ? textPart.text : "",
          toolCalls: toolParts.length,
          tools: toolParts.map((t) => t.tool),
          hasResponse: true,
        };
      }
    }
  } catch {}
  return null;
}

async function runTest(task, mode, complexity) {
  const testId = complexity[0].toUpperCase() + task.id + "-" + mode;
  results.total++;

  try {
    const cr = await reqRetry(B + "/session", { method: "POST", body: { title: "Test " + testId } });
    if (cr.s !== 200 || !cr.d || !cr.d.id) throw new Error("create session failed");
    const sid = cr.d.id;

    const body = { parts: [{ type: "text", text: task.prompt }], agent: mode };
    const start = Date.now();
    let success = false;
    let response = null;

    if (ASYNC_MODES.includes(mode)) {
      // Async mode: use prompt_async, verify via message storage
      const r = await reqRetry(B + "/session/" + sid + "/prompt_async", { method: "POST", body });
      if (r.s === 204) {
        await sleep(ASYNC_WAIT);
        response = await getAIResponse(sid);
        success = response !== null && response.hasResponse;
      }
    } else {
      // Sync mode: use message endpoint, verify via status code
      const r = await reqRetry(B + "/session/" + sid + "/message", { method: "POST", body });
      success = r.s === 200;
      if (success) {
        response = { text: "(sync mode - response streamed to client)", toolCalls: 0, tools: [], hasResponse: true };
      }
    }

    const elapsed = Date.now() - start;
    await req(B + "/session/" + sid, { method: "DELETE" }).catch(() => {});

    const result = {
      id: testId, task: task.id, mode, complexity,
      prompt: task.prompt.substring(0, 60),
      status: success ? "passed" : "failed",
      elapsed,
      response: response ? response.text.substring(0, 150) : "",
      toolCalls: response ? response.toolCalls : 0,
      verification: ASYNC_MODES.includes(mode) ? "message_storage" : "status_code",
    };

    results.details.push(result);
    if (success) results.passed++; else results.failed++;
    return result;
  } catch (e) {
    const result = { id: testId, task: task.id, mode, complexity, status: "error", elapsed: 0, error: e.message };
    results.details.push(result);
    results.failed++;
    return result;
  }
}

async function runMassTest() {
  console.log("=== Helix AI Mass Test v2 ===");
  console.log("Modes:", MODES.join(", "));
  console.log("Tasks per complexity:", TASKS_PER_LEVEL);
  console.log("Total tests:", MODES.length * COMPLEXITY.length * TASKS_PER_LEVEL);
  console.log("Verification strategy:");
  console.log("  Async (build/plan/compose): verify via message storage");
  console.log("  Sync (ask/loop/max): verify via status code 200");
  console.log("");

  const tasksPath = path.join(__dirname, "test-tasks.json");
  const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));

  try {
    const sr = await req(B + "/session");
    if (sr.s !== 200) throw new Error("server not running");
    console.log("Server OK");
  } catch (e) {
    console.error("Server not running:", e.message);
    return;
  }

  const startTime = Date.now();

  for (const complexity of COMPLEXITY) {
    console.log("\n=== " + complexity.toUpperCase() + " ===");
    const taskList = tasks[complexity].slice(0, TASKS_PER_LEVEL);

    for (const mode of MODES) {
      process.stdout.write("  " + mode + ": ");
      for (const task of taskList) {
        const result = await runTest(task, mode, complexity);
        process.stdout.write(result.status === "passed" ? "." : "F");
      }
      console.log();
    }
  }

  const totalTime = Date.now() - startTime;

  console.log("\n=== Summary ===");
  console.log("Passed:", results.passed + "/" + results.total, "(" + ((results.passed / results.total) * 100).toFixed(1) + "%)");
  console.log("Time:", (totalTime / 1000).toFixed(1) + "s");

  console.log("\nBy Mode:");
  for (const mode of MODES) {
    const mt = results.details.filter((d) => d.mode === mode);
    const mp = mt.filter((d) => d.status === "passed").length;
    const strategy = ASYNC_MODES.includes(mode) ? "(async)" : "(sync)";
    console.log("  " + mode + " " + strategy + ": " + mp + "/" + mt.length);
  }

  console.log("\nBy Complexity:");
  for (const c of COMPLEXITY) {
    const ct = results.details.filter((d) => d.complexity === c);
    const cp = ct.filter((d) => d.status === "passed").length;
    console.log("  " + c + ": " + cp + "/" + ct.length);
  }

  const reportPath = path.join(__dirname, "mass-test-v2-results.json");
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { total: results.total, passed: results.passed, failed: results.failed, time: totalTime, strategy: "hybrid" }, details: results.details }, null, 2));
  console.log("\nSaved to:", reportPath);

  return results;
}

if (require.main === module) {
  runMassTest().catch(console.error);
}

module.exports = { runMassTest };
