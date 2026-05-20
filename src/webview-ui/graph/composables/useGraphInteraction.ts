import { reactive, ref } from 'vue';
import type { ProjectGraphNode, NodePosition } from '../types';

export const DRAG_THRESHOLD = 4;

export interface InteractionState {
  pointerId: number | null;
  mode: 'node' | 'pan' | null;
  nodeId: string | null;
  startClientX: number;
  startClientY: number;
  nodeOffsetX: number;
  nodeOffsetY: number;
  startTx: number;
  startTy: number;
  moved: boolean;
}

export function useGraphInteraction(
  canvasEl: () => SVGSVGElement | null,
  currentPositions: Map<string, NodePosition>,
  clientToGraphPoint: (x: number, y: number) => { x: number; y: number },
  viewBoxScaleX: () => number,
  viewBoxScaleY: () => number,
  viewportTx: () => number,
  viewportTy: () => number,
  setViewportTx: (v: number) => void,
  setViewportTy: (v: number) => void,
  applyViewportTransform: (g: SVGGElement | null) => void,
  viewportGroup: () => SVGGElement | null,
) {
  const interactionState = reactive<InteractionState>({
    pointerId: null,
    mode: null,
    nodeId: null,
    startClientX: 0,
    startClientY: 0,
    nodeOffsetX: 0,
    nodeOffsetY: 0,
    startTx: 0,
    startTy: 0,
    moved: false,
  });

  const suppressNextClick = ref(false);

  function findNodeElement(nodeId: string): Element | null {
    const canvas = canvasEl();
    if (!canvas) return null;
    for (const el of canvas.querySelectorAll('[data-node-id]')) {
      if (el.getAttribute('data-node-id') === nodeId) return el;
    }
    return null;
  }

  function updateNodeDom(
    nodeId: string,
    visibleNodes: ProjectGraphNode[],
  ) {
    const canvas = canvasEl();
    const node = visibleNodes.find((n) => n.id === nodeId);
    const position = currentPositions.get(nodeId);
    const nodeElement = findNodeElement(nodeId);
    if (!canvas || !node || !position || !nodeElement) return;

    const circle = nodeElement.querySelector('circle');
    if (circle) {
      circle.setAttribute('cx', position.x.toFixed(2));
      circle.setAttribute('cy', position.y.toFixed(2));
    }

    const label = nodeElement.querySelector('.graph-label');
    if (label) {
      const radius = 10 + Math.min(18, (node.importCount + node.importedByCount) * 1.35);
      label.setAttribute('x', position.x.toFixed(2));
      label.setAttribute('y', (position.y + radius + 16).toFixed(2));
    }
  }

  function updateConnectedEdgeDom(
    nodeId: string,
    connectedEdgesByNodeId: Map<string, { id: string; source: string; target: string }[]>,
  ) {
    const canvas = canvasEl();
    if (!canvas) return;
    const connectedEdges = connectedEdgesByNodeId.get(nodeId) ?? [];
    for (const edge of connectedEdges) {
      const source = currentPositions.get(edge.source);
      const target = currentPositions.get(edge.target);
      let edgeEl: Element | null = null;
      for (const el of canvas.querySelectorAll('[data-edge-id]')) {
        if (el.getAttribute('data-edge-id') === edge.id) { edgeEl = el; break; }
      }
      if (!source || !target || !edgeEl) continue;
      edgeEl.setAttribute('x1', source.x.toFixed(2));
      edgeEl.setAttribute('y1', source.y.toFixed(2));
      edgeEl.setAttribute('x2', target.x.toFixed(2));
      edgeEl.setAttribute('y2', target.y.toFixed(2));
    }
  }

  function resetInteractionState() {
    const canvas = canvasEl();
    if (canvas) {
      canvas.classList.remove('is-panning');
      if (interactionState.nodeId) {
        findNodeElement(interactionState.nodeId)?.classList.remove('is-dragging');
      }
    }
    interactionState.pointerId = null;
    interactionState.mode = null;
    interactionState.nodeId = null;
    interactionState.startClientX = 0;
    interactionState.startClientY = 0;
    interactionState.nodeOffsetX = 0;
    interactionState.nodeOffsetY = 0;
    interactionState.startTx = viewportTx();
    interactionState.startTy = viewportTy();
    interactionState.moved = false;
  }

  function handlePointerDown(
    event: PointerEvent,
  ) {
    const canvas = canvasEl();
    if (!canvas || event.button !== 0) return;

    const nodeElement = event.target instanceof Element ? event.target.closest('.graph-node') : null;
    const graphPoint = clientToGraphPoint(event.clientX, event.clientY);

    interactionState.pointerId = event.pointerId;
    interactionState.mode = nodeElement ? 'node' : 'pan';
    interactionState.nodeId = nodeElement?.getAttribute('data-node-id') ?? null;
    interactionState.startClientX = event.clientX;
    interactionState.startClientY = event.clientY;
    interactionState.nodeOffsetX = 0;
    interactionState.nodeOffsetY = 0;
    interactionState.startTx = viewportTx();
    interactionState.startTy = viewportTy();
    interactionState.moved = false;

    if (interactionState.nodeId) {
      const nodePosition = currentPositions.get(interactionState.nodeId);
      if (nodePosition) {
        interactionState.nodeOffsetX = graphPoint.x - nodePosition.x;
        interactionState.nodeOffsetY = graphPoint.y - nodePosition.y;
      }
    }

    if (interactionState.mode === 'pan') canvas.classList.add('is-panning');
    if (interactionState.nodeId) nodeElement?.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(
    event: PointerEvent,
    visibleNodes: ProjectGraphNode[],
    connectedEdgesByNodeId: Map<string, { id: string; source: string; target: string }[]>,
  ) {
    if (interactionState.pointerId !== event.pointerId || !interactionState.mode) return;

    const deltaX = event.clientX - interactionState.startClientX;
    const deltaY = event.clientY - interactionState.startClientY;

    if (!interactionState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
      interactionState.moved = true;
      suppressNextClick.value = true;
    }

    if (interactionState.mode === 'pan') {
      if (!interactionState.moved) return;
      setViewportTx(interactionState.startTx + deltaX * viewBoxScaleX());
      setViewportTy(interactionState.startTy + deltaY * viewBoxScaleY());
      applyViewportTransform(viewportGroup());
      return;
    }

    if (!interactionState.nodeId || !interactionState.moved) return;
    const graphPoint = clientToGraphPoint(event.clientX, event.clientY);
    const nodePosition = currentPositions.get(interactionState.nodeId);
    if (!nodePosition) return;

    nodePosition.x = graphPoint.x - interactionState.nodeOffsetX;
    nodePosition.y = graphPoint.y - interactionState.nodeOffsetY;
    updateNodeDom(interactionState.nodeId, visibleNodes);
    updateConnectedEdgeDom(interactionState.nodeId, connectedEdgesByNodeId);
  }

  function handlePointerUp(
    event: PointerEvent,
    onNodeClick: (nodeId: string) => void,
  ) {
    const canvas = canvasEl();
    if (!canvas || interactionState.pointerId !== event.pointerId) return;

    const shouldOpenNode = interactionState.mode === 'node' && !interactionState.moved;
    const nodeId = interactionState.nodeId;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    resetInteractionState();

    if (shouldOpenNode && nodeId) onNodeClick(nodeId);
  }

  return {
    interactionState,
    suppressNextClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetInteractionState,
  };
}
