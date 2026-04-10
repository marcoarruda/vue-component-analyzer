import * as vscode from 'vscode';

import { AnalysisCache } from './analysisCache';

const CATEGORY_BADGES = {
  blue: '🔵',
  green: '🟢',
  yellow: '🟡',
  orange: '🟠',
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
  const badges = [
    hasAny(analysis.external.props, analysis.external.models, analysis.external.slots) ? CATEGORY_BADGES.blue : '',
    hasAny(analysis.external.injects, analysis.external.provides) ? CATEGORY_BADGES.green : '',
    analysis.external.stores.length > 0 ? CATEGORY_BADGES.yellow : '',
    hasAny(analysis.external.emits, analysis.external.exposed, analysis.external.slotProps) ? CATEGORY_BADGES.orange : ''
  ].filter(Boolean);

  return badges.join('') || CATEGORY_BADGES.empty;
}

function createTooltip(analysis: NonNullable<ReturnType<AnalysisCache['get']>>) {
  return [
    `${analysis.component.name} complexity: ${analysis.scores.level} (${analysis.scores.total})`,
    `Blue props ${analysis.external.props.length}, v-model ${analysis.external.models.length}, slots ${analysis.external.slots.length}`,
    `Green inject ${analysis.external.injects.length}, provide ${analysis.external.provides.length}`,
    `Yellow stores ${analysis.external.stores.length}`,
    `Orange emits ${analysis.external.emits.length}, exposed ${analysis.external.exposed.length}, slotProps ${analysis.external.slotProps.length}`
  ].join(' • ');
}

function hasAny(...groups: string[][]) {
  return groups.some((group) => group.length > 0);
}