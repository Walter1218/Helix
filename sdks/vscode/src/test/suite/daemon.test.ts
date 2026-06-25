import * as assert from "assert";
import * as vscode from "vscode";

suite("Daemon Startup Test Suite", () => {
  let extension: vscode.Extension<void>;

  setup(async () => {
    extension = vscode.extensions.getExtension("sst-dev.opencode")!;
    assert.ok(extension, "Extension should be present");
    await extension.activate();
  });

  test("Daemon should start after extension activation", async () => {
    const config = vscode.workspace.getConfiguration("helix");
    const basePort = config.get<number>("serverPort") || 26220;

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

      const health = await response.json() as { healthy: boolean; version: string };
      assert.ok(health.healthy, "Health response should indicate healthy status");
      assert.ok(health.version, "Health response should include version");
    } catch (err) {
      assert.fail(`Daemon health check failed: ${err}`);
    }
  });

  test("Daemon should respond to session API", async () => {
    const config = vscode.workspace.getConfiguration("helix");
    const basePort = config.get<number>("serverPort") || 26220;

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

      const session = await sessionResponse.json() as { id: string };
      assert.ok(session.id, "Session should have an ID");

      const listResponse = await fetch(`http://localhost:${port}/session?limit=10`, {
        signal: AbortSignal.timeout(5000),
      });
      assert.ok(listResponse.ok, "GET /session should succeed");

      const sessions = await listResponse.json();
      assert.ok(Array.isArray(sessions), "Sessions response should be an array");
    } catch (err) {
      assert.fail(`Session API test failed: ${err}`);
    }
  });
});
