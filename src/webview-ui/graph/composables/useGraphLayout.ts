import type { ProjectGraphNode, ProjectGraphEdge, NodePosition } from '../types';

// Minimum gap between circle edges of sibling nodes
const MIN_NODE_GAP = 80;
// Extra gap inserted between separate root subtrees
const ROOT_EXTRA_GAP = 72;
// Vertical distance between levels
const LEVEL_HEIGHT = 155;

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

export function createLayout(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
  width: number,
  _height: number,
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

  // Preferred entry points forced to level 0
  const preferredPaths = ['src/App.vue', 'src/main.ts', 'app/app.vue', 'app/App.vue'];
  const preferredPathSet = new Set(preferredPaths);
  const preferredPathRank = new Map(preferredPaths.map((p, i) => [p, i]));

  // --- Level assignment via topological sort ---
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
      // Use minimum level: first parent to process a node (always the shallowest in BFS
      // order) sets the level. Keeps nodes as high as possible, avoiding vertical stretch.
      if (!levelByNode.has(targetId)) {
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

  const maxLevel = levelByNode.size > 0 ? Math.max(...levelByNode.values()) : 0;
  for (const node of nodes) {
    if (!levelByNode.has(node.id)) levelByNode.set(node.id, maxLevel + 1);
  }

  // --- Connection count for tie-breaking ---
  const connectionCount = new Map(nodes.map((n) => [
    n.id,
    (outgoingByNode.get(n.id)?.length ?? 0) + (incomingByNode.get(n.id)?.length ?? 0),
  ]));

  // --- Build spanning tree: each non-root node gets exactly one primary parent ---
  // Primary parent is chosen from parents at level-1: prefer preferred paths, then most connected.
  const spanningChildren = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const assignedParent = new Set<string>();

  for (let level = 1; level <= maxLevel; level++) {
    const nodesAtLevel = nodes.filter((n) => levelByNode.get(n.id) === level);
    for (const node of nodesAtLevel) {
      if (assignedParent.has(node.id)) continue;
      const parents = (incomingByNode.get(node.id) ?? []).filter(
        (p) => levelByNode.get(p) === level - 1,
      );
      if (parents.length === 0) continue;
      const primary = [...parents].sort((a, b) => {
        const rankA = preferredPathRank.get(nodesById.get(a)?.path ?? '') ?? Number.MAX_SAFE_INTEGER;
        const rankB = preferredPathRank.get(nodesById.get(b)?.path ?? '') ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return (connectionCount.get(b) ?? 0) - (connectionCount.get(a) ?? 0);
      })[0];
      spanningChildren.get(primary)!.push(node.id);
      assignedParent.add(node.id);
    }
  }

  // --- Count total descendants per node for child ordering ---
  const descendantCount = new Map<string, number>();
  function countDescendants(nodeId: string): number {
    if (descendantCount.has(nodeId)) return descendantCount.get(nodeId)!;
    const children = spanningChildren.get(nodeId) ?? [];
    const count = children.reduce((s, c) => s + 1 + countDescendants(c), 0);
    descendantCount.set(nodeId, count);
    return count;
  }
  for (const node of nodes) countDescendants(node.id);

  // Initial sort: heavy subtrees first, then alphabetically (used for preliminary layout).
  for (const [, children] of spanningChildren) {
    children.sort((a, b) => {
      const da = descendantCount.get(a) ?? 0;
      const db = descendantCount.get(b) ?? 0;
      if (da !== db) return db - da;
      return (nodesById.get(a)?.path ?? '').localeCompare(nodesById.get(b)?.path ?? '');
    });
  }

  // --- Slot width per node (includes MIN_NODE_GAP padding) ---
  // A leaf's slot = 2r + MIN_NODE_GAP (r gap on each side beyond the circle).
  // A parent's slot = sum of children slots (gap is already baked into leaf slots).
  // This guarantees exactly MIN_NODE_GAP between circle edges of adjacent siblings.
  const nodeRadii = new Map(nodes.map((n) => [n.id, radiusForNode(n)]));
  const slotWidths = new Map<string, number>();

  function calcSlotWidth(nodeId: string): number {
    if (slotWidths.has(nodeId)) return slotWidths.get(nodeId)!;
    const r = nodeRadii.get(nodeId)!;
    const children = spanningChildren.get(nodeId) ?? [];
    let w: number;
    if (children.length === 0) {
      w = r * 2 + MIN_NODE_GAP;
    } else {
      w = children.reduce((s, c) => s + calcSlotWidth(c), 0);
      // Parent slot must be at least as wide as its own node circle + gap
      w = Math.max(w, r * 2 + MIN_NODE_GAP);
    }
    slotWidths.set(nodeId, w);
    return w;
  }
  for (const node of nodes) calcSlotWidth(node.id);

  // --- Root nodes at level 0, sorted by preferred rank then connectivity ---
  const roots = nodes
    .filter((n) => levelByNode.get(n.id) === 0)
    .sort((a, b) => {
      const rankA = preferredPathRank.get(a.path) ?? Number.MAX_SAFE_INTEGER;
      const rankB = preferredPathRank.get(b.path) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return (connectionCount.get(b.id) ?? 0) - (connectionCount.get(a.id) ?? 0);
    });

  // Each node is centered in its slot; children fill consecutive sub-slots below.
  const topPadding = 90;
  const positions = new Map<string, NodePosition>();

  function assignPositions(nodeId: string, slotStartX: number, level: number): void {
    const slotW = slotWidths.get(nodeId)!;
    const centerX = slotStartX + slotW / 2;
    const y = topPadding + level * LEVEL_HEIGHT;
    positions.set(nodeId, { x: centerX, y, depth: level });

    const children = spanningChildren.get(nodeId) ?? [];
    let childSlotX = slotStartX;
    for (const childId of children) {
      const childSlotW = slotWidths.get(childId)!;
      assignPositions(childId, childSlotX, level + 1);
      childSlotX += childSlotW;
    }
  }

  const totalRootsWidth = roots.reduce((s, r) => s + slotWidths.get(r.id)!, 0)
    + ROOT_EXTRA_GAP * Math.max(roots.length - 1, 0);
  const initialRootSlotX = Math.max((width - totalRootsWidth) / 2, 20);

  // --- Pass 1: preliminary positions so we can compute each node's idealX ---
  let rootSlotX = initialRootSlotX;
  for (const root of roots) {
    assignPositions(root.id, rootSlotX, 0);
    rootSlotX += slotWidths.get(root.id)! + ROOT_EXTRA_GAP;
  }

  // --- Re-sort children: heavy subtrees first, then by idealX (mean x of all parents),
  //     then alphabetically. Nodes with parents spread across the graph are placed at the
  //     horizontal position closest to all of them, minimising long cross-tree edges. ---
  for (const [, children] of spanningChildren) {
    if (children.length <= 1) continue;
    children.sort((a, b) => {
      const da = descendantCount.get(a) ?? 0;
      const db = descendantCount.get(b) ?? 0;
      if (da !== db) return db - da;
      const parentsA = incomingByNode.get(a) ?? [];
      const parentsB = incomingByNode.get(b) ?? [];
      const idealXA = parentsA.length > 0
        ? parentsA.reduce((s, p) => s + (positions.get(p)?.x ?? 0), 0) / parentsA.length
        : (positions.get(a)?.x ?? 0);
      const idealXB = parentsB.length > 0
        ? parentsB.reduce((s, p) => s + (positions.get(p)?.x ?? 0), 0) / parentsB.length
        : (positions.get(b)?.x ?? 0);
      if (idealXA !== idealXB) return idealXA - idealXB;
      return (nodesById.get(a)?.path ?? '').localeCompare(nodesById.get(b)?.path ?? '');
    });
  }

  // --- Pass 2: final positions using proximity-optimised child order ---
  positions.clear();
  rootSlotX = initialRootSlotX;
  for (const root of roots) {
    assignPositions(root.id, rootSlotX, 0);
    rootSlotX += slotWidths.get(root.id)! + ROOT_EXTRA_GAP;
  }

  // Place any orphaned nodes (cycles or unreachable) below everything else
  const orphanLevel = maxLevel + 2;
  let orphanX = 20;
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      const slotW = slotWidths.get(node.id)!;
      positions.set(node.id, {
        x: orphanX + slotW / 2,
        y: topPadding + orphanLevel * LEVEL_HEIGHT,
        depth: orphanLevel,
      });
      orphanX += slotW;
    }
  }

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
