export type ComplexityLevel = 'low' | 'medium' | 'high';

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
  stores: string[];
  apiCalls: string[];
  exposed: string[];
}

export interface InternalAnalysisBucket {
  refs: string[];
  computed: string[];
  watchers: string[];
  methods: string[];
}

export interface AnalysisScores {
  external: number;
  internal: number;
  total: number;
  level: ComplexityLevel;
}

export interface AnalysisMeta {
  warnings: string[];
  version: 1;
}

export interface ComponentAnalysisResult {
  component: ComponentReference;
  external: AnalysisBucket;
  internal: InternalAnalysisBucket;
  scores: AnalysisScores;
  meta: AnalysisMeta;
}