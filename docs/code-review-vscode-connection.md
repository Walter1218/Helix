# VSCode 扩展 ↔ Helix 核心智能体连接 Code Review 报告

**审查范围**：`sdks/vscode/`（扩展端）与 `packages/opencode/src/server/` / `packages/opencode/src/acp/`（核心端）的连接链路
**审查目标**：定位 offline 卡点根因，对比业界最佳实践，给出可落地的改进方案
**参考项目**：Continue.dev（开源 VSCode AI 扩展标杆）

---

## 一、执行摘要：5 个核心结论

1. **架构债务是根本病因**：Helix 采用「扩展 Host 启动子进程服务器 → Webview 通过 Bridge 劫持 fetch 连接子进程」的进程外模型，而 Continue.dev 采用「Core 直接内嵌 Extension Host 进程 → Webview 通过原生消息通道通信」的进程内模型。前者多了一层进程边界、端口分配和网络通信，故障面指数级扩大。

2. **Bridge 脚本存在 3 处单点故障**：fetch 劫持、WebSocket 伪桥接、端口硬编码注入，任何一处失效即 offline。

3. **进程生命周期管理缺失**：子进程崩溃没有检测，stdout/stderr 黑箱，没有自动重启，没有优雅关闭。

4. **前端连接状态判断过于乐观**：仅检查 `__HELIX_SERVER_PORT__ > 0` 即认为 online，从未验证实际连通性。

5. **SSE 与 HTTP 通信路径不一致**：SSE 绕过 Bridge 直接走原生 fetch 连接 localhost，而 HTTP API 走 Bridge → Extension Host → 代理 fetch。两条路径的可用性不同步，导致部分功能可用、部分不可用。

---

## 二、逐层诊断：从 Webview 到核心智能体的完整链路

### 2.1 链路全景图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node.js)                                             │
│  ┌─────────────────┐    ┌─────────────┐    ┌─────────────────────────────┐  │
│  │  extension.ts   │───▶│  server.ts  │───▶│  mimo --port <random>       │  │
│  │  (生命周期管理)  │    │ (子进程管理) │    │  (独立进程: opencode server)  │  │
│  └─────────────────┘    └─────────────┘    └─────────────────────────────┘  │
│         │                                              │                     │
│         │  acquireVsCodeApi()                          │  HTTP API + SSE     │
│         │  postMessage({type: 'api'})                    │  /session, /event   │
│         ▼                                              ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │  HelixWebviewPanel (Webview)                                 │             │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐   │             │
│  │  │bridge script│───▶│  fetchApi() │───▶│  connectEventStream│   │             │
│  │  │(注入到HTML) │    │(HTTP 代理)   │    │(SSE 直接连接)      │   │             │
│  │  └─────────────┘    └─────────────┘    └─────────────────┘   │             │
│  └─────────────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘

Continue.dev 的做法（对比）：

┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node.js)                            │
│  ┌─────────────────┐    ┌─────────────────────────────┐      │
│  │  VsCodeExtension │───▶│  Core (进程内实例化)          │      │
│  │  (生命周期管理)   │    │  (LLM/MCP/索引逻辑)           │      │
│  └─────────────────┘    └─────────────────────────────┘      │
│         │                          │                          │
│         │  postMessage             │  直接函数调用              │
│         ▼                          ▼                          │
│  ┌─────────────────────────────────────────────┐              │
│  │  Webview (React GUI)                         │              │
│  │  ← 没有 Bridge 劫持，没有端口，没有子进程     │              │
│  └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 逐层问题清单

#### Layer 1: 子进程启动层（`server.ts`）

