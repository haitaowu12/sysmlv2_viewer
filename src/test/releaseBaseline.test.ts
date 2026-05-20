import { describe, expect, it } from 'vitest';
import { VEHICLE_SYSTEM_EXAMPLE } from '../examples/vehicleSystem';
import { parseSysML } from '../parser/parser';
import type { SysMLNode } from '../parser/types';
import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';

function flatten(nodes: SysMLNode[]): SysMLNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

describe('release-grounded starter content', () => {
  it('keeps the default vehicle example parseable and semantically useful', () => {
    const parsed = parseSysML(VEHICLE_SYSTEM_EXAMPLE);
    expect(parsed.errors).toHaveLength(0);

    const nodes = flatten(parsed.children);
    expect(nodes.some((node) => node.kind === 'PartDef' && node.name === 'Vehicle')).toBe(true);
    expect(nodes.some((node) => node.kind === 'RequirementDef' && node.name === 'MassRequirement')).toBe(true);
    expect(nodes.some((node) => node.kind === 'VerificationDef' && node.name === 'VehicleInspection')).toBe(true);
    expect(nodes.filter((node) => node.kind === 'Unknown')).toHaveLength(0);
  });

  it('builds semantic satisfy and verify edges from the starter model', () => {
    const semantic = buildSemanticModelFromSource(VEHICLE_SYSTEM_EXAMPLE);
    expect(semantic.nodes.some((node) => node.kind === 'PartDef' && node.name === 'Vehicle')).toBe(true);
    expect(semantic.edges.some((edge) => edge.kind === 'satisfy')).toBe(true);
    expect(semantic.edges.some((edge) => edge.kind === 'verify')).toBe(true);
  });
});
