import * as vscode from 'vscode';

import { AnalysisCache } from './extension/analysisCache';
import { VueComplexityDecorationProvider } from './extension/fileDecorationProvider';
import { getBadgeAssetName, getBadgeGroups, type ComponentAnalysisResult } from './types/analysis';
import { renderComplexityWebview } from './webview/renderComplexityWebview';

let panel: vscode.WebviewPanel | undefined;

const TOPBAR_BADGE_CONTEXT_KEY = 'vueComponentAnalyzer.topbarBadge';
const SHOW_COMPLEXITY_COMMAND_IDS = [
  'vueComponentAnalyzer.showComplexity',
  'vueComponentAnalyzer.showComplexity.empty',
  'vueComponentAnalyzer.showComplexity.inputs',
  'vueComponentAnalyzer.showComplexity.stores',
  'vueComponentAnalyzer.showComplexity.injects',
  'vueComponentAnalyzer.showComplexity.outputs',
  'vueComponentAnalyzer.showComplexity.inputsStores',
  'vueComponentAnalyzer.showComplexity.inputsInjects',
  'vueComponentAnalyzer.showComplexity.inputsOutputs',
  'vueComponentAnalyzer.showComplexity.storesInjects',
  'vueComponentAnalyzer.showComplexity.storesOutputs',
  'vueComponentAnalyzer.showComplexity.injectsOutputs',
  'vueComponentAnalyzer.showComplexity.inputsStoresInjects',
  'vueComponentAnalyzer.showComplexity.inputsStoresOutputs',
  'vueComponentAnalyzer.showComplexity.inputsInjectsOutputs',
  'vueComponentAnalyzer.showComplexity.storesInjectsOutputs',
  'vueComponentAnalyzer.showComplexity.inputsStoresInjectsOutputs'
] as const;

export function activate(context: vscode.ExtensionContext) {
  const cache = new AnalysisCache();
  const decorations = new VueComplexityDecorationProvider(cache);
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.vue');
  const showComplexity = async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || !isVueDocument(editor.document)) {
      void vscode.window.showInformationMessage('Open a Vue component to inspect its complexity.');
      return;
    }

    const analysis = await cache.getOrAnalyze(editor.document);
    openComplexityPanel(context, analysis);
    decorations.refresh(editor.document.uri);
    await updateTopbarBadgeContext(cache, editor);
  };

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorations),
    watcher,
    ...SHOW_COMPLEXITY_COMMAND_IDS.map((commandId) => vscode.commands.registerCommand(commandId, showComplexity)),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || !isVueDocument(editor.document)) {
        await updateTopbarBadgeContext(cache, editor);
        return;
      }

      await cache.getOrAnalyze(editor.document);
      decorations.refresh(editor.document.uri);
      await updateTopbarBadgeContext(cache, editor);
    }),
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (!isVueDocument(document)) {
        return;
      }

      await cache.getOrAnalyze(document);
      decorations.refresh(document.uri);

       if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (!isVueDocument(document)) {
        return;
      }

      const analysis = cache.recompute(document);
      if (panel && panel.visible) {
        panel.title = `${analysis.component.name} Complexity`;
        panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
      }
      decorations.refresh(document.uri);

      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }
    }),
    watcher.onDidCreate(async (uri) => {
      const analysis = await cache.analyzeUri(uri);
      if (panel && panel.visible) {
        panel.title = `${analysis.component.name} Complexity`;
      }
      decorations.refresh(uri);

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }
    }),
    watcher.onDidChange(async (uri) => {
      const analysis = await cache.analyzeUri(uri);
      if (panel && panel.visible) {
        panel.title = `${analysis.component.name} Complexity`;
        panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
      }
      decorations.refresh(uri);

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }
    }),
    watcher.onDidDelete(async (uri) => {
      cache.delete(uri);
      decorations.refresh(uri);

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, 'analysis-empty');
      }
    })
  );

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument && isVueDocument(activeDocument)) {
    void cache.getOrAnalyze(activeDocument).then(async () => {
      decorations.refresh(activeDocument.uri);
      await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
    });
  } else {
    void vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, 'analysis-empty');
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

async function updateTopbarBadgeContext(cache: AnalysisCache, editor: vscode.TextEditor | undefined) {
  if (!editor || !isVueDocument(editor.document)) {
    await vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, 'analysis-empty');
    return;
  }

  const analysis = await cache.getOrAnalyze(editor.document);
  await vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, getTopbarBadgeKey(analysis));
}

function getTopbarBadgeKey(analysis: ComponentAnalysisResult) {
  return getBadgeAssetName(getBadgeGroups(analysis)).replace(/\.svg$/, '');
}