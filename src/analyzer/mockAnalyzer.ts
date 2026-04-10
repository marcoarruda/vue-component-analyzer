import * as path from 'path';

import type { ComponentAnalysisResult, ComplexityLevel } from '../types/analysis';

export interface AnalyzerInput {
  filePath: string;
  source: string;
}

const LEVELS: ComplexityLevel[] = ['low', 'medium', 'high'];

export function analyzeMockVueComponent(input: AnalyzerInput): ComponentAnalysisResult {
  const seed = createStableSeed(input.filePath, input.source);
  const external = (seed % 6) + 2;
  const internal = ((seed >> 3) % 6) + 2;
  const total = external + internal;
  const level = LEVELS[Math.min(LEVELS.length - 1, Math.floor(total / 5))] ?? 'low';
  const componentName = inferComponentName(input.filePath);

  return {
    component: {
      name: componentName,
      path: input.filePath
    },
    external: {
      props: sampleList('prop', external % 3),
      emits: sampleList('emit', Math.max(1, external % 2)),
      slots: sampleList('slot', seed % 2),
      models: sampleList('model', seed % 2),
      injects: sampleList('inject', (seed >> 1) % 2),
      stores: sampleList('store', (seed >> 2) % 2),
      apiCalls: sampleList('apiCall', Math.max(1, (seed >> 4) % 3)),
      exposed: sampleList('exposed', (seed >> 5) % 2)
    },
    internal: {
      refs: sampleList('ref', Math.max(1, internal % 3)),
      computed: sampleList('computed', internal % 2),
      watchers: sampleList('watch', (seed >> 6) % 2),
      methods: sampleList('method', Math.max(1, (seed >> 7) % 4))
    },
    scores: {
      external,
      internal,
      total,
      level
    },
    meta: {
      warnings: ['Mock analysis only. Real Vue extraction is not implemented yet.'],
      version: 1
    }
  };
}

function createStableSeed(filePath: string, source: string) {
  const value = `${filePath}:${source.length}`;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function inferComponentName(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function sampleList(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}