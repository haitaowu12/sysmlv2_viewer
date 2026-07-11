import { describe, expect, it } from 'vitest';
import { sysmlCompareModels, sysmlRenderView, sysmlTraceCoverage } from '../agent-tools/advanced';

const context = { engineVersion: 'test-engine', packageVersion: 'test-package' };

describe('advanced deterministic SysML agent tools', () => {
  it('renders a byte-stable compact Mermaid view', () => {
    const files = [{ path: 'model.sysml', content: 'package P { part def A; part a : A; }' }];
    const first = sysmlRenderView(files, context);
    const second = sysmlRenderView(files, context);
    expect(first.content).toBe(second.content);
    expect(first.nodeCount).toBeGreaterThan(1);
    expect(first.content).toContain('typing');
  });

  it('reports uncovered requirements explicitly', () => {
    const result = sysmlTraceCoverage([{ path: 'req.sysml', content: 'requirement def R;' }], context);
    expect(result).toMatchObject({ requirements: 1, fullyCovered: 0 });
    expect(result.uncoveredRequirementIds).toHaveLength(1);
  });

  it('compares model semantics without reading a working tree', () => {
    const before = [{ path: 'model.sysml', content: 'package P { part def A; }' }];
    const after = [{ path: 'model.sysml', content: 'package P { part def A; part def B; }' }];
    const result = sysmlCompareModels(before, after, context);
    expect(result.added.some((item) => item.qualifiedPath.includes('B'))).toBe(true);
    expect(result.removed).toEqual([]);
  });
});
