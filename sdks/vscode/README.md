# opencode VS Code Extension

A Visual Studio Code extension that integrates Helix (opencode) directly into your development workflow.

## Two Modes

| Mode | Description | How to Open |
|------|-------------|-------------|
| **GUI Mode** | Full Webview panel with 6-mode switcher (Ask/Build/Plan/Compose/Loop/Max), task list, file review, and inline chat. | `Cmd+Esc` (Mac) / `Ctrl+Esc` (Win/Linux) |
| **Terminal Mode** | Split terminal with opencode TUI (legacy). | `Cmd+Shift+Esc` (Mac) / `Ctrl+Shift+Esc` (Win/Linux) |

## Features

- **6-Mode AI Assistant**: Ask (💬), Build (🛠️), Plan (📋), Compose (🎼), Loop (🔄), Max (⚡)
- **Minimal Mode (Default)**: Clean, distraction-free interface with sidebar and status bar hidden
- **Collapsible Sidebar**: Click ◀/▶ button to collapse/expand the side panel
- **Context Awareness**: Automatically share your current selection or tab with Helix
- **File Reference Shortcuts**: Use `Cmd+Option+K` (Mac) or `Alt+Ctrl+K` (Win/Linux) to insert file references. For example, `@File#L37-42`.
- **Task List & Checkpoints**: Monitor AI task progress and review file changes directly in the panel
- **Pre-flight Check & Cardinal**: Harness-layer safety guardrails with UI feedback
- **Settings Panel**: Configure model, behavior, appearance, and shortcuts (`Cmd+,`)
- **AlignmentGuard**: Drift detection with visual warnings for file drift, rabbit holes, and distractions

## Prerequisites

- **opencode CLI** must be installed and available in `PATH`. For local development, the extension will auto-detect `packages/opencode/dist/mimo`.
- **Node.js 20+** (for `fetch` API support in the extension host)

## Quick Start

1. `code sdks/vscode` — Open the `sdks/vscode` directory in VS Code. **Do not open from repo root.**
2. `bun install` — Run inside the `sdks/vscode` directory.
3. `bun run build:media` — Copy `packages/app/dist` frontend assets into `media/`.
4. Press `F5` to start debugging — This launches a new VS Code window with the extension loaded.
5. In the debug window, press `Cmd+Esc` to open the Helix GUI panel.

## Making Changes

`tsc` and `esbuild` watchers run automatically during debugging (visible in the Terminal tab). Changes to the extension are automatically rebuilt in the background.

To test your changes:

1. In the debug VS Code window, press `Cmd+Shift+P`
2. Search for `Developer: Reload Window`
3. Reload to see your changes without restarting the debug session

## Architecture

```
sdks/vscode/
├── src/
│   ├── extension.ts          # Entry point: register commands, start backend
│   ├── webview/
│   │   └── panel.ts          # Webview panel: load HTML, inject bridge script
│   └── server.ts             # Backend manager: spawn opencode CLI, wait for ready
├── media/                    # Frontend assets (copied from packages/app/dist)
├── images/                   # Extension icons
└── dist/
    └── extension.js          # Bundled extension (esbuild output)
```

### Communication Flow

```
VS Code Extension Host
    │
    ├─► HelixServer (spawns opencode --port <random>)
    │   └─► opencode CLI (HTTP API on localhost)
    │
    ├─► HelixWebviewPanel
        │
        ├─► Bridge Script (injected into Webview)
        │   ├─► Overrides window.fetch → postMessage to Extension
        │   └─► Overrides window.WebSocket → postMessage to Extension
        │
        └─► Frontend App (packages/app, SolidJS + Tailwind)
            ├─► API calls via fetch → Bridge → Extension → opencode HTTP
            └─► Real-time updates via WebSocket → Bridge → Extension → opencode WS
```

## Build Scripts

```bash
# Copy frontend assets (run after packages/app build)
bun run build:media

# Full package (types + lint + esbuild)
bun run package

# Watch mode for development
bun run watch:esbuild
```

## Support

This is an early release. If you encounter issues or have feedback, please create an issue at https://github.com/anomalyco/opencode/issues.
