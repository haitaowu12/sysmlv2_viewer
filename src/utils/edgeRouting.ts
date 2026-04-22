/**
 * Intelligent Edge Routing System
 *
 * Provides orthogonal (Manhattan-style) edge routing with obstacle avoidance,
 * edge bundling for parallel connections, and zoom-adaptive label rendering.
 */

import type { Node, Edge, XYPosition } from '@xyflow/react';

/** Margin around obstacles to keep routes clear. */
const OBSTACLE_MARGIN = 12;

/** Grid step size for A* pathfinding. */
const GRID_STEP = 10;

/** Maximum search iterations for A*. */
const MAX_ITERATIONS = 5000;

/** Rectangle representing a node obstacle. */
export interface ObstacleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for computing an orthogonal route. */
export interface RouteOptions {
  /** Source point. */
  source: XYPosition;
  /** Target point. */
  target: XYPosition;
  /** Rectangular obstacles to avoid. */
  obstacles: ObstacleRect[];
  /** Preferred initial direction from source: 'H' (horizontal first) or 'V' (vertical first). */
  preferredDirection?: 'H' | 'V';
}

/** A single waypoint in an orthogonal path. */
export interface Waypoint {
  x: number;
  y: number;
}

/** Options for bundling multiple edges between the same node pair. */
export interface BundleOptions {
  /** Edges sharing the same source and target. */
  edges: Edge[];
  /** Source node center position. */
  sourcePos: XYPosition;
  /** Target node center position. */
  targetPos: XYPosition;
  /** Spacing between bundled parallel paths. */
  spacing?: number;
}

