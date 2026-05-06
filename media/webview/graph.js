const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const graphPayloadElement = document.getElementById('graph-payload');
const graphCanvas = document.getElementById('graph-canvas');
const emptyState = document.getElementById('empty-state');
const isolatedToggle = document.getElementById('isolated-toggle');
const routerToggle = document.getElementById('router-toggle');
const servicesToggle = document.getElementById('services-toggle');
const storesToggle = document.getElementById('stores-toggle');
const composableTsToggle = document.getElementById('composable-ts-toggle');
const viewComponentsToggle = document.getElementById('view-components-toggle');
const componentFolderSection = document.getElementById('component-folder-section');
const componentFolderToggles = document.getElementById('component-folder-toggles');
const labelsToggle = document.getElementById('labels-toggle');
const zoomOutButton = document.getElementById('zoom-out-button');
const zoomResetButton = document.getElementById('zoom-reset-button');
const zoomInButton = document.getElementById('zoom-in-button');
const openGraphPanelButton = document.getElementById('open-graph-panel-button');

const graph = parsePayload(graphPayloadElement);
const currentPositions = new Map();
const componentFolderFilterState = new Map(
  collectComponentSubfolders(graph.nodes).map((folderName) => [folderName, false])
);
let shouldFitViewportOnRender = true;

let visibleNodes = [];
let visibleEdges = [];
let connectedEdgesByNodeId = new Map();
let viewportGroup = null;
let suppressNextClick = false;
let hoveredNodeId = null;

const viewportState = {
  scale: 1,
  tx: 0,
  ty: 0
};

const interactionState = {
  pointerId: null,
  mode: null,
  nodeId: null,
  startClientX: 0,
  startClientY: 0,
  nodeOffsetX: 0,
  nodeOffsetY: 0,
  startTx: 0,
  startTy: 0,
  moved: false
};

const MIN_SCALE = 0.35;
const MAX_SCALE = 4;
const DRAG_THRESHOLD = 4;

if (graphCanvas) {
  graphCanvas.addEventListener('pointerdown', handlePointerDown);
  graphCanvas.addEventListener('pointermove', handlePointerMove);
  graphCanvas.addEventListener('pointerup', handlePointerUp);
  graphCanvas.addEventListener('pointercancel', handlePointerUp);
  graphCanvas.addEventListener('lostpointercapture', resetInteractionState);
  graphCanvas.addEventListener('mouseover', handleNodeMouseOver);
  graphCanvas.addEventListener('mouseout', handleNodeMouseOut);
}

function parsePayload(payloadElement) {
  if (!payloadElement) {
    return { nodes: [], edges: [], stats: {} };
  }

  try {
    return JSON.parse(payloadElement.textContent || '{}');
  } catch {
    return { nodes: [], edges: [], stats: {} };
  }
}

function updateVisibleGraph() {
  const hideIsolated = Boolean(isolatedToggle?.checked);
  const showRouter = Boolean(routerToggle?.checked);
  const showServices = Boolean(servicesToggle?.checked);
  const showStores = Boolean(storesToggle?.checked);
  const showComposableTs = Boolean(composableTsToggle?.checked);
  const showViewComponents = Boolean(viewComponentsToggle?.checked);
  const connectedNodeIds = new Set();

  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  visibleNodes = graph.nodes.filter((node) => {
    if (!isComponentFolderVisible(node)) {
      return false;
    }

    if (!showRouter && isRouterNode(node)) {
      return false;
    }

    if (!showServices && isServiceNode(node)) {
      return false;
    }

    if (!showStores && isStoreNode(node)) {
      return false;
    }

    if (!showComposableTs && isComposableTsNode(node)) {
      return false;
    }

    if (!showViewComponents && isViewComponentNode(node)) {
      return false;
    }

    return !hideIsolated || connectedNodeIds.has(node.id);
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  visibleEdges = graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));

  connectedEdgesByNodeId = new Map();
  for (const edge of visibleEdges) {
    const sourceEdges = connectedEdgesByNodeId.get(edge.source) || [];
    sourceEdges.push(edge);
    connectedEdgesByNodeId.set(edge.source, sourceEdges);

    const targetEdges = connectedEdgesByNodeId.get(edge.target) || [];
    targetEdges.push(edge);
    connectedEdgesByNodeId.set(edge.target, targetEdges);
  }
}

