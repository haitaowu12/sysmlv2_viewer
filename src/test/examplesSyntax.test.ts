import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARS_ROVER_EXAMPLE } from '../examples/marsRover';
import { RADIO_SYSTEM_EXAMPLE } from '../examples/radioSystem';
import { VEHICLE_SYSTEM_EXAMPLE } from '../examples/vehicleSystem';
import { parseSysML } from '../parser/parser';
import type { SysMLNode } from '../parser/types';
import { nodeProperties } from '../utils/nodeProperties';

function flatten(nodes: SysMLNode[]): SysMLNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

const ROOT_EXAMPLE = readFileSync(join(process.cwd(), 'example.sysml'), 'utf8');

const bundledExamples = [
  ['default vehicle example', VEHICLE_SYSTEM_EXAMPLE],
  ['Mars rover example', MARS_ROVER_EXAMPLE],
  ['radio system example', RADIO_SYSTEM_EXAMPLE],
  ['root example.sysml', ROOT_EXAMPLE],
] as const;

describe('bundled SysML examples', () => {
  it.each(bundledExamples)('%s parses without diagnostics or fallback nodes', (_, source) => {
    const parsed = parseSysML(source);
    const unknownNodeNames = flatten(parsed.children)
      .filter((node) => node.kind === 'Unknown')
      .map((node) => node.name);

    expect(parsed.errors).toEqual([]);
    expect(unknownNodeNames).toEqual([]);
  });

  it('preserves typed flows and analysis returns from the radio example', () => {
    const nodes = flatten(parseSysML(RADIO_SYSTEM_EXAMPLE).children);
    const typedFlows = nodes
      .filter((node) => node.kind === 'FlowUsage')
      .map((node) => nodeProperties(node).typeName);
    const returnParam = nodes.find((node) => node.kind === 'AttributeUsage' && node.name === 'totalLatency');

    expect(typedFlows).toContain('DataMessage');
    expect(typedFlows).toContain('Power');
    expect(nodeProperties(returnParam!).direction).toBe('out');
  });

  it('preserves enum literals, metadata, and redefinitions from root example.sysml', () => {
    const nodes = flatten(parseSysML(ROOT_EXAMPLE).children);
    const tailoringLevel = nodes.find((node) => node.kind === 'EnumDef' && node.name === 'TailoringLevel');
    const enumValues = tailoringLevel?.children.map((node) => node.name) ?? [];
    const metadata = nodes.find((node) => node.kind === 'MetadataDef' && node.name === 'ProcessMetadata');
    const triggerMetric = nodes.find(
      (node) => node.kind === 'AttributeUsage' && node.name === 'triggerMetric' && nodeProperties(node).isRedefine,
    );

    expect(enumValues).toEqual(expect.arrayContaining(['Basic', 'Standard', 'Comprehensive']));
    expect(metadata).toBeDefined();
    expect(nodeProperties(triggerMetric!).isRedefine).toBe(true);
    expect(nodeProperties(triggerMetric!).defaultValue).toBe('"M5"');
  });
});
