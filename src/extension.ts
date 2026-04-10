import * as vscode from 'vscode';

import { AnalysisCache } from './extension/analysisCache';
import { VueComplexityDecorationProvider } from './extension/fileDecorationProvider';
import { renderComplexityWebview } from './webview/renderComplexityWebview';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const cache = new AnalysisCache();
  const decorations = new VueComplexityDecorationProvider(cache);
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.vue');

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorations),
    watcher,
    vscode.commands.registerCommand('vueComponentAnalyzer.showComplexity', async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || !isVueDocument(editor.document)) {
        void vscode.window.showInformationMessage('Open a Vue component to inspect its complexity.');
        return;
      }

      const analysis = await cache.getOrAnalyze(editor.document);
      openComplexityPanel(context, analysis);
      decorations.refresh(editor.document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || !isVueDocument(editor.document)) {
        return;
      }

      await cache.getOrAnalyze(editor.document);
      decorations.refresh(editor.document.uri);
    }),
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (!isVueDocument(document)) {
        return;
      }

      await cache.getOrAnalyze(document);
      decorations.refresh(document.uri);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isVueDocument(document)) {
        return;
      }

      const analysis = cache.recompute(document);
      if (panel && panel.visible) {
        panel.title = `${analysis.component.name} Complexity`;
        panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
      }
      decorations.refresh(document.uri);
    }),
    watcher.onDidCreate(async (uri) => {
      const analysis = await cache.analyzeUri(uri);
      if (panel && panel.visible) {
        panel.title = `${analysis.component.name} Complexity`;
      }
      decorations.refresh(uri);
    }),
    watcher.onDidChange(async (uri) => {
      const analysis = await cache.analyzeUri(uri);
      if (panel && panel.visible) {
        panel.title = `${analysis.component.name} Complexity`;
        panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
      }
      decorations.refresh(uri);
    }),
    watcher.onDidDelete((uri) => {
      cache.delete(uri);
      decorations.refresh(uri);
    })
  );

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument && isVueDocument(activeDocument)) {
    void cache.getOrAnalyze(activeDocument).then(() => decorations.refresh(activeDocument.uri));
  }

  void primeWorkspaceVueFiles(cache, decorations);
}

export function deactivate() {}

function isVueDocument(document: vscode.TextDocument) {
  return document.uri.scheme === 'file' && document.uri.fsPath.endsWith('.vue');
}

function openComplexityPanel(context: vscode.ExtensionContext, analysis: Awaited<ReturnType<AnalysisCache['getOrAnalyze']>>) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    panel.title = `${analysis.component.name} Complexity`;
    panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'vueComponentAnalyzer.complexity',
    `${analysis.component.name} Complexity`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
}

async function primeWorkspaceVueFiles(cache: AnalysisCache, decorations: VueComplexityDecorationProvider) {
  const vueFiles = await vscode.workspace.findFiles('**/*.vue', '**/node_modules/**', 200);

  await Promise.all(
    vueFiles.map(async (uri) => {
      await cache.analyzeUri(uri);
      decorations.refresh(uri);
    })
  );
}