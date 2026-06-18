/**
 * 快速验证测试 - 每种复杂度取5个任务，共90个测试
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const B = "http://localhost:3095";
const TIMEOUT = 60000;
const ASYNC_WAIT = 10000;
const RETRY = 2;
const RETRY_DELAY = 1500;

const MODES = ["ask", "build", "plan", "compose", "loop", "max"];
const COMPLEXITY = ["simple", "medium", "complex"];
const TASKS_PER_LEVEL = 5; // 每种复杂度取5个任务

const results = { total: 0, passed: 0, failed: 0, details: [] };

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
          hasResponse: true,
        };
      }
    }
  } catch {}
  return null;
}

async function runTest(task, mode, complexity) {
  const testId = `${complexity[0].toUpperCase()}${task.id}-${mode}`;
  results.total++;

  try {
    const cr = await reqRetry(`${B}/session`, { method: "POST", body: { title: `Test ${testId}` } });
    if (cr.s !== 200 || !cr.d?.id) throw new Error("create session failed");
    const sid = cr.d.id;

    const isAsync = mode !== "ask";
    const endpoint = isAsync ? "prompt_async" : "message";
    const body = { parts: [{ type: "text", text: task.prompt }], agent: mode };

    const start = Date.now();
    const r = await reqRetry(`${B}/session/${sid}/${endpoint}`, { method: "POST", body });
    const elapsed = Date.now() - start;

    let success = false;
    let response = null;

    // All modes: wait for response then check session messages
    if (r.s === 200 || r.s === 204) {
      const waitTime = isAsync ? ASYNC_WAIT : 3000;
      await sleep(waitTime);
      response = await getAIResponse(sid);
      success = response !== null && response.hasResponse;
    }

    await req(`${B}/session/${sid}`, { method: "DELETE" }).catch(() => {});

    const result = {
      id: testId, task: task.id, mode, complexity,
      prompt: task.prompt.substring(0, 60),
      status: success ? "passed" : "failed",
      elapsed,
      response: response?.text?.substring(0, 150) || "",
      toolCalls: response?.toolCalls || 0,
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

async function runQuickTest() {
  console.log("=== Helix AI Quick Mass Test ===");
  console.log(`Modes: ${MODES.join(", ")}`);
  console.log(`Tasks per complexity: ${TASKS_PER_LEVEL}`);
  console.log(`Total tests: ${MODES.length} × ${COMPLEXITY.length} × ${TASKS_PER_LEVEL} = ${MODES.length * COMPLEXITY.length * TASKS_PER_LEVEL}\n`);

  const tasksPath = path.join(__dirname, "test-tasks.json");
  const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));

  try {
    const sr = await req(`${B}/session`);
    if (sr.s !== 200) throw new Error("server not running");
    console.log(`Server OK\n`);
  } catch (e) {
    console.error(`Server not running: ${e.message}`);
    return;
  }

  const startTime = Date.now();

  for (const complexity of COMPLEXITY) {
    console.log(`\n=== ${complexity.toUpperCase()} ===`);
    const taskList = tasks[complexity].slice(0, TASKS_PER_LEVEL);

    for (const mode of MODES) {
      process.stdout.write(`  ${mode}: `);
      for (const task of taskList) {
        const result = await runTest(task, mode, complexity);
        process.stdout.write(result.status === "passed" ? "." : "F");
      }
      console.log();
    }
  }

  const totalTime = Date.now() - startTime;

  console.log("\n=== Summary ===");
  console.log(`Passed: ${results.passed}/${results.total} (${((results.passed / results.total) * 100).toFixed(1)}%)`);
  console.log(`Time: ${(totalTime / 1000).toFixed(1)}s`);

  console.log("\nBy Mode:");
  for (const mode of MODES) {
    const mt = results.details.filter((d) => d.mode === mode);
    const mp = mt.filter((d) => d.status === "passed").length;
    console.log(`  ${mode}: ${mp}/${mt.length}`);
  }

  console.log("\nBy Complexity:");
  for (const c of COMPLEXITY) {
    const ct = results.details.filter((d) => d.complexity === c);
    const cp = ct.filter((d) => d.status === "passed").length;
    console.log(`  ${c}: ${cp}/${ct.length}`);
  }

  // Save
  const reportPath = path.join(__dirname, "mass-test-quick-results.json");
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { total: results.total, passed: results.passed, failed: results.failed, time: totalTime }, details: results.details }, null, 2));
  console.log(`\nSaved to: ${reportPath}`);

  return results;
}

if (require.main === module) {
  runQuickTest().catch(console.error);
}

module.exports = { runQuickTest };
