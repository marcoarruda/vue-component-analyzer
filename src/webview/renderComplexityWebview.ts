import * as vscode from 'vscode';

import type { ComponentAnalysisResult } from '../types/analysis';

export function renderComplexityWebview(webview: vscode.Webview, analysis: ComponentAnalysisResult) {
  const json = JSON.stringify(analysis, null, 2);
  const escapedJson = escapeHtml(json);
  const externalItems = countExternalItems(analysis);
  const internalItems = countInternalItems(analysis);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';" />
    <title>Vue Component Complexity</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0f172a;
        --panel: #111827;
        --panel-border: rgba(148, 163, 184, 0.18);
        --text: #e5eefc;
        --muted: #94a3b8;
        --accent: #22c55e;
        --accent-2: #f59e0b;
        --accent-3: #ef4444;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 24px;
        font-family: Georgia, 'Iowan Old Style', serif;
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 22%),
          linear-gradient(180deg, #08111f 0%, #0f172a 100%);
        color: var(--text);
      }

      .shell {
        max-width: 1080px;
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }

      .hero,
      .panel {
        background: rgba(15, 23, 42, 0.82);
        border: 1px solid var(--panel-border);
        border-radius: 20px;
        backdrop-filter: blur(12px);
      }

      .hero {
        padding: 24px;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 10px;
      }

      h1 {
        margin: 0 0 10px;
        font-size: 32px;
        line-height: 1.1;
      }

      .subtitle {
        color: var(--muted);
        margin: 0;
        font-size: 15px;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
      }

      .stat,
      .diagram-col,
      .json {
        padding: 20px;
      }

      .stat-value {
        font-size: 38px;
        margin: 8px 0;
      }

      .level.low { color: var(--accent); }
      .level.medium { color: var(--accent-2); }
      .level.high { color: var(--accent-3); }

      .diagram {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 20px;
      }

      .lane {
        display: grid;
        gap: 12px;
      }

      .node {
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 16px;
        background: rgba(30, 41, 59, 0.55);
      }

      .node-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--muted);
      }

      .node-value {
        font-size: 28px;
        margin-top: 8px;
      }

      .json pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: 'SFMono-Regular', Consolas, monospace;
        font-size: 13px;
        line-height: 1.55;
        color: #d8e4ff;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">Vue Component Analyzer</div>
        <h1>${escapeHtml(analysis.component.name)}</h1>
        <p class="subtitle">${escapeHtml(analysis.component.path)}</p>
      </section>

      <section class="stats">
        <article class="panel stat">
          <div class="eyebrow">External Score</div>
          <div class="stat-value">${analysis.scores.external}</div>
          <div>${externalItems} extracted items</div>
        </article>
        <article class="panel stat">
          <div class="eyebrow">Internal Score</div>
          <div class="stat-value">${analysis.scores.internal}</div>
          <div>${internalItems} extracted items</div>
        </article>
        <article class="panel stat">
          <div class="eyebrow">Complexity Level</div>
          <div class="stat-value level ${analysis.scores.level}">${escapeHtml(analysis.scores.level)}</div>
          <div>Total score ${analysis.scores.total}</div>
        </article>
      </section>

      <section class="diagram">
        <article class="panel diagram-col">
          <div class="eyebrow">Diagram</div>
          <div class="lane">
            <div class="node">
              <div class="node-title">External Dependencies</div>
              <div class="node-value">${externalItems}</div>
            </div>
            <div class="node">
              <div class="node-title">Internal Behaviors</div>
              <div class="node-value">${internalItems}</div>
            </div>
            <div class="node">
              <div class="node-title">Prototype Status</div>
              <div class="node-value">Mock</div>
            </div>
          </div>
        </article>

        <article class="panel json">
          <div class="eyebrow">Versioned JSON</div>
          <pre>${escapedJson}</pre>
        </article>
      </section>
    </div>
  </body>
</html>`;
}

function countExternalItems(analysis: ComponentAnalysisResult) {
  return Object.values(analysis.external).reduce((total, values) => total + values.length, 0);
}

function countInternalItems(analysis: ComponentAnalysisResult) {
  return Object.values(analysis.internal).reduce((total, values) => total + values.length, 0);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}