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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
suite("Daemon Startup Test Suite", () => {
    let extension;
    setup(async () => {
        extension = vscode.extensions.getExtension("sst-dev.opencode");
        assert.ok(extension, "Extension should be present");
        await extension.activate();
    });
    test("Daemon should start after extension activation", async () => {
        const config = vscode.workspace.getConfiguration("helix");
        const basePort = config.get("serverPort") || 26220;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceName = workspaceFolders && workspaceFolders[0]
            ? workspaceFolders[0].uri.fsPath.split("/").pop() || "default"
            : "default";
        let hash = 0;
        for (const c of workspaceName) {
            hash = ((hash << 5) - hash) + c.charCodeAt(0);
            hash |= 0;
        }
        const offset = Math.abs(hash) % 100;
        const expectedPort = basePort + offset;
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            const response = await fetch(`http://localhost:${expectedPort}/global/health`, {
                signal: AbortSignal.timeout(5000),
            });
            assert.ok(response.ok, `Health check should pass on port ${expectedPort}`);
            const health = await response.json();
            assert.ok(health.healthy, "Health response should indicate healthy status");
            assert.ok(health.version, "Health response should include version");
        }
        catch (err) {
            assert.fail(`Daemon health check failed: ${err}`);
        }
    });
    test("Daemon should respond to session API", async () => {
        const config = vscode.workspace.getConfiguration("helix");
        const basePort = config.get("serverPort") || 26220;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceName = workspaceFolders && workspaceFolders[0]
            ? workspaceFolders[0].uri.fsPath.split("/").pop() || "default"
            : "default";
        let hash = 0;
        for (const c of workspaceName) {
            hash = ((hash << 5) - hash) + c.charCodeAt(0);
            hash |= 0;
        }
        const offset = Math.abs(hash) % 100;
        const port = basePort + offset;
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            const sessionResponse = await fetch(`http://localhost:${port}/session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "E2E Test Session" }),
                signal: AbortSignal.timeout(10000),
            });
            assert.ok(sessionResponse.ok, "POST /session should succeed");
            const session = await sessionResponse.json();
            assert.ok(session.id, "Session should have an ID");
            const listResponse = await fetch(`http://localhost:${port}/session?limit=10`, {
                signal: AbortSignal.timeout(5000),
            });
            assert.ok(listResponse.ok, "GET /session should succeed");
            const sessions = await listResponse.json();
            assert.ok(Array.isArray(sessions), "Sessions response should be an array");
        }
        catch (err) {
            assert.fail(`Session API test failed: ${err}`);
        }
    });
});
//# sourceMappingURL=daemon.test.js.map