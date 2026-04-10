# Vue Component Analyzer

VS Code extension project for analyzing Vue 3 single-file components and visualizing component complexity.

The current version parses Vue single-file components with Vue compiler tooling and extracts component-facing signals into a versioned JSON structure.

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
- webview panel with an attribute diagram and JSON output
- Vue SFC parsing for `<script setup>`, `<script>`, and `<template>` signals
- file-level explorer decorations for Vue files using right-side badge markers
- in-memory cache with refresh on file open, save, and watcher events
- sample Vue component for manual testing

Not implemented yet:

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
- the webview shows parsed Vue attributes around the component node and JSON
- the explorer shows a right-side badge summarizing the attribute groups present

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
			vueSfcAnalyzer.ts
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
- parses Vue SFC blocks and returns stable JSON through a versioned interface

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

1. Expand support for classic `setup()` and Options API patterns.
2. Separate extraction and scoring modules.
3. Add configurable scoring weights.
4. Broaden API call and store detection rules.
5. Add analyzer tests for macro and template coverage.