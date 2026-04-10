import * as vscode from 'vscode';

import { analyzeVueFile } from '../analyzer';
import type { ComponentAnalysisResult } from '../types/analysis';

export class AnalysisCache {
  private readonly results = new Map<string, ComponentAnalysisResult>();

  async getOrAnalyze(document: vscode.TextDocument) {
    const key = document.uri.toString();
    const cached = this.results.get(key);

    if (cached) {
      return cached;
    }

    const result = analyzeVueFile({
      filePath: toWorkspacePath(document.uri),
      source: document.getText()
    });

    this.results.set(key, result);
    return result;
  }

  async analyzeUri(uri: vscode.Uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    return this.recompute(document);
  }

  recompute(document: vscode.TextDocument) {
    const result = analyzeVueFile({
      filePath: toWorkspacePath(document.uri),
      source: document.getText()
    });

    this.results.set(document.uri.toString(), result);
    return result;
  }

  get(uri: vscode.Uri) {
    return this.results.get(uri.toString());
  }

  delete(uri: vscode.Uri) {
    this.results.delete(uri.toString());
  }

  entries() {
    return Array.from(this.results.entries());
  }
}

function toWorkspacePath(uri: vscode.Uri) {
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  return relativePath || uri.fsPath;
}