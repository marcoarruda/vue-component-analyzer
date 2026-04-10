# Vue Component Analyzer

VS Code extension project for analyzing Vue 3 single-file components and visualizing component complexity.

The current version is a minimal working prototype. It already wires the extension UI end to end, but the analyzer still returns mock data. The next implementation step is replacing the mock analyzer with real Vue SFC parsing, starting with `<script setup>`.

## Goal

Build a single VS Code extension codebase that:

- analyzes Vue 3 `.vue` files
- extracts external dependencies and internal behaviors
- produces stable, versioned JSON output
- computes grouped complexity scores
- shows results in a dedicated webview
- adds explorer indicators based on complexity
- keeps analyzer logic as independent from VS Code APIs as practical

## Current status

Implemented now:

- editor title button for Vue files
- command: `Vue Analyzer: Show Complexity`
- webview panel with summary cards and JSON output
- mock analyzer result with stable output shape
- file-level explorer decorations for Vue files
- in-memory cache with refresh on file open, save, and watcher events
- sample Vue component for manual testing

Not implemented yet:

- real Vue SFC parsing
- extraction of props, emits, slots, models, injects, stores, API calls, exposed methods
- extraction of refs, computed values, watchers, and methods from actual source
- configurable scoring weights
- classic `setup()` and Options API support

## Open This Project In VS Code

From the workspace root:

```sh
cd /Users/marcoarruda/Projects/VSCode/vue-component-analyzer
code .
```

If you are already in VS Code, open the folder:

- File -> Open Folder...
- Select `vue-component-analyzer`

Once opened, this folder is self-contained for continuing the extension work.

## Local development

Install dependencies once:

```sh
npm install
```

Build the extension bundle:

```sh
npm run build
```

Rebuild after code changes:

```sh
npm run build
```

Launch the extension in development mode:

1. Open this folder in VS Code.
2. Press `F5`.
3. In the Extension Development Host, open a `.vue` file.
4. Click the editor title button to open the complexity view.

## Quick manual test

Use the included sample component:

- `samples/UserProfileCard.vue`

Expected behavior in the Extension Development Host:

- the editor title button appears when the file is open
- clicking the button opens a webview tab
- the webview shows mock complexity data and JSON
- the explorer shows a decoration badge for the Vue file

## Scripts

- `npm run build`: bundle the extension into `dist/extension.js`
- `npm run watch`: rebuild automatically while editing
- `npm run package`: create a `.vsix` package

## Project structure

```text
vue-component-analyzer/
	media/
		complexity.svg
	samples/
		UserProfileCard.vue
	src/
		analyzer/
			index.ts
			mockAnalyzer.ts
		extension/
			analysisCache.ts
			fileDecorationProvider.ts
		types/
			analysis.ts
		webview/
			renderComplexityWebview.ts
		extension.ts
	package.json
	tsconfig.json
	README.md
```

## Architecture notes

`src/analyzer`

- owns analysis logic
- should stay independent from VS Code APIs
- currently returns mock data through a stable interface

`src/types`

- defines the versioned JSON contract returned by the analyzer

`src/extension`

- owns VS Code-specific integration such as cache and explorer decorations

`src/webview`

- renders the complexity result into a presentation layer for the panel

`src/extension.ts`

- activates the extension
- registers commands and watchers
- connects analyzer output to the webview and file decorations

## Output shape

The analyzer is built around this JSON structure:

```json
{
	"component": {
		"name": "UserProfileCard",
		"path": "src/components/UserProfileCard.vue"
	},
	"external": {
		"props": [],
		"emits": [],
		"slots": [],
		"models": [],
		"injects": [],
		"stores": [],
		"apiCalls": [],
		"exposed": []
	},
	"internal": {
		"refs": [],
		"computed": [],
		"watchers": [],
		"methods": []
	},
	"scores": {
		"external": 0,
		"internal": 0,
		"total": 0,
		"level": "low"
	},
	"meta": {
		"warnings": [],
		"version": 1
	}
}
```

## Recommended next work

1. Add Vue SFC parsing with `@vue/compiler-sfc`.
2. Extract real signals from `<script setup>` first.
3. Separate extraction and scoring modules.
4. Add configurable scoring weights.
5. Replace the placeholder webview diagram with a real structure visualization.