import type { ProjectGraphNode, ProjectGraphEdge, NodePosition } from '../types';

const VERTICAL_LAYOUT_MULTIPLIER = 1;
const HORIZONTAL_NODE_GAP_MULTIPLIER = 6.4;

export function radiusForNode(node: ProjectGraphNode): number {
  return 10 + Math.min(18, (node.importCount + node.importedByCount) * 1.35);
}

export function createFocusLayout(
  centerNodeId: string,
  nodes: ProjectGraphNode[],
  width: number,
  height: number,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const centerX = width / 2;
  const centerY = height / 2;
  positions.set(centerNodeId, { x: centerX, y: centerY, depth: 0 });

  const surrounding = nodes.filter((n) => n.id !== centerNodeId);
  if (surrounding.length === 0) return positions;

  const orbitRadius = Math.min(width, height) * 0.35;
  surrounding.forEach((node, index) => {
    const angle = (index / surrounding.length) * (2 * Math.PI) - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + orbitRadius * Math.cos(angle),
      y: centerY + orbitRadius * Math.sin(angle),
      depth: 1,
    });
  });

  return positions;
}

function pathAfterSrcForLayout(path: string): string {
  if (path.startsWith('src/')) return path.slice(4);
  if (path.startsWith('app/')) return path.slice(4);
  return path;
}

