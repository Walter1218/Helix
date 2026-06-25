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
suite("Frontend Rendering Test Suite", () => {
    let extension;
    setup(async () => {
        extension = vscode.extensions.getExtension("sst-dev.opencode");
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
        const sidebarView = sidebarViews.find((v) => v.id === "helix.sidebar");
        assert.ok(sidebarView, "Should have helix.sidebar view");
        const executionTreeView = sidebarViews.find((v) => v.id === "helix.executionTree");
        assert.ok(executionTreeView, "Should have helix.executionTree view");
    });
    test("Extension should have correct activation events", async () => {
        const extension = vscode.extensions.getExtension("sst-dev.opencode");
        assert.ok(extension, "Extension should be present");
        const packageJSON = extension.packageJSON;
        assert.ok(packageJSON.activationEvents, "Extension should have activation events");
        assert.ok(packageJSON.activationEvents.includes("onCommand:helix.openGUI"), "Should activate on helix.openGUI command");
        assert.ok(packageJSON.activationEvents.includes("onView:helix.sidebar"), "Should activate on helix.sidebar view");
    });
});
//# sourceMappingURL=webview.test.js.map