import * as vscode from 'vscode';

import {
  getActiveBadgeGroups,
  getBadgeAssetName,
  getBadgeCombinationLabel,
  getBadgeGlyph,
  getBadgeGroups,
  type BadgeGroups
} from '../types/analysis';
import { AnalysisCache } from './analysisCache';

const GROUP_COLORS: Record<keyof BadgeGroups, vscode.ThemeColor> = {
  inputs: new vscode.ThemeColor('charts.blue'),
  stores: new vscode.ThemeColor('charts.yellow'),
  injects: new vscode.ThemeColor('charts.green'),
  outputs: new vscode.ThemeColor('charts.orange')
};

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

    const groups = getBadgeGroups(analysis);

    return {
      badge: getBadgeGlyph(groups),
      tooltip: createTooltip(analysis, groups),
      propagate: false
    };
  }
}

function createTooltip(analysis: NonNullable<ReturnType<AnalysisCache['get']>>, groups: BadgeGroups) {
  return [
    `Badge groups: ${getBadgeCombinationLabel(groups)}`,
    `Badge asset: ${getBadgeAssetName(groups)}`,
    `Complexity: ${analysis.scores.level} (${analysis.scores.total})`,
    `Inputs props ${analysis.external.props.length}, v-model ${analysis.external.models.length}, slots ${analysis.external.slots.length}`,
    `External sources inject ${analysis.external.injects.length}, provide ${analysis.external.provides.length}`,
    `External sources stores ${analysis.external.stores.length}`,
    `Outputs emits ${analysis.external.emits.length}, exposed ${analysis.external.exposed.length}, slotProps ${analysis.external.slotProps.length}`
  ].join('\n');
}
