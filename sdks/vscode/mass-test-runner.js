/**
 * 大规模测试运行器
 * 3种复杂度 × 20个任务 × 6种模式 = 360个测试用例
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const B = "http://localhost:3095";
const TIMEOUT = 60000;
const ASYNC_WAIT = 15000; // wait for async tasks
const RETRY = 3;
const RETRY_DELAY = 2000;

const MODES = ["ask", "build", "plan", "compose", "loop", "max"];
const COMPLEXITY = ["simple", "medium", "complex"];

// Results
const results = { total: 0, passed: 0, failed: 0, skipped: 0, details: [] };

function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const timeoutId = setTimeout(() => reject(new Error("timeout")), TIMEOUT);
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || "GET", headers: { "Content-Type": "application/json" } },
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
    if (opts.body) r.write(JSON.stringify(opts.body));
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reqRetry(url, opts = {}) {
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

async function checkStatus(sid) {
  try {
    const r = await req(`${B}/session/${sid}`);
    return r.d?.status || "unknown";
  } catch { return "error"; }
}

async function waitForIdle(sid, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const st = await checkStatus(sid);
    if (st === "idle" || st === "unknown") return true;
    await sleep(1000);
  }
  return false;
}

async function ensureIdle(sid) {
  const st = await checkStatus(sid);
  if (st === "busy") return waitForIdle(sid);
  return true;
}

// Get AI response from session messages
async function getAIResponse(sid) {
  try {
    const r = await req(`${B}/session/${sid}/message`);
    if (r.s === 200 && Array.isArray(r.d)) {
      const assistantMsgs = r.d.filter((m) => m.info?.role === "assistant");
      if (assistantMsgs.length > 0) {
        const last = assistantMsgs[assistantMsgs.length - 1];
        const textPart = last.parts?.find((p) => p.type === "text");
        const toolParts = last.parts?.filter((p) => p.type === "tool") || [];
        return {
          text: textPart?.text || "",
          toolCalls: toolParts.length,
          tools: toolParts.map((t) => t.tool),
        };
      }
    }
  } catch {}
  return null;
}

// Run a single test
async function runTest(task, mode, complexity) {
  const testId = `${complexity}-${task.id}-${mode}`;
  results.total++;

  try {
    // Create session
    const cr = await reqRetry(`${B}/session`, { method: "POST", body: { title: `Test ${testId}` } });
    if (cr.s !== 200 || !cr.d?.id) throw new Error("create session failed");
    const sid = cr.d.id;

    // Send prompt
    const isAsync = mode !== "ask";
    const endpoint = isAsync ? "prompt_async" : "message";
    const body = { parts: [{ type: "text", text: task.prompt }], agent: mode };

    const start = Date.now();
    const r = await reqRetry(`${B}/session/${sid}/${endpoint}`, { method: "POST", body });
    const elapsed = Date.now() - start;

    let success = false;
    let response = null;

    if (isAsync) {
      if (r.s === 204) {
        // Wait for async processing
        await sleep(ASYNC_WAIT);
        response = await getAIResponse(sid);
        success = response !== null && response.text.length > 0;
      }
    } else {
      if (r.s === 200) {
        response = { text: r.d?.parts?.find((p) => p.type === "text")?.text || "", toolCalls: 0, tools: [] };
        success = response.text.length > 0;
      }
    }

    // Cleanup
    await req(`${B}/session/${sid}`, { method: "DELETE" }).catch(() => {});

    const result = {
      id: testId,
      task: task.id,
      mode,
      complexity,
      prompt: task.prompt.substring(0, 80),
      status: success ? "passed" : "failed",
      elapsed,
      response: response?.text?.substring(0, 200) || "",
      toolCalls: response?.toolCalls || 0,
      tools: response?.tools || [],
    };

    results.details.push(result);
    if (success) results.passed++;
    else results.failed++;

    return result;
  } catch (e) {
    const result = {
      id: testId,
      task: task.id,
      mode,
      complexity,
      prompt: task.prompt.substring(0, 80),
      status: "error",
      elapsed: 0,
      error: e.message,
    };
    results.details.push(result);
    results.failed++;
    return result;
  }
}

// Main test runner
async function runMassTest() {
  console.log("=== Helix AI Mass Test Runner ===");
  console.log(`Modes: ${MODES.join(", ")}`);
  console.log(`Complexity: ${COMPLEXITY.join(", ")}`);
  console.log(`Total tests: ${MODES.length} × ${COMPLEXITY.length} × 20 = ${MODES.length * COMPLEXITY.length * 20}\n`);

  // Load tasks
  const tasksPath = path.join(__dirname, "test-tasks.json");
  if (!fs.existsSync(tasksPath)) {
    console.error("test-tasks.json not found");
    return;
  }
  const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));

  // Check server
  try {
    const sr = await req(`${B}/session`);
    if (sr.s !== 200) throw new Error("server not running");
    console.log(`Server OK, ${sr.d.length} sessions\n`);
  } catch (e) {
    console.error(`Server not running: ${e.message}`);
    return;
  }

  const startTime = Date.now();

  // Run tests by complexity and mode
  for (const complexity of COMPLEXITY) {
    console.log(`\n=== ${complexity.toUpperCase()} Tasks ===`);
    const taskList = tasks[complexity];

    for (const mode of MODES) {
      console.log(`\n--- Mode: ${mode} ---`);

      for (const task of taskList) {
        const result = await runTest(task, mode, complexity);
        const icon = result.status === "passed" ? "PASS" : "FAIL";
        console.log(`  ${icon} ${task.id} [${mode}] ${result.elapsed}ms ${result.toolCalls ? `(${result.toolCalls} tools)` : ""}`);
      }
    }
  }

  const totalTime = Date.now() - startTime;

  // Generate report
  console.log("\n=== Results ===");
  console.log(`Total: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log(`Time: ${(totalTime / 1000).toFixed(1)}s`);

  // By mode
  console.log("\nBy Mode:");
  for (const mode of MODES) {
    const modeTests = results.details.filter((d) => d.mode === mode);
    const modePassed = modeTests.filter((d) => d.status === "passed").length;
    console.log(`  ${mode}: ${modePassed}/${modeTests.length} (${((modePassed / modeTests.length) * 100).toFixed(1)}%)`);
  }

  // By complexity
  console.log("\nBy Complexity:");
  for (const c of COMPLEXITY) {
    const cTests = results.details.filter((d) => d.complexity === c);
    const cPassed = cTests.filter((d) => d.status === "passed").length;
    console.log(`  ${c}: ${cPassed}/${cTests.length} (${((cPassed / cTests.length) * 100).toFixed(1)}%)`);
  }

  // Save results
  const reportPath = path.join(__dirname, "mass-test-results.json");
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { total: results.total, passed: results.passed, failed: results.failed, time: totalTime }, details: results.details }, null, 2));
  console.log(`\nResults saved to: ${reportPath}`);

  return results;
}

if (require.main === module) {
  runMassTest().catch(console.error);
}

module.exports = { runMassTest };
