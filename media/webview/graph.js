const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const graphPayloadElement = document.getElementById('graph-payload');
const graphCanvas = document.getElementById('graph-canvas');
const emptyState = document.getElementById('empty-state');
const isolatedToggle = document.getElementById('isolated-toggle');
const labelsToggle = document.getElementById('labels-toggle');
const detailsTitle = document.getElementById('details-title');
const detailsPath = document.getElementById('details-path');
const detailsKind = document.getElementById('details-kind');
const detailsOutgoing = document.getElementById('details-outgoing');
const detailsIncoming = document.getElementById('details-incoming');
const openFileButton = document.getElementById('open-file-button');

const graph = parsePayload(graphPayloadElement);
let selectedNodeId = null;
let visibleNodes = [];
let visibleEdges = [];

if (graphCanvas) {
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

  if (!visibleNodeIds.has(selectedNodeId)) {
    selectedNodeId = null;
    renderDetails(null);
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

function radiusForNode(node) {
  return 10 + Math.min(18, (node.importCount + node.importedByCount) * 1.35);
}

function renderGraph() {
  if (!graphCanvas) {
    return;
  }

  updateVisibleGraph();

  if (visibleNodes.length === 0) {
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

  const positions = createLayout(visibleNodes, width, height);
  const showLabels = Boolean(labelsToggle?.checked);

  graphCanvas.innerHTML = [
    renderEdges(visibleEdges, positions),
    renderNodes(visibleNodes, positions, showLabels)
  ].join('');

  syncSelectedNode();
}

function handleGraphClick(event) {
  const nodeElement = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  const nodeId = nodeElement?.getAttribute('data-node-id');
  if (!nodeId) {
    return;
  }

  selectedNodeId = nodeId;
  renderDetails(visibleNodes.find((node) => node.id === nodeId) || null);
  syncSelectedNode();
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

function renderDetails(node) {
  if (!detailsTitle || !detailsPath || !detailsKind || !detailsOutgoing || !detailsIncoming || !openFileButton) {
    return;
  }

  if (!node) {
    detailsTitle.textContent = 'Select a file';
    detailsPath.textContent = 'Click a node to inspect its relation counts and open the file.';
    detailsKind.textContent = '-';
    detailsOutgoing.textContent = '-';
    detailsIncoming.textContent = '-';
    openFileButton.disabled = true;
    return;
  }

  detailsTitle.textContent = node.label;
  detailsPath.textContent = node.path;
  detailsKind.textContent = node.kind === 'vue' ? 'Vue file' : 'TypeScript file';
  detailsOutgoing.textContent = String(node.importCount);
  detailsIncoming.textContent = String(node.importedByCount);
  openFileButton.disabled = false;
}

function syncSelectedNode() {
  if (!graphCanvas) {
    return;
  }

  for (const nodeElement of graphCanvas.querySelectorAll('.graph-node')) {
    nodeElement.classList.toggle('is-selected', nodeElement.getAttribute('data-node-id') === selectedNodeId);
  }

  for (const edgeElement of graphCanvas.querySelectorAll('.graph-edge')) {
    const isConnected = selectedNodeId
      ? edgeElement instanceof Element
        && (visibleEdges.some((edge) => edge.id === edgeElement.getAttribute('data-edge-id') && (edge.source === selectedNodeId || edge.target === selectedNodeId)))
      : false;
    edgeElement.classList.toggle('is-connected', isConnected);
  }
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

if (openFileButton) {
  openFileButton.addEventListener('click', () => {
    if (!selectedNodeId || !vscode) {
      return;
    }

    vscode.postMessage({ type: 'openFile', path: selectedNodeId });
  });
}

window.addEventListener('resize', renderGraph);
renderGraph();