| # | 位置 | 问题 | 严重度 | 说明 |
|---|------|------|--------|------|
| L1-1 | `server.ts:18-27` | 先检查 `localhost:3095/health`，如果已有服务则复用端口，但新启动时随机端口范围 16384-65535 | 🔴 P0 | 如果 3095 被其他程序占用，复用端口可能导致连接到错误的服务。如果 3095 是旧的 mimo 进程但没响应，就会启动新进程。没有进程归属验证。 |
| L1-2 | `server.ts:29` | 随机端口但没有冲突检测和重试 | 🟡 P1 | `Math.floor(Math.random() * ...)` 可能选中已被占用的端口，`start()` 会抛异常但没有自动重试。 |
| L1-3 | `server.ts:41-49` | `stdio: "pipe"` 但 stdout/stderr 没有消费 | 🔴 P0 | 子进程输出被缓冲，可能触发 Node.js 的背压导致子进程阻塞。且没有日志输出到 VS Code 输出通道，无法调试。 |
| L1-4 | `server.ts:105-120` | `waitForReady()` 等待 `/app`，但轮询间隔 200ms × 50 次 = 10s | 🟡 P1 | 对于大型项目或慢启动环境，10s 可能不够。没有指数退避。 |
| L1-5 | `server.ts:122-129` | `stop()` 使用 `SIGTERM`，没有优雅关闭确认 | 🟡 P1 | 子进程可能忽略 SIGTERM，导致孤儿进程残留。 |
| L1-6 | `server.ts:58-103` | CLI 发现逻辑复杂且和 `extension.ts:207-233` 重复 | 🟢 P2 | `findOpencodeCli` 和 `findCliPath` 两个函数逻辑几乎相同，维护成本高。 |

#### Layer 2: Bridge 注入层（`panel.ts` + `helix-welcome.html`）

| # | 位置 | 问题 | 严重度 | 说明 |
|---|------|------|--------|------|
| L2-1 | `panel.ts:80-189` | Bridge Script 是字符串模板拼接，在 `</head>` 前注入 | 🔴 P0 | `html.replace("</head>", ...)` 如果 HTML 中有多处 `</head>` 或大小写不同，注入失败。注入的是 `<script>` 而不是 `<script nonce="...">`，虽然 VS Code Webview 默认允许，但不符合 CSP 最佳实践。 |
| L2-2 | `panel.ts:92-114` | `window.fetch` 劫持只拦截 `http://localhost` 开头的 URL | 🟡 P1 | 如果前端代码使用相对路径或 `http://127.0.0.1`，劫持会失败。`url.startsWith('http://localhost')` 过于严格。 |
| L2-3 | `panel.ts:118-172` | `WebSocket` 桥接是伪实现 | 🔴 P0 | `ws-connect` 事件在 `panel.ts:232` 直接返回 `ws-open`，没有实际建立 WebSocket 连接。`ws-send` 在 `panel.ts:237` 是空操作。`ws-close` 直接返回关闭。这是一个「假装连接的 WebSocket」。README 自己也说：「WebSocket bridging exists but is not fully utilized」。 |
| L2-4 | `panel.ts:29` | `retainContextWhenHidden: true` 导致 Bridge 端口缓存 | 🔴 P0 | Webview 隐藏后保留上下文，但再次显示时不会重新加载 HTML。如果子进程重启后端口变化，Webview 中的 `__HELIX_SERVER_PORT__` 仍然是旧端口。这就是用户反复 offline 的核心根因之一。 |
| L2-5 | `panel.ts:64-78` | `getHtml()` 每次都读取文件，但没有缓存 | 🟢 P2 | `fs.readFileSync` 每次 `createOrShow` 都执行，对于频繁切换的场景效率低。 |
| L2-6 | `helix-welcome.html:5901` | `__HELIX_SERVER_PORT__` 为 0 时进入 offline，但没有任何重试机制 | 🟡 P1 | 用户看到 offline 后，除非关闭重开面板，否则不会自动尝试重新连接。 |
| L2-7 | `helix-welcome.html:3227-3251` | `fetchApi` 使用 `window.__HELIX_VSCODE_REF__` 而不是 `window.__HELIX_VSCODE_REF__`（之前已修复但属于典型问题） | 🟢 P2 | 这是之前的一个 bug，`fetchApi` 和 Bridge 中的 `vscode` 变量作用域不一致，导致 `vscode is undefined`。 |
| L2-8 | `helix-welcome.html:5254` | SSE 使用 `__ORIGINAL_FETCH__` 绕过 Bridge | 🔴 P0 | `var realFetch = window.__ORIGINAL_FETCH__ || window.fetch; realFetch(url, ...)` 直接连接 `localhost:${port}/event`。这意味着 SSE 不经过 Bridge 的 `postMessage` 机制，直接走原生 fetch。但 `__ORIGINAL_FETCH__` 是 Bridge 劫持时保存的原始 `window.fetch`，如果 Bridge 注入失败，`__ORIGINAL_FETCH__` 就是 `undefined`，fallback 到被劫持的 `window.fetch`，导致无限递归或错误。 |
| L2-9 | `helix-welcome.html:3105-3114` | `checkOnlineMode()` 仅检查 `__HELIX_SERVER_PORT__ > 0` | 🔴 P0 | 端口大于 0 不代表服务真的活着。可能子进程已经崩溃，但端口变量还在。从未验证 `fetch('/health')` 实际连通性。 |

