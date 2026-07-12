import { describe, expect, it } from 'vitest';
import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import { parseSysML } from '../parser/parser';

describe('usage relationship parsing', () => {
  it('keeps typing, specialization, and redefinition distinct', () => {
    const source = `package Test {
      part def Vehicle;
      part base : Vehicle;
      part specialized :> base;
      part :>> base : Vehicle;
    }`;
    const parsed = parseSysML(source);
    const usages = parsed.children[0].children.filter((node) => node.kind === 'PartUsage');

    expect(usages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'base', typeName: 'Vehicle' }),
      expect.objectContaining({ name: 'specialized', specializes: 'base', typeName: undefined }),
      expect.objectContaining({ name: 'base', redefines: 'base', isRedefine: true, typeName: 'Vehicle' }),
    ]));
  });

  it('emits distinct specialization and redefinition semantic edges', () => {
    const semantic = buildSemanticModelFromSource(`package Test {
      part def Vehicle;
      part base : Vehicle;
      part specialized :> base;
      part :>> base;
    }`);

    expect(semantic.edges.some((edge) => edge.kind === 'typing')).toBe(true);
    expect(semantic.edges.some((edge) => edge.kind === 'specialization')).toBe(true);
    expect(semantic.edges.some((edge) => edge.kind === 'redefinition')).toBe(true);
  });

  it('emits one typing edge for each typed requirement and verification usage', () => {
    const semantic = buildSemanticModelFromSource(`package Test {
      requirement def Need;
      verification def Check;
      requirement need : Need;
      verification check : Check;
    }`);
    const typedUsages = semantic.nodes.filter((node) =>
      node.kind === 'RequirementUsage' || node.kind === 'VerificationUsage');

    for (const usage of typedUsages) {
      expect(semantic.edges.filter((edge) =>
        edge.kind === 'typing' && edge.sourceId === usage.id)).toHaveLength(1);
    }
  });

  it('parses perform usages with quoted and qualified action names', () => {
    const parsed = parseSysML(`package Test {
      perform 'provide power'.'generate torque';
      perform action :>> providePowerFamily;
    }`);
    const actions = parsed.children[0].children.filter((node) => node.kind === 'ActionUsage');

    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'provide power.generate torque' }),
      expect.objectContaining({ name: 'providePowerFamily' }),
    ]));
  });

  it('preserves multiplicity on supported typed usages and allocation endpoints', () => {
    const parsed = parseSysML(`package Test {
      part def Source;
      part def Target;
      interface def Link;
      action def Monitor;
      requirement def Need;
      verification def Check;
      interface link : Link[0..1];
      action monitor : Monitor[0..1];
      requirement need : Need[0..1];
      verification check : Check[0..1];
      allocate monitor to need;
    }`);
    const children = parsed.children[0].children;

    expect(children).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'InterfaceUsage', multiplicity: '0..1' }),
      expect.objectContaining({ kind: 'ActionUsage', multiplicity: '0..1' }),
      expect.objectContaining({ kind: 'RequirementUsage', multiplicity: '0..1' }),
      expect.objectContaining({ kind: 'VerificationUsage', multiplicity: '0..1' }),
      expect.objectContaining({ kind: 'AllocationUsage', source: 'monitor', target: 'need' }),
    ]));
  });
});
