<template>
  <section class="panel graph-panel">
    <div class="graph-stage">
      <ZoomControls
        @zoom-out="onZoomOut"
        @zoom-in="onZoomIn"
        @fit="onFit"
        @reset="onReset"
      />
      <SelectedNodeBadge :node="selectedNode" @deselect="$emit('deselect-node')" />
      <svg
        ref="canvasEl"
        class="graph-canvas"
        :class="{ 'is-panning': isPanning, 'is-node-hovering': hoveredNodeId !== null }"
        aria-label="Project dependency graph"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @lostpointercapture="onLostCapture"
        @mouseover="onMouseOver"
        @mouseout="onMouseOut"
        @wheel.prevent="onWheel"
      ></svg>
      <div v-if="visibleNodes.length === 0" class="empty-state">
        No Vue or TypeScript relations were found in this workspace.
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import ZoomControls from './ZoomControls.vue';
import SelectedNodeBadge from './SelectedNodeBadge.vue';
import { useViewport, MIN_SCALE, MAX_SCALE, clamp } from '../composables/useViewport';
import { useGraphInteraction } from '../composables/useGraphInteraction';
import { ensureNodePositions, radiusForNode } from '../composables/useGraphLayout';
import { shortNodePath } from '../composables/useGraphFilters';
import type { ProjectGraphNode, ProjectGraphEdge, NodePosition, FilterState } from '../types';

const props = defineProps<{
  visibleNodes: ProjectGraphNode[];
  visibleEdges: ProjectGraphEdge[];
  connectedEdgesByNodeId: Map<string, ProjectGraphEdge[]>;
  allEdges: ProjectGraphEdge[];
  selectedNodeId: string | null;
  filters: FilterState;
}>();

const emit = defineEmits<{
  'select-node': [nodeId: string];
  'deselect-node': [];
  'open-file': [nodeId: string];
}>();

const canvasEl = ref<SVGSVGElement | null>(null);
const hoveredNodeId = ref<string | null>(null);
const isPanning = ref(false);
const currentPositions = new Map<string, NodePosition>();
let viewportGroup: SVGGElement | null = null;
let shouldFitViewportOnRender = true;

const selectedNode = computed(() =>
  props.selectedNodeId ? (props.visibleNodes.find((n) => n.id === props.selectedNodeId) ?? null) : null
);

const viewport = useViewport(() => canvasEl.value);

const interaction = useGraphInteraction(
  () => canvasEl.value,
  currentPositions,
  viewport.clientToGraphPoint,
  viewport.viewBoxScaleX,
  viewport.viewBoxScaleY,
  () => viewport.state.tx,
  () => viewport.state.ty,
  (v) => { viewport.state.tx = v; },
  (v) => { viewport.state.ty = v; },
  viewport.applyViewportTransform,
  () => viewportGroup,
);

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const LABEL_MAX_CHARS = 14;
const LABEL_LINE_HEIGHT = 14;

function findBreakPoints(text: string): number[] {
  const points: number[] = [];
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1];
    const curr = text[i];
    if (prev === '/' || prev === '_' || prev === '-') {
      points.push(i);
    } else if (curr === '.') {
      points.push(i);
    } else if (/[a-z]/.test(prev) && /[A-Z]/.test(curr)) {
      points.push(i);
    }
  }
  return points;
}

function wrapLabelText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const breakPoints = findBreakPoints(text);
  const naturalBreak = [...breakPoints].reverse().find((p) => p <= maxChars && p > 0);
  if (naturalBreak !== undefined) {
    return [text.slice(0, naturalBreak), ...wrapLabelText(text.slice(naturalBreak), maxChars)];
  }

  const nextBreak = breakPoints.find((p) => p > maxChars);
  if (nextBreak !== undefined) {
    return [text.slice(0, nextBreak), ...wrapLabelText(text.slice(nextBreak), maxChars)];
  }

  return [text.slice(0, maxChars), ...wrapLabelText(text.slice(maxChars), maxChars)];
}

function buildLabelInnerHtml(text: string, centerX: number, maxChars: number = LABEL_MAX_CHARS): string {
  const lines = wrapLabelText(text, maxChars);
  return lines.map((line, i) =>
    `<tspan x="${centerX.toFixed(2)}" dy="${i === 0 ? 0 : LABEL_LINE_HEIGHT}">${escapeHtml(line)}</tspan>`
  ).join('');
}