#### Layer 3: 前端状态管理层（`helix-welcome.html`）

| # | 位置 | 问题 | 严重度 | 说明 |
|---|------|------|--------|------|
| L3-1 | `helix-welcome.html:3177-3224` | `initSession()` 在 online 模式下串行初始化 | 🟡 P1 | 获取 session、加载模型、加载任务、连接 SSE 都是串行，如果任何一步失败，整个初始化中断。没有部分降级。 |
| L3-2 | `helix-welcome.html:5245-5251` | SSE heartbeat 20s 超时，但服务端心跳是 10s | 🟢 P2 | 服务端 `event.ts:51-58` 每 10s 发送一次 `server.heartbeat`，前端设置 20s 超时。如果中间丢了一个心跳，20s 后才会触发重连。对于实时交互体验来说，20s 感知延迟太高。 |
| L3-3 | `helix-welcome.html:5296-5306` | `reconnectEventStream` 固定 250ms backoff | 🟢 P2 | 退避时间固定，对于短暂网络抖动应该立即重试，对于服务崩溃应该指数退避。 |
| L3-4 | `helix-welcome.html:5204` | `connectEventStream` 在 `prompt_async` 之前连接 | 🟡 P1 | 逻辑正确，但如果在连接 SSE 和发送 prompt 之间服务器崩溃，用户会看到一个无限 loading 的 AI 响应。 |

#### Layer 4: 核心服务端层（`packages/opencode/src/server/`）

| # | 位置 | 问题 | 严重度 | 说明 |
|---|------|------|--------|------|
| L4-1 | `server/adapter.node.ts:12-30` | 端口绑定失败时没有自动重试 | 🟡 P1 | `opts.port === 0 ? await start(4096).catch(() => start(0))` 只有一次 fallback，如果 4096 也被占用，就失败。 |
| L4-2 | `server/adapter.node.ts:41-61` | `stop()` 只关闭 server，不通知所有 SSE 连接 | 🟡 P1 | 调用 `stop()` 时，SSE 客户端（`event.ts` 的 `stream.onAbort`）应该收到 `InstanceDisposed` 事件断开，但实现依赖于 `Bus.subscribeAll`，如果 Bus 先被清理，SSE 客户端会挂起。 |
| L4-3 | `server/server.ts:99-120` | `listen()` 没有启动完成确认 | 🟢 P2 | 返回 `Listener` 对象，但 `port` 字段是绑定的实际端口，调用方需要检查 `port !== 0`。VSCode 扩展的 `server.ts` 没有检查这个。 |
| L4-4 | `server/routes/instance/event.ts:34-80` | SSE 没有客户端连接数限制 | 🟢 P2 | 每个 Webview 连接都会创建一个 SSE 连接，如果用户反复切换，可能产生大量连接。没有 `Connection: close` 或最大连接数限制。 |

