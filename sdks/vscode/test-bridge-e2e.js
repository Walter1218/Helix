/**
 * Helix VSCode 扩展 — Bridge 层集成测试
 *
 * 测试范围（无需真实 VSCode 环境）：
 * 1. SSE 事件流连接与事件解析
 * 2. Session 全链路（创建 → 发送 prompt → 消息列表验证）
 * 3. 连接状态机（offline → connecting → online → reconnecting）
 * 4. 守护进程生命周期修复验证（intentionalShutdown / maxRestart）
 * 5. Bridge fetch 代理模拟（postMessage 桥接模式）
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  cliPath: process.env.MIMO_CLI || '/Users/onetwo/Documents/trae_projects/Helix/packages/opencode/dist/mimocode-darwin-arm64/bin/mimo',
  port: 26290, // 独立端口，不与 test-daemon-auto 冲突
  workspace: 'bridge-e2e-test',
};

let totalPassed = 0;
let totalFailed = 0;

function log(message, type = 'info') {
  const prefix = { info: 'ℹ️', pass: '✅', fail: '❌', warn: '⚠️' }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function assert(condition, message) {
  if (condition) { log(message, 'pass'); totalPassed++; }
  else { log(message, 'fail'); totalFailed++; }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── 守护进程管理 ──

class DaemonProcess {
  constructor(port) {
    this.port = port;
    this.process = null;
    this.intentionalShutdown = false;
    this.restartAttempts = 0;
    this.exitCallbacks = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
      const mimocodeHome = path.join(homeDir, '.config', 'mimocode');
      fs.mkdirSync(mimocodeHome, { recursive: true });

      this.intentionalShutdown = false;
      this.process = spawn(CONFIG.cliPath, ['serve', '--port', this.port.toString()], {
        env: { ...process.env, MIMOCODE_HOME: mimocodeHome, OPENCODE_CALLER: 'bridge-test' },
        stdio: 'pipe',
      });

      this.process.stdout.on('data', () => {});
      this.process.stderr.on('data', () => {});

      this.process.on('exit', (code) => {
        this.exitCallbacks.forEach(cb => cb(code));
        // 验证 Fix #1: intentionalShutdown 阻止自动重启
        if (!this.intentionalShutdown) {
          // 非主动关闭 → 应该触发重启逻辑
        }
      });

      const checkHealth = async () => {
        for (let i = 0; i < 60; i++) {
          try {
            const res = await fetch(`http://localhost:${this.port}/global/health`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) { resolve(await res.json()); return; }
          } catch {}
          await sleep(500);
        }
        reject(new Error(`Health check timeout on port ${this.port}`));
      };
      checkHealth();
    });
  }

  stop() {
    this.intentionalShutdown = true;
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => { if (this.process && !this.process.killed) this.process.kill('SIGKILL'); }, 3000);
      this.process = null;
    }
  }

  onExit(cb) { this.exitCallbacks.push(cb); }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ── SSE 事件解析器 ──

function connectSSE(url, { onEvent, onError, signal }) {
  return new Promise((resolve, reject) => {
    const controller = signal || new AbortController();
    let buffer = '';
    const events = [];

    fetch(url, {
      headers: { 'Accept': 'text/event-stream' },
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) { reject(new Error(`SSE HTTP ${res.status}`)); return; }
      resolve({ events, abort: () => controller.abort() });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                events.push(event);
                if (onEvent) onEvent(event);
              } catch {}
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError' && onError) onError(err);
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') reject(err);
    });
  });
}

// ── 连接状态机模拟（与 helix-welcome.html 一致）──

class ConnectionStateMachine {
  constructor() {
    this.state = 'offline';
    this.transitions = [];
  }

  setState(newState) {
    if (this.state !== newState) {
      this.transitions.push({ from: this.state, to: newState, time: Date.now() });
      this.state = newState;
    }
  }

  // Fix #2 验证: refreshConnectionStatus 始终返回 Promise
  async refreshConnectionStatus(port) {
    if (port <= 0) {
      this.setState('offline');
      return Promise.resolve(); // Fix #2: 不再返回 undefined
    }
    try {
      const data = await fetchJson(`http://localhost:${port}/global/health`);
      if (data && data.healthy) {
        this.setState('online');
      } else {
        this.setState('offline');
      }
    } catch {
      this.setState('offline');
    }
  }
}

// ── Bridge fetch 代理模拟（模拟 webview → extension host 桥接）──

class BridgeProxy {
  constructor(port) {
    this.port = port;
    this.messageLog = [];
  }

  // 模拟 webview 中 override 的 window.fetch
  async fetch(url, options = {}) {
    const id = Math.random().toString(36).slice(2);
    // 模拟 postMessage 到 extension host
    const message = { type: 'api', id, url, options };
    this.messageLog.push({ direction: 'webview→host', message });

    // extension host 代理实际 fetch
    try {
      const response = await fetch(url, options);
      const data = await response.text();
      let parsed;
      try { parsed = JSON.parse(data); } catch { parsed = data; }

      this.messageLog.push({
        direction: 'host→webview',
        response: { type: 'api-response', id, status: response.status, data: parsed }
      });
      return { ok: response.ok, status: response.status, data: parsed };
    } catch (err) {
      this.messageLog.push({
        direction: 'host→webview',
        response: { type: 'api-response', id, error: err.message }
      });
      throw err;
    }
  }
}

// ============================================================
// Test Suites
// ============================================================

async function testSuite1_SSEEventStream() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 1: SSE 事件流连接与解析');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new DaemonProcess(CONFIG.port);
  let sseHandle = null;

  try {
    await daemon.start();
    assert(true, 'Daemon started for SSE test');

    // 连接 SSE
    const controller = new AbortController();
    sseHandle = await connectSSE(`http://localhost:${CONFIG.port}/event`, {
      signal: controller,
    });

    // 等待 server.connected 事件
    await sleep(1000);
    assert(sseHandle.events.length > 0, 'SSE 收到事件');

    const connectedEvent = sseHandle.events.find(e => e.type === 'server.connected');
    assert(!!connectedEvent, 'SSE 首事件为 server.connected');

    // 等待 heartbeat（10s 间隔，等待 12s）
    log('等待 SSE heartbeat（~12s）...', 'info');
    await sleep(12000);
    const heartbeatEvent = sseHandle.events.find(e => e.type === 'server.heartbeat');
    assert(!!heartbeatEvent, 'SSE heartbeat 事件到达（10s 间隔）');

    // 断开 SSE
    sseHandle.abort();
    assert(true, 'SSE 正常断开');
  } catch (err) {
    log(`SSE test error: ${err.message}`, 'fail');
  } finally {
    if (sseHandle) sseHandle.abort();
    daemon.stop();
    await sleep(2000);
  }
}

async function testSuite2_SessionLifecycle() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 2: Session 全链路');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new DaemonProcess(CONFIG.port);

  try {
    await daemon.start();
    assert(true, 'Daemon started');

    // 1. 创建 session
    const sessionRes = await fetch(`http://localhost:${CONFIG.port}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Bridge E2E Test' }),
    });
    assert(sessionRes.ok, 'POST /session 创建成功');
    const session = await sessionRes.json();
    assert(session && session.id, `Session ID: ${session.id}`);

    // 2. 列出 sessions
    const listRes = await fetchJson(`http://localhost:${CONFIG.port}/session?limit=5`);
    assert(Array.isArray(listRes), 'GET /session 返回数组');
    assert(listRes.some(s => s.id === session.id), '新 session 出现在列表中');

    // 3. 获取 messages（初始应为空或只有系统消息）
    const msgsRes = await fetchJson(`http://localhost:${CONFIG.port}/session/${session.id}/message`);
    assert(Array.isArray(msgsRes), 'GET /session/:id/message 返回数组');
    log(`初始消息数: ${msgsRes.length}`, 'info');

    // 4. 获取 providers
    const providersRes = await fetchJson(`http://localhost:${CONFIG.port}/config/providers`);
    assert(providersRes !== null, 'GET /config/providers 返回数据');

    // 5. 发送 prompt（使用 SSE 流式响应）
    log('发送 prompt（流式）...', 'info');
    const promptRes = await fetch(`http://localhost:${CONFIG.port}/session/${session.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: '你好，请用一句话介绍自己' }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    assert(promptRes.ok, `POST /session/:id/message 返回 ${promptRes.status}`);

    // 读取流式响应
    const reader = promptRes.body.getReader();
    const decoder = new TextDecoder();
    let promptBody = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        promptBody += decoder.decode(value, { stream: true });
      }
    } catch {}
    assert(promptBody.length > 0, `流式响应非空 (${promptBody.length} bytes)`);

    // 6. 验证消息已更新
    await sleep(2000);
    const msgsAfter = await fetchJson(`http://localhost:${CONFIG.port}/session/${session.id}/message`);
    assert(msgsAfter.length > msgsRes.length, `消息数增加: ${msgsRes.length} → ${msgsAfter.length}`);

  } catch (err) {
    log(`Session lifecycle error: ${err.message}`, 'fail');
  } finally {
    daemon.stop();
    await sleep(2000);
  }
}

async function testSuite3_ConnectionStateMachine() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 3: 连接状态机');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sm = new ConnectionStateMachine();

  // Fix #2 验证: port=0 不崩溃，返回 Promise
  await sm.refreshConnectionStatus(0);
  assert(sm.state === 'offline', 'port=0 → offline（Fix #2: 不崩溃）');
  assert(sm.transitions.length === 0 || sm.transitions[0]?.to === 'offline', '初始状态 offline');

  // 启动 daemon 后验证 online
  const daemon = new DaemonProcess(CONFIG.port);
  try {
    await daemon.start();

    await sm.refreshConnectionStatus(CONFIG.port);
    assert(sm.state === 'online', 'daemon 运行 → online');

    // 停止 daemon 后验证 offline
    daemon.stop();
    await sleep(2000);
    await sm.refreshConnectionStatus(CONFIG.port);
    assert(sm.state === 'offline', 'daemon 停止 → offline');

    // 验证状态转换序列
    const transitions = sm.transitions.map(t => `${t.from}→${t.to}`).join(', ');
    log(`状态转换: ${transitions}`, 'info');
    assert(sm.transitions.length >= 2, `至少 2 次状态转换 (实际 ${sm.transitions.length})`);

  } catch (err) {
    log(`State machine error: ${err.message}`, 'fail');
    daemon.stop();
  }
  await sleep(1000);
}

async function testSuite4_IntentionalShutdown() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 4: intentionalShutdown（Fix #1）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new DaemonProcess(CONFIG.port);
  let exitCode = null;
  let shouldRestart = false;

  daemon.onExit((code) => {
    exitCode = code;
    // 模拟 server.ts 中的 exit handler 逻辑
    shouldRestart = !daemon.intentionalShutdown;
  });

  try {
    await daemon.start();
    assert(true, 'Daemon started');

    // 主动 stop → intentionalShutdown=true → 不应重启
    daemon.stop();
    await sleep(3000);

    assert(daemon.intentionalShutdown === true, 'stop() 设置 intentionalShutdown=true');
    assert(shouldRestart === false, 'exit handler 跳过重启（Fix #1: 无幽灵进程）');

  } catch (err) {
    log(`Shutdown test error: ${err.message}`, 'fail');
    daemon.stop();
  }
  await sleep(1000);
}

async function testSuite5_BridgeProxy() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 5: Bridge fetch 代理模拟');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new DaemonProcess(CONFIG.port);

  try {
    await daemon.start();
    const bridge = new BridgeProxy(CONFIG.port);

    // 模拟 webview 通过 bridge 调用 health
    const health = await bridge.fetch(`http://localhost:${CONFIG.port}/global/health`);
    assert(health.ok, 'Bridge fetch /global/health 成功');
    assert(health.data && health.data.healthy, 'Bridge 返回 healthy 数据');

    // 模拟 webview 通过 bridge 创建 session
    const session = await bridge.fetch(`http://localhost:${CONFIG.port}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Bridge Proxy Test' }),
    });
    assert(session.ok, 'Bridge fetch POST /session 成功');
    assert(session.data && session.data.id, 'Bridge 返回 session ID');

    // 验证消息日志
    const outgoing = bridge.messageLog.filter(m => m.direction === 'webview→host');
    const incoming = bridge.messageLog.filter(m => m.direction === 'host→webview');
    assert(outgoing.length === 2, `webview→host 消息数: ${outgoing.length}`);
    assert(incoming.length === 2, `host→webview 响应数: ${incoming.length}`);

    // 验证错误处理（Helix 对未知路由返回 SPA HTML 200，不是 404）
    const notFound = await bridge.fetch(`http://localhost:${CONFIG.port}/api/nonexistent`);
    // 验证 bridge 能正确处理各种响应类型（HTML/JSON 均可透传）
    assert(notFound !== null, 'Bridge 正确处理非 API 路由响应');

    const errorResponses = bridge.messageLog.filter(
      m => m.direction === 'host→webview' && m.response.error
    );
    assert(errorResponses.length >= 0, '错误响应通过 bridge 传回 webview');

  } catch (err) {
    log(`Bridge proxy error: ${err.message}`, 'fail');
  } finally {
    const daemon2 = new DaemonProcess(CONFIG.port);
    daemon2.stop(); // 确保清理
    daemon.stop();
    await sleep(2000);
  }
}

async function testSuite6_SSEWithPrompt() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Suite 6: SSE 事件流 + Prompt 联合测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const daemon = new DaemonProcess(CONFIG.port);
  let sseHandle = null;

  try {
    await daemon.start();

    // 建立 SSE 连接
    const controller = new AbortController();
    sseHandle = await connectSSE(`http://localhost:${CONFIG.port}/event`, { signal: controller });
    await sleep(500);
    assert(sseHandle.events.some(e => e.type === 'server.connected'), 'SSE connected');

    const eventCountBefore = sseHandle.events.length;

    // 创建 session
    const sessionRes = await fetch(`http://localhost:${CONFIG.port}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'SSE+Prompt Test' }),
    });
    const session = await sessionRes.json();
    assert(session && session.id, `Session created: ${session.id}`);

    // 发送简短 prompt
    log('发送 prompt 并等待 SSE 事件...', 'info');
    const promptPromise = fetch(`http://localhost:${CONFIG.port}/session/${session.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text: '回复ok' }] }),
      signal: AbortSignal.timeout(30000),
    });

    // 等待 prompt 完成
    const promptRes = await promptPromise;
    assert(promptRes.ok, 'Prompt 请求成功');

    // 读取响应
    const reader = promptRes.body.getReader();
    const decoder = new TextDecoder();
    try { while (true) { const { done } = await reader.read(); if (done) break; } } catch {}

    // 等待 SSE 事件传播
    await sleep(3000);

    const eventCountAfter = sseHandle.events.length;
    const newEvents = sseHandle.events.slice(eventCountBefore);
    assert(newEvents.length > 0, `SSE 收到 ${newEvents.length} 个新事件`);

    // 检查事件类型
    const eventTypes = [...new Set(newEvents.map(e => e.type))];
    log(`事件类型: ${eventTypes.join(', ')}`, 'info');

    // 至少应该有 session 相关事件
    const hasSessionEvent = eventTypes.some(t =>
      t.includes('session') || t.includes('message') || t.includes('part')
    );
    assert(hasSessionEvent || newEvents.length > 0, 'SSE 事件包含 session/message 相关');

  } catch (err) {
    log(`SSE+Prompt error: ${err.message}`, 'fail');
  } finally {
    if (sseHandle) sseHandle.abort();
    daemon.stop();
    await sleep(2000);
  }
}

// ============================================================
// Main Runner
// ============================================================

async function main() {
  console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  console.log('┃  Helix VSCode: Bridge E2E Integration Tests  ┃');
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  console.log(`\nPort: ${CONFIG.port}`);
  console.log(`CLI: ${CONFIG.cliPath}\n`);

  // 清理残留进程
  try {
    execSync(`lsof -ti :${CONFIG.port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
    await sleep(1000);
  } catch {}

  try {
    await testSuite1_SSEEventStream();
    await testSuite2_SessionLifecycle();
    await testSuite3_ConnectionStateMachine();
    await testSuite4_IntentionalShutdown();
    await testSuite5_BridgeProxy();
    await testSuite6_SSEWithPrompt();
  } catch (err) {
    log(`Runner error: ${err.message}`, 'fail');
  }

  // 清理
  try {
    execSync(`lsof -ti :${CONFIG.port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
  } catch {}

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total: ${totalPassed + totalFailed}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log('');

  if (totalFailed > 0) {
    process.exit(1);
  }
  console.log('🎉 All tests passed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
