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
  const scriptNonce = createNonce();
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${scriptNonce}';" />
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

      .badge-card {
        min-width: 180px;
        padding: 16px 18px;
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
        overflow-wrap: anywhere;
        word-break: break-word;
        hyphens: auto;
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

      .diagram-header-copy {
        display: grid;
        gap: 6px;
        min-width: 0;
        grid-column: 1;
        grid-row: 1;
        align-self: start;
        max-width: min(62%, 520px);
        z-index: 2;
      }

      .diagram-header-copy .eyebrow {
        margin-bottom: 0;
      }

      .diagram-path {
        color: var(--muted);
        font-size: 15px;
        word-break: break-word;
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

      .network .badge-card {
        grid-column: 3;
        grid-row: 1;
        justify-self: end;
        align-self: start;
        z-index: 2;
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
        marker-end: url(#connector-arrow);
      }

      .connector marker path {
        fill: context-stroke;
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
        min-width: 0;
      }

      .component-node h2 {
        max-width: 100%;
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
        .network {
          grid-template-columns: 1fr;
          grid-template-rows: repeat(8, auto);
          min-height: auto;
          padding-top: 0;
        }

        .diagram-header-copy,
        .network .badge-card {
          max-width: none;
          justify-self: stretch;
        }

        .diagram-header-copy {
          grid-column: 1;
          grid-row: 1;
        }

        .network .badge-card {
          grid-column: 1;
          grid-row: 2;
          justify-self: start;
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

        .cluster.external-source { grid-row: 3; }
        .cluster.external-source-store { grid-row: 4; }
        .component-node { grid-row: 5; }
        .cluster.inputs { grid-row: 6; }
        .cluster.outputs { grid-row: 7; }
        .cluster.external-source-provide { grid-row: 8; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="diagram">
        <article class="panel diagram-col">
          <div class="eyebrow">Attribute Diagram</div>
          <div class="network">
            <div class="diagram-header-copy">
              <div class="eyebrow">Component</div>
              <h1>${escapeHtml(analysis.component.name)}</h1>
              <p class="diagram-path">${escapeHtml(analysis.component.path)}</p>
            </div>
            <aside class="badge-card" aria-label="Analysis badge preview">
              <div class="badge-label">Resolved Badge</div>
              <img class="badge-image" src="${badgeAssetUri}" alt="${escapeHtml(badgeLabel)} badge" />
              <div class="badge-value">${escapeHtml(badgeLabel)}</div>
            </aside>
            <svg class="connector" aria-hidden="true">
              <defs>
                <marker id="connector-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              <line data-from="inputs" data-to="component" stroke="var(--inputs)" />
              <line data-from="external-source" data-to="component" stroke="var(--external-sources)" />
              <line data-from="external-source-store" data-to="component" stroke="var(--external-sources-alt)" />
              <line data-from="component" data-to="outputs" stroke="var(--outputs)" />
              <line data-from="component" data-to="external-source-provide" stroke="var(--external-sources)" />
            </svg>

            <section class="cluster external-source" data-node="external-source">
              <div class="cluster-title">External Sources</div>
              <div class="cluster-total">${injectTotal}</div>
              <div class="metric-list">${renderMetric('Injected', injectTotal)}</div>
            </section>

            <section class="cluster external-source-store" data-node="external-source-store">
              <div class="cluster-title">External Sources</div>
              <div class="cluster-total">${storeTotal}</div>
              <div class="metric-list">${renderMetric('Stores', storeTotal)}</div>
            </section>

            <section class="cluster inputs" data-node="inputs">
              <div class="cluster-title">Inputs</div>
              <div class="cluster-total">${inputTotal}</div>
              <div class="metric-list">
                ${renderMetric('Props', analysis.external.props.length)}
                ${renderMetric('V-Model', analysis.external.models.length)}
                ${renderMetric('Slots', analysis.external.slots.length)}
              </div>
            </section>

            <section class="component-node" data-node="component">
              <div class="node-title">Component</div>
              <h2>${escapeHtml(analysis.component.name)}</h2>
            </section>

            <section class="cluster outputs" data-node="outputs">
              <div class="cluster-title">Outputs</div>
              <div class="cluster-total">${outputTotal}</div>
              <div class="metric-list">
                ${renderMetric('Emit', analysis.external.emits.length)}
                ${renderMetric('Exposed', analysis.external.exposed.length)}
                ${renderMetric('Slot Props', analysis.external.slotProps.length)}
              </div>
            </section>

            <section class="cluster external-source-provide" data-node="external-source-provide">
              <div class="cluster-title">External Sources</div>
              <div class="cluster-total">${provideTotal}</div>
              <div class="metric-list">${renderMetric('Provides', provideTotal)}</div>
            </section>
          </div>
        </article>
      </section>
    </div>
    <script nonce="${scriptNonce}">
      const network = document.querySelector('.network');
      const connector = document.querySelector('.connector');

      function anchorPoint(rect, targetRect) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        const deltaX = targetCenterX - centerX;
        const deltaY = targetCenterY - centerY;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          return {
            x: deltaX >= 0 ? rect.right : rect.left,
            y: centerY
          };
        }

        return {
          x: centerX,
          y: deltaY >= 0 ? rect.bottom : rect.top
        };
      }

      function renderConnectors() {
        if (!network || !connector || window.innerWidth <= 980) {
          return;
        }

        const networkRect = network.getBoundingClientRect();
        connector.setAttribute('viewBox', '0 0 ' + networkRect.width + ' ' + networkRect.height);

        for (const line of connector.querySelectorAll('line')) {
          const fromKey = line.getAttribute('data-from');
          const toKey = line.getAttribute('data-to');
          const fromElement = network.querySelector('[data-node="' + fromKey + '"]');
          const toElement = network.querySelector('[data-node="' + toKey + '"]');

          if (!fromElement || !toElement) {
            continue;
          }

          const fromRect = fromElement.getBoundingClientRect();
          const toRect = toElement.getBoundingClientRect();
          const start = anchorPoint(fromRect, toRect);
          const end = anchorPoint(toRect, fromRect);

          line.setAttribute('x1', String(start.x - networkRect.left));
          line.setAttribute('y1', String(start.y - networkRect.top));
          line.setAttribute('x2', String(end.x - networkRect.left));
          line.setAttribute('y2', String(end.y - networkRect.top));
        }
      }

      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            renderConnectors();
          })
        : undefined;

      if (resizeObserver) {
        resizeObserver.observe(document.body);
        if (network) {
          resizeObserver.observe(network);
        }
      }

      window.addEventListener('resize', renderConnectors);
      window.addEventListener('load', renderConnectors);
      renderConnectors();
    </script>
  </body>
</html>`;
}

function createNonce() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';

  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return value;
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