#### Layer 5: ACP 协议层（`packages/opencode/src/acp/`）

| # | 位置 | 问题 | 严重度 | 说明 |
|---|------|------|--------|------|
| L5-1 | `acp/agent.ts:170-185` | `runEventSubscription()` 使用 `while(true)` 循环，但外层错误只 catch 一次 | 🟡 P1 | `startEventSubscription()` 中 `this.runEventSubscription().catch(...)` 只 catch 一次外层错误，如果循环内部抛出异常，会被 `catch` 捕获，但不会重新启动循环。如果 `events.stream` 迭代器结束，循环就退出了。 |
| L5-2 | `acp/agent.ts:173-175` | `this.sdk.global.event({signal})` 的 AbortSignal 没有超时控制 | 🟡 P1 | 如果 `AbortSignal` 永远不触发，SSE 连接会无限挂起。应该设置一个超时 signal。 |
| L5-3 | `acp/agent.ts:504-547` | `initialize()` 返回 capabilities，但没有 connection health check | 🟢 P2 | ACP 协议没有心跳或 ping 机制，连接状态只能通过 event stream 推断。 |

---

## 三、根因分析：为什么反复 offline

综合上述问题，offline 的触发路径有 **4 条**（按发生频率排序）：

### Path 1: 子进程崩溃 + Webview 缓存旧端口（最频繁）

```
1. 用户首次打开 GUI → server.start() 启动 mimo --port 49152 → 注入 bridge port=49152
2. 用户切换到其他文件 → Webview 隐藏（retainContextWhenHidden=true，保留上下文）
3. mimo 进程因某种原因崩溃（OOM/异常/用户关闭终端）
4. 用户再次按 Cmd+Esc → activePanel 存在 → reveal() → 不重新加载 HTML
5. Webview 中的 __HELIX_SERVER_PORT__ 仍然是 49152，但服务已死
6. fetchApi('/health') → 连接超时 → statusDot offline
7. 用户看到 offline，除非 Reload Window 或关闭重开，否则无法恢复
```

**修复方向**：在 `reveal()` 时检测端口存活性，如果服务已死则重新启动并重新加载 Webview。

### Path 2: 随机端口冲突

```
1. server.start() 随机选中 port 50000
2. 该端口已被其他程序占用（如另一个 VS Code 实例的 Helix）
3. adapter.node.ts start() 抛 error → waitForReady() 超时 → 扩展抛异常
4. openGUI() catch 异常 → port = 0 → 注入 bridge port=0
5. 前端 checkOnlineMode() → offline
```

**修复方向**：端口冲突时自动重试，并通知用户具体原因。

### Path 3: SSE 与 HTTP 路径不一致

```
1. Bridge 注入成功，HTTP API 正常（fetch 劫持工作）
2. 但 SSE 使用 __ORIGINAL_FETCH__ 直接连接 localhost
3. 如果 __ORIGINAL_FETCH__ 被其他脚本覆盖（如 Chrome 扩展、VS Code 内部更新），SSE 失败
4. 或如果网络层有防火墙/代理拦截 localhost 的 streaming 请求
5. 表现：可以发送消息（HTTP 通），但收不到实时更新（SSE 断）
```

**修复方向**：SSE 也应该统一走 Bridge 机制，或者使用 EventSource 原生 API + Bridge 代理。

### Path 4: 子进程 stdout 阻塞

```
1. mimo 进程启动，stdio: "pipe"
2. 进程输出大量日志到 stdout/stderr
3. Node.js 管道缓冲区满（默认 64KB on Linux）
4. 子进程 write() 阻塞，整个进程冻结
5. waitForReady() 超时 → 扩展认为启动失败
```

**修复方向**：消费 stdout/stderr，或改用 `stdio: "ignore"` / `stdio: "inherit"`。

---

## 四、业界参考：Continue.dev 的架构选择

