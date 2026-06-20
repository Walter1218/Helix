import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";
import * as fs from "fs";

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

/**
 * 守护进程模式：
 * - VS Code 激活时启动，常驻运行
 * - 端口固定（按工作区哈希计算）
 * - 崩溃后自动重启（指数退避）
 * - 统一 MIMOCODE_HOME，全局记忆共享
 */
export class HelixServer {
  private process: childProcess.ChildProcess | null = null;
  private port: number = 0;
  private ready: boolean = false;
  private context: vscode.ExtensionContext | null = null;
  private outputChannel: vscode.OutputChannel | null = null;
  private restartAttempts: number = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private intentionalShutdown: boolean = false;
  private static readonly MAX_RESTART_ATTEMPTS = 10;
  private onExitCallbacks: Array<(code: number | null) => void> = [];

  /**
   * 计算工作区固定端口：basePort + hash(workspaceName) % 100
   * 保证同一工作区始终使用同一端口
   */
  private getWorkspacePort(): number {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceName = workspaceFolders && workspaceFolders[0]
      ? path.basename(workspaceFolders[0].uri.fsPath)
      : "default";

    let hash = 0;
    for (const c of workspaceName) {
      hash = ((hash << 5) - hash) + c.charCodeAt(0);
      hash |= 0;
    }
    const offset = Math.abs(hash) % 100;

    const config = vscode.workspace.getConfiguration("helix");
    const basePort = config.get<number>("serverPort") || 26220;

    return basePort + offset;
  }

  /**
   * 启动守护进程（VS Code 激活时调用）
   * 如果已有进程在运行，复用现有端口
   */
  async startDaemon(context: vscode.ExtensionContext): Promise<number> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceName = workspaceFolders && workspaceFolders[0]
      ? path.basename(workspaceFolders[0].uri.fsPath)
      : "default";

    this.port = this.getPort(); // getPort() 会计算端口

    // 先检查是否已有进程在运行（扩展重新加载场景）
    try {
      const res = await fetchWithTimeout(`http://localhost:${this.port}/global/health`, 2000);
      if (res.ok) {
        this.ready = true;
        this.outputChannel = vscode.window.createOutputChannel(`Helix Daemon (${workspaceName})`);
        this.outputChannel?.appendLine(`[Helix] Reusing existing daemon on port ${this.port}`);
        return this.port;
      }
    } catch {
      // 没有现有进程，继续启动
    }

    const cwd = workspaceFolders && workspaceFolders[0]
      ? workspaceFolders[0].uri.fsPath
      : process.cwd();

    this.outputChannel = vscode.window.createOutputChannel(`Helix Daemon (${workspaceName})`);

    try {
      return await this.spawnProcess(cwd, workspaceName);
    } catch (err) {
      this.outputChannel?.appendLine(`[Helix] Daemon start failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * 内部 spawn 进程，含崩溃自动重启逻辑
   */
  private async spawnProcess(cwd: string, workspaceName: string): Promise<number> {
    const opencodePath = await this.findOpencodeCli();
    if (!opencodePath) {
      throw new Error("Helix CLI 未找到。请确保已安装 Helix。");
    }

    // 统一全局 MIMOCODE_HOME（所有入口共享）
    const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
    const mimocodeHome = path.join(homeDir, ".config", "mimocode");
    fs.mkdirSync(mimocodeHome, { recursive: true });

    this.outputChannel?.appendLine(`[Helix] Starting daemon on port ${this.port} (workspace: ${workspaceName})...`);

        const currentProcess = childProcess.spawn(opencodePath, ["serve", "--port", this.port.toString(), "--workspace-id", workspaceName], {
          cwd,
          env: {
            ...process.env,
            OPENCODE_CALLER: "vscode",
            MIMOCODE_HOME: mimocodeHome,
          },
          stdio: "pipe",
        });

    this.process = currentProcess;

    // 消费 stdout/stderr，防止子进程阻塞
    currentProcess.stdout?.on("data", (data) => {
      this.outputChannel?.append(data.toString());
    });
    currentProcess.stderr?.on("data", (data) => {
      this.outputChannel?.append("[ERR] " + data.toString());
    });

    // 进程退出监听 — 自动重启（仅在非主动关闭时）
    currentProcess.on("exit", (code) => {
      this.outputChannel?.appendLine(`\n[Helix] Daemon exited with code ${code}`);

      if (this.process === currentProcess) {
        this.process = null;
      }
      this.ready = false;

      // 通知退出回调
      for (const cb of this.onExitCallbacks) { cb(code); }

      // 仅在非主动关闭时自动重启
      if (!this.intentionalShutdown) {
        this.scheduleRestart(cwd, workspaceName);
      }
    });

    // 等待服务就绪
    await this.waitForReady();
    this.ready = true;
    this.restartAttempts = 0; // 重置重试计数
    this.intentionalShutdown = false; // 重置主动关闭标志
    this.outputChannel?.appendLine(`[Helix] Daemon ready on port ${this.port}`);

    return this.port;
  }

  /**
   * 指数退避自动重启（有上限，超过后停止重试并通知用户）
   */
  private scheduleRestart(cwd: string, workspaceName: string): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    this.restartAttempts++;

    if (this.restartAttempts > HelixServer.MAX_RESTART_ATTEMPTS) {
      this.outputChannel?.appendLine(
        `[Helix] Max restart attempts (${HelixServer.MAX_RESTART_ATTEMPTS}) exceeded. ` +
        `Daemon will not be restarted automatically. Please check CLI installation or restart VS Code.`
      );
      vscode.window.showErrorMessage(
        `Helix 守护进程连续重启失败 ${HelixServer.MAX_RESTART_ATTEMPTS} 次，已停止自动重启。请检查 CLI 安装或重启 VS Code。`
      );
      return;
    }

    const maxDelay = 30000; // 最大 30 秒
    const delay = Math.min(Math.pow(2, this.restartAttempts) * 1000, maxDelay);

    this.outputChannel?.appendLine(`[Helix] Scheduling restart in ${delay}ms (attempt ${this.restartAttempts}/${HelixServer.MAX_RESTART_ATTEMPTS})...`);

    this.restartTimer = setTimeout(() => {
      this.spawnProcess(cwd, workspaceName).then((port) => {
        this.outputChannel?.appendLine(`[Helix] Daemon restarted on port ${port}`);
      }).catch((err) => {
        this.outputChannel?.appendLine(`[Helix] Restart failed: ${err instanceof Error ? err.message : String(err)}`);
        // 失败后由 exit handler 再次触发 scheduleRestart，计数继续递增
      });
    }, delay);
  }

  /**
   * 手动重启（用于外部调用）
   */
  async restart(): Promise<number> {
    this.stop();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceName = workspaceFolders && workspaceFolders[0]
      ? path.basename(workspaceFolders[0].uri.fsPath)
      : "default";
    const cwd = workspaceFolders && workspaceFolders[0]
      ? workspaceFolders[0].uri.fsPath
      : process.cwd();

    this.restartAttempts = 0;
    return this.spawnProcess(cwd, workspaceName);
  }

  /**
   * 停止守护进程（VS Code 停用时调用）
   */
  stop(): void {
    this.intentionalShutdown = true; // 阻止 exit handler 触发自动重启

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.process) {
      const p = this.process;
      p.kill("SIGTERM");
      setTimeout(() => {
        if (!p.killed) {
          p.kill("SIGKILL");
        }
      }, 3000);
      this.process = null;
    }
    this.ready = false;
    this.onExitCallbacks = [];
  }

  /**
   * 检测进程是否存活（支持进程外检测）
   */
  async isRunning(): Promise<boolean> {
    const port = this.getPort();
    try {
      const res = await fetchWithTimeout(`http://localhost:${port}/global/health`, 2000);
      if (res.ok) {
        this.ready = true;
        return true;
      }
    } catch {
      // health check 失败
    }
    return false;
  }

