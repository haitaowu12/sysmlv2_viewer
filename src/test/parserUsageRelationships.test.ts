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
});