Continue.dev 是目前 VSCode AI 扩展中 star 数最高（~20k+）的开源项目，其架构设计值得我们直接参考。

### 4.1 Continue.dev 的核心设计决策

| 决策 | Continue.dev | Helix（当前） |
|------|-------------|--------------|
| **Core 位置** | 直接实例化在 Extension Host 进程内（`core/core.ts`） | 独立子进程（`mimo --port <random>`） |
| **与 Webview 通信** | VS Code 原生 `postMessage`（`VsCodeMessenger`） | Bridge 劫持 `window.fetch` + `postMessage` 代理到 HTTP |
| **与外部 LLM 通信** | Core 内直接调用 LLM SDK | 通过 HTTP API 路由到子进程 → Core 内调用 |
| **MCP 服务器** | 由 Core 内的 `MCPManagerSingleton` 管理 | 由子进程内的 Hono server 管理 |
| **实时更新** | Pass-Through 消息，Webview ↔ Core 直接路由 | SSE 通过独立 HTTP 连接，Bridge 代理 HTTP |
| **端口使用** | 0（不需要） | 1（随机端口，可能冲突） |
| **进程数** | 1（VS Code 本身） | 2（VS Code + mimo 子进程） |
| **启动时间** | 毫秒级（进程内初始化） | 秒级（子进程启动 + 轮询就绪） |
| **进程崩溃影响** | Core 崩溃会导致整个扩展崩溃（但 VS Code 会重启扩展） | mimo 崩溃 → offline，需要手动重连 |

### 4.2 Continue.dev 的 Pass-Through 消息设计

```
Webview  ──postMessage──▶  VsCodeMessenger  ──直接透传──▶  Core
    │                              │                        │
    │  llm/streamChat              │  (不经 IDE 逻辑)        │  直接调用 LLM SDK
    │  autocomplete/complete       │                        │
    │  index/forceReIndex          │                        │
    │                              │                        │
    ◄──configUpdate────────────────┼──直接透传───────────────┘
    ◄──indexProgress───────────────┘
    ◄──addContextItem──────────────┘
```

**关键洞察**：对于 LLM 流式响应、自动补全、索引等高频/低延迟操作，Continue.dev 不在 Extension 层做任何拦截，直接让 Webview 和 Core 对话。这减少了约一倍的延迟（没有 HTTP 序列化 + 网络往返）。

### 4.3 为什么 Continue.dev 不需要本地服务器？

Continue.dev 的设计假设：**所有需要「本地服务」的能力（文件系统访问、编辑器操作、终端命令）都可以通过 VS Code API 完成**，不需要一个独立的 HTTP 服务器。只有 MCP 外部服务器需要网络通信，但那是功能扩展（如连接数据库），不是 Core 自身。

Helix 的架构选择（独立子进程）的初衷可能是：
1. 复用 CLI 的 HTTP API（`mimo serve` 的接口）
2. 让 Web UI（浏览器）和 VS Code 扩展共享同一套后端
3. 支持非 VS Code 场景（独立 TUI、Web 界面）

**但代价是**：VS Code 场景下引入了不必要的进程边界和网络通信。

---

## 五、改进方案：短期修复 + 长期重构

### 5.1 短期修复（1-2 周，可立即改善 offline 问题）

#### Fix 1: 修复 Webview 缓存旧端口问题（P0）

**问题**：`retainContextWhenHidden: true` 导致 Bridge 端口不更新。

**方案 A（最小改动）**：在 `reveal()` 时增加端口检测：

