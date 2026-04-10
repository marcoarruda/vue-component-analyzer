import * as path from 'path';

import * as vscode from 'vscode';

import { AnalysisCache } from './analysisCache';
import { getBadgeAssetName, getBadgeCombinationLabel, getBadgeGroups } from '../types/analysis';

export class VueAnalysisTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly cache: AnalysisCache,
    private readonly extensionUri: vscode.Uri
  ) {}

  refresh() {
    this.emitter.fire();
  }

  getTreeItem(element: vscode.TreeItem) {
    return element;
  }

  async getChildren(element?: vscode.TreeItem) {
    if (element) {
      return [];
    }

    const vueFiles = await vscode.workspace.findFiles('**/*.vue', '**/node_modules/**', 200);
    const sortedFiles = vueFiles.sort((left, right) => left.fsPath.localeCompare(right.fsPath));
    return Promise.all(sortedFiles.map(async (uri) => this.createTreeItem(uri)));
  }

  private async createTreeItem(uri: vscode.Uri) {
    const analysis = this.cache.get(uri) ?? (await this.cache.analyzeUri(uri));
    const badgeGroups = getBadgeGroups(analysis);
    const badgeAsset = getBadgeAssetName(badgeGroups);
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    const label = path.basename(uri.fsPath);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

    item.description = `${getBadgeCombinationLabel(badgeGroups)} · ${analysis.scores.level}`;
    item.tooltip = new vscode.MarkdownString([
      `**${label}**`,
      '',
      `Path: ${relativePath}`,
      `Badge: ${badgeAsset}`,
      `Complexity: ${analysis.scores.level} (${analysis.scores.total})`
    ].join('\n'));
    item.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'file-badges', badgeAsset);
    item.resourceUri = uri;
    item.command = {
      command: 'vueComponentAnalyzer.showComplexity',
      title: 'Show Complexity',
      arguments: [uri]
    };
    item.contextValue = 'vueComponentAnalyzer.component';

    return item;
  }
}