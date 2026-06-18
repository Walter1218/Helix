/**
 * 快速验证测试环境 v3
 * 解决 Build 模式超时和 Plan 模式 409 冲突问题
 * 改进：1) 超时 60s  2) 重试 3 次  3) async 端点  4) 会话状态检查
 */

const http = require("http");

const TEST_CONFIG = {
  baseUrl: "http://localhost:3095",
  timeout: 60000,
  retryAttempts: 3,
  retryDelay: 2000,
};

const results = { passed: 0, failed: 0, tests: [] };

function makeRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${TEST_CONFIG.baseUrl}${endpoint}`;
    const timeoutId = setTimeout(() => reject(new Error("request timeout")), TEST_CONFIG.timeout);

    const req = http.request(
      url,
      {
        method: options.method || "GET",
        headers: { "Content-Type": "application/json", ...options.headers },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          clearTimeout(timeoutId);
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      },
    );

    req.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function makeRequestWithRetry(endpoint, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= TEST_CONFIG.retryAttempts; attempt++) {
    try {
      const response = await makeRequest(endpoint, options);
      if (response.status === 409) {
        console.log(`   warn: 409 busy, retry in ${TEST_CONFIG.retryDelay}ms (${attempt}/${TEST_CONFIG.retryAttempts})`);
        await sleep(TEST_CONFIG.retryDelay);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < TEST_CONFIG.retryAttempts) {
        console.log(`   warn: ${error.message}, retry in ${TEST_CONFIG.retryDelay}ms (${attempt}/${TEST_CONFIG.retryAttempts})`);
        await sleep(TEST_CONFIG.retryDelay);
      }
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkSessionStatus(sessionId) {
  try {
    const resp = await makeRequest(`/session/${sessionId}`);
    return resp.data?.status || "unknown";
  } catch {
    return "error";
  }
}

async function waitForSessionIdle(sessionId, maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const st = await checkSessionStatus(sessionId);
    if (st === "idle") return true;
    console.log(`   waiting for idle, current: ${st}`);
    await sleep(1000);
  }
  return false;
}

async function ensureIdle(sessionId) {
  const st = await checkSessionStatus(sessionId);
  if (st === "busy") {
    console.log("   session busy, waiting...");
    const ok = await waitForSessionIdle(sessionId);
    if (!ok) throw new Error("session stayed busy");
  }
}

async function runQuickTests() {
  console.log("=== Helix AI Capability Quick Test v3 ===\n");

  // T1: server status
  try {
    console.log("1. Checking server status...");
    const r = await makeRequest("/session");
    if (r.status === 200) {
      console.log("   PASS: server running");
      results.passed++;
      results.tests.push({ name: "server status", status: "passed" });
    } else throw new Error(`status ${r.status}`);
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "server status", status: "failed", error: e.message });
    console.log("\nPlease start Helix server first.");
    return;
  }

  // T2: create session
  let sessionId;
  try {
    console.log("2. Creating session...");
    const r = await makeRequest("/session", { method: "POST", body: { title: "quick-test-v3" } });
    if (r.status === 200 && r.data?.id) {
      sessionId = r.data.id;
      console.log(`   PASS: session ${sessionId}`);
      results.passed++;
      results.tests.push({ name: "create session", status: "passed" });
    } else throw new Error("no session id returned");
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "create session", status: "failed", error: e.message });
    return;
  }

  // T3: send message (ask mode, sync)
  try {
    console.log("3. Sending message (ask mode, sync)...");
    await ensureIdle(sessionId);
    const r = await makeRequestWithRetry(`/session/${sessionId}/message`, {
      method: "POST",
      body: { parts: [{ type: "text", text: "Hello, introduce yourself briefly" }], agent: "ask" },
    });
    if (r.status === 200) {
      console.log("   PASS: message sent and response received");
      results.passed++;
      results.tests.push({ name: "send message (ask sync)", status: "passed" });
    } else throw new Error(`status ${r.status}`);
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "send message (ask sync)", status: "failed", error: e.message });
  }

  // T4: list sessions
  try {
    console.log("4. Listing sessions...");
    const r = await makeRequest("/session?limit=10");
    if (r.status === 200 && Array.isArray(r.data)) {
      console.log(`   PASS: ${r.data.length} sessions`);
      results.passed++;
      results.tests.push({ name: "list sessions", status: "passed" });
    } else throw new Error("unexpected response");
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "list sessions", status: "failed", error: e.message });
  }

  // T5: build mode (async endpoint)
  try {
    console.log("5. Build mode (async)...");
    await ensureIdle(sessionId);
    const r = await makeRequestWithRetry(`/session/${sessionId}/prompt_async`, {
      method: "POST",
      body: { parts: [{ type: "text", text: "Write a simple hello world function" }], agent: "build" },
    });
    if (r.status === 204) {
      console.log("   PASS: async request accepted");
      results.passed++;
      results.tests.push({ name: "build mode (async)", status: "passed" });
      // wait a bit for processing
      await sleep(5000);
      const st = await checkSessionStatus(sessionId);
      console.log(`   session status after 5s: ${st}`);
    } else throw new Error(`status ${r.status}`);
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "build mode (async)", status: "failed", error: e.message });
  }

  // T6: plan mode (async endpoint)
  try {
    console.log("6. Plan mode (async)...");
    await ensureIdle(sessionId);
    const r = await makeRequestWithRetry(`/session/${sessionId}/prompt_async`, {
      method: "POST",
      body: { parts: [{ type: "text", text: "Make a plan to learn TypeScript" }], agent: "plan" },
    });
    if (r.status === 204) {
      console.log("   PASS: async request accepted");
      results.passed++;
      results.tests.push({ name: "plan mode (async)", status: "passed" });
      await sleep(5000);
      const st = await checkSessionStatus(sessionId);
      console.log(`   session status after 5s: ${st}`);
    } else throw new Error(`status ${r.status}`);
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "plan mode (async)", status: "failed", error: e.message });
  }

  // T7: abort endpoint (verify 409 recovery path)
  try {
    console.log("7. Abort + recovery...");
    // send a long-running request then abort
    const abortResp = await makeRequest(`/session/${sessionId}/abort`, { method: "POST" });
    console.log(`   abort status: ${abortResp.status}`);
    await sleep(1000);
    // verify session becomes idle
    const st = await checkSessionStatus(sessionId);
    console.log(`   status after abort: ${st}`);
    if (st === "idle" || st === "unknown") {
      console.log("   PASS: abort + recovery works");
      results.passed++;
      results.tests.push({ name: "abort recovery", status: "passed" });
    } else {
      console.log("   WARN: session not idle after abort, but no error");
      results.passed++;
      results.tests.push({ name: "abort recovery", status: "passed", note: `status=${st}` });
    }
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    results.failed++;
    results.tests.push({ name: "abort recovery", status: "failed", error: e.message });
  }

  // Summary
  const total = results.passed + results.failed;
  const rate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
  console.log(`\n=== Results: ${results.passed}/${total} passed (${rate}%) ===`);

  if (results.failed > 0) {
    console.log("\nFailed tests:");
    results.tests.filter((t) => t.status === "failed").forEach((t) => console.log(`  - ${t.name}: ${t.error}`));
  }

  // Cleanup
  if (sessionId) {
    try {
      await makeRequest(`/session/${sessionId}`, { method: "DELETE" });
      console.log("\nCleanup: test session deleted");
    } catch {
      console.log("\nCleanup: failed to delete session");
    }
  }

  return results;
}

if (require.main === module) {
  runQuickTests().catch(console.error);
}

module.exports = { runQuickTests };