function renderEdges(edges: ProjectGraphEdge[], positions: Map<string, NodePosition>): string {
  return edges.map((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return '';
    return `<line class="graph-edge${edge.kind === 'dynamic-import' ? ' graph-edge--dynamic' : ''}" `
      + `data-edge-id="${escapeHtml(edge.id)}" `
      + `x1="${source.x.toFixed(2)}" y1="${source.y.toFixed(2)}" `
      + `x2="${target.x.toFixed(2)}" y2="${target.y.toFixed(2)}"></line>`;
  }).join('');
}

function renderNodes(
  nodes: ProjectGraphNode[],
  positions: Map<string, NodePosition>,
  showLabels: boolean,
  showFolderPaths: boolean,
): string {
  return nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position) return '';
    const radius = radiusForNode(node);
    const shortPath = shortNodePath(node);
    const displayLabel = showFolderPaths ? shortPath : node.label;
    const labelHidden = !showLabels && !showFolderPaths;
    const labelClassName = labelHidden ? 'graph-label is-hidden' : 'graph-label';
    const labelContent = buildLabelInnerHtml(displayLabel, position.x);
    const label = `<text class="${labelClassName}" x="${position.x.toFixed(2)}" y="${(position.y + radius + 16).toFixed(2)}">${labelContent}</text>`;

    return `<g class="graph-node graph-node--${node.color}${node.virtual ? ' graph-node--virtual' : ''}" `
      + `data-node-id="${escapeHtml(node.id)}" `
      + `data-node-label="${escapeHtml(node.label)}" `
      + `data-node-path="${escapeHtml(node.path)}" `
      + `data-node-short-path="${escapeHtml(shortPath)}">`
      + `<circle cx="${position.x.toFixed(2)}" cy="${position.y.toFixed(2)}" r="${radius.toFixed(2)}"></circle>`
      + label
      + '</g>';
  }).join('');
}

function visiblePositions(): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  for (const node of props.visibleNodes) {
    const position = currentPositions.get(node.id);
    if (position) positions.set(node.id, position);
  }
  return positions;
}

function renderGraph() {
  const canvas = canvasEl.value;
  if (!canvas) return;

  if (props.visibleNodes.length === 0) {
    viewportGroup = null;
    canvas.innerHTML = '';
    canvas.setAttribute('viewBox', '0 0 1200 720');
    return;
  }

  const width = Math.max(canvas.clientWidth || 1200, 720);
  const height = Math.max(canvas.clientHeight || 720, 520);
  canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);

  ensureNodePositions(props.visibleNodes, props.allEdges, currentPositions, props.selectedNodeId, width, height);
  const positions = visiblePositions();
  const showLabels = props.filters.showLabels;
  const showFolderPaths = props.filters.showFolderPaths;

  canvas.innerHTML = '<g id="graph-viewport" class="graph-viewport">'
    + renderEdges(props.visibleEdges, positions)
    + renderNodes(props.visibleNodes, positions, showLabels, showFolderPaths)
    + '</g>';

  viewportGroup = canvas.querySelector<SVGGElement>('#graph-viewport');
  applyHoveredNodeState();

  if (shouldFitViewportOnRender) {
    viewport.fitViewportToVisibleGraph(props.visibleNodes, currentPositions, showLabels || showFolderPaths, viewportGroup);
    shouldFitViewportOnRender = false;
  }
  viewport.applyViewportTransform(viewportGroup);
}

function rerenderWithLayoutReset() {
  currentPositions.clear();
  viewport.resetViewport();
  shouldFitViewportOnRender = true;
  renderGraph();
}