function normalizeNodePath(node) {
  return node.path.replaceAll('\\', '/');
}

function pathAfterSrc(node) {
  const normalizedPath = normalizeNodePath(node);
  return normalizedPath.startsWith('src/') ? normalizedPath.slice(4) : normalizedPath;
}

function isRouterNode(node) {
  return pathAfterSrc(node).startsWith('router/');
}

function isServiceNode(node) {
  return pathAfterSrc(node).startsWith('services/');
}

function isStoreNode(node) {
  return pathAfterSrc(node).startsWith('stores/');
}

function isComposableTsNode(node) {
  return node.kind === 'ts' && !isRouterNode(node) && !isServiceNode(node) && !isStoreNode(node);
}

function isViewComponentNode(node) {
  return /^views\/.*\/components\//.test(pathAfterSrc(node));
}

function componentFolderNameForNode(node) {
  const relativePath = pathAfterSrc(node);
  if (!relativePath.startsWith('components/')) {
    return null;
  }

  const segments = relativePath.split('/');
  return segments.length >= 3 ? segments[1] : null;
}

function collectComponentSubfolders(nodes) {
  return Array.from(new Set(nodes
    .map((node) => componentFolderNameForNode(node))
    .filter((folderName) => Boolean(folderName)))).sort((left, right) => left.localeCompare(right));
}

function isComponentFolderVisible(node) {
  const folderName = componentFolderNameForNode(node);
  return folderName ? componentFolderFilterState.get(folderName) !== false : true;
}

