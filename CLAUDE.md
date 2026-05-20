# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build                # Build both extension (esbuild) and webview (Vite)
npm run build:extension      # Compile extension to dist/extension.js via esbuild only
npm run build:webview        # Build Vue webview apps to media/webview/ via Vite only
npm run watch                # Watch-rebuild extension only (not webview)
npm run package              # Package as .vsix for distribution (vsce package)
```

There are no tests and no linter configured.

To run the extension locally, press **F5** in VS Code to launch the Extension Development Host. Run `npm run build` first — both `dist/extension.js` and the files in `media/webview/` must exist.

## Architecture

This is a VS Code extension. There are two distinct runtime environments that never share code directly:

### 1. Extension Host (`src/`)

TypeScript compiled by esbuild into a single `dist/extension.js`. Runs in Node.js inside VS Code.

- `src/extension.ts` — activation entry point; registers all commands, watchers, webview providers, and tree data providers. Manages two panel singletons (`complexityPanel`, `projectGraphPanel`) and one sidebar view (`projectGraphSidebarView`).
- `src/extension/analysisCache.ts` — caches `ComponentAnalysisResult` per URI; drives re-analysis on file events.
- `src/extension/componentAnalysisTreeProvider.ts` — tree data provider for the "Vue Components" sidebar tree.
- `src/extension/fileDecorationProvider.ts` — shows file badge decorations in the explorer.
- `src/extension/projectGraphService.ts` — scans workspace `.vue` and `.ts` files to produce a `ProjectGraphResult`.
- `src/analyzer/` — parses Vue SFCs using `@vue/compiler-sfc` and Babel to extract component signals.
- `src/webview/renderComplexityWebview.ts` — reads `media/webview/index.html` from disk (cached), does `{{PLACEHOLDER}}` string replacements, and returns the final HTML string.
- `src/webview/renderProjectGraphWebview.ts` — same pattern for `media/webview/graph.html`.

### 2. Webview (`media/webview/`)

Built output from the Vue 3 source in `src/webview-ui/`. **Requires a build step** (`npm run build:webview`).

- `index.html` + `complexity.js` + `style.css` — component complexity view
- `graph.html` + `graph.js` + `graph.css` — project dependency graph view
- `runtime-dom.esm-bundler.js` — shared Vue runtime chunk imported by both entry modules

**Vue source** lives in `src/webview-ui/`:
- `complexity/` — complexity view app (App.vue + 6 components)
- `graph/` — project graph app (App.vue + 7 components + 4 composables)
- `vite.config.ts` — Vite multi-page build config
- Each sub-app has its own `tsconfig.json` with DOM lib types

The script tags in the HTML templates use `type="module"` so the browser auto-resolves the shared Vue runtime chunk via relative ES module imports.

### Data flow between layers

The extension never sends post-messages to the webview after initial render. Instead, it re-renders the full HTML string each time via the `renderX` functions.

Data from the extension is embedded in the HTML as a `<script type="application/json">` tag. The webview JS reads it from the DOM on startup (`JSON.parse(element.textContent)`).

Messages from the webview **to** the extension use `vscode.postMessage()` and are handled in `extension.ts` via `onDidReceiveMessage`. Currently only two messages: `openFile` (open a file in the editor) and `openGraphPanel` (open the full graph panel).

### CSP and resource loading

Webviews use a strict Content Security Policy with a per-render nonce. All webview-accessible files must be under `extensionUri` (enforced by `localResourceRoots`). URIs for static assets are converted via `webview.asWebviewUri(...)`.

### Two graph surfaces

The project graph exists in two places:
- **Sidebar WebviewView** (`vueComponentAnalyzer.projectGraph`) — always registered; compact layout (`graph-layout--sidebar` body class).
- **Panel WebviewPanel** — created on demand by `showProjectGraph` command; full layout.

Both share the same HTML template and JS, differentiated by the `layout` parameter passed to `renderProjectGraphWebview`.
