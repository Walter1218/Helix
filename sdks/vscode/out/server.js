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
exports.HelixServer = void 0;
const vscode = __importStar(require("vscode"));
const childProcess = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function fetchWithTimeout(url, timeoutMs) {
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
class HelixServer {
    process = null;
    port = 0;
    ready = false;
    context = null;
    outputChannel = null;
    restartAttempts = 0;
    restartTimer = null;
    intentionalShutdown = false;
    static MAX_RESTART_ATTEMPTS = 10;
    onExitCallbacks = [];
    /**
     * 计算工作区固定端口：basePort + hash(workspaceName) % 100
     * 保证同一工作区始终使用同一端口
     */
    getWorkspacePort() {
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
        const basePort = config.get("serverPort") || 26220;
        return basePort + offset;
    }
    /**
     * 启动守护进程（VS Code 激活时调用）
     * 如果已有进程在运行，复用现有端口
     */
    async startDaemon(context) {
        this.context = context; // 保存 context 供 findOpencodeCli 查找 bundled CLI
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
        }
        catch {
            // 没有现有进程，继续启动
        }
        const cwd = workspaceFolders && workspaceFolders[0]
            ? workspaceFolders[0].uri.fsPath
            : process.cwd();
        this.outputChannel = vscode.window.createOutputChannel(`Helix Daemon (${workspaceName})`);
        try {
            return await this.spawnProcess(cwd, workspaceName);
        }
        catch (err) {
            this.outputChannel?.appendLine(`[Helix] Daemon start failed: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }
    /**
     * 内部 spawn 进程，含崩溃自动重启逻辑
     */
    async spawnProcess(cwd, workspaceName) {
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
            for (const cb of this.onExitCallbacks) {
                cb(code);
            }
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
    scheduleRestart(cwd, workspaceName) {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
        }
        this.restartAttempts++;
        if (this.restartAttempts > HelixServer.MAX_RESTART_ATTEMPTS) {
            this.outputChannel?.appendLine(`[Helix] Max restart attempts (${HelixServer.MAX_RESTART_ATTEMPTS}) exceeded. ` +
                `Daemon will not be restarted automatically. Please check CLI installation or restart VS Code.`);
            vscode.window.showErrorMessage(`Helix 守护进程连续重启失败 ${HelixServer.MAX_RESTART_ATTEMPTS} 次，已停止自动重启。请检查 CLI 安装或重启 VS Code。`);
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
    async restart() {
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
    stop() {
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
    async isRunning() {
        const port = this.getPort();
        try {
            const res = await fetchWithTimeout(`http://localhost:${port}/global/health`, 2000);
            if (res.ok) {
                this.ready = true;
                return true;
            }
        }
        catch {
            // health check 失败
        }
        return false;
    }
    getPort() {
        if (this.port === 0) {
            this.port = this.getWorkspacePort();
        }
        return this.port;
    }
    isReady() {
        return this.ready;
    }
    onExit(callback) {
        this.onExitCallbacks.push(callback);
    }
    clearExitCallbacks() {
        this.onExitCallbacks = [];
    }
    /**
     * Verify a CLI binary can actually execute (catches macOS provenance/signing issues,
     * corruption, wrong architecture, etc.)
     */
    async verifyCli(cliPath, timeoutMs = 5000) {
        try {
            const result = childProcess.spawnSync(cliPath, ["--version"], {
                timeout: timeoutMs,
                stdio: "pipe",
                killSignal: "SIGKILL",
            });
            if (result.status === 0 || result.stdout.toString().trim().length > 0) {
                console.log(`[Helix] CLI 验证通过: ${cliPath} → ${result.stdout.toString().trim()}`);
                return true;
            }
            // On macOS, provenance-blocked processes exit with signal SIGKILL and no output
            if (result.signal || result.error) {
                console.warn(`[Helix] CLI 验证失败: ${cliPath} (signal=${result.signal}, error=${result.error?.message})`);
                return false;
            }
            // Non-zero exit but with output might be acceptable (some CLIs print version on stderr)
            if (result.stderr.toString().length > 0 || result.stdout.toString().length > 0) {
                console.log(`[Helix] CLI 验证通过（非零退出码但有输出）: ${cliPath}`);
                return true;
            }
            console.warn(`[Helix] CLI 验证失败: ${cliPath} (exit=${result.status}, no output)`);
            return false;
        }
        catch (err) {
            console.warn(`[Helix] CLI 验证异常: ${cliPath}`, err);
            return false;
        }
    }
    async findOpencodeCli() {
        const config = vscode.workspace.getConfiguration("helix");
        const configuredPath = config.get("cliPath");
        console.log("[Helix] 配置的 CLI 路径:", configuredPath);
        if (configuredPath && fs.existsSync(configuredPath)) {
            if (await this.verifyCli(configuredPath)) {
                console.log("[Helix] 使用配置的 CLI 路径:", configuredPath);
                return configuredPath;
            }
            console.warn("[Helix] 配置的 CLI 验证失败，尝试其他路径");
        }
        if (this.context) {
            const bundledCli = path.join(this.context.extensionPath, "bin", "mimo");
            console.log("[Helix] 检查打包的 CLI:", bundledCli);
            if (fs.existsSync(bundledCli)) {
                if (await this.verifyCli(bundledCli)) {
                    console.log("[Helix] 使用打包的 CLI:", bundledCli);
                    return bundledCli;
                }
                console.warn("[Helix] 打包的 CLI 验证失败（可能是 macOS provenance 问题），降级搜索其他路径");
            }
        }
        const candidates = ["opencode", "mimo"];
        for (const cmd of candidates) {
            try {
                childProcess.execSync(`which ${cmd}`, { stdio: "pipe" });
                if (await this.verifyCli(cmd)) {
                    console.log("[Helix] 使用 PATH 中的 CLI:", cmd);
                    return cmd;
                }
            }
            catch {
                // 继续尝试下一个
            }
        }
        // 本地开发：搜索编译产物（支持多平台目录结构）
        // process.cwd() 在 VSCode 扩展中不是项目根，需用 workspaceFolders
        const projectRoots = [];
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders && wsFolders.length > 0) {
            projectRoots.push(wsFolders[0].uri.fsPath);
        }
        projectRoots.push(process.cwd()); // fallback
        for (const root of projectRoots) {
            const distDir = path.join(root, "packages", "opencode", "dist");
            const localCandidates = [
                path.join(distDir, "mimo"), // 旧路径
                path.join(distDir, "mimocode-darwin-arm64", "bin", "mimo"), // macOS ARM
                path.join(distDir, "mimocode-darwin-x64", "bin", "mimo"), // macOS Intel
                path.join(distDir, "mimocode-linux-arm64", "bin", "mimo"), // Linux ARM
                path.join(distDir, "mimocode-linux-x64", "bin", "mimo"), // Linux x64
            ];
            for (const cliPath of localCandidates) {
                if (fs.existsSync(cliPath)) {
                    if (await this.verifyCli(cliPath)) {
                        console.log("[Helix] 使用本地开发的 CLI:", cliPath);
                        return cliPath;
                    }
                    console.warn("[Helix] 本地 CLI 验证失败，继续:", cliPath);
                }
            }
        }
        console.log("[Helix] 未找到 CLI");
        return null;
    }
    async waitForReady() {
        let tries = 120;
        while (tries > 0) {
            try {
                const response = await fetchWithTimeout(`http://localhost:${this.port}/global/health`, 2000);
                if (response.ok) {
                    this.outputChannel?.appendLine(`[Helix] Health check passed after ${120 - tries} tries`);
                    return;
                }
            }
            catch (e) {
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
exports.HelixServer = HelixServer;
//# sourceMappingURL=server.js.map