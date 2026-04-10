import type { ComponentAnalysisResult } from '../types/analysis';
import { analyzeVueSfcComponent } from './vueSfcAnalyzer';

export interface AnalyzeVueFileInput {
  filePath: string;
  source: string;
}

export function analyzeVueFile(input: AnalyzeVueFileInput): ComponentAnalysisResult {
  return analyzeVueSfcComponent(input);
}