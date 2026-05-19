const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const graphPayloadElement = document.getElementById('graph-payload');
const graphCanvas = document.getElementById('graph-canvas');
const emptyState = document.getElementById('empty-state');
const isolatedToggle = document.getElementById('isolated-toggle');
const testsToggle = document.getElementById('tests-toggle');
const storiesToggle = document.getElementById('stories-toggle');
const appEntryToggle = document.getElementById('app-entry-toggle');
const routerToggle = document.getElementById('router-toggle');
const servicesToggle = document.getElementById('services-toggle');
const storesToggle = document.getElementById('stores-toggle');
const composableTsToggle = document.getElementById('composable-ts-toggle');
const viewComponentsToggle = document.getElementById('view-components-toggle');
const componentFolderSection = document.getElementById('component-folder-section');
const componentFolderToggles = document.getElementById('component-folder-toggles');
const labelsToggle = document.getElementById('labels-toggle');
const folderPathsToggle = document.getElementById('folder-paths-toggle');
const zoomOutButton = document.getElementById('zoom-out-button');
const zoomResetButton = document.getElementById('zoom-reset-button');
const fitViewportButton = document.getElementById('fit-viewport-button');
const zoomInButton = document.getElementById('zoom-in-button');
const openGraphPanelButton = document.getElementById('open-graph-panel-button');
const selectedNodeBadge = document.getElementById('selected-node-badge');
const selectedNodeBadgeName = document.getElementById('selected-node-badge-name');
const deselectNodeButton = document.getElementById('deselect-node-button');

const graph = parsePayload(graphPayloadElement);
const currentPositions = new Map();
const componentFolderFilterState = new Map(
  collectComponentSubfolders(graph.nodes).map((folderName) => [folderName, false])
);
let shouldFitViewportOnRender = true;

let selectedNodeId = null;

