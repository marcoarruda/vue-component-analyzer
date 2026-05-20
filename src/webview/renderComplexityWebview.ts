import * as fs from 'node:fs';

import * as vscode from 'vscode';

import type { ComponentAnalysisResult, AnalysisDetailItem } from '../types/analysis';
import { getBadgeAssetName, getBadgeCombinationLabel, getBadgeGroups } from '../types/analysis';

export function renderComplexityWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  analysis: ComponentAnalysisResult
) {
  const template = getComplexityTemplate(extensionUri);
  const scriptNonce = createNonce();
  const badgeGroups = getBadgeGroups(analysis);
  const badgeLabel = getBadgeCombinationLabel(badgeGroups);
  const badgeAssetUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'file-badges', getBadgeAssetName(badgeGroups))
  );
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'style.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'complexity.js'));
  const payload = createPayload(analysis, String(badgeAssetUri), badgeLabel);

  return template
    .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
    .replaceAll('{{SCRIPT_NONCE}}', scriptNonce)
    .replaceAll('{{STYLES_URI}}', String(stylesUri))
    .replaceAll('{{SCRIPT_URI}}', String(scriptUri))
    .replaceAll('{{ANALYSIS_DETAILS}}', serializeForScript(payload));
}

interface DetailSection {
  title: string;
  emptyLabel: string;
  items: AnalysisDetailItem[];
}

interface ComplexityPayload {
  componentName: string;
  componentPath: string;
  badgeAssetUri: string;
  badgeLabel: string;
  sections: Record<string, DetailSection>;
}

function createPayload(
  analysis: ComponentAnalysisResult,
  badgeAssetUri: string,
  badgeLabel: string
): ComplexityPayload {
  return {
    componentName: analysis.component.name,
    componentPath: analysis.component.path,
    badgeAssetUri,
    badgeLabel,
    sections: {
      props: { title: 'Props', emptyLabel: 'No props were detected.', items: analysis.details.external.props },
      models: { title: 'V-Model', emptyLabel: 'No models were detected.', items: analysis.details.external.models },
      slots: { title: 'Slots', emptyLabel: 'No slots were detected.', items: analysis.details.external.slots },
      injects: { title: 'Injected Dependencies', emptyLabel: 'No injected dependencies were detected.', items: analysis.details.external.injects },
      stores: { title: 'Stores', emptyLabel: 'No stores were detected.', items: analysis.details.external.stores },
      router: { title: 'Router', emptyLabel: 'No router composables were detected.', items: analysis.details.external.router },
      refs: { title: 'Refs', emptyLabel: 'No refs were detected.', items: analysis.details.internal.refs },
      computed: { title: 'Computed Values', emptyLabel: 'No computed values were detected.', items: analysis.details.internal.computed },
      watchers: { title: 'Watchers', emptyLabel: 'No watchers were detected.', items: analysis.details.internal.watchers },
      emits: { title: 'Emits', emptyLabel: 'No emitted events were detected.', items: analysis.details.external.emits },
      exposed: { title: 'Exposed Members', emptyLabel: 'No exposed members were detected.', items: analysis.details.external.exposed },
      slotProps: { title: 'Slot Props', emptyLabel: 'No slot props were detected.', items: analysis.details.external.slotProps },
      provides: { title: 'Provided Dependencies', emptyLabel: 'No provided dependencies were detected.', items: analysis.details.external.provides },
    },
  };
}

let complexityTemplateCache: string | undefined;

function getComplexityTemplate(extensionUri: vscode.Uri) {
  if (complexityTemplateCache) return complexityTemplateCache;
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

function serializeForScript(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E')
    .replaceAll(String.fromCodePoint(0x2028), '\\u2028')
    .replaceAll(String.fromCodePoint(0x2029), '\\u2029');
}