function createLayout(nodes, width, height) {
  if (nodes.length === 0) {
    return new Map();
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const outgoingByNodeId = new Map();
  const incomingCountByNodeId = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    const outgoing = outgoingByNodeId.get(edge.source) || [];
    outgoing.push(edge.target);
    outgoingByNodeId.set(edge.source, outgoing);
    incomingCountByNodeId.set(edge.target, (incomingCountByNodeId.get(edge.target) || 0) + 1);
  }

  const preferredPaths = ['src/App.vue', 'src/main.ts'];
  const preferredPathRank = new Map(preferredPaths.map((path, index) => [path, index]));
  const levelByNodeId = new Map();

  function compareNodes(left, right) {
    const preferredRankDelta = (preferredPathRank.get(left.path) ?? Number.MAX_SAFE_INTEGER)
      - (preferredPathRank.get(right.path) ?? Number.MAX_SAFE_INTEGER);
    if (preferredRankDelta !== 0) {
      return preferredRankDelta;
    }

    const incomingDelta = (incomingCountByNodeId.get(left.id) || 0) - (incomingCountByNodeId.get(right.id) || 0);
    if (incomingDelta !== 0) {
      return incomingDelta;
    }

    const outgoingDelta = (outgoingByNodeId.get(right.id)?.length || 0) - (outgoingByNodeId.get(left.id)?.length || 0);
    if (outgoingDelta !== 0) {
      return outgoingDelta;
    }

    return left.path.localeCompare(right.path);
  }

  function assignLevelsFromRoots(rootNodes) {
    const queue = rootNodes.map((node) => ({ nodeId: node.id, level: 0 }));

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const knownLevel = levelByNodeId.get(current.nodeId);
      if (knownLevel !== undefined && knownLevel <= current.level) {
        continue;
      }

      levelByNodeId.set(current.nodeId, current.level);

      const targets = [...(outgoingByNodeId.get(current.nodeId) || [])].sort((left, right) => left.localeCompare(right));
      for (const targetId of targets) {
        queue.push({ nodeId: targetId, level: current.level + 1 });
      }
    }
  }

  const preferredRoots = nodes
    .filter((node) => preferredPathRank.has(node.path))
    .sort(compareNodes);
  assignLevelsFromRoots(preferredRoots);

  const fallbackRoots = nodes
    .filter((node) => !levelByNodeId.has(node.id) && (incomingCountByNodeId.get(node.id) || 0) === 0)
    .sort(compareNodes);
  assignLevelsFromRoots(fallbackRoots);

  const remainingNodes = nodes
    .filter((node) => !levelByNodeId.has(node.id))
    .sort(compareNodes);
  assignLevelsFromRoots(remainingNodes);

  function pathAfterSrc(node) {
    return node.path.startsWith('src/') ? node.path.slice(4) : node.path;
  }

  function classifyNode(node) {
    if (preferredPathRank.has(node.path)) {
      return 'root';
    }

    const normalizedPath = pathAfterSrc(node);
    if (normalizedPath.startsWith('router/')) {
      return 'router';
    }
    if (normalizedPath.startsWith('stores/')) {
      return 'store';
    }
    if (normalizedPath.startsWith('services/')) {
      return 'service';
    }

    return 'other';
  }

  const positions = new Map();
  const topPadding = 90;
  const bottomPadding = 90;
  const leftPadding = 90;
  const rightPadding = 90;
  const availableHeight = Math.max(height - topPadding - bottomPadding, 1);
  const availableWidth = Math.max(width - leftPadding - rightPadding, 1);
  const groupedNodes = {
    root: nodes.filter((node) => classifyNode(node) === 'root').sort(compareNodes),
    router: nodes.filter((node) => classifyNode(node) === 'router').sort(compareNodes),
    service: nodes.filter((node) => classifyNode(node) === 'service').sort(compareNodes),
    store: nodes.filter((node) => classifyNode(node) === 'store').sort(compareNodes),
    other: nodes.filter((node) => classifyNode(node) === 'other').sort((left, right) => {
      const levelDelta = (levelByNodeId.get(left.id) || 0) - (levelByNodeId.get(right.id) || 0);
      if (levelDelta !== 0) {
        return levelDelta;
      }
      return compareNodes(left, right);
    })
  };

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const routerNodeIds = new Set(groupedNodes.router.map((node) => node.id));
  const routerConnectedViewIds = new Set();
  for (const edge of edges) {
    const sourceIsRouter = routerNodeIds.has(edge.source);
    const targetIsRouter = routerNodeIds.has(edge.target);
    if (!sourceIsRouter && !targetIsRouter) {
      continue;
    }

    const candidateId = sourceIsRouter ? edge.target : edge.source;
    const candidateNode = nodesById.get(candidateId);
    if (candidateNode && pathAfterSrc(candidateNode).startsWith('views/')) {
      routerConnectedViewIds.add(candidateNode.id);
    }
  }

  const routerConnectedViews = groupedNodes.other.filter((node) => routerConnectedViewIds.has(node.id));
  groupedNodes.other = groupedNodes.other.filter((node) => !routerConnectedViewIds.has(node.id));

  const otherLevels = groupedNodes.other.map((node) => levelByNodeId.get(node.id) || 0);

  const maxOtherLevel = otherLevels.length > 0 ? Math.max(...otherLevels) : 0;
  const hasRouterConnectedViews = routerConnectedViews.length > 0;
  const serviceStoreRowIndex = hasRouterConnectedViews ? 3 : 2;
  const otherRowBaseIndex = hasRouterConnectedViews ? 4 : 3;
  const otherRowCount = Math.max(1, maxOtherLevel + 1);
  const rowCount = otherRowBaseIndex + otherRowCount;
  const rowGap = rowCount > 1 ? availableHeight / (rowCount - 1) : 0;

  function placeNodesHorizontally(bucketNodes, rowIndex, startX, laneWidth) {
    if (bucketNodes.length === 0) {
      return;
    }

    const y = topPadding + rowGap * rowIndex;
    const laneCenter = startX + Math.max(laneWidth, 1) / 2;

    if (bucketNodes.length === 1) {
      positions.set(bucketNodes[0].id, {
        x: laneCenter,
        y,
        depth: rowIndex
      });
      return;
    }

    const diameters = bucketNodes.map((node) => radiusForNode(node) * 2);
    const minimumGaps = bucketNodes.slice(0, -1).map((node, index) => {
      return Math.max(diameters[index], diameters[index + 1]) * 2;
    });
    const minimumSpan = minimumGaps.reduce((sum, gap) => sum + gap, 0);
    const targetSpan = Math.max(Math.max(laneWidth, 1), minimumSpan);
    const extraGap = (targetSpan - minimumSpan) / minimumGaps.length;
    const firstRadius = diameters[0] / 2;
    const lastRadius = diameters[diameters.length - 1] / 2;
    const minCenterX = leftPadding + firstRadius;
    const maxCenterX = width - rightPadding - lastRadius;
    const unclampedStartX = laneCenter - targetSpan / 2;
    const maxStartX = Math.max(minCenterX, maxCenterX - targetSpan);
    const rowStartX = Math.min(Math.max(unclampedStartX, minCenterX), maxStartX);

    let x = rowStartX;
    bucketNodes.forEach((node, nodeIndex) => {
      positions.set(node.id, {
        x,
        y,
        depth: rowIndex
      });

      x += (minimumGaps[nodeIndex] || 0) + extraGap;
    });
  }

  placeNodesHorizontally(groupedNodes.root, 0, width * 0.3, width * 0.4);
  placeNodesHorizontally(groupedNodes.router, 1, width * 0.28, width * 0.44);
  if (hasRouterConnectedViews) {
    placeNodesHorizontally(routerConnectedViews, 2, leftPadding, availableWidth);
  }
  placeNodesHorizontally(groupedNodes.service, serviceStoreRowIndex, leftPadding, availableWidth * 0.34);
  placeNodesHorizontally(groupedNodes.store, serviceStoreRowIndex, width - rightPadding - availableWidth * 0.34, availableWidth * 0.34);

  const otherRows = new Map();
  for (const node of groupedNodes.other) {
    const inferredLevel = levelByNodeId.get(node.id) || 0;
    const rowIndex = otherRowBaseIndex + Math.max(0, inferredLevel);
    const bucket = otherRows.get(rowIndex) || [];
    bucket.push(node);
    otherRows.set(rowIndex, bucket);
  }

  for (const [rowIndex, rowNodes] of Array.from(otherRows.entries()).sort((left, right) => left[0] - right[0])) {
    placeNodesHorizontally(rowNodes, rowIndex, leftPadding, availableWidth);
  }

  return positions;
}