const DEFAULT_CHECKBOX_STATE = new Map([
  ['isolated-toggle', true],
  ['tests-toggle', false],
  ['stories-toggle', false],
  ['app-entry-toggle', true],
  ['router-toggle', true],
  ['services-toggle', false],
  ['stores-toggle', false],
  ['composable-ts-toggle', false],
  ['view-components-toggle', true],
  ['labels-toggle', true],
  ['folder-paths-toggle', false]
]);

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
const VERTICAL_LAYOUT_MULTIPLIER = 1;
const HORIZONTAL_NODE_GAP_MULTIPLIER = 6.4;

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
  const showTests = Boolean(testsToggle?.checked);
  const showStories = Boolean(storiesToggle?.checked);
  const showAppEntries = Boolean(appEntryToggle?.checked);
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

    if (!showTests && isTestNode(node)) {
      return false;
    }

    if (!showStories && isStorybookOrHistoireNode(node)) {
      return false;
    }

    if (!showAppEntries && isAppEntryNode(node)) {
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

  if (selectedNodeId) {
    const focusEdges = graph.edges.filter(
      (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId
    );
    const focusNodeIds = new Set(focusEdges.flatMap((edge) => [edge.source, edge.target]));
    focusNodeIds.add(selectedNodeId);
    visibleNodes = visibleNodes.filter((node) => focusNodeIds.has(node.id));
  }

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

const SHORT_PATH_CATEGORY_PREFIXES = new Set([
  'components', 'pages', 'views', 'layouts', 'stores',
  'composables', 'services', 'utils', 'router', 'middleware'
]);

function shortNodePath(node) {
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

function pathAfterSrc(node) {
  const normalizedPath = normalizeNodePath(node);
  if (normalizedPath.startsWith('src/')) {
    return normalizedPath.slice(4);
  }
  if (normalizedPath.startsWith('app/')) {
    return normalizedPath.slice(4);
  }
  return normalizedPath;
}

function isRouterNode(node) {
  return node.id === '__nuxt-router__' || pathAfterSrc(node).startsWith('router/');
}

function isAppEntryNode(node) {
  return node.path === 'src/App.vue' || node.path === 'src/main.ts'
    || node.path === 'app/app.vue' || node.path === 'app/App.vue';
}

function isTestNode(node) {
  const normalizedPath = normalizeNodePath(node).toLowerCase();
  const pathSegments = normalizedPath.split('/');
  const fileName = pathSegments[pathSegments.length - 1];

  return pathSegments.includes('__tests__')
    || fileName === 'spec.ts'
    || fileName === 'spec.js'
    || normalizedPath.endsWith('.spec.ts')
    || normalizedPath.endsWith('.spec.js');
}

function isStorybookOrHistoireNode(node) {
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

function isServiceNode(node) {
  return pathAfterSrc(node).startsWith('services/');
}

function isStoreNode(node) {
  return pathAfterSrc(node).startsWith('stores/');
}

function isComposableTsNode(node) {
  return node.kind === 'ts'
    && !isAppEntryNode(node)
    && !isRouterNode(node)
    && !isServiceNode(node)
    && !isStoreNode(node);
}

function isViewComponentNode(node) {
  const relative = pathAfterSrc(node);
  return /^views\/.*\/components\//.test(relative) || /^pages\/.*\/components\//.test(relative);
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
  if (selectedNodeId) {
    return true;
  }
  const folderName = componentFolderNameForNode(node);
  return folderName ? componentFolderFilterState.get(folderName) !== false : true;
}

function createFocusLayout(centerNodeId, nodes, width, height) {
  const positions = new Map();
  const centerX = width / 2;
  const centerY = height / 2;

  positions.set(centerNodeId, { x: centerX, y: centerY, depth: 0 });

  const surrounding = nodes.filter((node) => node.id !== centerNodeId);
  if (surrounding.length === 0) {
    return positions;
  }

  const orbitRadius = Math.min(width, height) * 0.35;
  surrounding.forEach((node, index) => {
    const angle = (index / surrounding.length) * (2 * Math.PI) - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + orbitRadius * Math.cos(angle),
      y: centerY + orbitRadius * Math.sin(angle),
      depth: 1
    });
  });

  return positions;
}

function createLayout(nodes, width, height) {
  if (nodes.length === 0) {
    return new Map();
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  // Build adjacency
  const outgoingByNode = new Map(nodes.map((node) => [node.id, []]));
  const incomingByNode = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    outgoingByNode.get(edge.source).push(edge.target);
    incomingByNode.get(edge.target).push(edge.source);
  }

  // ── STEP 1: Longest-path topological level assignment (Kahn's) ───────────
  // level[v] = max(level[u] + 1) over all u → v
  // This guarantees every node sits strictly below all its importers,
  // so direct imports of app.vue are always above the router.
  const preferredPaths = ['src/App.vue', 'src/main.ts', 'app/app.vue', 'app/App.vue'];
  const preferredPathSet = new Set(preferredPaths);
  const preferredPathRank = new Map(preferredPaths.map((p, i) => [p, i]));

  const levelByNode = new Map();
  // Treat preferred entry-points as roots regardless of incoming edges
  const workingInDeg = new Map(nodes.map((node) => [
    node.id,
    preferredPathSet.has(node.path) ? 0 : incomingByNode.get(node.id).length
  ]));

  const queue = [];
  const enqueued = new Set();
  for (const node of nodes) {
    if (workingInDeg.get(node.id) === 0) {
      levelByNode.set(node.id, 0);
      queue.push(node.id);
      enqueued.add(node.id);
    }
  }
  // Preferred paths first so their levels propagate before other roots
  queue.sort((a, b) => {
    const rankA = preferredPathRank.get(nodesById.get(a)?.path ?? '') ?? Number.MAX_SAFE_INTEGER;
    const rankB = preferredPathRank.get(nodesById.get(b)?.path ?? '') ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

  let qi = 0;
  while (qi < queue.length) {
    const nodeId = queue[qi++];
    const currentLevel = levelByNode.get(nodeId) ?? 0;
    for (const targetId of outgoingByNode.get(nodeId) ?? []) {
      // Propagate longest path — keep the maximum depth seen so far
      const proposed = currentLevel + 1;
      if (!levelByNode.has(targetId) || levelByNode.get(targetId) < proposed) {
        levelByNode.set(targetId, proposed);
      }
      const newDeg = (workingInDeg.get(targetId) ?? 1) - 1;
      workingInDeg.set(targetId, newDeg);
      // Only enqueue once all predecessors are processed (ensures max level is known)
      if (newDeg <= 0 && !enqueued.has(targetId)) {
        enqueued.add(targetId);
        queue.push(targetId);
      }
    }
  }
  // Cycle nodes (never dequeued) are placed below everything else
  const maxAssignedLevel = levelByNode.size > 0 ? Math.max(...levelByNode.values()) : 0;
  for (const node of nodes) {
    if (!levelByNode.has(node.id)) {
      levelByNode.set(node.id, maxAssignedLevel + 1);
    }
  }

  // ── STEP 2: Zone classification ──────────────────────────────────────────
  // Services → left lane, Stores → right lane, everything else → center lane.
  // Side zones are only allocated when those node types are actually visible.
  function pathAfterSrc(node) {
    if (node.path.startsWith('src/')) return node.path.slice(4);
    if (node.path.startsWith('app/')) return node.path.slice(4);
    return node.path;
  }

  function getZone(node) {
    if (preferredPathSet.has(node.path)) return 'center';
    const p = pathAfterSrc(node);
    if (p.startsWith('stores/') || p.startsWith('store/')) return 'right';
    if (p.startsWith('services/')) return 'left';
    return 'center';
  }

  // ── STEP 3: Build rows grouped by level, sorted by connectivity ──────────
  const connectionCount = new Map(nodes.map((node) => [
    node.id,
    (outgoingByNode.get(node.id)?.length ?? 0) + (incomingByNode.get(node.id)?.length ?? 0)
  ]));

  function compareByConnectivity(a, b) {
    const connDelta = (connectionCount.get(b.id) ?? 0) - (connectionCount.get(a.id) ?? 0);
    if (connDelta !== 0) return connDelta;
    const rankA = preferredPathRank.get(a.path) ?? Number.MAX_SAFE_INTEGER;
    const rankB = preferredPathRank.get(b.path) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.path.localeCompare(b.path);
  }

  const rowsByLevel = new Map();
  for (const node of nodes) {
    const lv = levelByNode.get(node.id) ?? 0;
    if (!rowsByLevel.has(lv)) {
      rowsByLevel.set(lv, { left: [], center: [], right: [] });
    }
    rowsByLevel.get(lv)[getZone(node)].push(node);
  }
  for (const row of rowsByLevel.values()) {
    row.left.sort(compareByConnectivity);
    row.center.sort(compareByConnectivity);
    row.right.sort(compareByConnectivity);
  }

  const sortedLevels = Array.from(rowsByLevel.keys()).sort((a, b) => a - b);
  const rowCount = sortedLevels.length;

  // ── STEP 4: Compute zone geometry ────────────────────────────────────────
  const topPadding = 90;
  const bottomPadding = 90;
  const leftPadding = 90;
  const rightPadding = 90;
  const availableWidth = Math.max(width - leftPadding - rightPadding, 1);
  const availableHeight = Math.max(height - topPadding - bottomPadding, 1);
  // Per-gap vertical spacing: gap between level i and i+1 is weighted by the
  // maximum number of direct children any single node in level i sends to
  // level i+1.  Gaps with denser fan-out get proportionally more room.
  // All weights are normalised so the total height stays constant.
  const gapWeights = sortedLevels.slice(0, -1).map((fromLevel, i) => {
    const toLevel = sortedLevels[i + 1];
    const row = rowsByLevel.get(fromLevel);
    const nodesAtFrom = [...row.left, ...row.center, ...row.right];
    let maxChildren = 1;
    for (const node of nodesAtFrom) {
      const count = (outgoingByNode.get(node.id) ?? [])
        .filter((id) => levelByNode.get(id) === toLevel).length;
      if (count > maxChildren) maxChildren = count;
    }
    return maxChildren;
  });
  const totalGapWeight = gapWeights.reduce((s, w) => s + w, 0) || 1;
  const totalVerticalSpace = rowCount > 1 ? availableHeight * VERTICAL_LAYOUT_MULTIPLIER : 0;
  const cumulativeY = [0];
  for (let gi = 0; gi < gapWeights.length; gi++) {
    cumulativeY.push(cumulativeY[gi] + totalVerticalSpace * (gapWeights[gi] / totalGapWeight));
  }

  const hasAnyLeft = nodes.some((n) => getZone(n) === 'left');
  const hasAnyRight = nodes.some((n) => getZone(n) === 'right');
  const sideZoneFrac = 0.25;
  const usedSideFrac = (hasAnyLeft ? sideZoneFrac : 0) + (hasAnyRight ? sideZoneFrac : 0);
  const centerZoneFrac = 1 - usedSideFrac;
  const sideZoneWidth = availableWidth * sideZoneFrac;
  const centerZoneWidth = availableWidth * centerZoneFrac;
  const centerZoneStart = leftPadding + (hasAnyLeft ? sideZoneWidth : 0);
  const rightZoneStart = leftPadding + (hasAnyLeft ? sideZoneWidth : 0) + centerZoneWidth;

  // ── STEP 5: Place nodes top-down with barycenter-guided positioning ─────────
  // Each node's ideal X = average X of its already-placed parents (barycenter).
  // Nodes within a row are sorted by that ideal, then a forward+backward scan
  // resolves overlaps while keeping each node as close to its ideal as possible.
  // The group is finally centred around the mean of the ideals (or the lane
  // centre for root rows that have no placed parents yet).
  const positions = new Map();

  function placeRow(rowNodes, y, startX, laneWidth) {
    if (rowNodes.length === 0) return;
    const laneCenter = startX + Math.max(laneWidth, 1) / 2;

    // Compute ideal X = average X of already-placed parents
    const idealByNode = new Map();
    for (const node of rowNodes) {
      const parents = incomingByNode.get(node.id) ?? [];
      const placed = parents.map((id) => positions.get(id)).filter(Boolean);
      if (placed.length > 0) {
        idealByNode.set(node.id, placed.reduce((s, p) => s + p.x, 0) / placed.length);
      }
    }
    const hasIdeal = idealByNode.size > 0;

    // Sort: nodes with placed parents by their ideal X; orphans by connectivity
    const sorted = [...rowNodes].sort((a, b) => {
      const ia = idealByNode.get(a.id);
      const ib = idealByNode.get(b.id);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return compareByConnectivity(a, b);
    });

    const radii = sorted.map((node) => radiusForNode(node));

    if (sorted.length === 1) {
      const idealX = idealByNode.get(sorted[0].id) ?? laneCenter;
      const minX = leftPadding + radii[0];
      const maxX = width - rightPadding - radii[0];
      positions.set(sorted[0].id, { x: Math.min(Math.max(idealX, minX), maxX), y, depth: 0 });
      return;
    }

    // Minimum separation between adjacent centres
    const minSep = radii.slice(0, -1).map((_, i) => (radii[i] + radii[i + 1]) * HORIZONTAL_NODE_GAP_MULTIPLIER);

    // Build ideal X array; fill nulls by neighbour interpolation
    const idealArr = sorted.map((node) => idealByNode.get(node.id) ?? null);
    const filled = idealArr.map((x, i) => {
      if (x !== null) return x;
      for (let d = 1; d < sorted.length; d++) {
        const prev = i - d >= 0 ? idealArr[i - d] : null;
        const next = i + d < sorted.length ? idealArr[i + d] : null;
        if (prev !== null && next !== null) return (prev + next) / 2;
        if (prev !== null) return prev + d * 110;
        if (next !== null) return next - d * 110;
      }
      return laneCenter;
    });

    // Forward scan: push right to enforce minimum separation
    const assignedX = [...filled];
    for (let i = 1; i < sorted.length; i++) {
      assignedX[i] = Math.max(assignedX[i], assignedX[i - 1] + minSep[i - 1]);
    }
    // Backward scan: push left to enforce minimum separation
    for (let i = sorted.length - 2; i >= 0; i--) {
      assignedX[i] = Math.min(assignedX[i], assignedX[i + 1] - minSep[i]);
    }

    // Centre the group around the mean of ideal positions (or lane centre for roots)
    {
      let targetCenter;
      if (hasIdeal) {
        let sum = 0, count = 0;
        for (const node of sorted) {
          const ideal = idealByNode.get(node.id);
          if (ideal !== undefined) { sum += ideal; count++; }
        }
        targetCenter = sum / count;
      } else {
        targetCenter = laneCenter;
      }
      const groupMid = (assignedX[0] + assignedX[sorted.length - 1]) / 2;
      const centerShift = targetCenter - groupMid;
      for (let i = 0; i < sorted.length; i++) assignedX[i] += centerShift;
    }

    // Clamp to canvas bounds
    const firstMinX = leftPadding + radii[0];
    const lastMaxX = width - rightPadding - radii[sorted.length - 1];
    let shift = 0;
    if (assignedX[0] < firstMinX) shift = firstMinX - assignedX[0];
    if (assignedX[sorted.length - 1] + shift > lastMaxX) {
      shift = lastMaxX - assignedX[sorted.length - 1];
    }
    shift = Math.max(shift, firstMinX - assignedX[0]);

    for (let i = 0; i < sorted.length; i++) {
      positions.set(sorted[i].id, { x: assignedX[i] + shift, y, depth: 0 });
    }
  }

  sortedLevels.forEach((level, rowIndex) => {
    const row = rowsByLevel.get(level);
    const y = topPadding + cumulativeY[rowIndex];
    placeRow(row.center, y, centerZoneStart, centerZoneWidth);
    if (hasAnyLeft) placeRow(row.left, y, leftPadding, sideZoneWidth);
    if (hasAnyRight) placeRow(row.right, y, rightZoneStart, sideZoneWidth);
  });

  return positions;
}

function ensureNodePositions(nodes, width, height) {
  const layoutPositions = selectedNodeId
    ? createFocusLayout(selectedNodeId, nodes, width, height)
    : createLayout(nodes, width, height);

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
  const showFolderPaths = Boolean(folderPathsToggle?.checked);
  const bounds = getVisibleGraphBounds(showLabels || showFolderPaths);
  const viewBox = currentViewBox();
  const padding = 48;
  const availableWidth = Math.max(viewBox.width - padding * 2, 1);
  const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const fitScale = availableWidth / graphWidth;
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
  const showFolderPaths = Boolean(folderPathsToggle?.checked);

  graphCanvas.innerHTML = '<g id="graph-viewport" class="graph-viewport">'
    + renderEdges(visibleEdges, positions)
    + renderNodes(visibleNodes, positions, showLabels, showFolderPaths)
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
  const showLabels = Boolean(labelsToggle?.checked);
  const showFolderPaths = Boolean(folderPathsToggle?.checked);
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

    const labelElement = nodeElement.querySelector('.graph-label');
    if (labelElement) {
      const shouldShowPath = isHovered || isConnected;
      const shortPath = nodeElement.getAttribute('data-node-short-path') || '';
      const defaultLabel = showFolderPaths
        ? (shortPath || nodeElement.getAttribute('data-node-label') || '')
        : (nodeElement.getAttribute('data-node-label') || '');
      const fullPath = nodeElement.getAttribute('data-node-path') || defaultLabel;
      labelElement.textContent = shouldShowPath ? fullPath : defaultLabel;
      labelElement.classList.toggle('graph-label--path', shouldShowPath);
      labelElement.classList.toggle('is-hidden', !showLabels && !showFolderPaths && !shouldShowPath);
    }
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

function renderNodes(nodes, positions, showLabels, showFolderPaths) {
  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) {
      return '';
    }

    const radius = radiusForNode(node);
    const shortPath = shortNodePath(node);
    const displayLabel = showFolderPaths ? shortPath : node.label;
    const labelHidden = !showLabels && !showFolderPaths;
    const labelClassName = labelHidden ? 'graph-label is-hidden' : 'graph-label';
    const label = '<text class="' + labelClassName + '" x="' + position.x.toFixed(2) + '" y="' + (position.y + radius + 16).toFixed(2) + '">' + escapeHtml(displayLabel) + '</text>';

    return '<g class="graph-node graph-node--' + node.color + (node.virtual ? ' graph-node--virtual' : '') + '" data-node-id="' + escapeHtml(node.id) + '" data-node-label="' + escapeHtml(node.label) + '" data-node-path="' + escapeHtml(node.path) + '" data-node-short-path="' + escapeHtml(shortPath) + '">'
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
    selectNode(nodeId);
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

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node?.virtual) {
    return;
  }

  vscode.postMessage({ type: 'openFile', path: nodeId });
}

function getAllStaticToggles() {
  return [
    isolatedToggle,
    testsToggle,
    storiesToggle,
    appEntryToggle,
    routerToggle,
    servicesToggle,
    storesToggle,
    composableTsToggle,
    viewComponentsToggle
  ].filter(Boolean);
}

function resetComponentFolderFilterState(value) {
  for (const key of componentFolderFilterState.keys()) {
    componentFolderFilterState.set(key, value);
  }
  renderComponentFolderToggles();
}

function setAllCheckboxesChecked() {
  for (const toggle of getAllStaticToggles()) {
    toggle.checked = true;
  }
  resetComponentFolderFilterState(true);
}

function restoreCheckboxStates() {
  for (const toggle of getAllStaticToggles()) {
    const defaultValue = DEFAULT_CHECKBOX_STATE.get(toggle.id);
    if (defaultValue !== undefined) {
      toggle.checked = defaultValue;
    }
  }
  resetComponentFolderFilterState(false);
}

function selectNode(nodeId) {
  if (selectedNodeId === nodeId) {
    openNodeFile(nodeId);
    return;
  }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return;
  }

  selectedNodeId = nodeId;
  setAllCheckboxesChecked();

  if (selectedNodeBadgeName) {
    selectedNodeBadgeName.textContent = node.path;
  }
  if (selectedNodeBadge) {
    selectedNodeBadge.hidden = false;
  }

  rerenderGraphWithLayoutReset();
}

function deselectNode() {
  selectedNodeId = null;
  restoreCheckboxStates();

  if (selectedNodeBadge) {
    selectedNodeBadge.hidden = true;
  }

  rerenderGraphWithLayoutReset();
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

if (testsToggle) {
  testsToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (storiesToggle) {
  storiesToggle.addEventListener('change', rerenderGraphWithLayoutReset);
}

if (appEntryToggle) {
  appEntryToggle.addEventListener('change', rerenderGraphWithLayoutReset);
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

if (folderPathsToggle) {
  folderPathsToggle.addEventListener('change', () => {
    shouldFitViewportOnRender = true;
    renderGraph();
  });
}

if (zoomOutButton) {
  zoomOutButton.addEventListener('click', () => {
    setZoom(viewportState.scale * 0.9);
  });
}

if (fitViewportButton) {
  fitViewportButton.addEventListener('click', () => {
    shouldFitViewportOnRender = true;
    renderGraph();
  });
}

if (zoomResetButton) {
  zoomResetButton.addEventListener('click', () => {
    if (selectedNodeId) {
      setAllCheckboxesChecked();
    } else {
      restoreCheckboxStates();
    }
    rerenderGraphWithLayoutReset();
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

if (deselectNodeButton) {
  deselectNodeButton.addEventListener('click', deselectNode);
}

for (const btn of document.querySelectorAll('.toggle-all-btn')) {
  btn.addEventListener('click', () => {
    const section = btn.getAttribute('data-section');
    const checked = btn.getAttribute('data-action') === 'all';

    if (section === 'graph') {
      for (const id of ['isolated-toggle', 'labels-toggle', 'folder-paths-toggle', 'tests-toggle', 'stories-toggle']) {
        const el = document.getElementById(id);
        if (el) { el.checked = checked; }
      }
    } else if (section === 'architecture') {
      for (const id of ['app-entry-toggle', 'router-toggle', 'services-toggle', 'stores-toggle', 'composable-ts-toggle', 'view-components-toggle']) {
        const el = document.getElementById(id);
        if (el) { el.checked = checked; }
      }
    } else if (section === 'component-folders') {
      for (const key of componentFolderFilterState.keys()) {
        componentFolderFilterState.set(key, checked);
      }
      renderComponentFolderToggles();
    }

    rerenderGraphWithLayoutReset();
  });
}

renderComponentFolderToggles();
window.addEventListener('resize', () => {
  shouldFitViewportOnRender = true;
  renderGraph();
});
renderGraph();