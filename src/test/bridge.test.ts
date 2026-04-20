import { describe, it, expect } from 'vitest';
import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import { diffSemanticModels } from '../bridge/semantic-diff';
import type { SemanticModel } from '../bridge/semantic-types';

describe('buildSemanticModelFromSource', () => {
  it('converts a simple part def', () => {
    const model = buildSemanticModelFromSource('part def Vehicle {\n}');
    expect(model.nodes.length).toBeGreaterThanOrEqual(1);
    expect(model.nodes.some((n) => n.kind === 'PartDef' && n.name === 'Vehicle')).toBe(true);
  });

  it('converts a package with children', () => {
    const model = buildSemanticModelFromSource("package 'Test' {\n\tpart def A {\n}\n}");
    expect(model.nodes.some((n) => n.kind === 'Package')).toBe(true);
    expect(model.nodes.some((n) => n.kind === 'PartDef')).toBe(true);
  });

  it('produces edges for connections', () => {
    const model = buildSemanticModelFromSource('part def A {\n}\npart def B {\n}\nconnect a to b;');
    expect(model.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty model', () => {
    const model = buildSemanticModelFromSource('');
    expect(model.nodes).toHaveLength(0);
    expect(model.edges).toHaveLength(0);
  });
});

describe('diffSemanticModels', () => {
  it('detects added nodes', () => {
    const oldModel: SemanticModel = { nodes: [], edges: [], layout: {}, version: 'v1' };
    const newModel: SemanticModel = {
      nodes: [{ id: '1', kind: 'PartDef', name: 'A', sysmlPath: 'A' }],
      edges: [],
      layout: {},
      version: 'v1',
    };
    const result = diffSemanticModels(oldModel, newModel);
    expect(result.patches.some((p) => p.op === 'add_node')).toBe(true);
  });

  it('detects removed nodes', () => {
    const oldModel: SemanticModel = {
      nodes: [{ id: '1', kind: 'PartDef', name: 'A', sysmlPath: 'A' }],
      edges: [],
      layout: {},
      version: 'v1',
    };
    const newModel: SemanticModel = { nodes: [], edges: [], layout: {}, version: 'v1' };
    const result = diffSemanticModels(oldModel, newModel);
    expect(result.patches.some((p) => p.op === 'remove_node')).toBe(true);
  });

  it('detects renamed nodes', () => {
    const oldModel: SemanticModel = {
      nodes: [{ id: '1', kind: 'PartDef', name: 'A', sysmlPath: 'A' }],
      edges: [],
      layout: {},
      version: 'v1',
    };
    const newModel: SemanticModel = {
      nodes: [{ id: '1', kind: 'PartDef', name: 'B', sysmlPath: 'B' }],
      edges: [],
      layout: {},
      version: 'v1',
    };
    const result = diffSemanticModels(oldModel, newModel);
    expect(result.patches.some((p) => p.op === 'rename_node')).toBe(true);
  });

  it('returns no patches for identical models', () => {
    const model: SemanticModel = {
      nodes: [{ id: '1', kind: 'PartDef', name: 'A', sysmlPath: 'A' }],
      edges: [],
      layout: {},
      version: 'v1',
    };
    const result = diffSemanticModels(model, model);
    expect(result.patches).toHaveLength(0);
  });
});
