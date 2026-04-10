import * as vscode from 'vscode';

import type { ComponentAnalysisResult } from '../types/analysis';

export function renderComplexityWebview(webview: vscode.Webview, analysis: ComponentAnalysisResult) {
  const json = JSON.stringify(analysis, null, 2);
  const escapedJson = escapeHtml(json);
  const blueTotal = analysis.external.props.length + analysis.external.models.length + analysis.external.slots.length;
  const injectTotal = analysis.external.injects.length;
  const storeTotal = analysis.external.stores.length;
  const provideTotal = analysis.external.provides.length;
  const orangeTotal = analysis.external.emits.length + analysis.external.exposed.length + analysis.external.slotProps.length;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';" />
    <title>Vue Component Complexity</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-top: #06131f;
        --bg-bottom: #0d1725;
        --panel: rgba(8, 19, 31, 0.9);
        --panel-border: rgba(148, 163, 184, 0.16);
        --text: #ecf3fb;
        --muted: #8ca2ba;
        --blue: #35495e;
        --blue-glow: rgba(53, 73, 94, 0.45);
        --green: #42b883;
        --green-glow: rgba(66, 184, 131, 0.34);
        --yellow: #f2c94c;
        --yellow-glow: rgba(242, 201, 76, 0.32);
        --orange: #f2994a;
        --orange-glow: rgba(242, 153, 74, 0.28);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 24px;
        font-family: 'Avenir Next', 'Segoe UI', sans-serif;
        background:
          radial-gradient(circle at top left, rgba(66, 184, 131, 0.16), transparent 24%),
          radial-gradient(circle at 85% 20%, rgba(53, 73, 94, 0.22), transparent 20%),
          radial-gradient(circle at 80% 75%, rgba(242, 153, 74, 0.12), transparent 22%),
          linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
        color: var(--text);
      }

      .shell {
        max-width: 1180px;
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }

      .hero,
      .panel {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 24px;
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

      h1,
      h2,
      p {
        margin: 0;
      }

      h1 {
        font-size: 34px;
        line-height: 1.05;
        margin-bottom: 10px;
      }

      h2 {
        font-size: 28px;
        line-height: 1.1;
      }

      .subtitle {
        color: var(--muted);
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

      .level.low { color: var(--green); }
      .level.medium { color: var(--yellow); }
      .level.high { color: var(--orange); }

      .diagram {
        display: grid;
        grid-template-columns: minmax(420px, 1.25fr) minmax(320px, 0.75fr);
        gap: 20px;
      }

      .diagram-col {
        overflow: hidden;
      }

      .network {
        position: relative;
        display: grid;
        grid-template-columns: minmax(170px, 1fr) minmax(180px, 240px) minmax(170px, 1fr);
        grid-template-rows: auto 1fr auto;
        gap: 18px;
        align-items: center;
        min-height: 560px;
      }

      .connector {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .connector line {
        stroke-width: 2;
        stroke-linecap: round;
        opacity: 0.84;
      }

      .cluster,
      .component-node {
        position: relative;
        border-radius: 22px;
        border: 1px solid var(--panel-border);
        background: rgba(10, 22, 35, 0.94);
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster {
        padding: 18px;
      }

      .cluster.blue {
        grid-column: 1;
        grid-row: 2;
        box-shadow: 0 0 0 1px var(--blue-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster.inject {
        grid-column: 2;
        grid-row: 1;
        justify-self: start;
        width: min(48%, 180px);
        box-shadow: 0 0 0 1px var(--green-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster.store {
        grid-column: 2;
        grid-row: 1;
        justify-self: end;
        width: min(48%, 180px);
        box-shadow: 0 0 0 1px var(--yellow-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .component-node {
        grid-column: 2;
        grid-row: 2;
        z-index: 1;
        padding: 26px 22px;
        text-align: center;
      }

      .cluster.orange {
        grid-column: 3;
        grid-row: 2;
        box-shadow: 0 0 0 1px var(--orange-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster.provide {
        grid-column: 2;
        grid-row: 3;
        box-shadow: 0 0 0 1px var(--green-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster-title,
      .node-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--muted);
      }

      .cluster-total {
        font-size: 34px;
        margin: 10px 0 14px;
      }

      .component-score {
        margin-top: 10px;
        color: var(--muted);
        font-size: 14px;
      }

      .metric-list {
        display: grid;
        gap: 10px;
      }

      .metric {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.03);
      }

      .metric-name {
        font-size: 14px;
      }

      .metric-value {
        min-width: 32px;
        padding: 4px 8px;
        border-radius: 999px;
        text-align: center;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.08);
      }

      .blue .cluster-total,
      .blue .metric-value { color: #8ea8cc; }

      .inject .cluster-total,
      .inject .metric-value,
      .provide .cluster-total,
      .provide .metric-value { color: #6bdba8; }

      .store .cluster-total,
      .store .metric-value { color: #f7d97e; }

      .orange .cluster-total,
      .orange .metric-value { color: #ffc38f; }

      .json pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: 'SFMono-Regular', Consolas, monospace;
        font-size: 13px;
        line-height: 1.55;
        color: #d8e4ff;
      }

      @media (max-width: 980px) {
        .diagram {
          grid-template-columns: 1fr;
        }

        .network {
          grid-template-columns: 1fr;
          grid-template-rows: repeat(6, auto);
          min-height: auto;
        }

        .connector {
          display: none;
        }

        .cluster.blue,
        .cluster.inject,
        .cluster.store,
        .component-node,
        .cluster.orange,
        .cluster.provide {
          grid-column: 1;
          width: auto;
          justify-self: stretch;
        }

        .cluster.inject { grid-row: 1; }
        .cluster.store { grid-row: 2; }
        .component-node { grid-row: 3; }
        .cluster.blue { grid-row: 4; }
        .cluster.orange { grid-row: 5; }
        .cluster.provide { grid-row: 6; }
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
          <div class="eyebrow">External Surface</div>
          <div class="stat-value">${analysis.scores.external}</div>
          <div>Component-facing contracts and integrations</div>
        </article>
        <article class="panel stat">
          <div class="eyebrow">Internal Signals</div>
          <div class="stat-value">${analysis.scores.internal}</div>
          <div>Refs, computed values, watchers, and methods</div>
        </article>
        <article class="panel stat">
          <div class="eyebrow">Complexity Level</div>
          <div class="stat-value level ${analysis.scores.level}">${escapeHtml(analysis.scores.level)}</div>
          <div>Total score ${analysis.scores.total}</div>
        </article>
      </section>

      <section class="diagram">
        <article class="panel diagram-col">
          <div class="eyebrow">Attribute Diagram</div>
          <div class="network">
            <svg class="connector" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="18" y1="50" x2="43" y2="50" stroke="var(--blue)" />
              <line x1="50" y1="12" x2="50" y2="40" stroke="var(--green)" />
              <line x1="58" y1="18" x2="53" y2="40" stroke="var(--yellow)" />
              <line x1="82" y1="50" x2="57" y2="50" stroke="var(--orange)" />
              <line x1="50" y1="88" x2="50" y2="60" stroke="var(--green)" />
            </svg>

            <section class="cluster inject">
              <div class="cluster-title">Inject</div>
              <div class="cluster-total">${injectTotal}</div>
              <div class="metric-list">${renderMetric('inject', injectTotal)}</div>
            </section>

            <section class="cluster store">
              <div class="cluster-title">Store</div>
              <div class="cluster-total">${storeTotal}</div>
              <div class="metric-list">${renderMetric('store', storeTotal)}</div>
            </section>

            <section class="cluster blue">
              <div class="cluster-title">Blue Attributes</div>
              <div class="cluster-total">${blueTotal}</div>
              <div class="metric-list">
                ${renderMetric('props', analysis.external.props.length)}
                ${renderMetric('v-model', analysis.external.models.length)}
                ${renderMetric('slots', analysis.external.slots.length)}
              </div>
            </section>

            <section class="component-node">
              <div class="node-title">Component</div>
              <h2>${escapeHtml(analysis.component.name)}</h2>
              <div class="component-score">${analysis.scores.level} complexity • ${analysis.scores.total} total extracted signals</div>
            </section>

            <section class="cluster orange">
              <div class="cluster-title">Orange Attributes</div>
              <div class="cluster-total">${orangeTotal}</div>
              <div class="metric-list">
                ${renderMetric('emit', analysis.external.emits.length)}
                ${renderMetric('exposed', analysis.external.exposed.length)}
                ${renderMetric('slotProps', analysis.external.slotProps.length)}
              </div>
            </section>

            <section class="cluster provide">
              <div class="cluster-title">Provide</div>
              <div class="cluster-total">${provideTotal}</div>
              <div class="metric-list">${renderMetric('provide', provideTotal)}</div>
            </section>
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

function renderMetric(label: string, count: number) {
  return `<div class="metric"><span class="metric-name">${escapeHtml(label)}</span><span class="metric-value">${count}</span></div>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}