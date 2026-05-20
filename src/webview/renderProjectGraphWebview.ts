import * as vscode from 'vscode';

import type { ProjectGraphResult } from '../types/projectGraph';

const PROJECT_GRAPH_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{CSP_SOURCE}}; script-src 'nonce-{{SCRIPT_NONCE}}' {{CSP_SOURCE}};" />
    <link rel="stylesheet" href="{{STYLES_URI}}" />
    <title>Vue Analyzer Project Graph</title>
  </head>
  <body class="{{BODY_CLASS}}">
    <div id="app"></div>
    <script id="graph-payload" type="application/json">{{GRAPH_PAYLOAD}}</script>
    <script type="module" nonce="{{SCRIPT_NONCE}}" src="{{SCRIPT_URI}}"></script>
  </body>
</html>`;

export function renderProjectGraphWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  graph: ProjectGraphResult,
  layout: 'panel' | 'sidebar' = 'panel'
) {
  const template = getProjectGraphTemplate();
  const scriptNonce = createNonce();
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'graph.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'graph.js'));

  return template
    .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
    .replaceAll('{{SCRIPT_NONCE}}', scriptNonce)
    .replaceAll('{{STYLES_URI}}', String(stylesUri))
    .replaceAll('{{SCRIPT_URI}}', String(scriptUri))
    .replaceAll('{{BODY_CLASS}}', layout === 'sidebar' ? 'graph-layout--sidebar' : '')
    .replaceAll('{{GRAPH_PAYLOAD}}', serializeForScript(graph));
}

function getProjectGraphTemplate() {
  return PROJECT_GRAPH_TEMPLATE;
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
