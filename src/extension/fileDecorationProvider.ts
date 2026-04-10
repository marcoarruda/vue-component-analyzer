import * as vscode from 'vscode';

import { AnalysisCache } from './analysisCache';

const COMPLEXITY_BADGES = {
  complexity: '↗',
  empty: '◌'
} as const;

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
      badge: getBadge(analysis),
      tooltip: createTooltip(analysis),
      propagate: false
    };
  }
}

function getBadge(analysis: NonNullable<ReturnType<AnalysisCache['get']>>) {
  return analysis.scores.total > 0 ? COMPLEXITY_BADGES.complexity : COMPLEXITY_BADGES.empty;
}

function createTooltip(analysis: NonNullable<ReturnType<AnalysisCache['get']>>) {
  return [
    `Complexity: ${analysis.scores.level} (${analysis.scores.total})`,
    `Inputs props ${analysis.external.props.length}, v-model ${analysis.external.models.length}, slots ${analysis.external.slots.length}`,
    `External sources inject ${analysis.external.injects.length}, provide ${analysis.external.provides.length}`,
    `External sources stores ${analysis.external.stores.length}`,
    `Outputs emits ${analysis.external.emits.length}, exposed ${analysis.external.exposed.length}, slotProps ${analysis.external.slotProps.length}`
  ].join('\n');
}