```ts
// panel.ts
public async reveal() {
  this.panel.reveal(vscode.ViewColumn.Two);
  
  // 检测端口是否仍然存活
  const currentPort = window.__HELIX_SERVER_PORT__;
  try {
    const res = await fetch(`http://localhost:${currentPort}/health`, { 
      signal: AbortSignal.timeout(2000) 
    });
    if (!res.ok) throw new Error('health check failed');
  } catch {
    // 端口已失效，通知扩展重新加载
    vscode.postMessage({ type: 'port-stale' });
  }
}
```

在 Extension Host 中处理 `port-stale`：

```ts
// extension.ts
panel.webview.onDidReceiveMessage(async (message) => {
  if (message.type === 'port-stale') {
    // 重新启动服务并重新加载面板
    activePanel?.dispose();
    activePanel = null;
    await openGUI(context); // 这会重新启动 server + 创建新面板
  }
});
```

**方案 B（更彻底）**：去掉 `retainContextWhenHidden`，每次显示都重新加载。但代价是 UI 状态丢失。

**方案 C（推荐）**：将 `__HELIX_SERVER_PORT__` 改为动态获取——不注入硬编码端口，而是提供一个 `getPort()` API，前端每次请求前都查询当前端口。

```js
// Bridge 中提供
window.__HELIX_GET_PORT__ = () => {
  return vscode.postMessage({ type: 'get-port' }); // 返回当前 server port
};
```

#### Fix 2: 统一 SSE 通信路径（P0）

**问题**：SSE 使用 `__ORIGINAL_FETCH__` 绕过 Bridge，与 HTTP API 路径不一致。

**方案**：让 SSE 也走 Bridge 机制。有两种实现：

**方案 A**：Bridge 代理 SSE：

```ts
// panel.ts 中处理 SSE 消息
// 前端通过 Bridge 请求 SSE，Extension Host 建立 EventSource，
// 将收到的 event 通过 postMessage 转发给 Webview

case "sse-connect": {
  const source = new EventSource(message.url);
  source.onmessage = (event) => {
    this.panel.webview.postMessage({
      type: "sse-event",
      _sseId: message.id,
      data: event.data,
    });
  };
  // 保存 source 以便后续关闭
  break;
}
```

**方案 B**：如果 Bridge 代理 SSE 的延迟不可接受，至少确保 `__ORIGINAL_FETCH__` 的可靠性：

```js
// 前端增加校验
var realFetch = window.__ORIGINAL_FETCH__;
if (!realFetch || realFetch === window.fetch) {
  // Bridge 劫持失败或被覆盖，fallback 到 Bridge 的 HTTP 代理
  reportError('SSE', new Error('Original fetch not available'));
  return;
}
```

#### Fix 3: stdout/stderr 消费（P0）

**问题**：`stdio: "pipe"` 但没有消费，导致子进程可能阻塞。

```ts
// server.ts
this.process = childProcess.spawn(..., { stdio: "pipe" });

// 消费输出，避免阻塞
const outputChannel = vscode.window.createOutputChannel("Helix Server");
this.process.stdout?.on("data", (data) => {
  outputChannel.append(data.toString());
});
this.process.stderr?.on("data", (data) => {
  outputChannel.append("[ERR] " + data.toString());
});

// 进程退出检测
this.process.on("exit", (code) => {
  outputChannel.appendLine(`Server exited with code ${code}`);
  this.ready = false;
  this.port = 0;
});
```

#### Fix 4: 进程崩溃自动重启（P1）

```ts
// server.ts
private processExitHandler?: (code: number | null) => void;

async start(context): Promise<number> {
  // ... 启动逻辑 ...
  
  this.process.on("exit", (code) => {
    this.ready = false;
    this.port = 0;
    if (this.processExitHandler) {
      this.processExitHandler(code);
    }
  });
}