  getPort(): number {
    if (this.port === 0) {
      this.port = this.getWorkspacePort();
    }
    return this.port;
  }

  isReady(): boolean {
    return this.ready;
  }

  onExit(callback: (code: number | null) => void) {
    this.onExitCallbacks.push(callback);
  }

  clearExitCallbacks() {
    this.onExitCallbacks = [];
  }

  private async findOpencodeCli(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration("helix");
    const configuredPath = config.get<string>("cliPath");
    console.log("[Helix] 配置的 CLI 路径:", configuredPath);
    if (configuredPath && fs.existsSync(configuredPath)) {
      console.log("[Helix] 使用配置的 CLI 路径:", configuredPath);
      return configuredPath;
    }

    if (this.context) {
      const bundledCli = path.join(this.context.extensionPath, "bin", "mimo");
      console.log("[Helix] 检查打包的 CLI:", bundledCli);
      if (fs.existsSync(bundledCli)) {
        console.log("[Helix] 使用打包的 CLI:", bundledCli);
        return bundledCli;
      }
    }

    const candidates = ["opencode", "mimo"];
    for (const cmd of candidates) {
      try {
        childProcess.execSync(`which ${cmd}`, { stdio: "pipe" });
        console.log("[Helix] 使用 PATH 中的 CLI:", cmd);
        return cmd;
      } catch {
        // 继续尝试下一个
      }
    }

    // 本地开发：搜索编译产物（支持多平台目录结构）
    const distDir = path.join(process.cwd(), "packages", "opencode", "dist");
    const localCandidates = [
      path.join(distDir, "mimo"),                                    // 旧路径
      path.join(distDir, "mimocode-darwin-arm64", "bin", "mimo"),    // macOS ARM
      path.join(distDir, "mimocode-darwin-x64", "bin", "mimo"),     // macOS Intel
      path.join(distDir, "mimocode-linux-arm64", "bin", "mimo"),     // Linux ARM
      path.join(distDir, "mimocode-linux-x64", "bin", "mimo"),       // Linux x64
    ];
    for (const cliPath of localCandidates) {
      if (fs.existsSync(cliPath)) {
        console.log("[Helix] 使用本地开发的 CLI:", cliPath);
        return cliPath;
      }
    }

    console.log("[Helix] 未找到 CLI");
    return null;
  }

  private async waitForReady(): Promise<void> {
    let tries = 120;
    while (tries > 0) {
      try {
        const response = await fetchWithTimeout(`http://localhost:${this.port}/global/health`, 2000);
        if (response.ok) {
          this.outputChannel?.appendLine(`[Helix] Health check passed after ${120 - tries} tries`);
          return;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (tries % 10 === 0 || tries === 120) {
          this.outputChannel?.appendLine(`[Helix] Health check failed (${120 - tries}/120): ${errMsg}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      tries--;
    }
    throw new Error(`Helix 守护进程在端口 ${this.port} 上未能启动`);
  }
}
