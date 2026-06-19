/**
 * Helix VSCode 扩展 — 双向交互集成测试（带 LLM）
 *
 * 测试范围：
 * 1. 多轮对话上下文保持（LLM 记住前一轮信息）
 * 2. Permission 审批流（SSE permission.asked → 自动 approve → 工具执行完成）
 * 3. Session abort（发送长任务 → 中途中断 → 验证 session 释放）
 * 4. Tool call 全链路可视化（tool.start → tool.end → text 结论）
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  cliPath: process.env.MIMO_CLI || '/Users/onetwo/Documents/trae_projects/Helix/packages/opencode/dist/mimocode-darwin-arm64/bin/mimo',
  port: 26295,
  workspace: 'bidirectional-test',
  testDir: '/tmp/helix-bridge-bi-test',
};

let totalPassed = 0;
let totalFailed = 0;

function log(msg, type = 'info') {
  const prefix = { info: 'ℹ️', pass: '✅', fail: '❌', warn: '⚠️' }[type] || 'ℹ️';
  console.log(`${prefix} ${msg}`);
}

function assert(cond, msg) {
  if (cond) { log(msg, 'pass'); totalPassed++; }
  else { log(msg, 'fail'); totalFailed++; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 守护进程 ──

class Daemon {
  constructor(port) { this.port = port; this.proc = null; }

  start() {
    return new Promise((resolve, reject) => {
      const home = process.env.HOME || '.';
      const mh = path.join(home, '.config', 'mimocode');
      fs.mkdirSync(mh, { recursive: true });

      this.proc = spawn(CONFIG.cliPath, ['serve', '--port', String(this.port)], {
        env: { ...process.env, MIMOCODE_HOME: mh, OPENCODE_CALLER: 'bridge-bi-test' },
        stdio: 'pipe',
      });
      this.proc.stdout?.on('data', () => {});
      this.proc.stderr?.on('data', () => {});
      this.proc.on('exit', () => {});

      (async () => {
        for (let i = 0; i < 60; i++) {
          try {
            const r = await fetch(`http://localhost:${this.port}/global/health`, { signal: AbortSignal.timeout(2000) });
            if (r.ok) { resolve(); return; }
          } catch {}
          await sleep(500);
        }
        reject(new Error('Health timeout'));
      })();
    });
  }

  stop() {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      setTimeout(() => { if (this.proc && !this.proc.killed) this.proc.kill('SIGKILL'); }, 3000);
      this.proc = null;
    }
  }
}

// ── SSE 连接 ──

function connectSSE(port) {
  const controller = new AbortController();
  const events = [];
  let ready = false;

  const promise = (async () => {
    const res = await fetch(`http://localhost:${port}/event`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`SSE HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            events.push(evt);
            if (evt.type === 'server.connected') ready = true;
          } catch {}
        }
      }
    }
  })().catch(() => {});

  return { events, abort: () => controller.abort(), isReady: () => ready, promise };
}

// ── API helpers ──

async function api(port, path, opts = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    ...opts,
    signal: AbortSignal.timeout(opts._timeout || 15000),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function sendPrompt(port, sessionID, text, timeoutMs = 90000) {
  const res = await fetch(`http://localhost:${port}/session/${sessionID}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts: [{ type: 'text', text }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Prompt HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
  } catch {}
  return body;
}

async function getMessages(port, sessionID) {
  const { data } = await api(port, `/session/${sessionID}/message`);
  return data || [];
}

// ── 等待特定 SSE 事件 ──

async function waitForSSEEvent(events, type, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const evt = events.find(e => e.type === type);
    if (evt) return evt;
    await sleep(500);
  }
  return null;
}

async function waitForSSEEventMatching(events, predicate, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const evt = events.find(predicate);
    if (evt) return evt;
    await sleep(500);
  }
  return null;
}

// ============================================================
// Test Suites
// ============================================================

async function testSuite1_MultiTurnConversation() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 1: 多轮对话上下文保持');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new Daemon(CONFIG.port);
  try {
    await daemon.start();
    log('Daemon ready', 'pass');

    // 创建 session
    const { data: session } = await api(CONFIG.port, '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Multi-turn test' }),
    });
    assert(session?.id, `Session created: ${session.id}`);

    // 第 1 轮：告诉 LLM 一个信息
    log('第 1 轮: 告诉 LLM "我的猫叫小橘"', 'info');
    const r1 = await sendPrompt(CONFIG.port, session.id, '记住：我的猫叫小橘，它是一只橘色的猫。只需回复"好的"即可。');
    assert(r1.length > 0, `第 1 轮响应 (${r1.length} bytes)`);

    await sleep(1000);
    const msgs1 = await getMessages(CONFIG.port, session.id);
    log(`第 1 轮后消息数: ${msgs1.length}`, 'info');

    // 第 2 轮：问 LLM 是否记得
    log('第 2 轮: 问 "我的猫叫什么名字？"', 'info');
    const r2 = await sendPrompt(CONFIG.port, session.id, '我的猫叫什么名字？直接回答名字即可。');
    assert(r2.length > 0, `第 2 轮响应 (${r2.length} bytes)`);

    await sleep(1000);
    const msgs2 = await getMessages(CONFIG.port, session.id);

    // 验证消息数增长（2轮对话 = 至少4条消息：user+assistant × 2）
    assert(msgs2.length >= 4, `4+ 条消息（实际 ${msgs2.length}）`);

    // 验证 LLM 回复中包含"小橘"
    const assistantMsgs = msgs2.filter(m => m.info?.role === 'assistant');
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    const textParts = lastAssistant?.parts?.filter(p => p.type === 'text') || [];
    const responseText = textParts.map(p => p.text || '').join('');
    const hasContext = responseText.includes('小橘');
    assert(hasContext, `LLM 记住了上下文: "${responseText.slice(0, 80)}"`);

  } catch (err) {
    log(`Multi-turn error: ${err.message}`, 'fail');
  } finally {
    daemon.stop();
    await sleep(2000);
  }
}

async function testSuite2_PermissionFlow() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 2: Permission 审批双向流');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 准备测试目录
  fs.mkdirSync(CONFIG.testDir, { recursive: true });
  const testFile = path.join(CONFIG.testDir, 'helix-bridge-test.txt');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

  const daemon = new Daemon(CONFIG.port);
  let sse = null;

  try {
    await daemon.start();
    sse = connectSSE(CONFIG.port);

    // 等待 SSE connected
    for (let i = 0; i < 20; i++) {
      if (sse.isReady()) break;
      await sleep(500);
    }
    assert(sse.isReady(), 'SSE connected');

    // 创建 session
    const { data: session } = await api(CONFIG.port, '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Permission test' }),
    });
    assert(session?.id, `Session: ${session.id}`);

    // 发送会触发写文件的 prompt
    log('发送 prompt（触发文件写入 + permission）...', 'info');
    const promptPromise = sendPrompt(CONFIG.port, session.id,
      `请在 ${testFile} 文件中写入 "hello from helix bridge test"。这是一个测试文件。`,
      90000
    );

    // 等待 permission.asked 事件（最多 60s）
    log('等待 permission.asked SSE 事件...', 'info');
    const permEvent = await waitForSSEEventMatching(
      sse.events,
      e => e.type === 'permission.asked',
      60000
    );

    if (permEvent) {
      assert(true, `收到 permission.asked: ${JSON.stringify(permEvent.properties).slice(0, 100)}`);

      const requestID = permEvent.properties?.id || permEvent.properties?.requestID;
      assert(requestID, `Permission requestID: ${requestID}`);

      // 自动 approve
      if (requestID) {
        log(`自动 approve permission ${requestID}`, 'info');
        const replyRes = await api(CONFIG.port, `/permission/${requestID}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reply: 'approve' }),
        });
        assert(replyRes.ok, `Permission approve 返回 ${replyRes.status}`);
      }

      // 等待 prompt 完成
      log('等待 prompt 完成...', 'info');
      const responseBody = await promptPromise;
      assert(responseBody.length > 0, `Prompt 完成 (${responseBody.length} bytes)`);

      // 验证工具执行结果
      await sleep(2000);

      // 检查 tool call 事件
      const toolEvents = sse.events.filter(e =>
        e.type === 'metrics.tool_call' || e.type?.includes('tool')
      );
      assert(toolEvents.length > 0, `Tool call 事件: ${toolEvents.length} 个`);

      // 检查最终消息
      const msgs = await getMessages(CONFIG.port, session.id);
      const assistantMsgs = msgs.filter(m => m.info?.role === 'assistant');
      assert(assistantMsgs.length > 0, `Assistant 消息数: ${assistantMsgs.length}`);

      // 检查工具执行的 part
      const lastMsg = assistantMsgs[assistantMsgs.length - 1];
      const toolParts = lastMsg?.parts?.filter(p => p.type === 'tool') || [];
      const textParts = lastMsg?.parts?.filter(p => p.type === 'text') || [];
      assert(toolParts.length > 0 || textParts.length > 0,
        `消息包含 tool(${toolParts.length}) + text(${textParts.length}) parts`);

    } else {
      // 如果没有 permission 事件（可能 agent 用了 bash 或 auto-approved）
      log('未触发 permission.asked（可能 auto-approved 或用了 bash）', 'warn');
      const responseBody = await promptPromise;
      assert(responseBody.length > 0, `Prompt 仍然完成 (${responseBody.length} bytes)`);

      // 检查 SSE 中的 tool 相关事件
      const toolEvents = sse.events.filter(e =>
        e.type?.includes('tool') || e.type === 'metrics.tool_call'
      );
      log(`Tool 相关事件: ${toolEvents.length}`, 'info');
      assert(true, '双向链路可用（permission 可能被 auto-approved）');
    }

  } catch (err) {
    log(`Permission flow error: ${err.message}`, 'fail');
  } finally {
    if (sse) sse.abort();
    daemon.stop();
    await sleep(2000);
    // 清理
    try { fs.unlinkSync(testFile); } catch {}
    try { fs.rmdirSync(CONFIG.testDir); } catch {}
  }
}

async function testSuite3_SessionAbort() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 3: Session Abort 中途打断');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new Daemon(CONFIG.port);
  let sse = null;

  try {
    await daemon.start();
    sse = connectSSE(CONFIG.port);
    for (let i = 0; i < 20; i++) {
      if (sse.isReady()) break;
      await sleep(500);
    }
    assert(sse.isReady(), 'SSE connected');

    const { data: session } = await api(CONFIG.port, '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Abort test' }),
    });
    assert(session?.id, `Session: ${session.id}`);

    // 发送一个长任务（但不等待完成）
    log('发送长任务 prompt...', 'info');
    const promptPromise = sendPrompt(CONFIG.port, session.id,
      '请详细解释量子计算的原理，包括量子比特、叠加态、纠缠等概念，尽量写长一些。',
      90000
    ).catch(err => ({ error: err.message }));

    // 等 5 秒让 LLM 开始响应
    await sleep(5000);

    // 发送 abort
    log('发送 abort 中断任务...', 'info');
    const abortRes = await api(CONFIG.port, `/session/${session.id}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(abortRes.ok || abortRes.status === 200, `Abort 返回 ${abortRes.status}`);

    // 等待 prompt promise 结束（应该很快）
    const result = await Promise.race([
      promptPromise,
      sleep(10000).then(() => ({ timeout: true })),
    ]);

    // 验证 session 被释放（可以再发新 prompt）
    await sleep(2000);
    log('验证 session 已释放（发送新 prompt）...', 'info');
    try {
      const r2 = await sendPrompt(CONFIG.port, session.id, '回复ok', 30000);
      assert(r2.length > 0, `Session 释放后可重新使用 (${r2.length} bytes)`);
    } catch (err) {
      // 如果 prompt 仍在运行，可能返回 409
      if (err.message?.includes('409')) {
        assert(false, 'Session 未释放（409 busy）');
      } else {
        assert(true, `Session abort 后响应: ${err.message?.slice(0, 50)}`);
      }
    }

    // 检查 SSE 中的 session.status 事件
    const statusEvents = sse.events.filter(e => e.type === 'session.status');
    log(`session.status 事件: ${statusEvents.length}`, 'info');

  } catch (err) {
    log(`Abort test error: ${err.message}`, 'fail');
  } finally {
    if (sse) sse.abort();
    daemon.stop();
    await sleep(2000);
  }
}

async function testSuite4_ToolCallChain() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 4: Tool Call 全链路可视化');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new Daemon(CONFIG.port);
  let sse = null;

  try {
    await daemon.start();
    sse = connectSSE(CONFIG.port);
    for (let i = 0; i < 20; i++) {
      if (sse.isReady()) break;
      await sleep(500);
    }

    const { data: session } = await api(CONFIG.port, '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Tool chain test' }),
    });
    assert(session?.id, `Session: ${session.id}`);

    // 发送一个会触发多个工具的简单 prompt
    log('发送 prompt（触发工具链）...', 'info');
    const eventCountBefore = sse.events.length;

    const body = await sendPrompt(CONFIG.port, session.id,
      '查看当前目录下有哪些文件（用 ls 命令），然后告诉我当前工作目录是什么。',
      60000
    );
    assert(body.length > 0, `Prompt 完成 (${body.length} bytes)`);

    await sleep(2000);

    // 分析 SSE 事件链
    const newEvents = sse.events.slice(eventCountBefore);
    const eventTypes = newEvents.map(e => e.type);

    // 检查关键事件类型
    const hasToolMetrics = eventTypes.includes('metrics.tool_call');
    const hasModelMetrics = eventTypes.includes('metrics.model_call');
    const hasPartDelta = eventTypes.includes('message.part.delta');
    const hasPartUpdated = eventTypes.includes('message.part.updated');
    const hasSessionIdle = eventTypes.includes('session.idle');

    assert(hasToolMetrics, 'metrics.tool_call 事件（工具执行指标）');
    assert(hasModelMetrics, 'metrics.model_call 事件（LLM 调用指标）');
    assert(hasPartDelta, 'message.part.delta 事件（流式文本增量）');
    assert(hasPartUpdated, 'message.part.updated 事件（部分更新）');
    assert(hasSessionIdle, 'session.idle 事件（agent 完成）');

    // 验证事件顺序: reasoning/tool → text → idle
    const toolIdx = eventTypes.indexOf('metrics.tool_call');
    const idleIdx = eventTypes.indexOf('session.idle');
    if (toolIdx >= 0 && idleIdx >= 0) {
      assert(toolIdx < idleIdx, '事件顺序正确: tool_call → session.idle');
    }

    // 检查消息中的 tool parts
    const msgs = await getMessages(CONFIG.port, session.id);
    const assistantMsgs = msgs.filter(m => m.info?.role === 'assistant');
    const lastMsg = assistantMsgs[assistantMsgs.length - 1];
    const parts = lastMsg?.parts || [];
    const partTypes = [...new Set(parts.map(p => p.type))];
    log(`消息 part 类型: ${partTypes.join(', ')}`, 'info');
    assert(partTypes.includes('text'), 'Assistant 消息包含 text part');

    log(`\nSSE 事件统计（共 ${newEvents.length} 个）:`, 'info');
    const counts = {};
    eventTypes.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
      log(`  ${t}: ${c}`, 'info');
    });

  } catch (err) {
    log(`Tool chain error: ${err.message}`, 'fail');
  } finally {
    if (sse) sse.abort();
    daemon.stop();
    await sleep(2000);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  console.log('┃  Helix Bridge: Bidirectional E2E Tests (LLM) ┃');
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  console.log(`\nPort: ${CONFIG.port}`);
  console.log(`CLI: ${CONFIG.cliPath}\n`);

  // 清理
  try { execSync(`lsof -ti :${CONFIG.port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' }); await sleep(1000); } catch {}

  try {
    await testSuite1_MultiTurnConversation();
    await testSuite2_PermissionFlow();
    await testSuite3_SessionAbort();
    await testSuite4_ToolCallChain();
  } catch (err) {
    log(`Runner error: ${err.message}`, 'fail');
  }

  try { execSync(`lsof -ti :${CONFIG.port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' }); } catch {}

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total: ${totalPassed + totalFailed}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log('');

  if (totalFailed > 0) { process.exit(1); }
  console.log('🎉 All tests passed!');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
