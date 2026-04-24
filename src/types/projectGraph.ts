export type ProjectGraphFileKind = 'vue' | 'ts';

export type ProjectGraphNodeColor = 'vue' | 'ts' | 'store' | 'service' | 'view' | 'component' | 'router';

export type ProjectGraphEdgeKind = 'import' | 'dynamic-import';

export interface ProjectGraphNode {
  id: string;
  label: string;
  path: string;
  kind: ProjectGraphFileKind;
  color: ProjectGraphNodeColor;
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
  storeFileCount: number;
  serviceFileCount: number;
  viewFileCount: number;
  componentFileCount: number;
  routerFileCount: number;
  edgeCount: number;
}

export interface ProjectGraphResult {
  workspaceName: string;
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  stats: ProjectGraphStats;
}