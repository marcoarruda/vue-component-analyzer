import type { ComponentAnalysisResult } from '../types/analysis';
import { analyzeMockVueComponent } from './mockAnalyzer';

export interface AnalyzeVueFileInput {
  filePath: string;
  source: string;
}

export function analyzeVueFile(input: AnalyzeVueFileInput): ComponentAnalysisResult {
  return analyzeMockVueComponent(input);
}