// extension.ts
server.onProcessExit(async (code) => {
  if (activePanel) {
    vscode.window.showWarningMessage("Helix server crashed. Restarting...");
    try {
      const port = await server.start(context);
      activePanel.updatePort(port); // 需要新方法更新 Bridge 端口
    } catch (err) {
      vscode.window.showErrorMessage("Failed to restart Helix server: " + err.message);
    }
  }
});
```

#### Fix 5: 端口冲突自动重试（P1）

```ts
// server.ts
for (let attempt = 0; attempt < 3; attempt++) {
  this.port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
  try {
    this.process = childProcess.spawn(...);
    await this.waitForReady();
    this.ready = true;
    return this.port;
  } catch (err) {
    if (this.process) this.process.kill();
    if (attempt === 2) throw err;
    await new Promise(r => setTimeout(r, 500));
  }
}
```

#### Fix 6: 前端 online 检测增强（P1）

```js
// 不只检查端口，还实际发请求
function checkOnlineMode() {
  const port = window.__HELIX_SERVER_PORT__ || 0;
  if (port <= 0) return false;
  
  // 异步验证连通性
  fetchApi('/health').then(() => {
    isOnlineMode = true;
    updateStatusBar(true);
  }).catch(() => {
    isOnlineMode = false;
    updateStatusBar(false);
  });
  
  // 先返回当前状态，等验证完成后再更新
  return isOnlineMode;
}
```

### 5.2 中期改进（1-2 月，提升稳定性）

#### Improvement 1: 连接状态机（Connection State Machine）

当前前端状态是隐式的（`isOnlineMode` boolean），应该改为显式状态机：

```
[disconnected] --启动中--> [connecting] --健康检查通过--> [online]
                                     --健康检查失败--> [offline] --重试--> [connecting]

[online] --SSE 心跳超时--> [reconnecting] --恢复--> [online]
                                     --多次失败--> [offline]
```

每个状态对应 UI 显示和自动行为：
- `connecting`：显示 loading spinner，禁用输入
- `online`：显示 Connected，启用所有功能
- `offline`：显示离线提示，提供「重新连接」按钮
- `reconnecting`：显示「连接中断，正在重试...」

#### Improvement 2: Bridge 协议规范化

将当前手写 Bridge 替换为结构化的消息协议：

```ts
// Bridge 消息类型（TypeScript 定义）
type BridgeMessage =
  | { type: "api-request"; id: string; method: string; path: string; body?: unknown }
  | { type: "api-response"; id: string; status: number; data?: unknown; error?: string }
  | { type: "sse-subscribe"; id: string; path: string }
  | { type: "sse-event"; id: string; event: string; data: string }
  | { type: "sse-unsubscribe"; id: string }
  | { type: "port-request" }
  | { type: "port-response"; port: number }
  | { type: "health-check" }
  | { type: "health-response"; status: "ok" | "error"; detail?: string };
```

#### Improvement 3: 将 CLI 发现逻辑统一为单一函数

`server.ts` 和 `extension.ts` 中都有 CLI 发现逻辑，应提取到共享模块。

### 5.3 长期重构（3-6 月，从根本上消除 offline）

#### Refactor 1: 考虑将 Core 内嵌到 Extension Host（向 Continue.dev 看齐）

**前提条件**：如果 Helix 需要同时支持浏览器/独立 TUI 和 VS Code，可能需要保持子进程架构。但如果 VS Code 是主要场景，内嵌 Core 的 ROI 很高。

**实现思路**：
1. 将 `packages/opencode/src/acp/` 中的 `Agent` 类包装为 VS Code 扩展可以直接 `require` 的模块
2. 创建一个 `HelixCore` 类，在 `extension.ts` 的 `activate()` 中直接实例化
3. 用 `vscode.EventEmitter` 替代 HTTP SSE 进行实时事件推送
4. Webview 直接通过 `postMessage` 与 Core 通信，不再需要 Bridge 劫持 fetch

**工作量评估**：高（涉及 opencode 核心架构调整），但收益是彻底消除 offline 问题。

#### Refactor 2: 保持子进程，但改为 Unix Domain Socket / Named Pipe（消除端口）

如果必须保持子进程，用 UDS/Named Pipe 替代 TCP 端口：

```ts
// server.ts
const socketPath = path.join(os.tmpdir(), `helix-${process.pid}.sock`);
this.process = spawn(opencodePath, ["--socket", socketPath]);

// panel.ts 的 Bridge 中
window.__HELIX_SOCKET_PATH__ = socketPath;

