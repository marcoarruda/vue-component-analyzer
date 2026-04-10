import * as vscode from 'vscode';

import { AnalysisCache } from './analysisCache';

export class VueComplexityDecorationProvider implements vscode.FileDecorationProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(private readonly cache: AnalysisCache) {}

  refresh(uri?: vscode.Uri) {
    this.emitter.fire(uri);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.scheme !== 'file' || !uri.fsPath.endsWith('.vue')) {
      return undefined;
    }

    const analysis = this.cache.get(uri);

    if (!analysis) {
      return undefined;
    }

    return {
      badge: analysis.scores.level.slice(0, 1).toUpperCase(),
      tooltip: `Vue complexity: ${analysis.scores.level} (${analysis.scores.total})`,
      color: getDecorationColor(analysis.scores.level),
      propagate: false
    };
  }
}

function getDecorationColor(level: 'low' | 'medium' | 'high') {
  switch (level) {
    case 'high':
      return new vscode.ThemeColor('charts.red');
    case 'medium':
      return new vscode.ThemeColor('charts.yellow');
    default:
      return new vscode.ThemeColor('charts.green');
  }
}