/** Zoom-adaptive label settings. */
export interface AdaptiveLabel {
  /** Opacity value between 0 and 1. */
  opacity: number;
  /** Truncated text when zoom is low. */
  text: string;
  /** Whether the label should be rendered at all. */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function expandRect(rect: ObstacleRect, margin: number): ObstacleRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

/** @internal Check if two rectangles overlap. Used by layout-map.ts via re-export if needed. */
export function rectsOverlap(a: ObstacleRect, b: ObstacleRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function pointInRect(p: XYPosition, rect: ObstacleRect): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

function snapToGrid(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function manhattan(a: XYPosition, b: XYPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Build a minimal bounding box that contains all obstacles and both endpoints.
 */
function computeBoundingBox(
  source: XYPosition,
  target: XYPosition,
  obstacles: ObstacleRect[]
): ObstacleRect {
  let minX = Math.min(source.x, target.x);
  let minY = Math.min(source.y, target.y);
  let maxX = Math.max(source.x, target.x);
  let maxY = Math.max(source.y, target.y);

  for (const o of obstacles) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width);
    maxY = Math.max(maxY, o.y + o.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// A* on an implicit grid
// ---------------------------------------------------------------------------

interface AStarNode {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

function keyOf(p: XYPosition): string {
  return `${p.x},${p.y}`;
}

/**
 * Orthogonal A* pathfinding on a sparse grid.
 *
 * Because SysML diagrams are relatively sparse, we use an implicit grid
 * rather than allocating a full dense matrix.  Nodes are generated on the
 * fly at GRID_STEP intervals, but we also add “portal” coordinates aligned
 * with obstacle edges to improve path quality.
 */
export function computeOrthogonalRoute(options: RouteOptions): Waypoint[] {
  const { source, target, obstacles, preferredDirection = 'H' } = options;

  if (obstacles.length === 0) {
    return computeDirectOrthogonalPath(source, target, preferredDirection);
  }

  const expanded = obstacles.map((o) => expandRect(o, OBSTACLE_MARGIN));

  // Quick check: if a direct orthogonal path is unobstructed, use it.
  const direct = computeDirectOrthogonalPath(source, target, preferredDirection);
  if (!pathIntersectsObstacles(direct, expanded)) {
    return direct;
  }

  // Build sparse grid coordinates from obstacle boundaries.
  const xs = new Set<number>();
  const ys = new Set<number>();

  xs.add(snapToGrid(source.x, GRID_STEP));
  xs.add(snapToGrid(target.x, GRID_STEP));
  ys.add(snapToGrid(source.y, GRID_STEP));
  ys.add(snapToGrid(target.y, GRID_STEP));

  for (const o of expanded) {
    xs.add(snapToGrid(o.x, GRID_STEP));
    xs.add(snapToGrid(o.x + o.width, GRID_STEP));
    ys.add(snapToGrid(o.y, GRID_STEP));
    ys.add(snapToGrid(o.y + o.height, GRID_STEP));
  }

  const sortedXs = Array.from(xs).sort((a, b) => a - b);
  const sortedYs = Array.from(ys).sort((a, b) => a - b);

  const bbox = computeBoundingBox(source, target, expanded);
  // Pad bounding box so routes can go around the outside.
  const pad = GRID_STEP * 4;
  const minX = snapToGrid(bbox.x - pad, GRID_STEP);
  const maxX = snapToGrid(bbox.x + bbox.width + pad, GRID_STEP);
  const minY = snapToGrid(bbox.y - pad, GRID_STEP);
  const maxY = snapToGrid(bbox.y + bbox.height + pad, GRID_STEP);

  // Helper: check whether a point lies inside any expanded obstacle.
  function isBlocked(p: XYPosition): boolean {
    for (const o of expanded) {
      if (pointInRect(p, o)) return true;
    }
    return false;
  }

  // Helper: check whether the segment between two points intersects an obstacle.
  function segmentBlocked(a: XYPosition, b: XYPosition): boolean {
    // Orthogonal segments only.
    if (a.x === b.x) {
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      for (const o of expanded) {
        if (a.x >= o.x && a.x <= o.x + o.width && y0 < o.y + o.height && y1 > o.y) {
          return true;
        }
      }
      return false;
    }
    if (a.y === b.y) {
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      for (const o of expanded) {
        if (a.y >= o.y && a.y <= o.y + o.height && x0 < o.x + o.width && x1 > o.x) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  // A* open/closed sets.
  const openMap = new Map<string, AStarNode>();
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    x: snapToGrid(source.x, GRID_STEP),
    y: snapToGrid(source.y, GRID_STEP),
    g: 0,
    f: manhattan(source, target),
    parent: null,
  };
  openMap.set(keyOf(startNode), startNode);

  let iterations = 0;

  try {
    while (openMap.size > 0 && iterations < MAX_ITERATIONS) {
      iterations++;

      // Pop node with lowest f.
      let best: AStarNode | null = null;
      let bestKey = '';
      for (const [k, v] of openMap) {
        if (!best || v.f < best.f) {
          best = v;
          bestKey = k;
        }
      }
      if (!best) break;

      openMap.delete(bestKey);
      closedSet.add(bestKey);

      // Goal test.
      if (Math.abs(best.x - target.x) < GRID_STEP / 2 && Math.abs(best.y - target.y) < GRID_STEP / 2) {
        const raw = reconstructWaypoints(best, target);
        return simplifyWaypoints(raw, expanded);
      }

      // Generate orthogonal neighbors.
      const neighbors: XYPosition[] = [];

      // Try next/prev X aligned with sortedXs.
      const xi = sortedXs.indexOf(best.x);
      if (xi > 0) neighbors.push({ x: sortedXs[xi - 1], y: best.y });
      if (xi >= 0 && xi < sortedXs.length - 1) neighbors.push({ x: sortedXs[xi + 1], y: best.y });

      // Try next/prev Y aligned with sortedYs.
      const yi = sortedYs.indexOf(best.y);
      if (yi > 0) neighbors.push({ x: best.x, y: sortedYs[yi - 1] });
      if (yi >= 0 && yi < sortedYs.length - 1) neighbors.push({ x: best.x, y: sortedYs[yi + 1] });

      // Also allow stepping by GRID_STEP if outside obstacle bounds to permit routing around.
      const stepCandidates: XYPosition[] = [
        { x: best.x - GRID_STEP, y: best.y },
        { x: best.x + GRID_STEP, y: best.y },
        { x: best.x, y: best.y - GRID_STEP },
        { x: best.x, y: best.y + GRID_STEP },
      ];

      for (const sc of stepCandidates) {
        if (sc.x >= minX && sc.x <= maxX && sc.y >= minY && sc.y <= maxY) {
          if (!neighbors.some((n) => n.x === sc.x && n.y === sc.y)) {
            neighbors.push(sc);
          }
        }
      }

      for (const nb of neighbors) {
        const k = keyOf(nb);
        if (closedSet.has(k)) continue;
        if (isBlocked(nb)) continue;
        if (segmentBlocked({ x: best.x, y: best.y }, nb)) continue;

        const g = best.g + manhattan({ x: best.x, y: best.y }, nb);
        const existing = openMap.get(k);
        if (!existing || g < existing.g) {
          openMap.set(k, {
            x: nb.x,
            y: nb.y,
            g,
            f: g + manhattan(nb, target),
            parent: best,
          });
        }
      }
    }
  } catch {
    // Graceful fallback on unexpected error during pathfinding.
  }

  // Fallback: direct orthogonal path even if it intersects.
  return computeDirectOrthogonalPath(source, target, preferredDirection);
}

function computeDirectOrthogonalPath(
  source: XYPosition,
  target: XYPosition,
  preferredDirection: 'H' | 'V'
): Waypoint[] {
  if (preferredDirection === 'H') {
    return [source, { x: target.x, y: source.y }, target];
  }
  return [source, { x: source.x, y: target.y }, target];
}

function pathIntersectsObstacles(path: Waypoint[], obstacles: ObstacleRect[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    for (const o of obstacles) {
      if (segmentIntersectsObstacle(a, b, o)) return true;
    }
  }
  return false;
}

function segmentIntersectsObstacle(a: XYPosition, b: XYPosition, o: ObstacleRect): boolean {
  if (a.x === b.x) {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return a.x >= o.x && a.x <= o.x + o.width && y0 < o.y + o.height && y1 > o.y;
  }
  if (a.y === b.y) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    return a.y >= o.y && a.y <= o.y + o.height && x0 < o.x + o.width && x1 > o.x;
  }
  return false;
}

function reconstructWaypoints(endNode: AStarNode, target: XYPosition): Waypoint[] {
  const waypoints: Waypoint[] = [];
  let curr: AStarNode | null = endNode;
  while (curr) {
    waypoints.unshift({ x: curr.x, y: curr.y });
    curr = curr.parent;
  }
  waypoints.push({ x: target.x, y: target.y });
  return waypoints;
}

/**
 * Simplify a waypoint list by removing collinear intermediate points.
 */
function simplifyWaypoints(waypoints: Waypoint[], obstacles: ObstacleRect[]): Waypoint[] {
  if (waypoints.length <= 2) return waypoints;

  const simplified: Waypoint[] = [waypoints[0]];

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    // If prev->curr->next are collinear, skip curr.
    if ((prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y)) {
      // But verify that skipping doesn't hit an obstacle.
      const directBlocked = segmentIntersectsObstacle(prev, next, obstacles[0]);
      let anyBlocked = directBlocked;
      if (!anyBlocked) {
        for (let j = 1; j < obstacles.length; j++) {
          if (segmentIntersectsObstacle(prev, next, obstacles[j])) {
            anyBlocked = true;
            break;
          }
        }
      }
      if (!anyBlocked) {
        continue;
      }
    }

    simplified.push(curr);
  }

  simplified.push(waypoints[waypoints.length - 1]);
  return simplified;
}

// ---------------------------------------------------------------------------
// Edge bundling
// ---------------------------------------------------------------------------

/**
 * Compute parallel offset waypoints for multiple edges between the same
 * source and target node pair.
 *
 * @returns Map from edge id to its offset waypoints.
 */
export function bundleEdges(options: BundleOptions): Map<string, Waypoint[]> {
  const { edges, sourcePos, targetPos, spacing = 14 } = options;

  const result = new Map<string, Waypoint[]>();
  if (edges.length === 0) return result;
  if (edges.length === 1) {
    result.set(edges[0].id, [sourcePos, targetPos]);
    return result;
  }

  // Determine the orientation of the primary connection.
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const isHorizontalDominant = Math.abs(dx) >= Math.abs(dy);

  const count = edges.length;
  const totalOffset = (count - 1) * spacing;
  const startOffset = -totalOffset / 2;

  for (let i = 0; i < count; i++) {
    const offset = startOffset + i * spacing;
    const edge = edges[i];

    if (isHorizontalDominant) {
      // Offset vertically.
      const wp: Waypoint[] = [
        { x: sourcePos.x, y: sourcePos.y + offset },
        { x: targetPos.x, y: targetPos.y + offset },
      ];
      result.set(edge.id, wp);
    } else {
      // Offset horizontally.
      const wp: Waypoint[] = [
        { x: sourcePos.x + offset, y: sourcePos.y },
        { x: targetPos.x + offset, y: targetPos.y },
      ];
      result.set(edge.id, wp);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Zoom-adaptive labels
// ---------------------------------------------------------------------------

/**
 * Compute opacity and truncated text for a label based on current zoom level.
 *
 * @param zoom - Current zoom level (1.0 = 100%).
 * @param text - Original label text.
 * @returns Adaptive label settings.
 */
export function computeAdaptiveLabel(zoom: number, text: string): AdaptiveLabel {
  if (zoom <= 0.3) {
    return { opacity: 0, text: '', visible: false };
  }

  if (zoom < 0.5) {
    const opacity = 0.3 + ((zoom - 0.3) / 0.2) * 0.7; // linear 0.3 -> 1.0
    return {
      opacity: Math.min(1, opacity),
      text: '',
      visible: false,
    };
  }

  if (zoom < 1.0) {
    const maxChars = Math.max(3, Math.floor(text.length * (zoom / 0.5)));
    const truncated = text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
    return {
      opacity: 1.0,
      text: truncated,
      visible: true,
    };
  }

  return { opacity: 1.0, text, visible: true };
}

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

/**
 * Build obstacle rectangles from React Flow nodes.
 *
 * @param nodes - React Flow nodes with known positions and dimensions.
 * @returns Array of obstacle rectangles.
 */
export function nodesToObstacles(nodes: Node[]): ObstacleRect[] {
  return nodes.map((n) => {
    const w = n.measured?.width ?? (n.style?.width as number) ?? 220;
    const h = n.measured?.height ?? (n.style?.height as number) ?? 80;
    return {
      x: n.position.x,
      y: n.position.y,
      width: w,
      height: h,
    };
  });
}

/**
 * Compute center point of a node.
 */
export function nodeCenter(node: Node): XYPosition {
  const w = node.measured?.width ?? (node.style?.width as number) ?? 220;
  const h = node.measured?.height ?? (node.style?.height as number) ?? 80;
  return {
    x: node.position.x + w / 2,
    y: node.position.y + h / 2,
  };
}

/**
 * Apply orthogonal routing to a set of edges given positioned nodes.
 *
 * @param edges - Original edges.
 * @param nodes - Positioned nodes.
 * @param enableBundling - Whether to bundle parallel edges.
 * @returns Edges updated with `type: 'default'` and waypoints.
 */
export function routeEdges(
  edges: Edge[],
  nodes: Node[],
  enableBundling = true
): Edge[] {
  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const obstacles = nodesToObstacles(nodes);

  // Group edges by source+target for bundling.
  const edgeGroups = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (!edgeGroups.has(key)) edgeGroups.set(key, []);
    edgeGroups.get(key)!.push(e);
  }

  const bundledWaypoints = new Map<string, Waypoint[]>();

  if (enableBundling) {
    for (const [, group] of edgeGroups) {
      if (group.length > 1) {
        const src = nodeMap.get(group[0].source);
        const tgt = nodeMap.get(group[0].target);
        if (src && tgt) {
          const wpMap = bundleEdges({
            edges: group,
            sourcePos: nodeCenter(src),
            targetPos: nodeCenter(tgt),
          });
          for (const [edgeId, wp] of wpMap) {
            bundledWaypoints.set(edgeId, wp);
          }
        }
      }
    }
  }

  return edges.map((edge) => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return edge;

    const bundled = bundledWaypoints.get(edge.id);
    if (bundled) {
      return {
        ...edge,
        type: 'default',
        data: { ...edge.data, waypoints: bundled },
      } as Edge;
    }

    const sourceCenter = nodeCenter(src);
    const targetCenter = nodeCenter(tgt);

    const waypoints = computeOrthogonalRoute({
      source: sourceCenter,
      target: targetCenter,
      obstacles,
    });

    return {
      ...edge,
      type: 'default',
      data: { ...edge.data, waypoints },
    } as Edge;
  });
}
