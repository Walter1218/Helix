import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";
import * as fs from "fs";

export class HelixServer {
  private process: childProcess.ChildProcess | null = null;
  private port: number = 0;
  private ready: boolean = false;
  private context: vscode.ExtensionContext | null = null;

  async start(context: vscode.ExtensionContext): Promise<number> {
    if (this.ready && this.port) {return this.port;}

    this.context = context;

    // 先检查是否有已运行的服务器（端口 3095）
    try {
      const response = await fetch("http://localhost:3095/health");
      if (response.ok) {
        this.port = 3095;
        this.ready = true;
        return this.port;
      }
    } catch {
      // 没有已运行的服务器，继续启动新的
    }

    this.port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;

    // 查找 opencode 可执行文件
    const opencodePath = await this.findOpencodeCli();
    if (!opencodePath) {
      throw new Error("Helix CLI 未找到。请确保已安装 Helix。");
    }

    // 获取工作区目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders && workspaceFolders[0] ? workspaceFolders[0].uri.fsPath : process.cwd();

    this.process = childProcess.spawn(opencodePath, ["--port", this.port.toString()], {
      cwd,
      env: {
        ...process.env,
        OPENCODE_CALLER: "vscode",
        MIMOCODE_HOME: path.join(context.extensionPath, ".dev-home"),
      },
      stdio: "pipe",
    });

    // 等待服务就绪
    await this.waitForReady();
    this.ready = true;

    return this.port;
  }

  private async findOpencodeCli(): Promise<string | null> {
    // 0. 检查用户配置的 CLI 路径
    const config = vscode.workspace.getConfiguration("helix");
    const configuredPath = config.get<string>("cliPath");
    console.log("[Helix] 配置的 CLI 路径:", configuredPath);
    if (configuredPath && fs.existsSync(configuredPath)) {
      console.log("[Helix] 使用配置的 CLI 路径:", configuredPath);
      return configuredPath;
    }

    // 1. 检查扩展内打包的 CLI
    if (this.context) {
      const bundledCli = path.join(this.context.extensionPath, "bin", "mimo");
      console.log("[Helix] 检查打包的 CLI:", bundledCli);
      if (fs.existsSync(bundledCli)) {
        console.log("[Helix] 使用打包的 CLI:", bundledCli);
        return bundledCli;
      }
    }

    // 2. 尝试在 PATH 中查找
    const candidates = [
      "opencode",
      "mimo",
    ];

    for (const cmd of candidates) {
      try {
        childProcess.execSync(`which ${cmd}`, { stdio: "pipe" });
        console.log("[Helix] 使用 PATH 中的 CLI:", cmd);
        return cmd;
      } catch {
        // 继续尝试下一个
      }
    }

    // 3. 检查本地开发的 opencode
    const localOpencode = path.join(process.cwd(), "packages", "opencode", "dist", "mimo");
    if (fs.existsSync(localOpencode)) {
      console.log("[Helix] 使用本地开发的 CLI:", localOpencode);
      return localOpencode;
    }

    console.log("[Helix] 未找到 CLI");
    return null;
  }

  private async waitForReady(): Promise<void> {
    let tries = 50;
    while (tries > 0) {
      try {
        const response = await fetch(`http://localhost:${this.port}/app`);
        if (response.ok) {
          return;
        }
      } catch {
        // 服务尚未就绪
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      tries--;
    }
    throw new Error(`Helix 服务在端口 ${this.port} 上未能启动`);
  }

  stop() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.ready = false;
    this.port = 0;
  }

  getPort(): number {
    return this.port;
  }

  isReady(): boolean {
    return this.ready;
  }
}
