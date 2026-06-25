import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Activation Test Suite", () => {
  test("Extension should be present", () => {
    const extension = vscode.extensions.getExtension("sst-dev.opencode");
    assert.ok(extension, "Extension should be present");
  });

  test("Extension should activate", async () => {
    const extension = vscode.extensions.getExtension("sst-dev.opencode");
    assert.ok(extension, "Extension should be present");

    await extension.activate();
    assert.ok(extension.isActive, "Extension should be active");
  });

  test("Commands should be registered after activation", async () => {
    const extension = vscode.extensions.getExtension("sst-dev.opencode");
    assert.ok(extension, "Extension should be present");

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("helix.openGUI"), "helix.openGUI command should be registered");
    assert.ok(commands.includes("helix.openGUI.new"), "helix.openGUI.new command should be registered");
    assert.ok(commands.includes("opencode.openTerminal"), "opencode.openTerminal command should be registered");
    assert.ok(commands.includes("opencode.openNewTerminal"), "opencode.openNewTerminal command should be registered");
    assert.ok(commands.includes("opencode.addFilepathToTerminal"), "opencode.addFilepathToTerminal command should be registered");
  });
});