function ensureNodePositions(nodes, width, height) {
  const layoutPositions = createLayout(nodes, width, height);

  for (const node of nodes) {
    if (!currentPositions.has(node.id)) {
      currentPositions.set(node.id, layoutPositions.get(node.id));
    }
  }

  const knownNodeIds = new Set(nodes.map((node) => node.id));
  for (const nodeId of currentPositions.keys()) {
    if (!knownNodeIds.has(nodeId)) {
      currentPositions.delete(nodeId);
    }
  }
}

function renderComponentFolderToggles() {
  if (!componentFolderToggles) {
    return;
  }

  const folderNames = collectComponentSubfolders(graph.nodes);
  if (componentFolderSection) {
    componentFolderSection.hidden = folderNames.length === 0;
  }

  componentFolderToggles.innerHTML = folderNames.map((folderName) => {
    const checked = componentFolderFilterState.get(folderName) !== false ? ' checked' : '';
    const inputId = 'component-folder-toggle-' + folderName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
    return '<label class="toggle" for="' + escapeHtml(inputId) + '">'
      + '<input id="' + escapeHtml(inputId) + '" type="checkbox" data-component-folder="' + escapeHtml(folderName) + '"' + checked + ' />'
      + '<span>Show components/' + escapeHtml(folderName) + '</span>'
      + '</label>';
  }).join('');

  for (const toggle of componentFolderToggles.querySelectorAll('input[data-component-folder]')) {
    toggle.addEventListener('change', () => {
      const folderName = toggle.getAttribute('data-component-folder');
      if (!folderName) {
        return;
      }

      componentFolderFilterState.set(folderName, toggle.checked);
      rerenderGraphWithLayoutReset();
    });
  }
}

