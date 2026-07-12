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

  it('separates definitions from usage trace links without claiming verification results', () => {
    const result = sysmlTraceCoverage([{
      path: 'req.sysml',
      content: 'requirement def R; requirement r : R;',
    }], context);
    expect(result).toMatchObject({
      requirementDefinitions: 1,
      requirementUsages: 1,
      satisfactionLinked: 0,
      verificationLinked: 0,
      fullyLinked: 0,
    });
    expect(result.unlinkedRequirementUsageIds).toHaveLength(1);
    expect(result.sourceBindings[0]).toMatchObject({ path: 'req.sysml', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(result.requirementLinks[0]).toMatchObject({
      qualifiedName: 'r',
      satisfactionRelationshipIds: [],
      verificationRelationshipIds: [],
      outOfContextVerificationRelationshipIds: [],
    });
    expect(result.limitations.join(' ')).toContain('not evidence');
  });

  it('links verification to a requirement usage when its definition normalizes to the same name', () => {
    const result = sysmlTraceCoverage([{
      path: 'req.sysml',
      content: `
        requirement def Safe;
        requirement safe : Safe;
        verification def Review {
          objective { verify safe; }
        }
      `,
    }], context);
    expect(result).toMatchObject({ requirementUsages: 1, verificationLinked: 1 });
    expect(result.requirementLinks[0]).toMatchObject({ name: 'safe', verificationLinked: true });
    expect(result.requirementLinks[0].verificationRelationshipIds).toHaveLength(1);
  });

  it('does not count a verify statement outside a verification definition as a plan link', () => {
    const result = sysmlTraceCoverage([{
      path: 'req.sysml',
      content: `
        part def System;
        requirement def Safe { subject system : System; }
        requirement safe : Safe;
        use case def Operate {
          subject system : System;
          objective { verify safe; }
        }
      `,
    }], context);

    expect(result.verificationLinked).toBe(0);
    expect(result.requirementLinks[0].verificationRelationshipIds).toEqual([]);
    expect(result.requirementLinks[0].outOfContextVerificationRelationshipIds).toHaveLength(1);
  });

  it('compares model semantics without reading a working tree', () => {
    const before = [{ path: 'model.sysml', content: 'package P { part def A; }' }];
    const after = [{ path: 'model.sysml', content: 'package P { part def A; part def B; }' }];
    const result = sysmlCompareModels(before, after, context);
    expect(result.added.some((item) => item.qualifiedPath.includes('B'))).toBe(true);
    expect(result.removed).toEqual([]);
  });
});
