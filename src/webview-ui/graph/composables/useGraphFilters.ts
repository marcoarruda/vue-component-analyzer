import type { ProjectGraphNode, ProjectGraphEdge, FilterState } from '../types';

export function normalizeNodePath(node: ProjectGraphNode): string {
  return node.path.replaceAll('\\', '/');
}

const SHORT_PATH_CATEGORY_PREFIXES = new Set([
  'components', 'pages', 'views', 'layouts', 'stores',
  'composables', 'services', 'utils', 'router', 'middleware',
]);

export function shortNodePath(node: ProjectGraphNode): string {
  const normalizedPath = normalizeNodePath(node);
  let relativePath = normalizedPath;
  if (relativePath.startsWith('app/') || relativePath.startsWith('src/')) {
    relativePath = relativePath.slice(4);
  }
  const slashIdx = relativePath.indexOf('/');
  if (slashIdx !== -1) {
    const firstSegment = relativePath.slice(0, slashIdx);
    if (SHORT_PATH_CATEGORY_PREFIXES.has(firstSegment)) {
      return relativePath.slice(slashIdx + 1);
    }
  }
  return relativePath;
}

export function pathAfterSrc(node: ProjectGraphNode): string {
  const normalizedPath = normalizeNodePath(node);
  if (normalizedPath.startsWith('src/')) return normalizedPath.slice(4);
  if (normalizedPath.startsWith('app/')) return normalizedPath.slice(4);
  return normalizedPath;
}

export function isRouterNode(node: ProjectGraphNode): boolean {
  return node.id === '__nuxt-router__' || pathAfterSrc(node).startsWith('router/');
}

export function isAppEntryNode(node: ProjectGraphNode): boolean {
  return node.path === 'src/App.vue' || node.path === 'src/main.ts'
    || node.path === 'app/app.vue' || node.path === 'app/App.vue';
}

export function isTestNode(node: ProjectGraphNode): boolean {
  const normalizedPath = normalizeNodePath(node).toLowerCase();
  const pathSegments = normalizedPath.split('/');
  const fileName = pathSegments[pathSegments.length - 1];
  return pathSegments.includes('__tests__')
    || fileName === 'spec.ts'
    || fileName === 'spec.js'
    || normalizedPath.endsWith('.spec.ts')
    || normalizedPath.endsWith('.spec.js');
}

export function isStorybookOrHistoireNode(node: ProjectGraphNode): boolean {
  const normalizedPath = normalizeNodePath(node).toLowerCase();
  const pathSegments = normalizedPath.split('/');
  const fileName = pathSegments[pathSegments.length - 1];
  return pathSegments.includes('.storybook')
    || pathSegments.includes('.histoire')
    || fileName.startsWith('histoire.')
    || normalizedPath.endsWith('.stories.ts')
    || normalizedPath.endsWith('.stories.js')
    || normalizedPath.endsWith('.stories.vue')
    || normalizedPath.endsWith('.story.ts')
    || normalizedPath.endsWith('.story.js')
    || normalizedPath.endsWith('.story.vue');
}

export function isServiceNode(node: ProjectGraphNode): boolean {
  return pathAfterSrc(node).startsWith('services/');
}

export function isStoreNode(node: ProjectGraphNode): boolean {
  return pathAfterSrc(node).startsWith('stores/');
}

export function isComposableTsNode(node: ProjectGraphNode): boolean {
  return node.kind === 'ts'
    && !isAppEntryNode(node)
    && !isRouterNode(node)
    && !isServiceNode(node)
    && !isStoreNode(node);
}

export function isViewComponentNode(node: ProjectGraphNode): boolean {
  const relative = pathAfterSrc(node);
  return /^views\/.*\/components\//.test(relative) || /^pages\/.*\/components\//.test(relative);
}

export function componentFolderNameForNode(node: ProjectGraphNode): string | null {
  const relativePath = pathAfterSrc(node);
  if (!relativePath.startsWith('components/')) return null;
  const segments = relativePath.split('/');
  return segments.length >= 3 ? segments[1] : null;
}

export function collectComponentSubfolders(nodes: ProjectGraphNode[]): string[] {
  return Array.from(new Set(
    nodes.map((node) => componentFolderNameForNode(node)).filter((f): f is string => Boolean(f))
  )).sort((a, b) => a.localeCompare(b));
}

export function isComponentFolderVisible(node: ProjectGraphNode, selectedNodeId: string | null, componentFolders: Map<string, boolean>): boolean {
  if (selectedNodeId) return true;
  const folderName = componentFolderNameForNode(node);
  return folderName ? componentFolders.get(folderName) !== false : true;
}

export function computeVisibleGraph(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
  filters: FilterState,
  selectedNodeId: string | null,
): { visibleNodes: ProjectGraphNode[]; visibleEdges: ProjectGraphEdge[]; connectedEdgesByNodeId: Map<string, ProjectGraphEdge[]> } {
  const connectedNodeIds = new Set<string>();
  for (const edge of edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  let visibleNodes = nodes.filter((node) => {
    if (!isComponentFolderVisible(node, selectedNodeId, filters.componentFolders)) return false;
    if (!filters.showTests && isTestNode(node)) return false;
    if (!filters.showStories && isStorybookOrHistoireNode(node)) return false;
    if (!filters.showAppEntries && isAppEntryNode(node)) return false;
    if (!filters.showRouter && isRouterNode(node)) return false;
    if (!filters.showServices && isServiceNode(node)) return false;
    if (!filters.showStores && isStoreNode(node)) return false;
    if (!filters.showComposableTs && isComposableTsNode(node)) return false;
    if (!filters.showViewComponents && isViewComponentNode(node)) return false;
    return !filters.hideIsolated || connectedNodeIds.has(node.id);
  });

  if (selectedNodeId) {
    const focusEdges = edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
    const focusNodeIds = new Set(focusEdges.flatMap((e) => [e.source, e.target]));
    focusNodeIds.add(selectedNodeId);
    visibleNodes = visibleNodes.filter((n) => focusNodeIds.has(n.id));
  }

  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  const connectedEdgesByNodeId = new Map<string, ProjectGraphEdge[]>();
  for (const edge of visibleEdges) {
    const src = connectedEdgesByNodeId.get(edge.source) ?? [];
    src.push(edge);
    connectedEdgesByNodeId.set(edge.source, src);
    const tgt = connectedEdgesByNodeId.get(edge.target) ?? [];
    tgt.push(edge);
    connectedEdgesByNodeId.set(edge.target, tgt);
  }

  return { visibleNodes, visibleEdges, connectedEdgesByNodeId };
}
