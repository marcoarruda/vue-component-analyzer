import * as fs from 'node:fs';

import * as vscode from 'vscode';

import type { ProjectGraphResult } from '../types/projectGraph';

let projectGraphTemplateCache: string | undefined;

export function renderProjectGraphWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  graph: ProjectGraphResult
) {
  const template = getProjectGraphTemplate(extensionUri);
  const scriptNonce = createNonce();
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'graph.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'graph.js'));

  return template
    .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
    .replaceAll('{{SCRIPT_NONCE}}', scriptNonce)
    .replaceAll('{{STYLES_URI}}', String(stylesUri))
    .replaceAll('{{SCRIPT_URI}}', String(scriptUri))
    .replaceAll('{{WORKSPACE_NAME}}', escapeHtml(graph.workspaceName))
    .replaceAll('{{FILE_COUNT}}', String(graph.stats.fileCount))
    .replaceAll('{{VUE_FILE_COUNT}}', String(graph.stats.vueFileCount))
    .replaceAll('{{TS_FILE_COUNT}}', String(graph.stats.tsFileCount))
    .replaceAll('{{STORE_FILE_COUNT}}', String(graph.stats.storeFileCount))
    .replaceAll('{{SERVICE_FILE_COUNT}}', String(graph.stats.serviceFileCount))
    .replaceAll('{{VIEW_FILE_COUNT}}', String(graph.stats.viewFileCount))
    .replaceAll('{{COMPONENT_FILE_COUNT}}', String(graph.stats.componentFileCount))
    .replaceAll('{{ROUTER_FILE_COUNT}}', String(graph.stats.routerFileCount))
    .replaceAll('{{EDGE_COUNT}}', String(graph.stats.edgeCount))
    .replaceAll('{{GRAPH_PAYLOAD}}', serializeForScript(graph));
}

function getProjectGraphTemplate(extensionUri: vscode.Uri) {
  if (projectGraphTemplateCache) {
    return projectGraphTemplateCache;
  }

  const templatePath = vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'graph.html');
  projectGraphTemplateCache = fs.readFileSync(templatePath.fsPath, 'utf8');
  return projectGraphTemplateCache;
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