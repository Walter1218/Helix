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
exports.HelixTreeItem = exports.TraceTreeItem = exports.ExecutionTreeProvider = exports.HelixSidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
class HelixSidebarProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve([
            new HelixTreeItem("Open Helix GUI", vscode.TreeItemCollapsibleState.None, {
                command: "helix.openGUI",
                title: "Open Helix GUI",
                arguments: []
            }, "$(play)"),
            new HelixTreeItem("Open Terminal Mode", vscode.TreeItemCollapsibleState.None, {
                command: "opencode.openTerminal",
                title: "Open Terminal Mode",
                arguments: []
            }, "$(terminal)"),
            new HelixTreeItem("Add File to Context", vscode.TreeItemCollapsibleState.None, {
                command: "opencode.addFilepathToTerminal",
                title: "Add File to Context",
                arguments: []
            }, "$(file-add)"),
            new HelixTreeItem("Documentation", vscode.TreeItemCollapsibleState.None, {
                command: "vscode.open",
                title: "Open Documentation",
                arguments: [vscode.Uri.parse("https://github.com/anomalyco/opencode/blob/main/README.md")]
            }, "$(book)")
        ]);
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
}
exports.HelixSidebarProvider = HelixSidebarProvider;
function fmtDuration(ms) {
    if (ms === undefined || ms === null)
        return "";
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
function statusIcon(s) {
    return s === "success" ? "pass" : s === "failed" ? "error" : "loading~spin";
}
function extractDetail(node) {
    const meta = node.metadata;
    if (!meta)
        return undefined;
    if (typeof meta.error === "string")
        return meta.error.slice(0, 100);
    if (typeof meta.output === "string" && meta.output)
        return meta.output.slice(0, 100);
    if (typeof meta.result === "string")
        return `result: ${meta.result}`;
    if (typeof meta.finishReason === "string") {
        const tokens = meta.tokens;
        const parts = [`finish: ${meta.finishReason}`];
        if (tokens?.input)
            parts.push(`in:${tokens.input}`);
        if (tokens?.output)
            parts.push(`out:${tokens.output}`);
        return parts.join(" · ");
    }
    if (typeof meta.input === "object" && meta.input) {
        const input = meta.input;
        if (input.command)
            return String(input.command).slice(0, 100);
        if (input.filePath)
            return String(input.filePath);
        if (input.pattern)
            return String(input.pattern);
    }
    return undefined;
}
class ExecutionTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    nodes = new Map();
    roots = [];
    pollTimer = null;
    serverPort = 0;
    sessionID = null;
    constructor() { }
    setServerPort(port) {
        this.serverPort = port;
    }
    setSessionID(sessionID) {
        this.sessionID = sessionID;
    }
    startPolling(intervalMs = 3000) {
        this.stopPolling();
        this.pollTimer = setInterval(() => this.refresh(), intervalMs);
    }
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    async refresh() {
        if (!this.serverPort)
            return;
        try {
            let url = `http://localhost:${this.serverPort}/trace?tree=true`;
            if (this.sessionID)
                url += `&sessionID=${this.sessionID}`;
            const resp = await fetch(url, {
                signal: AbortSignal.timeout(2000),
            });
            if (!resp.ok)
                return;
            const tree = (await resp.json());
            this.nodes.clear();
            this.roots = tree;
            const collect = (nodes) => {
                for (const n of nodes) {
                    this.nodes.set(n.id, n);
                    if (n.children)
                        collect(n.children);
                }
            };
            collect(tree);
            this._onDidChangeTreeData.fire();
        }
        catch {
            // server not reachable, silent
        }
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            if (!this.roots.length) {
                return Promise.resolve([
                    new TraceTreeItem("No execution trace", vscode.TreeItemCollapsibleState.None, "$(info)", "Waiting for agent activity..."),
                ]);
            }
            return Promise.resolve(this.roots.map((n) => this.toTreeItem(n, 0)));
        }
        const node = this.nodes.get(element.nodeId);
        const children = node?.children ?? [];
        return Promise.resolve(children.map((n) => this.toTreeItem(n, element.depth + 1)));
    }
    toTreeItem(node, depth) {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const icon = statusIcon(node.status);
        const dur = fmtDuration(node.duration);
        const detail = extractDetail(node);
        const label = `${node.name}${dur ? ` (${dur})` : ""}`;
        const description = detail ?? "";
        const item = new TraceTreeItem(label, hasChildren
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None, `$(${icon})`, description);
        item.nodeId = node.id;
        item.depth = depth;
        if (detail) {
            item.tooltip = `${node.name}\n${detail}`;
        }
        return item;
    }
    dispose() {
        this.stopPolling();
        this._onDidChangeTreeData.dispose();
    }
}
exports.ExecutionTreeProvider = ExecutionTreeProvider;
class TraceTreeItem extends vscode.TreeItem {
    nodeId = "";
    depth = 0;
    constructor(label, collapsibleState, iconId, description) {
        super(label, collapsibleState);
        this.description = description;
        if (iconId) {
            this.iconPath = new vscode.ThemeIcon(iconId.replace("$(", "").replace(")", ""));
        }
        this.contextValue = "traceNode";
    }
}
exports.TraceTreeItem = TraceTreeItem;
class HelixTreeItem extends vscode.TreeItem {
    label;
    collapsibleState;
    command;
    iconId;
    constructor(label, collapsibleState, command, iconId) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.iconId = iconId;
        this.tooltip = label;
        if (iconId) {
            this.iconPath = new vscode.ThemeIcon(iconId.replace("$(", "").replace(")", ""));
        }
        this.contextValue = "helixItem";
    }
}
exports.HelixTreeItem = HelixTreeItem;
//# sourceMappingURL=tree-provider.js.map