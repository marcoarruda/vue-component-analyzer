import * as fs from 'node:fs';

import * as vscode from 'vscode';

import {
  getBadgeAssetName,
  getBadgeCombinationLabel,
  getBadgeGroups,
  type AnalysisDetailItem,
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
  const detailPayload = createDetailPayload(analysis);

  return template
    .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
    .replaceAll('{{SCRIPT_NONCE}}', scriptNonce)
    .replaceAll('{{STYLES_URI}}', String(stylesUri))
    .replaceAll('{{SCRIPT_URI}}', String(scriptUri))
    .replaceAll('{{COMPONENT_PATH}}', escapeHtml(analysis.component.path))
    .replaceAll('{{BADGE_ASSET_URI}}', String(badgeAssetUri))
    .replaceAll('{{BADGE_LABEL}}', escapeHtml(badgeLabel))
    .replaceAll('{{INJECT_TOTAL}}', String(injectTotal))
    .replaceAll('{{INJECT_METRICS}}', renderMetric('Injected', 'injects', detailPayload.injects.items))
    .replaceAll('{{STORE_TOTAL}}', String(storeTotal))
    .replaceAll('{{STORE_METRICS}}', renderMetric('Stores', 'stores', detailPayload.stores.items))
    .replaceAll('{{INPUT_TOTAL}}', String(inputTotal))
    .replaceAll(
      '{{INPUT_METRICS}}',
      [
        renderMetric('Props', 'props', detailPayload.props.items),
        renderMetric('V-Model', 'models', detailPayload.models.items),
        renderMetric('Slots', 'slots', detailPayload.slots.items)
      ].join('')
    )
    .replaceAll('{{COMPONENT_NAME}}', escapeHtml(analysis.component.name))
    .replaceAll('{{OUTPUT_TOTAL}}', String(outputTotal))
    .replaceAll(
      '{{OUTPUT_METRICS}}',
      [
        renderMetric('Emit', 'emits', detailPayload.emits.items),
        renderMetric('Exposed', 'exposed', detailPayload.exposed.items),
        renderMetric('Slot Props', 'slotProps', detailPayload.slotProps.items)
      ].join('')
    )
    .replaceAll('{{PROVIDE_TOTAL}}', String(provideTotal))
    .replaceAll('{{PROVIDE_METRICS}}', renderMetric('Provides', 'provides', detailPayload.provides.items))
    .replaceAll('{{ANALYSIS_DETAILS}}', serializeForScript(detailPayload));
}

interface DetailSection {
  title: string;
  emptyLabel: string;
  items: AnalysisDetailItem[];
}

function createDetailPayload(analysis: ComponentAnalysisResult): Record<string, DetailSection> {
  return {
    props: {
      title: 'Props',
      emptyLabel: 'No props were detected.',
      items: analysis.details.external.props
    },
    models: {
      title: 'V-Model',
      emptyLabel: 'No models were detected.',
      items: analysis.details.external.models
    },
    slots: {
      title: 'Slots',
      emptyLabel: 'No slots were detected.',
      items: analysis.details.external.slots
    },
    injects: {
      title: 'Injected Dependencies',
      emptyLabel: 'No injected dependencies were detected.',
      items: analysis.details.external.injects
    },
    stores: {
      title: 'Stores',
      emptyLabel: 'No stores were detected.',
      items: analysis.details.external.stores
    },
    emits: {
      title: 'Emits',
      emptyLabel: 'No emitted events were detected.',
      items: analysis.details.external.emits
    },
    exposed: {
      title: 'Exposed Members',
      emptyLabel: 'No exposed members were detected.',
      items: analysis.details.external.exposed
    },
    slotProps: {
      title: 'Slot Props',
      emptyLabel: 'No slot props were detected.',
      items: analysis.details.external.slotProps
    },
    provides: {
      title: 'Provided Dependencies',
      emptyLabel: 'No provided dependencies were detected.',
      items: analysis.details.external.provides
    }
  };
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

function renderMetric(label: string, detailId: string, items: AnalysisDetailItem[]) {
  const count = items.length;
  const disabledAttributes = count === 0 ? ' disabled aria-disabled="true"' : '';

  return `<button class="metric metric-button" type="button" data-detail-id="${escapeHtml(detailId)}"${disabledAttributes}><span class="metric-name">${escapeHtml(label)}</span><span class="metric-value">${count}</span></button>`;
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}