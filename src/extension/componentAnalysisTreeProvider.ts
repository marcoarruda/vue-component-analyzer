import * as path from 'path';

import * as vscode from 'vscode';

import { AnalysisCache } from './analysisCache';
import {
  getAnalysisMetricValue,
  getBadgeAssetName,
  getBadgeCombinationLabel,
  getBadgeGroups,
  type AnalysisMetricName,
  type ComponentAnalysisResult
} from '../types/analysis';

type TreeDisplayMode = 'list' | 'folders';
type ListSortMode = 'path' | AnalysisMetricName;

type TreeNode = DirectoryTreeItem | ComponentTreeItem;

interface ComponentEntry {
  readonly uri: vscode.Uri;
  readonly analysis: ComponentAnalysisResult;
  readonly relativePath: string;
}

class DirectoryTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly directoryPath: string,
    readonly children: readonly TreeNode[],
    isRoot: boolean
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'vueComponentAnalyzer.directory';
    this.tooltip = directoryPath;
    if (!isRoot) {
      this.description = `${children.length}`;
    }
  }
}

class ComponentTreeItem extends vscode.TreeItem {
  constructor(
    readonly uri: vscode.Uri,
    readonly analysis: ComponentAnalysisResult,
    extensionUri: vscode.Uri,
    relativePath: string
  ) {
    const label = path.basename(uri.fsPath);
    const badgeGroups = getBadgeGroups(analysis);
    const badgeAsset = getBadgeAssetName(badgeGroups);

    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = `${getBadgeCombinationLabel(badgeGroups)} · ${analysis.scores.total}`;
    this.tooltip = new vscode.MarkdownString(
      [`**${label}**`, '', `Path: ${relativePath}`, `Badge: ${badgeAsset}`, `Complexity: ${analysis.scores.total}`].join('\n')
    );
    this.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'file-badges', badgeAsset);
    this.resourceUri = uri;
    this.command = {
      command: 'vueComponentAnalyzer.showComplexity',
      title: 'Show Complexity',
      arguments: [uri]
    };
    this.contextValue = 'vueComponentAnalyzer.component';
  }
}

export class VueAnalysisTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly cache: AnalysisCache,
    private readonly extensionUri: vscode.Uri
  ) {}

  refresh() {
    this.emitter.fire();
  }

  getTreeItem(element: TreeNode) {
    return element;
  }

  async getChildren(element?: TreeNode) {
    if (element instanceof DirectoryTreeItem) {
      return element.children;
    }

    if (element) {
      return [] as TreeNode[];
    }

    const entries = await this.getComponentEntries();
    return this.getDisplayMode() === 'folders' ? this.createFolderTree(entries) : this.createListTree(entries);
  }

  private async getComponentEntries() {
    const vueFiles = await vscode.workspace.findFiles('**/*.vue', '**/node_modules/**', 200);
    const entries = await Promise.all(
      vueFiles.map(async (uri) => {
        const analysis = this.cache.get(uri) ?? (await this.cache.analyzeUri(uri));
        return {
          uri,
          analysis,
          relativePath: vscode.workspace.asRelativePath(uri, false)
        } satisfies ComponentEntry;
      })
    );

    return entries;
  }

  private createListTree(entries: readonly ComponentEntry[]) {
    const sortMode = this.getListSortMode();
    const sortedEntries = [...entries].sort((left, right) => this.compareEntries(left, right, sortMode));
    return sortedEntries.map((entry) => this.createComponentItem(entry));
  }

  private createFolderTree(entries: readonly ComponentEntry[]) {
    const root = new Map<string, DirectoryNode>();
    const rootComponents: ComponentTreeItem[] = [];

    for (const entry of [...entries].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
      const segments = entry.relativePath.split('/');
      const fileName = segments.pop();

      if (!fileName) {
        continue;
      }

      let currentPath = '';
      let currentDirectory = root;
      let directoryNode: DirectoryNode | undefined;

      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        let node = currentDirectory.get(segment);

        if (!node) {
          node = {
            label: segment,
            directoryPath: currentPath,
            directories: new Map<string, DirectoryNode>(),
            components: []
          };
          currentDirectory.set(segment, node);
        }

        directoryNode = node;
        currentDirectory = node.directories;
      }

      if (directoryNode) {
        directoryNode.components.push(this.createComponentItem(entry));
      } else {
        rootComponents.push(this.createComponentItem(entry));
      }
    }

    const rootItems = this.materializeDirectoryChildren(root, rootComponents, true);
    return rootItems;
  }

  private materializeDirectoryChildren(
    nodes: Map<string, DirectoryNode>,
    rootComponents: readonly ComponentTreeItem[],
    isRoot: boolean
  ): TreeNode[] {
    const directories = [...nodes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, node]) => this.materializeDirectoryNode(node, isRoot));

    return [...rootComponents, ...directories];
  }

  private materializeDirectoryNode(node: DirectoryNode, isRoot: boolean) {
    const childDirectories = [...node.directories.values()]
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((child) => this.materializeDirectoryNode(child, false));
    const components = [...node.components].sort((left, right) => {
      const leftPath = vscode.workspace.asRelativePath(left.uri, false);
      const rightPath = vscode.workspace.asRelativePath(right.uri, false);
      return leftPath.localeCompare(rightPath);
    });

    return new DirectoryTreeItem(node.label, node.directoryPath, [...childDirectories, ...components], isRoot);
  }

  private createComponentItem(entry: ComponentEntry) {
    return new ComponentTreeItem(entry.uri, entry.analysis, this.extensionUri, entry.relativePath);
  }

  private compareEntries(left: ComponentEntry, right: ComponentEntry, sortMode: ListSortMode) {
    if (sortMode !== 'path') {
      const difference = getAnalysisMetricValue(right.analysis, sortMode) - getAnalysisMetricValue(left.analysis, sortMode);

      if (difference !== 0) {
        return difference;
      }
    }

    return left.relativePath.localeCompare(right.relativePath);
  }

  private getDisplayMode(): TreeDisplayMode {
    return vscode.workspace
      .getConfiguration('vueComponentAnalyzer')
      .get<TreeDisplayMode>('components.viewMode', 'list');
  }

  private getListSortMode(): ListSortMode {
    return vscode.workspace
      .getConfiguration('vueComponentAnalyzer')
      .get<ListSortMode>('components.listSortBy', 'path');
  }
}

interface DirectoryNode {
  label: string;
  directoryPath: string;
  directories: Map<string, DirectoryNode>;
  components: ComponentTreeItem[];
}