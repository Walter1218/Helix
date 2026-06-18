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
