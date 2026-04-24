const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const graphPayloadElement = document.getElementById('graph-payload');
const graphCanvas = document.getElementById('graph-canvas');
const emptyState = document.getElementById('empty-state');
const isolatedToggle = document.getElementById('isolated-toggle');
const labelsToggle = document.getElementById('labels-toggle');
const zoomOutButton = document.getElementById('zoom-out-button');
const zoomResetButton = document.getElementById('zoom-reset-button');
const zoomInButton = document.getElementById('zoom-in-button');

const graph = parsePayload(graphPayloadElement);
const currentPositions = new Map();

let visibleNodes = [];
let visibleEdges = [];
let connectedEdgesByNodeId = new Map();
let viewportGroup = null;
let suppressNextClick = false;

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
  graphCanvas.addEventListener('click', handleGraphClick);
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
  const connectedNodeIds = new Set();

  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  visibleNodes = graph.nodes.filter((node) => !hideIsolated || connectedNodeIds.has(node.id));
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

function createLayout(nodes, width, height) {
  if (nodes.length === 0) {
    return new Map();
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.34;
  const ringGap = Math.max(54, Math.min(width, height) * 0.06);
  const layers = new Map();

  for (const node of nodes) {
    const depth = node.path.split('/').length - 1;
    const key = String(depth);
    const bucket = layers.get(key) || [];
    bucket.push(node);
    layers.set(key, bucket);
  }

  const positions = new Map();
  const orderedLayers = Array.from(layers.entries()).sort((left, right) => Number(left[0]) - Number(right[0]));

  orderedLayers.forEach(([depth, layerNodes], layerIndex) => {
    layerNodes.sort((left, right) => left.path.localeCompare(right.path));
    const radius = baseRadius + layerIndex * ringGap;

    layerNodes.forEach((node, nodeIndex) => {
      const angle = ((Math.PI * 2) / layerNodes.length) * nodeIndex - Math.PI / 2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        depth: Number(depth)
      });
    });
  });

  return positions;
}

function ensureNodePositions(width, height) {
  const layoutPositions = createLayout(graph.nodes, width, height);

  for (const node of graph.nodes) {
    if (!currentPositions.has(node.id)) {
      currentPositions.set(node.id, layoutPositions.get(node.id));
    }
  }

  const knownNodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const nodeId of currentPositions.keys()) {
    if (!knownNodeIds.has(nodeId)) {
      currentPositions.delete(nodeId);
    }
  }
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

  ensureNodePositions(width, height);
  const positions = visiblePositions();
  const showLabels = Boolean(labelsToggle?.checked);

  graphCanvas.innerHTML = '<g id="graph-viewport" class="graph-viewport">'
    + renderEdges(visibleEdges, positions)
    + renderNodes(visibleNodes, positions, showLabels)
    + '</g>';

  viewportGroup = graphCanvas.querySelector('#graph-viewport');
  applyViewportTransform();
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

    return '<g class="graph-node graph-node--' + node.kind + '" data-node-id="' + escapeHtml(node.id) + '">'
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

  if (graphCanvas.hasPointerCapture(event.pointerId)) {
    graphCanvas.releasePointerCapture(event.pointerId);
  }

  resetInteractionState();
}

function resetInteractionState() {
  if (!graphCanvas) {
    return;
  }

  graphCanvas.classList.remove('is-panning');

  if (interactionState.nodeId) {
    const nodeElement = graphCanvas.querySelector('[data-node-id="' + escapeHtml(interactionState.nodeId) + '"]');
    nodeElement?.classList.remove('is-dragging');
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

function handleGraphClick(event) {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  const nodeElement = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  const nodeId = nodeElement?.getAttribute('data-node-id');
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
  isolatedToggle.addEventListener('change', renderGraph);
}

if (labelsToggle) {
  labelsToggle.addEventListener('change', renderGraph);
}

if (zoomOutButton) {
  zoomOutButton.addEventListener('click', () => {
    setZoom(viewportState.scale * 0.9);
  });
}

if (zoomResetButton) {
  zoomResetButton.addEventListener('click', () => {
    viewportState.scale = 1;
    viewportState.tx = 0;
    viewportState.ty = 0;
    applyViewportTransform();
  });
}

if (zoomInButton) {
  zoomInButton.addEventListener('click', () => {
    setZoom(viewportState.scale * 1.1);
  });
}

window.addEventListener('resize', renderGraph);
renderGraph();