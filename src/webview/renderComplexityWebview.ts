import * as vscode from 'vscode';

import {
  getBadgeAssetName,
  getBadgeCombinationLabel,
  getBadgeGroups,
  type ComponentAnalysisResult
} from '../types/analysis';

export function renderComplexityWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  analysis: ComponentAnalysisResult
) {
  const inputTotal = analysis.external.props.length + analysis.external.models.length + analysis.external.slots.length;
  const injectTotal = analysis.external.injects.length;
  const storeTotal = analysis.external.stores.length;
  const provideTotal = analysis.external.provides.length;
  const outputTotal = analysis.external.emits.length + analysis.external.exposed.length + analysis.external.slotProps.length;
  const badgeGroups = getBadgeGroups(analysis);
  const badgeLabel = getBadgeCombinationLabel(badgeGroups);
  const badgeAssetUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'file-badges', getBadgeAssetName(badgeGroups))
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';" />
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
        --inputs: #4da3ff;
        --inputs-glow: rgba(77, 163, 255, 0.38);
        --external-sources: #42b883;
        --external-sources-glow: rgba(66, 184, 131, 0.34);
        --external-sources-alt: #f2c94c;
        --external-sources-alt-glow: rgba(242, 201, 76, 0.32);
        --outputs: #f2994a;
        --outputs-glow: rgba(242, 153, 74, 0.28);
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
        gap: 16px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        backdrop-filter: blur(12px);
      }

      .header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        padding: 4px 2px;
        align-items: start;
      }

      .header-copy {
        display: grid;
        gap: 6px;
      }

      .badge-card {
        min-width: 180px;
        padding: 16px 18px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(14, 27, 42, 0.92), rgba(8, 20, 32, 0.92));
        border: 1px solid var(--panel-border);
        display: grid;
        justify-items: center;
        gap: 10px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
      }

      .badge-image {
        width: 52px;
        height: 52px;
        display: block;
      }

      .badge-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--muted);
      }

      .badge-value {
        font-size: 14px;
        font-weight: 700;
        text-align: center;
        color: var(--text);
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

      .diagram-col {
        padding: 20px;
      }

      .diagram {
        display: block;
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

      .cluster.inputs {
        grid-column: 1;
        grid-row: 2;
        box-shadow: 0 0 0 1px var(--inputs-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster.external-source {
        grid-column: 2;
        grid-row: 1;
        justify-self: start;
        width: min(48%, 180px);
        box-shadow: 0 0 0 1px var(--external-sources-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster.external-source-store {
        grid-column: 2;
        grid-row: 1;
        justify-self: end;
        width: min(48%, 180px);
        box-shadow: 0 0 0 1px var(--external-sources-alt-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .component-node {
        grid-column: 2;
        grid-row: 2;
        z-index: 1;
        padding: 26px 22px;
        text-align: center;
      }

      .cluster.outputs {
        grid-column: 3;
        grid-row: 2;
        box-shadow: 0 0 0 1px var(--outputs-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
      }

      .cluster.external-source-provide {
        grid-column: 2;
        grid-row: 3;
        box-shadow: 0 0 0 1px var(--external-sources-glow), 0 18px 45px rgba(0, 0, 0, 0.28);
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

      .inputs .cluster-total,
      .inputs .metric-value { color: #8fc5ff; }

      .external-source .cluster-total,
      .external-source .metric-value,
      .external-source-provide .cluster-total,
      .external-source-provide .metric-value { color: #6bdba8; }

      .external-source-store .cluster-total,
      .external-source-store .metric-value { color: #f7d97e; }

      .outputs .cluster-total,
      .outputs .metric-value { color: #ffc38f; }

      @media (max-width: 980px) {
        .header {
          grid-template-columns: 1fr;
        }

        .badge-card {
          justify-self: start;
        }

        .network {
          grid-template-columns: 1fr;
          grid-template-rows: repeat(6, auto);
          min-height: auto;
        }

        .connector {
          display: none;
        }

        .cluster.inputs,
        .cluster.external-source,
        .cluster.external-source-store,
        .component-node,
        .cluster.outputs,
        .cluster.external-source-provide {
          grid-column: 1;
          width: auto;
          justify-self: stretch;
        }

        .cluster.external-source { grid-row: 1; }
        .cluster.external-source-store { grid-row: 2; }
        .component-node { grid-row: 3; }
        .cluster.inputs { grid-row: 4; }
        .cluster.outputs { grid-row: 5; }
        .cluster.external-source-provide { grid-row: 6; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="header">
        <div class="header-copy">
          <div class="eyebrow">Component</div>
          <h1>${escapeHtml(analysis.component.name)}</h1>
          <p class="subtitle">${escapeHtml(analysis.component.path)}</p>
        </div>
        <aside class="badge-card" aria-label="Analysis badge preview">
          <div class="badge-label">Resolved Badge</div>
          <img class="badge-image" src="${badgeAssetUri}" alt="${escapeHtml(badgeLabel)} badge" />
          <div class="badge-value">${escapeHtml(badgeLabel)}</div>
        </aside>
      </section>

      <section class="diagram">
        <article class="panel diagram-col">
          <div class="eyebrow">Attribute Diagram</div>
          <div class="network">
            <svg class="connector" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="18" y1="50" x2="43" y2="50" stroke="var(--inputs)" />
              <line x1="50" y1="12" x2="50" y2="40" stroke="var(--external-sources)" />
              <line x1="58" y1="18" x2="53" y2="40" stroke="var(--external-sources-alt)" />
              <line x1="82" y1="50" x2="57" y2="50" stroke="var(--outputs)" />
              <line x1="50" y1="88" x2="50" y2="60" stroke="var(--external-sources)" />
            </svg>

            <section class="cluster external-source">
              <div class="cluster-title">External Sources</div>
              <div class="cluster-total">${injectTotal}</div>
              <div class="metric-list">${renderMetric('inject', injectTotal)}</div>
            </section>

            <section class="cluster external-source-store">
              <div class="cluster-title">External Sources</div>
              <div class="cluster-total">${storeTotal}</div>
              <div class="metric-list">${renderMetric('store', storeTotal)}</div>
            </section>

            <section class="cluster inputs">
              <div class="cluster-title">Inputs</div>
              <div class="cluster-total">${inputTotal}</div>
              <div class="metric-list">
                ${renderMetric('props', analysis.external.props.length)}
                ${renderMetric('v-model', analysis.external.models.length)}
                ${renderMetric('slots', analysis.external.slots.length)}
              </div>
            </section>

            <section class="component-node">
              <div class="node-title">Component</div>
              <h2>Core Node</h2>
            </section>

            <section class="cluster outputs">
              <div class="cluster-title">Outputs</div>
              <div class="cluster-total">${outputTotal}</div>
              <div class="metric-list">
                ${renderMetric('emit', analysis.external.emits.length)}
                ${renderMetric('exposed', analysis.external.exposed.length)}
                ${renderMetric('slotProps', analysis.external.slotProps.length)}
              </div>
            </section>

            <section class="cluster external-source-provide">
              <div class="cluster-title">External Sources</div>
              <div class="cluster-total">${provideTotal}</div>
              <div class="metric-list">${renderMetric('provide', provideTotal)}</div>
            </section>
          </div>
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