function resetViewport() {
  viewportState.scale = 1;
  viewportState.tx = 0;
  viewportState.ty = 0;
}

function fitViewportToVisibleGraph() {
  if (!graphCanvas || !viewportGroup || visibleNodes.length === 0) {
    return;
  }

  const showLabels = Boolean(labelsToggle?.checked);
  const bounds = getVisibleGraphBounds(showLabels);
  const viewBox = currentViewBox();
  const padding = 48;
  const availableWidth = Math.max(viewBox.width - padding * 2, 1);
  const availableHeight = Math.max(viewBox.height - padding * 2, 1);
  const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const fitScale = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);
  const nextScale = clamp(Math.min(1, fitScale), MIN_SCALE, MAX_SCALE);
  const graphCenterX = (bounds.minX + bounds.maxX) / 2;
  const graphCenterY = (bounds.minY + bounds.maxY) / 2;
  const viewCenterX = viewBox.x + viewBox.width / 2;
  const viewCenterY = viewBox.y + viewBox.height / 2;

  viewportState.scale = nextScale;
  viewportState.tx = viewCenterX - graphCenterX * nextScale;
  viewportState.ty = viewCenterY - graphCenterY * nextScale;
}

function getVisibleGraphBounds(showLabels) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of visibleNodes) {
    const position = currentPositions.get(node.id);
    if (!position) {
      continue;
    }

    const radius = radiusForNode(node);
    minX = Math.min(minX, position.x - radius);
    minY = Math.min(minY, position.y - radius);
    maxX = Math.max(maxX, position.x + radius);
    maxY = Math.max(maxY, position.y + radius + (showLabels ? 24 : 0));
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  return { minX, minY, maxX, maxY };
}

function rerenderGraphWithLayoutReset() {
  currentPositions.clear();
  resetViewport();
  shouldFitViewportOnRender = true;
  renderGraph();
}

function visiblePositions() {
  const positions = new Map();
  for (const node of visibleNodes) {
    const position = currentPositions.get(node.id);
    if (position) {
      positions.set(node.id, position);
    }
  }
  return positions;
}

function radiusForNode(node) {
  return 10 + Math.min(18, (node.importCount + node.importedByCount) * 1.35);
}

