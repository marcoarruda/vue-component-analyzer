import * as vscode from 'vscode';

import { AnalysisCache } from './extension/analysisCache';
import { VueAnalysisTreeProvider } from './extension/componentAnalysisTreeProvider';
import { VueComplexityDecorationProvider } from './extension/fileDecorationProvider';
import { buildWorkspaceProjectGraph } from './extension/projectGraphService';
import { getBadgeAssetName, getBadgeGroups, type ComponentAnalysisResult } from './types/analysis';
import { renderComplexityWebview } from './webview/renderComplexityWebview';
import { renderProjectGraphWebview } from './webview/renderProjectGraphWebview';

let complexityPanel: vscode.WebviewPanel | undefined;
let projectGraphPanel: vscode.WebviewPanel | undefined;
let projectGraphSidebarView: vscode.WebviewView | undefined;

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
  const tsWatcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
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
  const showProjectGraph = async () => {
    await openProjectGraphPanel(context);
  };

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.registerTreeDataProvider('vueComponentAnalyzer.components', analysisTree),
    vscode.window.registerWebviewViewProvider('vueComponentAnalyzer.projectGraph', {
      resolveWebviewView(webviewView) {
        projectGraphSidebarView = webviewView;
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [context.extensionUri]
        };
        webviewView.webview.onDidReceiveMessage((message) => handleProjectGraphWebviewMessage(context, message));
        void refreshProjectGraphSidebarView(context);
      }
    }),
    watcher,
    tsWatcher,
    vscode.commands.registerCommand('vueComponentAnalyzer.toggleTreeDisplayMode', toggleTreeDisplayMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.switchToFolderTreeDisplayMode', toggleTreeDisplayMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.switchToListTreeDisplayMode', toggleTreeDisplayMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.setListSortMode', pickListSortMode),
    vscode.commands.registerCommand('vueComponentAnalyzer.showProjectGraph', showProjectGraph),
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
      if (!isGraphDocument(document)) {
        return;
      }

      if (isVueDocument(document)) {
        const analysis = cache.recompute(document);
        if (complexityPanel && complexityPanel.visible) {
          complexityPanel.title = `${analysis.component.name} Complexity`;
          complexityPanel.webview.html = renderComplexityWebview(complexityPanel.webview, context.extensionUri, analysis);
        }
        decorations.refresh(document.uri);
        analysisTree.refresh();

        if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
          await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
        }
      }

      await refreshVisibleProjectGraphViews(context);
    }),
    watcher.onDidCreate(async (uri) => {
      const analysis = await cache.analyzeUri(uri);
      if (complexityPanel && complexityPanel.visible) {
        complexityPanel.title = `${analysis.component.name} Complexity`;
      }
      decorations.refresh(uri);
      analysisTree.refresh();

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }

      await refreshVisibleProjectGraphViews(context);
    }),
    watcher.onDidChange(async (uri) => {
      const analysis = await cache.analyzeUri(uri);
      if (complexityPanel && complexityPanel.visible) {
        complexityPanel.title = `${analysis.component.name} Complexity`;
        complexityPanel.webview.html = renderComplexityWebview(complexityPanel.webview, context.extensionUri, analysis);
      }
      decorations.refresh(uri);
      analysisTree.refresh();

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await updateTopbarBadgeContext(cache, vscode.window.activeTextEditor);
      }

      await refreshVisibleProjectGraphViews(context);
    }),
    watcher.onDidDelete(async (uri) => {
      cache.delete(uri);
      decorations.refresh(uri);
      analysisTree.refresh();

      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
        await vscode.commands.executeCommand('setContext', TOPBAR_BADGE_CONTEXT_KEY, 'analysis-empty');
      }

      await refreshVisibleProjectGraphViews(context);
    }),
    tsWatcher.onDidCreate(async () => {
      await refreshVisibleProjectGraphViews(context);
    }),
    tsWatcher.onDidChange(async () => {
      await refreshVisibleProjectGraphViews(context);
    }),
    tsWatcher.onDidDelete(async () => {
      await refreshVisibleProjectGraphViews(context);
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

function isGraphDocument(document: vscode.TextDocument) {
  return document.uri.scheme === 'file' && (document.uri.fsPath.endsWith('.vue') || document.uri.fsPath.endsWith('.ts'));
}

function openComplexityPanel(context: vscode.ExtensionContext, analysis: Awaited<ReturnType<AnalysisCache['getOrAnalyze']>>) {
  const targetViewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  if (complexityPanel) {
    complexityPanel.reveal(targetViewColumn);
    complexityPanel.title = `${analysis.component.name} Complexity`;
    complexityPanel.webview.html = renderComplexityWebview(complexityPanel.webview, context.extensionUri, analysis);
    return;
  }

  complexityPanel = vscode.window.createWebviewPanel(
    'vueComponentAnalyzer.complexity',
    `${analysis.component.name} Complexity`,
    targetViewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  complexityPanel.onDidDispose(() => {
    complexityPanel = undefined;
  });

  complexityPanel.webview.html = renderComplexityWebview(complexityPanel.webview, context.extensionUri, analysis);
}

async function openProjectGraphPanel(context: vscode.ExtensionContext) {
  const targetViewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  if (projectGraphPanel) {
    projectGraphPanel.reveal(targetViewColumn);
    await refreshProjectGraphPanel(context);
    return;
  }

  projectGraphPanel = vscode.window.createWebviewPanel(
    'vueComponentAnalyzer.projectGraph',
    'Workspace Graph',
    targetViewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri]
    }
  );

  projectGraphPanel.onDidDispose(() => {
    projectGraphPanel = undefined;
  });

  projectGraphPanel.webview.onDidReceiveMessage((message) => handleProjectGraphWebviewMessage(context, message));

  await refreshProjectGraphPanel(context);
}

async function handleProjectGraphWebviewMessage(context: vscode.ExtensionContext, message: unknown) {
  if (!message || typeof message !== 'object' || typeof (message as { type?: unknown }).type !== 'string') {
    return;
  }

  if ((message as { type: string }).type === 'openGraphPanel') {
    await openProjectGraphPanel(context);
    return;
  }

  if ((message as { type: string }).type !== 'openFile' || typeof (message as { path?: unknown }).path !== 'string') {
    return;
  }

  const candidate = await resolveProjectGraphNodeUri((message as { path: string }).path);
  if (!candidate) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(candidate);
  await vscode.window.showTextDocument(document, { preview: false });
}

async function resolveProjectGraphNodeUri(graphPath: string) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return undefined;
  }

  const normalizedGraphPath = graphPath.replaceAll('\\', '/').replace(/^\/+/, '');

  for (const workspaceFolder of workspaceFolders) {
    const candidate = vscode.Uri.joinPath(workspaceFolder.uri, ...normalizedGraphPath.split('/').filter(Boolean));

    try {
      const stat = await vscode.workspace.fs.stat(candidate);
      if (stat.type === vscode.FileType.File) {
        return candidate;
      }
    } catch {
      // Try the next workspace folder.
    }
  }

  const [fallbackCandidate] = await vscode.workspace.findFiles(normalizedGraphPath, undefined, 1);
  return fallbackCandidate;
}

