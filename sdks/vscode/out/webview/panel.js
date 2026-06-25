"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HelixWebviewPanel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class HelixWebviewPanel {
    static viewType = "helix.webview";
    panel;
    _extensionUri;
    _serverPort;
    _disposables = [];
    _sseAbortController = null;
    static createOrShow(extensionUri, serverPort) {
        const column = vscode.ViewColumn.Two;
        const existing = vscode.window.visibleTextEditors.find((e) => e.viewColumn === column);
        if (existing) {
            vscode.window.showTextDocument(existing.document, column);
        }
        const panel = vscode.window.createWebviewPanel(HelixWebviewPanel.viewType, "Helix", column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, "media"),
            ],
        });
        return new HelixWebviewPanel(panel, extensionUri, serverPort);
    }
    _onDispose;
    onDispose(callback) {
        this._onDispose = callback;
    }
    constructor(panel, extensionUri, serverPort) {
        this.panel = panel;
        this._extensionUri = extensionUri;
        this._serverPort = serverPort;
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(extensionUri, "images", "button-dark.svg"),
            dark: vscode.Uri.joinPath(extensionUri, "images", "button-light.svg"),
        };
        this.panel.webview.html = this.getHtml();
        this.setupMessageBridge();
        this.panel.onDidDispose(() => {
            this._onDispose?.();
            this.dispose();
        }, null, this._disposables);
    }
    getHtml() {
        const mediaPath = vscode.Uri.joinPath(this._extensionUri, "media");
        const welcomePath = vscode.Uri.joinPath(mediaPath, "helix-welcome.html");
        let html;
        try {
            html = fs.readFileSync(welcomePath.fsPath, "utf-8");
        }
        catch {
            return this.getFallbackHtml();
        }
        const bridgeScript = this.getBridgeScript();
        html = html.replace("</head>", `${bridgeScript}</head>`);
        return html;
    }
    getBridgeScript() {
        const pkg = require("../../package.json");
        const version = pkg.version;
        return `
<script>
(function() {
  // acquireVsCodeApi() can only be called once per webview lifetime.
  // After a reload the global may already be set by a prior bridge injection.
  const vscode = window.__HELIX_VSCODE_REF__ || acquireVsCodeApi()
  window.__HELIX_VSCODE__ = true
  window.__HELIX_VSCODE_REF__ = vscode
  window.__HELIX_SERVER_PORT__ = ${this._serverPort}
  window.__HELIX_EXT_VERSION__ = "${version}"

  // 版本检查：扩展更新后自动刷新 webview（带防循环保护）
  const RELOAD_GUARD_KEY = '__helix_reload_guard__'
  const storedVersion = localStorage.getItem('__helix_ext_version__')
  if (storedVersion && storedVersion !== "${version}") {
    const guard = sessionStorage.getItem(RELOAD_GUARD_KEY)
    if (guard === "${version}") {
      // Already reloaded for this version — skip to avoid infinite loop
      console.warn('[HelixGUI] Reload guard triggered for version ${version}, skipping reload')
    } else {
      localStorage.setItem('__helix_ext_version__', "${version}")
      sessionStorage.setItem(RELOAD_GUARD_KEY, "${version}")
      console.log('[HelixGUI] Extension updated from', storedVersion, 'to', "${version}", '— reloading webview...')
      location.reload()
      return
    }
  }
  localStorage.setItem('__helix_ext_version__', "${version}")

  // 保存原始 fetch
  const originalFetch = window.fetch
  window.__ORIGINAL_FETCH__ = originalFetch
  window.fetch = function(url, options) {
    if (typeof url === 'string' && url.startsWith('http://localhost')) {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2)
        const handler = (event) => {
          if (event.data && event.data.type === 'api-response' && event.data.id === id) {
            window.removeEventListener('message', handler)
            if (event.data.error) {
              reject(new Error(event.data.error))
            } else {
              const response = new Response(
                event.data.data ? JSON.stringify(event.data.data) : null,
                { status: event.data.status || 200, headers: event.data.headers || {} }
              )
              resolve(response)
            }
          }
        }
        window.addEventListener('message', handler)
        vscode.postMessage({ type: 'api', id, url, options })
      })
    }
    return originalFetch.apply(this, arguments)
  }

  // 桥接 WebSocket
  const OriginalWebSocket = window.WebSocket
  window.WebSocket = function(url, protocols) {
    if (typeof url === 'string' && url.startsWith('ws://localhost')) {
      const id = Math.random().toString(36).slice(2)
      const ws = {
        _id: id,
        _listeners: {},
        readyState: 0,
        CONNECTING: 0,
        OPEN: 1,
        CLOSING: 2,
        CLOSED: 3,
        send: function(data) {
          vscode.postMessage({ type: 'ws-send', id, data })
        },
        close: function() {
          this.readyState = 3
          vscode.postMessage({ type: 'ws-close', id })
        },
        addEventListener: function(type, handler) {
          if (!this._listeners[type]) this._listeners[type] = []
          this._listeners[type].push(handler)
        },
        removeEventListener: function(type, handler) {
          if (!this._listeners[type]) return
          this._listeners[type] = this._listeners[type].filter(h => h !== handler)
        },
        _dispatch: function(type, event) {
          if (this._listeners[type]) {
            this._listeners[type].forEach(h => h(event))
          }
          const prop = 'on' + type
          if (this[prop]) this[prop](event)
        }
      }

      const msgHandler = (event) => {
        if (!event.data || event.data._wsId !== id) return
        if (event.data.type === 'ws-open') {
          ws.readyState = 1
          ws._dispatch('open', {})
        } else if (event.data.type === 'ws-message') {
          ws._dispatch('message', { data: event.data.data })
        } else if (event.data.type === 'ws-close') {
          ws.readyState = 3
          ws._dispatch('close', {})
          window.removeEventListener('message', msgHandler)
        }
      }
      window.addEventListener('message', msgHandler)
      vscode.postMessage({ type: 'ws-connect', id, url, protocols })
      return ws
    }
    return new OriginalWebSocket(url, protocols)
  }

  // 监听扩展发来的消息
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'api-response') {
      // 由上面的 fetch 处理
    }
    if (event.data && event.data.type === 'connection-state') {
      // 扩展通知连接状态变化
      window.dispatchEvent(new CustomEvent('helix-connection-state', {
        detail: event.data.state
      }))
    }
    if (event.data && event.data.type === 'file-ref') {
      const input = document.querySelector('textarea, input[type="text"]')
      if (input) {
        input.value += ' ' + event.data.ref
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  })
})()
</script>
`;
    }
    getFallbackHtml() {
        return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Helix</title></head>
<body style="font-family:system-ui,sans-serif;padding:20px;color:#ccc;background:#1e1e1e">
  <h2>Helix UI 资源未找到</h2>
  <p>请先运行构建命令将前端产物复制到扩展目录：</p>
  <pre style="background:#2d2d2d;padding:10px;border-radius:4px">cd /path/to/Helix && cp -r packages/app/dist sdks/vscode/media</pre>
</body>
</html>`;
    }
    setupMessageBridge() {
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "api": {
                    try {
                        console.log(`[Helix Bridge] API request: ${message.url}`);
                        const response = await fetch(message.url, message.options);
                        const data = await response.text();
                        let parsed;
                        try {
                            parsed = JSON.parse(data);
                        }
                        catch {
                            parsed = data;
                        }
                        if (!response.ok) {
                            console.error(`[Helix Bridge] API error ${response.status}: ${message.url}`);
                            this.panel.webview.postMessage({
                                type: "api-response",
                                id: message.id,
                                error: `HTTP ${response.status}: ${data}`,
                            });
                            return;
                        }
                        console.log(`[Helix Bridge] API success: ${message.url}`);
                        this.panel.webview.postMessage({
                            type: "api-response",
                            id: message.id,
                            status: response.status,
                            data: parsed,
                            headers: Object.fromEntries(response.headers.entries()),
                        });
                    }
                    catch (err) {
                        console.error(`[Helix Bridge] API exception:`, err);
                        this.panel.webview.postMessage({
                            type: "api-response",
                            id: message.id,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    }
                    break;
                }
                case "sse-connect": {
                    if (this._sseAbortController) {
                        this._sseAbortController.abort();
                        this._sseAbortController = null;
                    }
                    try {
                        const url = message.url;
                        console.log(`[Helix Bridge] SSE connect: ${url}`);
                        this._sseAbortController = new AbortController();
                        const response = await fetch(url, {
                            method: 'GET',
                            headers: { 'Accept': 'text/event-stream' },
                            signal: this._sseAbortController.signal,
                        });
                        if (!response.ok || !response.body) {
                            this.panel.webview.postMessage({
                                type: 'sse-error',
                                _sseId: message._sseId,
                                error: `HTTP ${response.status}`,
                            });
                            return;
                        }
                        const contentType = response.headers.get('content-type') || 'unknown';
                        console.log(`[Helix Bridge] SSE stream opened, content-type: ${contentType}`);
                        // 通知 webview SSE 连接已就绪，可以安全发送 prompt
                        this.panel.webview.postMessage({
                            type: 'sse-ready',
                            _sseId: message._sseId,
                        });
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        let eventCount = 0;
                        const pump = async () => {
                            try {
                                while (this._sseAbortController) {
                                    const { done, value } = await reader.read();
                                    if (done) {
                                        console.log(`[Helix Bridge] SSE stream done, total events: ${eventCount}`);
                                        break;
                                    }
                                    const chunk = decoder.decode(value, { stream: true });
                                    console.log(`[Helix Bridge] SSE chunk: ${chunk.length} bytes, preview: ${chunk.slice(0, 120)}`);
                                    buffer += chunk;
                                    const lines = buffer.split('\n');
                                    buffer = lines.pop() || '';
                                    for (const line of lines) {
                                        if (line.startsWith('data: ')) {
                                            eventCount++;
                                            if (eventCount <= 3 || eventCount % 50 === 0) {
                                                console.log(`[Helix Bridge] SSE event #${eventCount}: ${line.slice(0, 200)}`);
                                            }
                                            this.panel.webview.postMessage({
                                                type: 'sse-event',
                                                _sseId: message._sseId,
                                                data: line.slice(6).trim(),
                                            });
                                        }
                                    }
                                }
                                console.log(`[Helix Bridge] SSE pump finished, events forwarded: ${eventCount}`);
                                this.panel.webview.postMessage({
                                    type: 'sse-close',
                                    _sseId: message._sseId,
                                });
                            }
                            catch (err) {
                                if (err.name !== 'AbortError') {
                                    console.error(`[Helix Bridge] SSE pump error:`, err);
                                    this.panel.webview.postMessage({
                                        type: 'sse-error',
                                        _sseId: message._sseId,
                                        error: err.message,
                                    });
                                }
                            }
                        };
                        pump();
                    }
                    catch (err) {
                        console.error(`[Helix Bridge] SSE exception:`, err);
                        this.panel.webview.postMessage({
                            type: 'sse-error',
                            _sseId: message._sseId,
                            error: err.message,
                        });
                    }
                    break;
                }
                case "sse-disconnect": {
                    if (this._sseAbortController) {
                        this._sseAbortController.abort();
                        this._sseAbortController = null;
                        console.log(`[Helix Bridge] SSE disconnect: ${message._sseId}`);
                    }
                    break;
                }
                case "ws-connect": {
                    this.panel.webview.postMessage({ type: "ws-open", _wsId: message.id });
                    break;
                }
                case "ws-send": {
                    break;
                }
                case "ws-close": {
                    this.panel.webview.postMessage({ type: "ws-close", _wsId: message.id });
                    break;
                }
                case "openFile": {
                    try {
                        const filePath = message.filePath;
                        const line = message.line || 1;
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const workspaceRoot = workspaceFolders[0].uri.fsPath;
                            const fullPath = path.resolve(workspaceRoot, filePath);
                            const uri = vscode.Uri.file(fullPath);
                            const position = new vscode.Position(line - 1, 0);
                            const selection = new vscode.Range(position, position);
                            await vscode.window.showTextDocument(uri, {
                                selection: selection,
                                viewColumn: vscode.ViewColumn.One
                            });
                        }
                    }
                    catch (err) {
                        console.error('Failed to open file:', err);
                        vscode.window.showErrorMessage(`Failed to open file: ${message.filePath}`);
                    }
                    break;
                }
                case "saveSettings": {
                    try {
                        const config = vscode.workspace.getConfiguration('helix');
                        const settings = message.settings;
                        if (settings) {
                            await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
                            await config.update('model', settings.model, vscode.ConfigurationTarget.Global);
                            await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
                            await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
                        }
                    }
                    catch (err) {
                        console.error('Failed to save settings:', err);
                    }
                    break;
                }
            }
        }, null, this._disposables);
    }
    sendFileRef(ref) {
        this.panel.webview.postMessage({ type: "file-ref", ref });
    }
    /**
     * 通知前端连接状态变化
     */
    notifyConnectionState(state) {
        this.panel.webview.postMessage({ type: "connection-state", state });
    }
    dispose() {
        // 先 abort 活跃的 SSE 流，防止 Reader 连接泄露
        if (this._sseAbortController) {
            this._sseAbortController.abort();
            this._sseAbortController = null;
        }
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
        this.panel.dispose();
    }
    updatePort(port) {
        this._serverPort = port;
    }
    reveal() {
        this.panel.reveal(vscode.ViewColumn.Two);
    }
}
exports.HelixWebviewPanel = HelixWebviewPanel;
//# sourceMappingURL=panel.js.map