function renderGraph() {
  if (!graphCanvas) {
    return;
  }

  updateVisibleGraph();

  if (visibleNodes.length === 0) {
    viewportGroup = null;
    graphCanvas.innerHTML = '';
    graphCanvas.setAttribute('viewBox', '0 0 1200 720');
    if (emptyState) {
      emptyState.hidden = false;
    }
    return;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  const width = Math.max(graphCanvas.clientWidth || 1200, 720);
  const height = Math.max(graphCanvas.clientHeight || 720, 520);
  graphCanvas.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

  ensureNodePositions(visibleNodes, width, height);
  const positions = visiblePositions();
  const showLabels = Boolean(labelsToggle?.checked);

  graphCanvas.innerHTML = '<g id="graph-viewport" class="graph-viewport">'
    + renderEdges(visibleEdges, positions)
    + renderNodes(visibleNodes, positions, showLabels)
    + '</g>';

  viewportGroup = graphCanvas.querySelector('#graph-viewport');
  applyHoveredNodeState();
  if (shouldFitViewportOnRender) {
    fitViewportToVisibleGraph();
    shouldFitViewportOnRender = false;
  }
  applyViewportTransform();
}

function handleNodeMouseOver(event) {
  const nodeElement = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  if (!nodeElement) {
    return;
  }

  setHoveredNode(nodeElement.getAttribute('data-node-id'));
}

function handleNodeMouseOut(event) {
  const nodeElement = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  if (!nodeElement) {
    return;
  }

  const relatedNodeElement = event.relatedTarget instanceof Element
    ? event.relatedTarget.closest('.graph-node')
    : null;

  if (relatedNodeElement === nodeElement) {
    return;
  }

  if (relatedNodeElement) {
    setHoveredNode(relatedNodeElement.getAttribute('data-node-id'));
    return;
  }

  setHoveredNode(null);
}

function setHoveredNode(nodeId) {
  hoveredNodeId = nodeId;
  applyHoveredNodeState();
}

function applyHoveredNodeState() {
  if (!graphCanvas) {
    return;
  }

  const hasHoveredNode = Boolean(hoveredNodeId) && visibleNodes.some((node) => node.id === hoveredNodeId);
  graphCanvas.classList.toggle('is-node-hovering', hasHoveredNode);
  const connectedEdges = hasHoveredNode ? connectedEdgesByNodeId.get(hoveredNodeId) || [] : [];
  const hoveredEdgeIds = new Set(connectedEdges.map((edge) => edge.id));
  const connectedNodeIds = new Set(
    connectedEdges.flatMap((edge) => [edge.source, edge.target]).filter((nodeId) => nodeId !== hoveredNodeId)
  );

  for (const nodeElement of graphCanvas.querySelectorAll('.graph-node')) {
    const isHovered = hasHoveredNode && nodeElement.getAttribute('data-node-id') === hoveredNodeId;
    const isConnected = hasHoveredNode && connectedNodeIds.has(nodeElement.getAttribute('data-node-id') || '');
    nodeElement.classList.toggle('is-hovered', isHovered);
    nodeElement.classList.toggle('is-connected', isConnected);
  }

  for (const edgeElement of graphCanvas.querySelectorAll('.graph-edge')) {
    const isHovered = hasHoveredNode && hoveredEdgeIds.has(edgeElement.getAttribute('data-edge-id') || '');
    edgeElement.classList.toggle('is-hovered', isHovered);
  }
}

function renderEdges(edges, positions) {
  return edges.map((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) {
      return '';
    }

    return '<line class="graph-edge ' + (edge.kind === 'dynamic-import' ? 'graph-edge--dynamic' : '') + '" '
      + 'data-edge-id="' + escapeHtml(edge.id) + '" '
      + 'x1="' + source.x.toFixed(2) + '" '
      + 'y1="' + source.y.toFixed(2) + '" '
      + 'x2="' + target.x.toFixed(2) + '" '
      + 'y2="' + target.y.toFixed(2) + '"></line>';
  }).join('');
}

function renderNodes(nodes, positions, showLabels) {
  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) {
      return '';
    }

    const radius = radiusForNode(node);
    const label = showLabels
      ? '<text class="graph-label" x="' + position.x.toFixed(2) + '" y="' + (position.y + radius + 16).toFixed(2) + '">' + escapeHtml(node.label) + '</text>'
      : '';

    return '<g class="graph-node graph-node--' + node.color + '" data-node-id="' + escapeHtml(node.id) + '">'
      + '<circle cx="' + position.x.toFixed(2) + '" cy="' + position.y.toFixed(2) + '" r="' + radius.toFixed(2) + '"></circle>'
      + label
      + '</g>';
  }).join('');
}

function handlePointerDown(event) {
  if (!graphCanvas || event.button !== 0) {
    return;
  }

  const nodeElement = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  const graphPoint = clientToGraphPoint(event.clientX, event.clientY);

  interactionState.pointerId = event.pointerId;
  interactionState.mode = nodeElement ? 'node' : 'pan';
  interactionState.nodeId = nodeElement?.getAttribute('data-node-id') || null;
  interactionState.startClientX = event.clientX;
  interactionState.startClientY = event.clientY;
  interactionState.nodeOffsetX = 0;
  interactionState.nodeOffsetY = 0;
  interactionState.startTx = viewportState.tx;
  interactionState.startTy = viewportState.ty;
  interactionState.moved = false;

  if (interactionState.nodeId) {
    const nodePosition = currentPositions.get(interactionState.nodeId);
    if (nodePosition) {
      interactionState.nodeOffsetX = graphPoint.x - nodePosition.x;
      interactionState.nodeOffsetY = graphPoint.y - nodePosition.y;
    }
  }

  if (interactionState.mode === 'pan') {
    graphCanvas.classList.add('is-panning');
  }

  if (interactionState.nodeId) {
    nodeElement?.classList.add('is-dragging');
  }

  graphCanvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!graphCanvas || interactionState.pointerId !== event.pointerId || !interactionState.mode) {
    return;
  }

  const deltaX = event.clientX - interactionState.startClientX;
  const deltaY = event.clientY - interactionState.startClientY;

  if (!interactionState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
    interactionState.moved = true;
    suppressNextClick = true;
  }

  if (interactionState.mode === 'pan') {
    if (!interactionState.moved) {
      return;
    }

    viewportState.tx = interactionState.startTx + deltaX * viewBoxScaleX();
    viewportState.ty = interactionState.startTy + deltaY * viewBoxScaleY();
    applyViewportTransform();
    return;
  }

  if (!interactionState.nodeId || !interactionState.moved) {
    return;
  }

  const graphPoint = clientToGraphPoint(event.clientX, event.clientY);
  const nodePosition = currentPositions.get(interactionState.nodeId);
  if (!nodePosition) {
    return;
  }

  nodePosition.x = graphPoint.x - interactionState.nodeOffsetX;
  nodePosition.y = graphPoint.y - interactionState.nodeOffsetY;
  updateNodeDom(interactionState.nodeId);
  updateConnectedEdgeDom(interactionState.nodeId);
}