async function refreshProjectGraphPanel(context: vscode.ExtensionContext) {
  if (!projectGraphPanel) {
    return;
  }

  const graph = await buildWorkspaceProjectGraph();
  projectGraphPanel.title = `${graph.workspaceName} Graph`;
  projectGraphPanel.webview.html = renderProjectGraphWebview(projectGraphPanel.webview, context.extensionUri, graph, 'panel');
}

async function refreshProjectGraphSidebarView(context: vscode.ExtensionContext) {
  if (!projectGraphSidebarView) {
    return;
  }

  const graph = await buildWorkspaceProjectGraph();
  projectGraphSidebarView.title = 'Project Graph';
  projectGraphSidebarView.description = graph.workspaceName;
  projectGraphSidebarView.webview.html = renderProjectGraphWebview(projectGraphSidebarView.webview, context.extensionUri, graph, 'sidebar');
}

async function refreshVisibleProjectGraphViews(context: vscode.ExtensionContext) {
  const refreshes: Array<Promise<void>> = [];

  if (projectGraphPanel?.visible) {
    refreshes.push(refreshProjectGraphPanel(context));
  }

  if (projectGraphSidebarView?.visible) {
    refreshes.push(refreshProjectGraphSidebarView(context));
  }

  await Promise.all(refreshes);
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