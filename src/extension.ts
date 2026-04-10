import * as vscode from 'vscode';

import { AnalysisCache } from './extension/analysisCache';
import { VueAnalysisTreeProvider } from './extension/componentAnalysisTreeProvider';
import { VueComplexityDecorationProvider } from './extension/fileDecorationProvider';
import { getBadgeAssetName, getBadgeGroups, type ComponentAnalysisResult } from './types/analysis';
import { renderComplexityWebview } from './webview/renderComplexityWebview';

let panel: vscode.WebviewPanel | undefined;

const TOPBAR_BADGE_CONTEXT_KEY = 'vueComponentAnalyzer.topbarBadge';
const COMPONENTS_VIEW_MODE_CONTEXT_KEY = 'vueComponentAnalyzer.componentsViewMode';
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
  const analysisTree = new VueAnalysisTreeProvider(cache, context.extensionUri);
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.vue');
  const toggleTreeDisplayMode = async () => {
    const configuration = vscode.workspace.getConfiguration('vueComponentAnalyzer');
    const currentMode = configuration.get<'list' | 'folders'>('components.viewMode', 'list');
    const nextMode = currentMode === 'folders' ? 'list' : 'folders';
    await configuration.update('components.viewMode', nextMode, vscode.ConfigurationTarget.Workspace);
    await updateComponentsViewModeContext();
  };
  const pickListSortMode = async () => {
    const configuration = vscode.workspace.getConfiguration('vueComponentAnalyzer');
    const currentSort = configuration.get<'path' | 'inputs' | 'reactivity' | 'outputs' | 'injects' | 'provides' | 'stores'>(
      'components.listSortBy',
      'path'
    );
    const selected = await vscode.window.showQuickPick(
      [
        { label: 'Path', description: 'Alphabetical by workspace path', value: 'path' as const },
        { label: 'Inputs', description: 'Most props, models, and slots first', value: 'inputs' as const },
        { label: 'Reactivity', description: 'Most refs, computed values, and watchers first', value: 'reactivity' as const },
        { label: 'Outputs', description: 'Most emits, exposed members, and slot props first', value: 'outputs' as const },
        { label: 'Injected', description: 'Most injected dependencies first', value: 'injects' as const },
        { label: 'Provided', description: 'Most provided dependencies first', value: 'provides' as const },
        { label: 'Stores', description: 'Most detected store usages first', value: 'stores' as const }
      ],
      {
        placeHolder: `Current sort: ${currentSort}`
      }
    );

    if (!selected || selected.value === currentSort) {
      return;
    }

    await configuration.update('components.listSortBy', selected.value, vscode.ConfigurationTarget.Workspace);
  };
  const showComplexity = async (targetUri?: vscode.Uri) => {
    const editor = targetUri ? await openVueDocument(targetUri) : vscode.window.activeTextEditor;

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
    vscode.window.registerTreeDataProvider('vueComponentAnalyzer.components', analysisTree),
    watcher,
    vscode.commands.registerCommand('vueComponentAnalyzer.toggleTreeDisplayMode', toggleTreeDisplayMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.switchToFolderTreeDisplayMode', toggleTreeDisplayMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.switchToListTreeDisplayMode', toggleTreeDisplayMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.setListSortMode', pickListSortMode),
    ...SHOW_COMPLEXITY_COMMAND_IDS.map((commandId) => vscode.commands.registerCommand(commandId, showComplexity)),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('vueComponentAnalyzer.components.viewMode') || event.affectsConfiguration('vueComponentAnalyzer.components.listSortBy')) {
        analysisTree.refresh();
      }

      if (event.affectsConfiguration('vueComponentAnalyzer.components.viewMode')) {
        await updateComponentsViewModeContext();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || !isVueDocument(editor.document)) {
        await updateTopbarBadgeContext(cache, editor);
        return;
      }

      await cache.getOrAnalyze(editor.document);
      decorations.refresh(editor.document.uri);
      analysisTree.refresh();
      await updateTopbarBadgeContext(cache, editor);
    }),
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (!isVueDocument(document)) {
        return;
      }

      await cache.getOrAnalyze(document);
      decorations.refresh(document.uri);
      analysisTree.refresh();

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
      analysisTree.refresh();

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
      analysisTree.refresh();

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
      analysisTree.refresh();

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }
    }),
    watcher.onDidDelete(async (uri) => {
      cache.delete(uri);
      decorations.refresh(uri);
      analysisTree.refresh();

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, 'analysis-empty');
      }
    })
  );

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument && isVueDocument(activeDocument)) {
    void cache.getOrAnalyze(activeDocument).then(async () => {
      decorations.refresh(activeDocument.uri);
      analysisTree.refresh();
      await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      await updateComponentsViewModeContext();
    });
  } else {
    void Promise.all([
      vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, 'analysis-empty'),
      updateComponentsViewModeContext()
    ]);
  }

  void primeWorkspaceVueFiles(cache, decorations, analysisTree);
}

export function deactivate() {}

function isVueDocument(document: vscode.TextDocument) {
  return document.uri.scheme === 'file' && document.uri.fsPath.endsWith('.vue');
}

function openComplexityPanel(context: vscode.ExtensionContext, analysis: Awaited<ReturnType<AnalysisCache['getOrAnalyze']>>) {
  const targetViewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  if (panel) {
    panel.reveal(targetViewColumn);
    panel.title = `${analysis.component.name} Complexity`;
    panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'vueComponentAnalyzer.complexity',
    `${analysis.component.name} Complexity`,
    targetViewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.webview.html = renderComplexityWebview(panel.webview, context.extensionUri, analysis);
}

async function primeWorkspaceVueFiles(
  cache: AnalysisCache,
  decorations: VueComplexityDecorationProvider,
  analysisTree: VueAnalysisTreeProvider
) {
  const vueFiles = await vscode.workspace.findFiles('**/*.vue', '**/node_modules/**', 200);

  await Promise.all(
    vueFiles.map(async (uri) => {
      await cache.analyzeUri(uri);
      decorations.refresh(uri);
    })
  );

  analysisTree.refresh();
}

async function openVueDocument(uri: vscode.Uri) {
  const document = await vscode.workspace.openTextDocument(uri);
  return vscode.window.showTextDocument(document, { preview: false });
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

async function updateComponentsViewModeContext() {
  const viewMode = vscode.workspace.getConfiguration('vueComponentAnalyzer').get<'list' | 'folders'>('components.viewMode', 'list');
  await vscode.commands.executeCommand('setContext', COMPONENTS_VIEW_MODE_CONTEXT_KEY, viewMode);
}