export function createLayout(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
  width: number,
  height: number,
): Map<string, NodePosition> {
  if (nodes.length === 0) return new Map();

  const nodeIds = new Set(nodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const outgoingByNode = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const incomingByNode = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const edge of filteredEdges) {
    outgoingByNode.get(edge.source)!.push(edge.target);
    incomingByNode.get(edge.target)!.push(edge.source);
  }

  const preferredPaths = ['src/App.vue', 'src/main.ts', 'app/app.vue', 'app/App.vue'];
  const preferredPathSet = new Set(preferredPaths);
  const preferredPathRank = new Map(preferredPaths.map((p, i) => [p, i]));

  const levelByNode = new Map<string, number>();
  const workingInDeg = new Map(nodes.map((n) => [
    n.id,
    preferredPathSet.has(n.path) ? 0 : incomingByNode.get(n.id)!.length,
  ]));

  const queue: string[] = [];
  const enqueued = new Set<string>();
  for (const node of nodes) {
    if (workingInDeg.get(node.id) === 0) {
      levelByNode.set(node.id, 0);
      queue.push(node.id);
      enqueued.add(node.id);
    }
  }
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
      const proposed = currentLevel + 1;
      if (!levelByNode.has(targetId) || levelByNode.get(targetId)! < proposed) {
        levelByNode.set(targetId, proposed);
      }
      const newDeg = (workingInDeg.get(targetId) ?? 1) - 1;
      workingInDeg.set(targetId, newDeg);
      if (newDeg <= 0 && !enqueued.has(targetId)) {
        enqueued.add(targetId);
        queue.push(targetId);
      }
    }
  }

  const maxAssignedLevel = levelByNode.size > 0 ? Math.max(...levelByNode.values()) : 0;
  for (const node of nodes) {
    if (!levelByNode.has(node.id)) levelByNode.set(node.id, maxAssignedLevel + 1);
  }

  function getZone(node: ProjectGraphNode): 'left' | 'center' | 'right' {
    if (preferredPathSet.has(node.path)) return 'center';
    const p = pathAfterSrcForLayout(node.path);
    if (p.startsWith('stores/') || p.startsWith('store/')) return 'right';
    if (p.startsWith('services/')) return 'left';
    return 'center';
  }

  const connectionCount = new Map(nodes.map((n) => [
    n.id,
    (outgoingByNode.get(n.id)?.length ?? 0) + (incomingByNode.get(n.id)?.length ?? 0),
  ]));

  function compareByConnectivity(a: ProjectGraphNode, b: ProjectGraphNode): number {
    const connDelta = (connectionCount.get(b.id) ?? 0) - (connectionCount.get(a.id) ?? 0);
    if (connDelta !== 0) return connDelta;
    const rankA = preferredPathRank.get(a.path) ?? Number.MAX_SAFE_INTEGER;
    const rankB = preferredPathRank.get(b.path) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.path.localeCompare(b.path);
  }

  const rowsByLevel = new Map<number, { left: ProjectGraphNode[]; center: ProjectGraphNode[]; right: ProjectGraphNode[] }>();
  for (const node of nodes) {
    const lv = levelByNode.get(node.id) ?? 0;
    if (!rowsByLevel.has(lv)) rowsByLevel.set(lv, { left: [], center: [], right: [] });
    rowsByLevel.get(lv)![getZone(node)].push(node);
  }
  for (const row of rowsByLevel.values()) {
    row.left.sort(compareByConnectivity);
    row.center.sort(compareByConnectivity);
    row.right.sort(compareByConnectivity);
  }

  const sortedLevels = Array.from(rowsByLevel.keys()).sort((a, b) => a - b);
  const rowCount = sortedLevels.length;

  const topPadding = 90;
  const bottomPadding = 90;
  const leftPadding = 90;
  const rightPadding = 90;
  const availableWidth = Math.max(width - leftPadding - rightPadding, 1);
  const availableHeight = Math.max(height - topPadding - bottomPadding, 1);

  const gapWeights = sortedLevels.slice(0, -1).map((fromLevel, i) => {
    const toLevel = sortedLevels[i + 1];
    const fromRow = rowsByLevel.get(fromLevel)!;
    const toRow = rowsByLevel.get(toLevel)!;
    const nodesAtFrom = [...fromRow.left, ...fromRow.center, ...fromRow.right];
    const nodesAtTo = [...toRow.left, ...toRow.center, ...toRow.right];
    let maxChildren = 1;
    for (const node of nodesAtFrom) {
      const count = (outgoingByNode.get(node.id) ?? []).filter((id) => levelByNode.get(id) === toLevel).length;
      if (count > maxChildren) maxChildren = count;
    }
    return Math.max(nodesAtTo.length, maxChildren);
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

  const positions = new Map<string, NodePosition>();

  function placeRow(rowNodes: ProjectGraphNode[], y: number, startX: number, laneWidth: number) {
    if (rowNodes.length === 0) return;
    const laneCenter = startX + Math.max(laneWidth, 1) / 2;

    const idealByNode = new Map<string, number>();
    for (const node of rowNodes) {
      const parents = incomingByNode.get(node.id) ?? [];
      const placed = parents.map((id) => positions.get(id)).filter((p): p is NodePosition => Boolean(p));
      if (placed.length > 0) {
        idealByNode.set(node.id, placed.reduce((s, p) => s + p.x, 0) / placed.length);
      }
    }
    const hasIdeal = idealByNode.size > 0;

    const sorted = [...rowNodes].sort((a, b) => {
      const ia = idealByNode.get(a.id);
      const ib = idealByNode.get(b.id);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return compareByConnectivity(a, b);
    });

    const radii = sorted.map((n) => radiusForNode(n));

    if (sorted.length === 1) {
      const idealX = idealByNode.get(sorted[0].id) ?? laneCenter;
      const minX = leftPadding + radii[0];
      const maxX = width - rightPadding - radii[0];
      positions.set(sorted[0].id, { x: Math.min(Math.max(idealX, minX), maxX), y, depth: 0 });
      return;
    }

    const minSep = radii.slice(0, -1).map((_, i) => (radii[i] + radii[i + 1]) * HORIZONTAL_NODE_GAP_MULTIPLIER);
    const idealArr = sorted.map((n) => idealByNode.get(n.id) ?? null);
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

    const assignedX = [...filled] as number[];
    for (let i = 1; i < sorted.length; i++) assignedX[i] = Math.max(assignedX[i], assignedX[i - 1] + minSep[i - 1]);
    for (let i = sorted.length - 2; i >= 0; i--) assignedX[i] = Math.min(assignedX[i], assignedX[i + 1] - minSep[i]);

    let targetCenter: number;
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

    const firstMinX = leftPadding + radii[0];
    const lastMaxX = width - rightPadding - radii[sorted.length - 1];
    let shift = 0;
    if (assignedX[0] < firstMinX) shift = firstMinX - assignedX[0];
    if (assignedX[sorted.length - 1] + shift > lastMaxX) shift = lastMaxX - assignedX[sorted.length - 1];
    shift = Math.max(shift, firstMinX - assignedX[0]);

    for (let i = 0; i < sorted.length; i++) {
      positions.set(sorted[i].id, { x: assignedX[i] + shift, y, depth: 0 });
    }
  }

  sortedLevels.forEach((level, rowIndex) => {
    const row = rowsByLevel.get(level)!;
    const y = topPadding + cumulativeY[rowIndex];
    placeRow(row.center, y, centerZoneStart, centerZoneWidth);
    if (hasAnyLeft) placeRow(row.left, y, leftPadding, sideZoneWidth);
    if (hasAnyRight) placeRow(row.right, y, rightZoneStart, sideZoneWidth);
  });

  return positions;
}

export function ensureNodePositions(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
  currentPositions: Map<string, NodePosition>,
  selectedNodeId: string | null,
  width: number,
  height: number,
): void {
  const layoutPositions = selectedNodeId
    ? createFocusLayout(selectedNodeId, nodes, width, height)
    : createLayout(nodes, edges, width, height);

  for (const node of nodes) {
    if (!currentPositions.has(node.id)) {
      const pos = layoutPositions.get(node.id);
      if (pos) currentPositions.set(node.id, pos);
    }
  }

  const knownNodeIds = new Set(nodes.map((n) => n.id));
  for (const nodeId of currentPositions.keys()) {
    if (!knownNodeIds.has(nodeId)) currentPositions.delete(nodeId);
  }
}