function handlePointerUp(event) {
  if (!graphCanvas || interactionState.pointerId !== event.pointerId) {
    return;
  }

  const shouldOpenNode = interactionState.mode === 'node' && !interactionState.moved;
  const nodeId = interactionState.nodeId;

  if (graphCanvas.hasPointerCapture(event.pointerId)) {
    graphCanvas.releasePointerCapture(event.pointerId);
  }

  resetInteractionState();

  if (shouldOpenNode && nodeId) {
    openNodeFile(nodeId);
  }
}

function resetInteractionState() {
  if (graphCanvas) {
    graphCanvas.classList.remove('is-panning');

    if (interactionState.nodeId) {
      const nodeElement = findGraphElementByDataAttribute('data-node-id', interactionState.nodeId);
      nodeElement?.classList.remove('is-dragging');
    }
  }

  interactionState.pointerId = null;
  interactionState.mode = null;
  interactionState.nodeId = null;
  interactionState.startClientX = 0;
  interactionState.startClientY = 0;
  interactionState.nodeOffsetX = 0;
  interactionState.nodeOffsetY = 0;
  interactionState.startTx = viewportState.tx;
  interactionState.startTy = viewportState.ty;
  interactionState.moved = false;
}

function openNodeFile(nodeId) {
  if (!nodeId || !vscode) {
    return;
  }

  vscode.postMessage({ type: 'openFile', path: nodeId });
}

function updateNodeDom(nodeId) {
  if (!graphCanvas) {
    return;
  }

  const node = visibleNodes.find((candidate) => candidate.id === nodeId);
  const position = currentPositions.get(nodeId);
  const nodeElement = findGraphElementByDataAttribute('data-node-id', nodeId);
  if (!node || !position || !nodeElement) {
    return;
  }

  const circle = nodeElement.querySelector('circle');
  if (circle) {
    circle.setAttribute('cx', position.x.toFixed(2));
    circle.setAttribute('cy', position.y.toFixed(2));
  }

  const label = nodeElement.querySelector('.graph-label');
  if (label) {
    label.setAttribute('x', position.x.toFixed(2));
    label.setAttribute('y', (position.y + radiusForNode(node) + 16).toFixed(2));
  }
}

function updateConnectedEdgeDom(nodeId) {
  if (!graphCanvas) {
    return;
  }

  const connectedEdges = connectedEdgesByNodeId.get(nodeId) || [];
  for (const edge of connectedEdges) {
    const source = currentPositions.get(edge.source);
    const target = currentPositions.get(edge.target);
    const edgeElement = findGraphElementByDataAttribute('data-edge-id', edge.id);
    if (!source || !target || !edgeElement) {
      continue;
    }

    edgeElement.setAttribute('x1', source.x.toFixed(2));
    edgeElement.setAttribute('y1', source.y.toFixed(2));
    edgeElement.setAttribute('x2', target.x.toFixed(2));
    edgeElement.setAttribute('y2', target.y.toFixed(2));
  }
}

