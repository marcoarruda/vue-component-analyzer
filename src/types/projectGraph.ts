export type ProjectGraphFileKind = 'vue' | 'ts';

export type ProjectGraphEdgeKind = 'import' | 'dynamic-import';

export interface ProjectGraphNode {
  id: string;
  label: string;
  path: string;
  kind: ProjectGraphFileKind;
  importCount: number;
  importedByCount: number;
}

export interface ProjectGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: ProjectGraphEdgeKind;
  specifier: string;
}

export interface ProjectGraphStats {
  fileCount: number;
  vueFileCount: number;
  tsFileCount: number;
  edgeCount: number;
}

export interface ProjectGraphResult {
  workspaceName: string;
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  stats: ProjectGraphStats;
}