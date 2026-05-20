/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSysML } from '../parser/parser';

const releaseDir = process.env.SYSML_V2_RELEASE_DIR;

const fixtures = [
  'sysml/src/validation/01-Parts Tree/1a-Parts Tree.sysml',
  'sysml/src/validation/02-Parts Interconnection/2a-Parts Interconnection.sysml',
  'sysml/src/validation/08-Requirements/8-Requirements.sysml',
  'sysml/src/validation/09-Verification/9-Verification-simplified.sysml',
  'sysml/src/validation/11-View and Viewpoint/11a-View-Viewpoint.sysml',
  'sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml',
  'sysml/src/examples/Simple Tests/IndividualTest.sysml',
];

const describeIfRelease = releaseDir && existsSync(releaseDir) ? describe : describe.skip;

describeIfRelease('SysML v2 release corpus smoke fixtures', () => {
  for (const relativePath of fixtures) {
    it(`parses or recovers visibly from ${relativePath}`, () => {
      const path = join(releaseDir as string, relativePath);
      expect(existsSync(path), `${relativePath} should exist in SYSML_V2_RELEASE_DIR`).toBe(true);

      const source = readFileSync(path, 'utf8');
      const parsed = parseSysML(source);
      const unknownCount = countKind(parsed.children, 'Unknown');

      expect(parsed.children.length).toBeGreaterThan(0);
      expect(parsed.errors.length + unknownCount).toBeLessThan(source.split('\n').length);
    });
  }
});

function countKind(nodes: ReturnType<typeof parseSysML>['children'], kind: string): number {
  return nodes.reduce((total, node) => total + (node.kind === kind ? 1 : 0) + countKind(node.children, kind), 0);
}