function findGraphElementByDataAttribute(attributeName, attributeValue) {
  if (!graphCanvas) {
    return null;
  }

  for (const element of graphCanvas.querySelectorAll('[' + attributeName + ']')) {
    if (element.getAttribute(attributeName) === attributeValue) {
      return element;
    }
  }

  return null;
}

function setZoom(nextScale) {
  const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const currentCenter = viewportCenterInGraphSpace();

  viewportState.scale = clampedScale;
  const centerSvgX = currentViewBox().x + currentViewBox().width / 2;
  const centerSvgY = currentViewBox().y + currentViewBox().height / 2;
  viewportState.tx = centerSvgX - currentCenter.x * viewportState.scale;
  viewportState.ty = centerSvgY - currentCenter.y * viewportState.scale;
  applyViewportTransform();
}

function viewportCenterInGraphSpace() {
  const box = currentViewBox();
  const centerSvgX = box.x + box.width / 2;
  const centerSvgY = box.y + box.height / 2;
  return {
    x: (centerSvgX - viewportState.tx) / viewportState.scale,
    y: (centerSvgY - viewportState.ty) / viewportState.scale
  };
}

function applyViewportTransform() {
  if (!viewportGroup) {
    return;
  }

  viewportGroup.setAttribute(
    'transform',
    'matrix(' + viewportState.scale + ' 0 0 ' + viewportState.scale + ' ' + viewportState.tx + ' ' + viewportState.ty + ')'
  );
}

function clientToSvgPoint(clientX, clientY) {
  if (!graphCanvas) {
    return { x: clientX, y: clientY };
  }

  const rect = graphCanvas.getBoundingClientRect();
  const { x, y, width, height } = currentViewBox();
  return {
    x: x + ((clientX - rect.left) / rect.width) * width,
    y: y + ((clientY - rect.top) / rect.height) * height
  };
}

function clientToGraphPoint(clientX, clientY) {
  const svgPoint = clientToSvgPoint(clientX, clientY);
  return {
    x: (svgPoint.x - viewportState.tx) / viewportState.scale,
    y: (svgPoint.y - viewportState.ty) / viewportState.scale
  };
}

function currentViewBox() {
  const rawValue = graphCanvas?.getAttribute('viewBox') || '0 0 1200 720';
  const [x, y, width, height] = rawValue.split(/\s+/).map(Number);
  return { x, y, width, height };
}

function viewBoxScaleX() {
  if (!graphCanvas) {
    return 1;
  }

  const { width } = currentViewBox();
  const rect = graphCanvas.getBoundingClientRect();
  return width / (rect.width || width);
}

function viewBoxScaleY() {
  if (!graphCanvas) {
    return 1;
  }

  const { height } = currentViewBox();
  const rect = graphCanvas.getBoundingClientRect();
  return height / (rect.height || height);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (isolatedToggle) {
  isolatedToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (routerToggle) {
  routerToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (servicesToggle) {
  servicesToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (storesToggle) {
  storesToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (composableTsToggle) {
  composableTsToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (viewComponentsToggle) {
  viewComponentsToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (labelsToggle) {
  labelsToggle.addEventListener('change', () => {
    shouldFitViewportOnRender = true;
    renderGraph();
  });
}

if (zoomOutButton) {
  zoomOutButton.addEventListener('click', () => {
    setZoom(viewportState.scale * 0.9);
  });
}

if (zoomResetButton) {
  zoomResetButton.addEventListener('click', () => {
    resetViewport();
    shouldFitViewportOnRender = true;
    fitViewportToVisibleGraph();
    applyViewportTransform();
  });
}

if (zoomInButton) {
  zoomInButton.addEventListener('click', () => {
    setZoom(viewportState.scale * 1.1);
  });
}

if (openGraphPanelButton) {
  openGraphPanelButton.addEventListener('click', () => {
    vscode?.postMessage({ type: 'openGraphPanel' });
  });
}

renderComponentFolderToggles();
window.addEventListener('resize', () => {
  shouldFitViewportOnRender = true;
  renderGraph();
});
renderGraph();