// 前端使用 Node.js 的 net.connect 或 fetch 到 http+unix://
```

优点：无端口冲突，进程唯一绑定，关闭时自动清理。
缺点：Windows 上 Named Pipe 支持需要额外处理。

#### Refactor 3: 将前端从 vanilla JS 迁移到 React/Solid + TypeScript

当前 `helix-welcome.html` 是一个 6000 行的单文件 vanilla JS，包含：
- UI 渲染逻辑
- 状态管理
- API 调用
- SSE 连接管理
- 错误处理

这导致：
- 无法类型检查
- 无法单元测试
- 无法复用组件
- 容易引入 bug（如 `fetchApi` 和 Bridge 的变量作用域问题）

建议拆分为：
```
packages/app/src/vscode/
├── components/
│   ├── ChatPanel.tsx
│   ├── StatusBar.tsx
│   ├── Sidebar.tsx
│   ├── ToolCard.tsx
│   └── TaskList.tsx
├── hooks/
│   ├── useConnection.ts      # 连接状态机
│   ├── useSSE.ts             # SSE 连接管理
│   ├── useSession.ts         # 会话管理
│   └── useBridge.ts          # Bridge 通信
├── bridge/
│   └── vscode-api.ts         # VS Code API 封装
└── App.tsx
```

---

## 六、优先级排序

| 优先级 | 项 | 预估工作量 | 影响 |
|--------|-----|-----------|------|
| P0 | Fix 1: Webview 缓存旧端口（`reveal` 时检测 + 重载） | 0.5d | 消除 50%+ 的 offline |
| P0 | Fix 2: 统一 SSE 路径（或增强 `__ORIGINAL_FETCH__` 校验） | 0.5d | 消除 SSE 断连问题 |
| P0 | Fix 3: stdout/stderr 消费 | 0.25d | 防止子进程阻塞 |
| P1 | Fix 4: 进程崩溃自动重启 | 1d | 自动恢复，无需用户操作 |
| P1 | Fix 5: 端口冲突自动重试 | 0.5d | 减少启动失败 |
| P1 | Fix 6: 前端 online 检测增强 | 0.5d | 更准确的离线检测 |
| P1 | Improvement 1: 连接状态机 | 2d | 更好的 UX 和调试体验 |
| P2 | Improvement 2: Bridge 协议规范化 | 3d | 长期维护性 |
| P2 | Improvement 3: CLI 发现统一 | 0.5d | 代码质量 |
| P3 | Refactor 1: Core 内嵌 Extension Host | 2-4w | 从根本上消除 offline |
| P3 | Refactor 2: Unix Domain Socket | 1w | 消除端口问题 |
| P3 | Refactor 3: 前端框架迁移 | 2-3w | 长期维护性 |

---

## 七、附录：快速诊断 Checklist

下次用户报 offline 时，按以下顺序排查：

1. **检查进程是否活着**：`lsof -i :<port>` 或 `curl http://localhost:<port>/health`
2. **检查端口是否正确**：Webview Console 中输入 `window.__HELIX_SERVER_PORT__`
3. **检查 Bridge 是否注入**：Webview Console 中输入 `window.__HELIX_VSCODE_REF__`
4. **检查 fetch 劫持**：Webview Console 中输入 `window.fetch !== window.__ORIGINAL_FETCH__`
5. **检查 SSE 路径**：Webview Console 中输入 `window.__ORIGINAL_FETCH__`
6. **检查扩展日志**：VS Code 输出面板 → 选择 "Helix Server"（如果 Fix 3 已实施）
7. **检查 mimo 日志**：`tail ~/.dev-home/data/log/*.log`
8. **Reload Window**：`Cmd+Shift+P → Developer: Reload Window`（排除缓存问题）

---

*报告生成时间：2026-06-19*
*审查人：CodeBuddy Agent*
*基于代码版本：helix-ide 分支 commit 583930f + 未提交改动（panel.ts, helix-welcome.html ×2）*
