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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const childProcess = __importStar(require("child_process"));
const panel_1 = require("./webview/panel");
const server_1 = require("./server");
const tree_provider_1 = require("./sidebar/tree-provider");
const TERMINAL_NAME = "Helix";
const server = new server_1.HelixServer();
let activePanel = null;
function activate(context) {
    // ── 1. 启动守护进程（VS Code 激活时即启动）──
    startDaemonAsync(context);
    // ── 2. 注册侧边栏 ──
    const sidebarProvider = new tree_provider_1.HelixSidebarProvider();
    const sidebarTreeView = vscode.window.createTreeView("helix.sidebar", {
        treeDataProvider: sidebarProvider,
        showCollapseAll: false
    });
    // ── 2b. 注册执行树侧边栏 ──
    const execTreeProvider = new tree_provider_1.ExecutionTreeProvider();
    const execTreeView = vscode.window.createTreeView("helix.executionTree", {
        treeDataProvider: execTreeProvider,
        showCollapseAll: true,
    });
    execTreeProvider.setServerPort(server.getPort());
    execTreeProvider.startPolling(3000);
    // ── 3. 注册 GUI 命令 ──
    const openGUIDisposable = vscode.commands.registerCommand("helix.openGUI", async () => {
        await openGUI(context);
    });
    const openNewGUIDisposable = vscode.commands.registerCommand("helix.openGUI.new", async () => {
        activePanel?.dispose();
        activePanel = null;
        await openGUI(context);
    });
    // ── 4. 保留原有终端命令（兼容模式）──
    const openNewTerminalDisposable = vscode.commands.registerCommand("opencode.openNewTerminal", async () => {
        await openTerminal(context);
    });
    const openTerminalDisposable = vscode.commands.registerCommand("opencode.openTerminal", async () => {
        const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
        if (existingTerminal) {
            existingTerminal.show();
            return;
        }
        await openTerminal(context);
    });
    const addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
        const fileRef = getActiveFile();
        if (!fileRef) {
            return;
        }
        if (activePanel) {
            activePanel.sendFileRef(fileRef);
            return;
        }
        const terminal = vscode.window.activeTerminal;
        if (!terminal) {
            return;
        }
        if (terminal.name === TERMINAL_NAME) {
            const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"];
            port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false);
            terminal.show();
        }
    });
    // ── 5. 注册进程崩溃监听（仅通知 UI，重启由 HelixServer 内部管理）──
    server.onExit((code) => {
        vscode.window.showWarningMessage(`Helix server 已退出 (code: ${code})。正在自动重启...`);
        if (activePanel) {
            activePanel.notifyConnectionState("reconnecting");
        }
    });
    context.subscriptions.push(sidebarTreeView, execTreeView, openGUIDisposable, openNewGUIDisposable, openNewTerminalDisposable, openTerminalDisposable, addFilepathDisposable, {
        dispose: () => {
            server.stop();
            activePanel?.dispose();
            execTreeProvider.dispose();
        },
    });
}
function deactivate() {
    server.stop();
    activePanel?.dispose();
}
/**
 * 异步启动守护进程（不阻塞 activate）
 */
async function startDaemonAsync(context) {
    try {
        const port = await server.startDaemon(context);
        console.log(`[Helix] Daemon started on port ${port}`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Helix] Daemon start failed:", msg);
        vscode.window.showWarningMessage(`Helix 守护进程启动失败: ${msg}。GUI 将以离线模式运行。`);
    }
}
async function openGUI(context) {
    try {
        // 检查守护进程是否运行
        const isRunning = await server.isRunning();
        if (!isRunning) {
            vscode.window.showWarningMessage("Helix 守护进程未运行，尝试启动...");
            try {
                await server.restart();
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Helix 启动失败: ${msg}`);
            }
        }
        const port = server.getPort();
        // 如果已有面板，直接显示
        if (activePanel) {
            activePanel.reveal();
            return;
        }
        activePanel = panel_1.HelixWebviewPanel.createOrShow(context.extensionUri, port);
        activePanel.onDispose(() => {
            activePanel = null;
        });
        console.log("[Helix] activePanel created");
    }
    catch (err) {
        console.error("[Helix] openGUI error:", err);
        vscode.window.showErrorMessage(`启动 Helix 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
}
async function openTerminal(context) {
    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
    const cliPath = await findCliPath(context);
    const terminal = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        iconPath: {
            light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
            dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
        },
        location: {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false,
        },
        env: {
            _EXTENSION_OPENCODE_PORT: port.toString(),
            OPENCODE_CALLER: "vscode",
        },
    });
    terminal.show();
    terminal.sendText(`"${cliPath}" --port ${port}`);
    const fileRef = getActiveFile();
    if (!fileRef) {
        return;
    }
    let tries = 10;
    let connected = false;
    do {
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
            await fetch(`http://localhost:${port}/app`);
            connected = true;
            break;
        }
        catch { }
        tries--;
    } while (tries > 0);
    if (connected) {
        await appendPrompt(port, `In ${fileRef}`);
        terminal.show();
    }
}
async function appendPrompt(port, text) {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
}
function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    const document = activeEditor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        return;
    }
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    let filepathWithAt = `@${relativePath}`;
    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        if (startLine === endLine) {
            filepathWithAt += `#L${startLine}`;
        }
        else {
            filepathWithAt += `#L${startLine}-${endLine}`;
        }
    }
    return filepathWithAt;
}
async function findCliPath(context) {
    const config = vscode.workspace.getConfiguration("helix");
    const configuredPath = config.get("cliPath");
    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }
    const bundledCli = path.join(context.extensionPath, "bin", "mimo");
    if (fs.existsSync(bundledCli)) {
        return bundledCli;
    }
    try {
        const result = childProcess.execSync("which mimo", { stdio: "pipe" }).toString().trim();
        if (result) {
            return result;
        }
    }
    catch {
        // 继续
    }
    return "mimo";
}
//# sourceMappingURL=extension.js.map