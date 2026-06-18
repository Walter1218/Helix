import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";
import { HelixWebviewPanel } from "./webview/panel";
import { HelixServer } from "./server";
import { HelixSidebarProvider } from "./sidebar/tree-provider";

const TERMINAL_NAME = "Helix";
const server = new HelixServer();
let activePanel: HelixWebviewPanel | null = null;

export function activate(context: vscode.ExtensionContext) {
  // ── 注册侧边栏 ──
  const sidebarProvider = new HelixSidebarProvider();
  const sidebarTreeView = vscode.window.createTreeView("helix.sidebar", {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false
  });

  // ── 注册新命令：GUI 模式 ──
  const openGUIDisposable = vscode.commands.registerCommand("helix.openGUI", async () => {
    await openGUI(context);
  });

  const openNewGUIDisposable = vscode.commands.registerCommand("helix.openGUI.new", async () => {
    activePanel?.dispose();
    activePanel = null;
    await openGUI(context);
  });

  // ── 保留原有终端命令（兼容模式） ──
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
    if (!fileRef) {return;}

    if (activePanel) {
      activePanel.sendFileRef(fileRef);
      return;
    }

    const terminal = vscode.window.activeTerminal;
    if (!terminal) {return;}
    if (terminal.name === TERMINAL_NAME) {
      const port = (terminal.creationOptions as any).env?.["_EXTENSION_OPENCODE_PORT"];
      port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false);
      terminal.show();
    }
  });

  context.subscriptions.push(
    sidebarTreeView,
    openGUIDisposable,
    openNewGUIDisposable,
    openNewTerminalDisposable,
    openTerminalDisposable,
    addFilepathDisposable,
    {
      dispose: () => {
        server.stop();
        activePanel?.dispose();
      },
    }
  );

  // 扩展关闭时清理
  context.subscriptions.push(
    new vscode.Disposable(() => {
      server.stop();
    })
  );
}

export function deactivate() {
  server.stop();
  activePanel?.dispose();
}

async function openGUI(context: vscode.ExtensionContext) {
  try {
    // 如果已有面板，直接显示（即使被隐藏了）
    if (activePanel) {
      try {
        activePanel.reveal();
        return;
      } catch {
        activePanel = null;
      }
    }

    let port: number;
    try {
      vscode.window.showInformationMessage("正在启动 Helix 服务...");
      port = await server.start(context);
      console.log(`[Helix] 服务启动成功，端口: ${port}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[Helix] 服务启动失败:", errorMsg);
      // 找不到 mimo 也打开面板，进入离线模式
      vscode.window.showWarningMessage(`Helix 服务未启动: ${errorMsg}。GUI 进入离线模式。`);
      port = 0;
    }

    activePanel = HelixWebviewPanel.createOrShow(context.extensionUri, port);
    activePanel.onDispose(() => {
      activePanel = null;
    });
    console.log("[Helix] activePanel created");
  } catch (err) {
    console.error("[Helix] openGUI error:", err);
    vscode.window.showErrorMessage(`启动 Helix 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function openTerminal(context: vscode.ExtensionContext) {
  const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
  
  // 查找 CLI 路径
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
  if (!fileRef) {return;}

  let tries = 10;
  let connected = false;
  do {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await fetch(`http://localhost:${port}/app`);
      connected = true;
      break;
    } catch {}
    tries--;
  } while (tries > 0);

  if (connected) {
    await appendPrompt(port, `In ${fileRef}`);
    terminal.show();
  }
}

async function appendPrompt(port: number, text: string) {
  await fetch(`http://localhost:${port}/tui/append-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

function getActiveFile(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {return;}

  const document = activeEditor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {return;}

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  let filepathWithAt = `@${relativePath}`;

  const selection = activeEditor.selection;
  if (!selection.isEmpty) {
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    if (startLine === endLine) {
      filepathWithAt += `#L${startLine}`;
    } else {
      filepathWithAt += `#L${startLine}-${endLine}`;
    }
  }

  return filepathWithAt;
}

async function findCliPath(context: vscode.ExtensionContext): Promise<string> {
  // 0. 检查用户配置的 CLI 路径
  const config = vscode.workspace.getConfiguration("helix");
  const configuredPath = config.get<string>("cliPath");
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  // 1. 检查扩展内打包的 CLI
  const bundledCli = path.join(context.extensionPath, "bin", "mimo");
  if (fs.existsSync(bundledCli)) {
    return bundledCli;
  }

  // 2. 尝试在 PATH 中查找
  try {
    const result = childProcess.execSync("which mimo", { stdio: "pipe" }).toString().trim();
    if (result) {
      return result;
    }
  } catch {
    // 继续
  }

  // 3. 返回默认名称
  return "mimo";
}
