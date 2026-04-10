import * as fs from 'node:fs';

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
  const template = getComplexityTemplate(extensionUri);
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
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'style.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'main.js'));

  return template
    .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
    .replaceAll('{{SCRIPT_NONCE}}', scriptNonce)
    .replaceAll('{{STYLES_URI}}', String(stylesUri))
    .replaceAll('{{SCRIPT_URI}}', String(scriptUri))
    .replaceAll('{{COMPONENT_PATH}}', escapeHtml(analysis.component.path))
    .replaceAll('{{BADGE_ASSET_URI}}', String(badgeAssetUri))
    .replaceAll('{{BADGE_LABEL}}', escapeHtml(badgeLabel))
    .replaceAll('{{INJECT_TOTAL}}', String(injectTotal))
    .replaceAll('{{INJECT_METRICS}}', renderMetric('Injected', injectTotal))
    .replaceAll('{{STORE_TOTAL}}', String(storeTotal))
    .replaceAll('{{STORE_METRICS}}', renderMetric('Stores', storeTotal))
    .replaceAll('{{INPUT_TOTAL}}', String(inputTotal))
    .replaceAll(
      '{{INPUT_METRICS}}',
      [
        renderMetric('Props', analysis.external.props.length),
        renderMetric('V-Model', analysis.external.models.length),
        renderMetric('Slots', analysis.external.slots.length)
      ].join('')
    )
    .replaceAll('{{COMPONENT_NAME}}', escapeHtml(analysis.component.name))
    .replaceAll('{{OUTPUT_TOTAL}}', String(outputTotal))
    .replaceAll(
      '{{OUTPUT_METRICS}}',
      [
        renderMetric('Emit', analysis.external.emits.length),
        renderMetric('Exposed', analysis.external.exposed.length),
        renderMetric('Slot Props', analysis.external.slotProps.length)
      ].join('')
    )
    .replaceAll('{{PROVIDE_TOTAL}}', String(provideTotal))
    .replaceAll('{{PROVIDE_METRICS}}', renderMetric('Provides', provideTotal));
}

let complexityTemplateCache: string | undefined;

function getComplexityTemplate(extensionUri: vscode.Uri) {
  if (complexityTemplateCache) {
    return complexityTemplateCache;
  }

  const templatePath = vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'index.html');
  complexityTemplateCache = fs.readFileSync(templatePath.fsPath, 'utf8');
  return complexityTemplateCache;
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