function applyHoveredNodeState() {
  const canvas = canvasEl.value;
  if (!canvas) return;

  const hasHovered = Boolean(hoveredNodeId.value) && props.visibleNodes.some((n) => n.id === hoveredNodeId.value);
  const showLabels = props.filters.showLabels;
  const showFolderPaths = props.filters.showFolderPaths;
  const connectedEdges = hasHovered ? (props.connectedEdgesByNodeId.get(hoveredNodeId.value!) ?? []) : [];
  const hoveredEdgeIds = new Set(connectedEdges.map((e) => e.id));
  const connectedNodeIds = new Set(
    connectedEdges.flatMap((e) => [e.source, e.target]).filter((id) => id !== hoveredNodeId.value)
  );

  for (const nodeEl of canvas.querySelectorAll<Element>('.graph-node')) {
    const id = nodeEl.getAttribute('data-node-id') ?? '';
    const isHovered = hasHovered && id === hoveredNodeId.value;
    const isConnected = hasHovered && connectedNodeIds.has(id);
    nodeEl.classList.toggle('is-hovered', isHovered);
    nodeEl.classList.toggle('is-connected', isConnected);

    const labelEl = nodeEl.querySelector('.graph-label');
    if (labelEl) {
      const shouldShowPath = isHovered || isConnected;
      const shortPath = nodeEl.getAttribute('data-node-short-path') ?? '';
      const nodeLabel = nodeEl.getAttribute('data-node-label') ?? '';
      const defaultLabel = showFolderPaths ? (shortPath || nodeLabel) : nodeLabel;
      const fullPath = nodeEl.getAttribute('data-node-path') ?? defaultLabel;
      const text = shouldShowPath ? fullPath : defaultLabel;
      const cx = parseFloat((labelEl as SVGTextElement).getAttribute('x') ?? '0');
      labelEl.innerHTML = buildLabelInnerHtml(text, cx, shouldShowPath ? 20 : LABEL_MAX_CHARS);
      labelEl.classList.toggle('graph-label--path', shouldShowPath);
      labelEl.classList.toggle('is-hidden', !showLabels && !showFolderPaths && !shouldShowPath);
    }
  }

  for (const edgeEl of canvas.querySelectorAll<Element>('.graph-edge')) {
    const isHovered = hasHovered && hoveredEdgeIds.has(edgeEl.getAttribute('data-edge-id') ?? '');
    edgeEl.classList.toggle('is-hovered', isHovered);
  }
}

function onPointerDown(event: PointerEvent) {
  isPanning.value = false;
  interaction.handlePointerDown(event);
  if (interaction.interactionState.mode === 'pan') isPanning.value = true;
}

function onPointerMove(event: PointerEvent) {
  interaction.handlePointerMove(event, props.visibleNodes, props.connectedEdgesByNodeId);
}

function onPointerUp(event: PointerEvent) {
  interaction.handlePointerUp(event, (nodeId) => {
    const node = props.visibleNodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (props.selectedNodeId === nodeId) {
      if (!node.virtual) emit('open-file', nodeId);
    } else {
      emit('select-node', nodeId);
    }
  });
  isPanning.value = false;
}

function onLostCapture() {
  interaction.resetInteractionState();
  isPanning.value = false;
}

function onMouseOver(event: MouseEvent) {
  const nodeEl = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  if (!nodeEl) return;
  hoveredNodeId.value = nodeEl.getAttribute('data-node-id');
  applyHoveredNodeState();
}

function onMouseOut(event: MouseEvent) {
  const nodeEl = event.target instanceof Element ? event.target.closest('.graph-node') : null;
  if (!nodeEl) return;
  const relatedNodeEl = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.graph-node') : null;
  if (relatedNodeEl === nodeEl) return;
  hoveredNodeId.value = relatedNodeEl ? relatedNodeEl.getAttribute('data-node-id') : null;
  applyHoveredNodeState();
}

function onWheel(event: WheelEvent) {
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
  viewport.setZoom(viewport.state.scale * factor, viewportGroup);
}

function onZoomOut() { viewport.setZoom(viewport.state.scale * 0.9, viewportGroup); }
function onZoomIn() { viewport.setZoom(viewport.state.scale * 1.1, viewportGroup); }
function onFit() {
  shouldFitViewportOnRender = true;
  renderGraph();
}
function onReset() {
  emit('deselect-node');
}

function onResize() {
  shouldFitViewportOnRender = true;
  renderGraph();
}

watch(
  () => [props.visibleNodes, props.visibleEdges, props.filters.showLabels, props.filters.showFolderPaths],
  () => {
    shouldFitViewportOnRender = true;
    rerenderWithLayoutReset();
  },
  { deep: false }
);

watch(
  () => props.selectedNodeId,
  () => rerenderWithLayoutReset(),
);

onMounted(() => {
  renderGraph();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});

defineExpose({ rerenderWithLayoutReset });
</script>
