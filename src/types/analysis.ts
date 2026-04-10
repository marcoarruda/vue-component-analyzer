export interface ComponentReference {
  name: string;
  path: string;
}

export interface AnalysisBucket {
  props: string[];
  emits: string[];
  slots: string[];
  models: string[];
  injects: string[];
  provides: string[];
  stores: string[];
  apiCalls: string[];
  exposed: string[];
  slotProps: string[];
}

export interface AnalysisDetailItem {
  name: string;
  type?: string;
}

export interface AnalysisDetailBucket {
  props: AnalysisDetailItem[];
  emits: AnalysisDetailItem[];
  slots: AnalysisDetailItem[];
  models: AnalysisDetailItem[];
  injects: AnalysisDetailItem[];
  provides: AnalysisDetailItem[];
  stores: AnalysisDetailItem[];
  apiCalls: AnalysisDetailItem[];
  exposed: AnalysisDetailItem[];
  slotProps: AnalysisDetailItem[];
}

export interface InternalAnalysisBucket {
  refs: string[];
  computed: string[];
  watchers: string[];
  methods: string[];
}

export interface InternalAnalysisDetailBucket {
  refs: AnalysisDetailItem[];
  computed: AnalysisDetailItem[];
  watchers: AnalysisDetailItem[];
  methods: AnalysisDetailItem[];
}

export interface AnalysisScores {
  external: number;
  internal: number;
  total: number;
}

export interface AnalysisMeta {
  warnings: string[];
  version: 1;
}

export interface ComponentAnalysisResult {
  component: ComponentReference;
  external: AnalysisBucket;
  internal: InternalAnalysisBucket;
  details: {
    external: AnalysisDetailBucket;
    internal: InternalAnalysisDetailBucket;
  };
  scores: AnalysisScores;
  meta: AnalysisMeta;
}

export interface BadgeGroups {
  inputs: boolean;
  stores: boolean;
  injects: boolean;
  outputs: boolean;
}

export type AnalysisMetricName = 'inputs' | 'reactivity' | 'outputs' | 'injects' | 'provides' | 'stores';

export type BadgeGroupName = keyof BadgeGroups;

const BRAILLE_BASE = 0x2800;
const BRAILLE_BITS: Record<BadgeGroupName, number> = {
  // two top dots
  stores: 0x9,
  // middle-left dot
  inputs: 0x2,
  // two bottom dots
  injects: 0xc0,
  // middle-right dot
  outputs: 0x10
};

const GROUP_LABELS: Record<BadgeGroupName, string> = {
  inputs: 'inputs',
  stores: 'stores',
  injects: 'injects',
  outputs: 'outputs'
};

export function getBadgeGroups(analysis: ComponentAnalysisResult): BadgeGroups {
  return {
    inputs:
      analysis.external.props.length > 0 ||
      analysis.external.models.length > 0 ||
      analysis.external.slots.length > 0,
    stores: analysis.external.stores.length > 0,
    injects: analysis.external.injects.length > 0,
    outputs:
      analysis.external.emits.length > 0 ||
      analysis.external.exposed.length > 0 ||
      analysis.external.slotProps.length > 0
  };
}

export function getBadgeGlyph(groups: BadgeGroups) {
  const codePoint = Object.entries(BRAILLE_BITS).reduce((total, [group, bit]) => {
    return groups[group as BadgeGroupName] ? total + bit : total;
  }, BRAILLE_BASE);

  return codePoint === BRAILLE_BASE ? '◌' : String.fromCodePoint(codePoint);
}

export function getBadgeAssetName(groups: BadgeGroups) {
  const activeGroups = getActiveBadgeGroups(groups);
  return activeGroups.length > 0 ? `analysis-${activeGroups.join('-')}.svg` : 'analysis-empty.svg';
}

export function getBadgeCombinationLabel(groups: BadgeGroups) {
  const activeGroups = getActiveBadgeGroups(groups);
  return activeGroups.length > 0 ? activeGroups.map((group) => GROUP_LABELS[group]).join(' + ') : 'empty';
}

export function getActiveBadgeGroups(groups: BadgeGroups) {
  return (Object.keys(groups) as BadgeGroupName[]).filter((group) => groups[group]);
}

export function getAnalysisMetricValue(analysis: ComponentAnalysisResult, metric: AnalysisMetricName) {
  switch (metric) {
    case 'inputs':
      return analysis.external.props.length + analysis.external.models.length + analysis.external.slots.length;
    case 'reactivity':
      return analysis.internal.refs.length + analysis.internal.computed.length + analysis.internal.watchers.length;
    case 'outputs':
      return analysis.external.emits.length + analysis.external.exposed.length + analysis.external.slotProps.length;
    case 'injects':
      return analysis.external.injects.length;
    case 'provides':
      return analysis.external.provides.length;
    case 'stores':
      return analysis.external.stores.length;
  }
}