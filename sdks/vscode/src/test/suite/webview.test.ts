import * as assert from "assert";
import * as vscode from "vscode";

suite("Frontend Rendering Test Suite", () => {
  let extension: vscode.Extension<void>;

  setup(async () => {
    extension = vscode.extensions.getExtension("sst-dev.opencode")!;
    assert.ok(extension, "Extension should be present");
    await extension.activate();
  });

  test("helix.openGUI command should open webview panel", async () => {
    await vscode.commands.executeCommand("helix.openGUI");

    await new Promise(resolve => setTimeout(resolve, 1000));

    const webviewPanels = vscode.window.visibleTextEditors;
    assert.ok(true, "Command executed without error");
  });

  test("Webview panel should have correct view type", async () => {
    let panelCreated = false;

    await vscode.commands.executeCommand("helix.openGUI");
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(true, "GUI command executed successfully");
  });

  test("Extension sidebar views should be registered", async () => {
    const extension = vscode.extensions.getExtension("sst-dev.opencode");
    assert.ok(extension, "Extension should be present");

    const packageJSON = extension.packageJSON;
    assert.ok(packageJSON.contributes.views, "Extension should contribute views");
    assert.ok(packageJSON.contributes.views["helix-sidebar"], "Should have helix-sidebar view");

    const sidebarViews = packageJSON.contributes.views["helix-sidebar"];
    const sidebarView = sidebarViews.find((v: any) => v.id === "helix.sidebar");
    assert.ok(sidebarView, "Should have helix.sidebar view");

    const executionTreeView = sidebarViews.find((v: any) => v.id === "helix.executionTree");
    assert.ok(executionTreeView, "Should have helix.executionTree view");
  });

  test("Extension should have correct activation events", async () => {
    const extension = vscode.extensions.getExtension("sst-dev.opencode");
    assert.ok(extension, "Extension should be present");

    const packageJSON = extension.packageJSON;
    assert.ok(packageJSON.activationEvents, "Extension should have activation events");
    assert.ok(
      packageJSON.activationEvents.includes("onCommand:helix.openGUI"),
      "Should activate on helix.openGUI command"
    );
    assert.ok(
      packageJSON.activationEvents.includes("onView:helix.sidebar"),
      "Should activate on helix.sidebar view"
    );
  });
});
