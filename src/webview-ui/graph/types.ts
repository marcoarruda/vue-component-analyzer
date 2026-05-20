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
  virtual?: boolean;
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

export interface NodePosition {
  x: number;
  y: number;
  depth: number;
}

export interface FilterState {
  hideIsolated: boolean;
  showTests: boolean;
  showStories: boolean;
  showAppEntries: boolean;
  showRouter: boolean;
  showServices: boolean;
  showStores: boolean;
  showComposableTs: boolean;
  showViewComponents: boolean;
  showLabels: boolean;
  showFolderPaths: boolean;
  componentFolders: Map<string, boolean>;
}
