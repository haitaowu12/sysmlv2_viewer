import { describe, it, expect } from 'vitest';
import {
  computeOrthogonalRoute,
  bundleEdges,
  computeAdaptiveLabel,
  routeEdges,
  type ObstacleRect,
  type Waypoint,
} from '../utils/edgeRouting';
import type { Edge } from '@xyflow/react';

function segmentIntersectsRect(a: Waypoint, b: Waypoint, rect: ObstacleRect): boolean {
  if (a.x === b.x) {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return a.x >= rect.x && a.x <= rect.x + rect.width && y0 < rect.y + rect.height && y1 > rect.y;
  }
  if (a.y === b.y) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    return a.y >= rect.y && a.y <= rect.y + rect.height && x0 < rect.x + rect.width && x1 > rect.x;
  }
  return false;
}

function pathIntersectsObstacles(path: Waypoint[], obstacles: ObstacleRect[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const o of obstacles) {
      if (segmentIntersectsRect(path[i], path[i + 1], o)) return true;
    }
  }
  return false;
}

describe('computeOrthogonalRoute', () => {
  it('returns a direct path when no obstacles are present', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };
    const path = computeOrthogonalRoute({ source, target, obstacles: [] });
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
  });

  it('avoids a single obstacle', () => {
    const source = { x: 0, y: 50 };
    const target = { x: 200, y: 50 };
    const obstacle: ObstacleRect = { x: 80, y: 0, width: 40, height: 100 };
    const path = computeOrthogonalRoute({ source, target, obstacles: [obstacle] });
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
    expect(pathIntersectsObstacles(path, [obstacle])).toBe(false);
  });

  it('avoids multiple obstacles', () => {
    const source = { x: 0, y: 50 };
    const target = { x: 300, y: 50 };
    const obstacles: ObstacleRect[] = [
      { x: 60, y: 0, width: 40, height: 100 },
      { x: 160, y: 0, width: 40, height: 100 },
    ];
    const path = computeOrthogonalRoute({ source, target, obstacles });
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
    expect(pathIntersectsObstacles(path, obstacles)).toBe(false);
  });

  it('avoids obstacle when source and target are vertically aligned', () => {
    const source = { x: 50, y: 0 };
    const target = { x: 50, y: 200 };
    const obstacle: ObstacleRect = { x: 0, y: 80, width: 100, height: 40 };
    const path = computeOrthogonalRoute({ source, target, obstacles: [obstacle] });
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
    expect(pathIntersectsObstacles(path, [obstacle])).toBe(false);
  });
});

describe('bundleEdges', () => {
  it('returns empty map for empty edges', () => {
    const result = bundleEdges({ edges: [], sourcePos: { x: 0, y: 0 }, targetPos: { x: 100, y: 0 } });
    expect(result.size).toBe(0);
  });

  it('returns direct path for a single edge', () => {
    const edge: Edge = { id: 'e1', source: 'a', target: 'b' };
    const result = bundleEdges({ edges: [edge], sourcePos: { x: 0, y: 0 }, targetPos: { x: 100, y: 0 } });
    expect(result.get('e1')).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('computes correct parallel offsets for 2 edges', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'b' },
    ];
    const result = bundleEdges({ edges, sourcePos: { x: 0, y: 0 }, targetPos: { x: 100, y: 0 }, spacing: 14 });
    expect(result.size).toBe(2);
    const wp1 = result.get('e1')!;
    const wp2 = result.get('e2')!;
    expect(wp1[0].y).toBe(-7);
    expect(wp2[0].y).toBe(7);
    expect(wp1[1].y).toBe(-7);
    expect(wp2[1].y).toBe(7);
  });

  it('computes correct parallel offsets for 3 edges', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'b' },
      { id: 'e3', source: 'a', target: 'b' },
    ];
    const result = bundleEdges({ edges, sourcePos: { x: 0, y: 0 }, targetPos: { x: 100, y: 0 }, spacing: 10 });
    expect(result.size).toBe(3);
    expect(result.get('e1')![0].y).toBe(-10);
    expect(result.get('e2')![0].y).toBe(0);
    expect(result.get('e3')![0].y).toBe(10);
  });

  it('computes correct parallel offsets for 5 edges', () => {
    const edges: Edge[] = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i + 1}`,
      source: 'a',
      target: 'b',
    }));
    const result = bundleEdges({ edges, sourcePos: { x: 0, y: 0 }, targetPos: { x: 100, y: 0 }, spacing: 8 });
    expect(result.size).toBe(5);
    const offsets = edges.map((e) => result.get(e.id)![0].y);
    expect(offsets).toEqual([-16, -8, 0, 8, 16]);
  });

  it('offsets horizontally when vertical dominant', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'b' },
    ];
    const result = bundleEdges({ edges, sourcePos: { x: 0, y: 0 }, targetPos: { x: 0, y: 100 }, spacing: 12 });
    const wp1 = result.get('e1')!;
    const wp2 = result.get('e2')!;
    expect(wp1[0].x).toBe(-6);
    expect(wp2[0].x).toBe(6);
  });
});

describe('computeAdaptiveLabel', () => {
  it('hides label at zoom 0.2', () => {
    const result = computeAdaptiveLabel(0.2, 'Hello World');
    expect(result.visible).toBe(false);
    expect(result.opacity).toBe(0);
    expect(result.text).toBe('');
  });

  it('fades in opacity between 0.3 and 0.5 at zoom 0.4', () => {
    const result = computeAdaptiveLabel(0.4, 'Hello World');
    expect(result.visible).toBe(false);
    expect(result.opacity).toBeGreaterThan(0.3);
    expect(result.opacity).toBeLessThanOrEqual(1);
  });

  it('shows truncated label at zoom 0.7', () => {
    const result = computeAdaptiveLabel(0.7, 'Hello World');
    expect(result.visible).toBe(true);
    expect(result.opacity).toBe(1);
    expect(result.text.length).toBeLessThanOrEqual('Hello World'.length + 1); // may include ellipsis
  });

  it('shows full label at zoom 1.0', () => {
    const result = computeAdaptiveLabel(1.0, 'Hello World');
    expect(result.visible).toBe(true);
    expect(result.opacity).toBe(1);
    expect(result.text).toBe('Hello World');
  });
});

describe('routeEdges', () => {
  it('adds waypoints to edges', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
      { id: 'b', position: { x: 200, y: 0 }, measured: { width: 100, height: 50 } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'b' }];
    const result = routeEdges(edges, nodes as any, false);
    expect(result[0].data).toBeDefined();
    expect((result[0].data as any).waypoints).toBeDefined();
    expect((result[0].data as any).waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('bundles parallel edges with offsets', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
      { id: 'b', position: { x: 200, y: 0 }, measured: { width: 100, height: 50 } },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'b' },
    ];
    const result = routeEdges(edges, nodes as any, true);
    const e1 = result.find((e) => e.id === 'e1')!;
    const e2 = result.find((e) => e.id === 'e2')!;
    expect((e1.data as any).waypoints).toBeDefined();
    expect((e2.data as any).waypoints).toBeDefined();
    expect((e1.data as any).waypoints[0].y).not.toBe((e2.data as any).waypoints[0].y);
  });

  it('preserves original edge when source or target node is missing', () => {
    const nodes = [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } }];
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'missing' }];
    const result = routeEdges(edges, nodes as any, false);
    expect(result[0]).toEqual(edges[0]);
  });
});
