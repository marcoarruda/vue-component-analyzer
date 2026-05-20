import { reactive } from 'vue';
import type { ProjectGraphNode, NodePosition } from '../types';
import { radiusForNode } from './useGraphLayout';

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 4;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useViewport(canvasEl: () => SVGSVGElement | null) {
  const state = reactive({ scale: 1, tx: 0, ty: 0 });

  function currentViewBox() {
    const rawValue = canvasEl()?.getAttribute('viewBox') ?? '0 0 1200 720';
    const [x, y, width, height] = rawValue.split(/\s+/).map(Number);
    return { x, y, width, height };
  }

  function viewBoxScaleX(): number {
    const canvas = canvasEl();
    if (!canvas) return 1;
    const { width } = currentViewBox();
    const rect = canvas.getBoundingClientRect();
    return width / (rect.width || width);
  }

  function viewBoxScaleY(): number {
    const canvas = canvasEl();
    if (!canvas) return 1;
    const { height } = currentViewBox();
    const rect = canvas.getBoundingClientRect();
    return height / (rect.height || height);
  }

  function clientToSvgPoint(clientX: number, clientY: number) {
    const canvas = canvasEl();
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    const { x, y, width, height } = currentViewBox();
    return {
      x: x + ((clientX - rect.left) / rect.width) * width,
      y: y + ((clientY - rect.top) / rect.height) * height,
    };
  }

  function clientToGraphPoint(clientX: number, clientY: number) {
    const svgPoint = clientToSvgPoint(clientX, clientY);
    return {
      x: (svgPoint.x - state.tx) / state.scale,
      y: (svgPoint.y - state.ty) / state.scale,
    };
  }

  function viewportCenterInGraphSpace() {
    const box = currentViewBox();
    return {
      x: (box.x + box.width / 2 - state.tx) / state.scale,
      y: (box.y + box.height / 2 - state.ty) / state.scale,
    };
  }

  function applyViewportTransform(viewportGroup: SVGGElement | null) {
    if (!viewportGroup) return;
    viewportGroup.setAttribute(
      'transform',
      `matrix(${state.scale} 0 0 ${state.scale} ${state.tx} ${state.ty})`,
    );
  }

  function setZoom(nextScale: number, viewportGroup: SVGGElement | null) {
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const center = viewportCenterInGraphSpace();
    state.scale = clamped;
    const box = currentViewBox();
    state.tx = box.x + box.width / 2 - center.x * state.scale;
    state.ty = box.y + box.height / 2 - center.y * state.scale;
    applyViewportTransform(viewportGroup);
  }

  function getVisibleGraphBounds(
    visibleNodes: ProjectGraphNode[],
    currentPositions: Map<string, NodePosition>,
    showLabels: boolean,
  ) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of visibleNodes) {
      const position = currentPositions.get(node.id);
      if (!position) continue;
      const radius = radiusForNode(node);
      minX = Math.min(minX, position.x - radius);
      minY = Math.min(minY, position.y - radius);
      maxX = Math.max(maxX, position.x + radius);
      maxY = Math.max(maxY, position.y + radius + (showLabels ? 24 : 0));
    }

    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return { minX, minY, maxX, maxY };
  }

  function fitViewportToVisibleGraph(
    visibleNodes: ProjectGraphNode[],
    currentPositions: Map<string, NodePosition>,
    showLabels: boolean,
    viewportGroup: SVGGElement | null,
  ) {
    if (!canvasEl() || !viewportGroup || visibleNodes.length === 0) return;
    const bounds = getVisibleGraphBounds(visibleNodes, currentPositions, showLabels);
    const box = currentViewBox();
    const padding = 48;
    const availableWidth = Math.max(box.width - padding * 2, 1);
    const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const fitScale = availableWidth / graphWidth;
    const nextScale = clamp(Math.min(1, fitScale), MIN_SCALE, MAX_SCALE);
    const graphCenterX = (bounds.minX + bounds.maxX) / 2;
    const graphCenterY = (bounds.minY + bounds.maxY) / 2;
    const viewCenterX = box.x + box.width / 2;
    const viewCenterY = box.y + box.height / 2;

    state.scale = nextScale;
    state.tx = viewCenterX - graphCenterX * nextScale;
    state.ty = viewCenterY - graphCenterY * nextScale;
    applyViewportTransform(viewportGroup);
  }

  function resetViewport() {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
  }

  return {
    state,
    currentViewBox,
    viewBoxScaleX,
    viewBoxScaleY,
    clientToGraphPoint,
    applyViewportTransform,
    setZoom,
    fitViewportToVisibleGraph,
    resetViewport,
  };
}
