import * as vscode from "vscode";

export class HelixSidebarProvider implements vscode.TreeDataProvider<HelixTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<HelixTreeItem | undefined | null | void> = new vscode.EventEmitter<HelixTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<HelixTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: HelixTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HelixTreeItem): Thenable<HelixTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve([
      new HelixTreeItem(
        "Open Helix GUI",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "helix.openGUI",
          title: "Open Helix GUI",
          arguments: []
        },
        "$(play)"
      ),
      new HelixTreeItem(
        "Open Terminal Mode",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "opencode.openTerminal",
          title: "Open Terminal Mode",
          arguments: []
        },
        "$(terminal)"
      ),
      new HelixTreeItem(
        "Add File to Context",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "opencode.addFilepathToTerminal",
          title: "Add File to Context",
          arguments: []
        },
        "$(file-add)"
      ),
      new HelixTreeItem(
        "Documentation",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "vscode.open",
          title: "Open Documentation",
          arguments: [vscode.Uri.parse("https://github.com/anomalyco/opencode/blob/main/README.md")]
        },
        "$(book)"
      )
    ]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

interface TraceNode {
  id: string
  parentId?: string
  type: string
  name: string
  status: "pending" | "success" | "failed"
  metadata?: Record<string, unknown>
  timestamp: number
  duration?: number
  children?: TraceNode[]
}

function fmtDuration(ms?: number): string {
  if (ms === undefined || ms === null) return ""
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function statusIcon(s: string): string {
  return s === "success" ? "pass" : s === "failed" ? "error" : "loading~spin"
}

function extractDetail(node: TraceNode): string | undefined {
  const meta = node.metadata
  if (!meta) return undefined
  if (typeof meta.error === "string") return meta.error.slice(0, 100)
  if (typeof meta.output === "string" && meta.output) return meta.output.slice(0, 100)
  if (typeof meta.result === "string") return `result: ${meta.result}`
  if (typeof meta.finishReason === "string") {
    const tokens = meta.tokens as Record<string, number> | undefined
    const parts = [`finish: ${meta.finishReason}`]
    if (tokens?.input) parts.push(`in:${tokens.input}`)
    if (tokens?.output) parts.push(`out:${tokens.output}`)
    return parts.join(" · ")
  }
  if (typeof meta.input === "object" && meta.input) {
    const input = meta.input as Record<string, unknown>
    if (input.command) return String(input.command).slice(0, 100)
    if (input.filePath) return String(input.filePath)
    if (input.pattern) return String(input.pattern)
  }
  return undefined
}

export class ExecutionTreeProvider implements vscode.TreeDataProvider<TraceTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TraceTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private nodes = new Map<string, TraceNode>()
  private roots: TraceNode[] = []
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private serverPort = 0
  private sessionID: string | null = null

  constructor() {}

  setServerPort(port: number) {
    this.serverPort = port
  }

  setSessionID(sessionID: string | null) {
    this.sessionID = sessionID
  }

  startPolling(intervalMs = 3000) {
    this.stopPolling()
    this.pollTimer = setInterval(() => this.refresh(), intervalMs)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  async refresh() {
    if (!this.serverPort) return
    try {
      let url = `http://localhost:${this.serverPort}/trace?tree=true`
      if (this.sessionID) url += `&sessionID=${this.sessionID}`
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      })
      if (!resp.ok) return
      const tree = (await resp.json()) as TraceNode[]
      this.nodes.clear()
      this.roots = tree
      const collect = (nodes: TraceNode[]) => {
        for (const n of nodes) {
          this.nodes.set(n.id, n)
          if (n.children) collect(n.children)
        }
      }
      collect(tree)
      this._onDidChangeTreeData.fire()
    } catch {
      // server not reachable, silent
    }
  }

  getTreeItem(element: TraceTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: TraceTreeItem): Thenable<TraceTreeItem[]> {
    if (!element) {
      if (!this.roots.length) {
        return Promise.resolve([
          new TraceTreeItem(
            "No execution trace",
            vscode.TreeItemCollapsibleState.None,
            "$(info)",
            "Waiting for agent activity...",
          ),
        ])
      }
      return Promise.resolve(this.roots.map((n) => this.toTreeItem(n, 0)))
    }
    const node = this.nodes.get(element.nodeId)
    const children = node?.children ?? []
    return Promise.resolve(children.map((n) => this.toTreeItem(n, element.depth + 1)))
  }

  private toTreeItem(node: TraceNode, depth: number): TraceTreeItem {
    const hasChildren = (node.children?.length ?? 0) > 0
    const icon = statusIcon(node.status)
    const dur = fmtDuration(node.duration)
    const detail = extractDetail(node)
    const label = `${node.name}${dur ? ` (${dur})` : ""}`
    const description = detail ?? ""
    const item = new TraceTreeItem(
      label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
      `$(${icon})`,
      description,
    )
    item.nodeId = node.id
    item.depth = depth
    if (detail) {
      item.tooltip = `${node.name}\n${detail}`
    }
    return item
  }

  dispose() {
    this.stopPolling()
    this._onDidChangeTreeData.dispose()
  }
}

export class TraceTreeItem extends vscode.TreeItem {
  nodeId = ""
  depth = 0

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    iconId?: string,
    description?: string,
  ) {
    super(label, collapsibleState)
    this.description = description
    if (iconId) {
      this.iconPath = new vscode.ThemeIcon(iconId.replace("$(", "").replace(")", ""))
    }
    this.contextValue = "traceNode"
  }
}

export class HelixTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly iconId?: string
  ) {
    super(label, collapsibleState);
    this.tooltip = label;
    if (iconId) {
      this.iconPath = new vscode.ThemeIcon(iconId.replace("$(", "").replace(")", ""));
    }
    this.contextValue = "helixItem";
  }
}
