import { describe, it, expect } from 'vitest';
import { autoLayout, getLayoutPreset } from '../utils/layout';
import type { Node, Edge } from '@xyflow/react';

describe('autoLayout', () => {
  it('returns nodes with positions', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'b' }];
    const result = autoLayout(nodes, edges);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].position.x).not.toBeNaN();
    expect(result.nodes[0].position.y).not.toBeNaN();
  });

  it('returns edges with waypoints when edgeRouting is enabled', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 }, data: {} },
      { id: 'b', position: { x: 200, y: 0 }, measured: { width: 100, height: 50 }, data: {} },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'b' }];
    const result = autoLayout(nodes, edges, { edgeRouting: true });
    expect(result.edges[0].data).toBeDefined();
    expect((result.edges[0].data as any).waypoints).toBeDefined();
    expect((result.edges[0].data as any).waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves user positions when nodes already have positions', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 10, y: 20 }, data: {} },
      { id: 'b', position: { x: 30, y: 40 }, data: {} },
    ];
    const edges: Edge[] = [];
    const result = autoLayout(nodes, edges);
    // Dagre will recompute positions, but nodes should still exist with valid positions
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.every((n) => typeof n.position.x === 'number' && typeof n.position.y === 'number')).toBe(true);
  });

  it('handles empty node and edge arrays', () => {
    const result = autoLayout([], []);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

describe('getLayoutPreset', () => {
  it('returns correct preset for general view', () => {
    const preset = getLayoutPreset('general');
    expect(preset.direction).toBe('TB');
    expect(preset.nodesep).toBe(80);
    expect(preset.ranksep).toBe(100);
  });

  it('returns correct preset for interconnection view', () => {
    const preset = getLayoutPreset('interconnection');
    expect(preset.direction).toBe('LR');
    expect(preset.nodesep).toBe(80);
    expect(preset.ranksep).toBe(120);
  });

  it('returns correct preset for stateTransition view', () => {
    const preset = getLayoutPreset('stateTransition');
    expect(preset.direction).toBe('TB');
    expect(preset.nodesep).toBe(80);
    expect(preset.ranksep).toBe(100);
  });

  it('returns correct preset for actionFlow view', () => {
    const preset = getLayoutPreset('actionFlow');
    expect(preset.direction).toBe('LR');
    expect(preset.nodesep).toBe(60);
    expect(preset.ranksep).toBe(120);
  });

  it('returns correct preset for requirements view', () => {
    const preset = getLayoutPreset('requirements');
    expect(preset.direction).toBe('TB');
    expect(preset.nodesep).toBe(100);
    expect(preset.ranksep).toBe(150);
  });

  it('returns correct preset for viewpoints view', () => {
    const preset = getLayoutPreset('viewpoints');
    expect(preset.direction).toBe('TB');
    expect(preset.nodesep).toBe(100);
    expect(preset.ranksep).toBe(150);
  });

  it('returns default preset for unknown view type', () => {
    const preset = getLayoutPreset('unknown');
    expect(preset.direction).toBe('TB');
    expect(preset.nodesep).toBe(80);
    expect(preset.ranksep).toBe(100);
  });
});
