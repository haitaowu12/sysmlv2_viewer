/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSysML } from '../parser/parser';

const releaseDir = process.env.SYSML_V2_RELEASE_DIR;

interface UpstreamFixture {
  path: string;
  lane:
    | 'structure'
    | 'interconnection'
    | 'functionBehavior'
    | 'allocation'
    | 'stateBehavior'
    | 'individualSnapshots'
    | 'variantConfiguration'
    | 'requirements'
    | 'verification'
    | 'analysisTrades'
    | 'views'
    | 'sequence'
    | 'integratedVehicle'
    | 'metadata'
    | 'aliasImport';
  expectedKinds?: string[];
  allowedUnsupported?: string[];
  expectedRelations?: string[];
}

const fixtures: UpstreamFixture[] = [
  { path: 'sysml/src/validation/01-Parts Tree/1a-Parts Tree.sysml', lane: 'structure', expectedKinds: ['Package', 'PartDef'] },
  { path: 'sysml/src/validation/02-Parts Interconnection/2a-Parts Interconnection.sysml', lane: 'interconnection', expectedKinds: ['Package', 'PartUsage', 'ConnectionUsage'] },
  { path: 'sysml/src/validation/03-Function-based Behavior/3a-Function-based Behavior-1.sysml', lane: 'functionBehavior', expectedKinds: ['ActionDef', 'ActionUsage'] },
  { path: 'sysml/src/validation/04-Functional Allocation/4a-Functional Allocation.sysml', lane: 'allocation', expectedKinds: ['AllocationUsage'] },
  { path: 'sysml/src/validation/05-State-based Behavior/5-State-based Behavior-1a.sysml', lane: 'stateBehavior', expectedKinds: ['StateDef', 'StateUsage', 'TransitionUsage'] },
  { path: 'sysml/src/validation/06-Individual and Snapshots/6-Individual and Snapshots.sysml', lane: 'individualSnapshots', allowedUnsupported: ['unsupported:individual', 'unsupported:snapshot', 'unsupported:time-slice'] },
  { path: 'sysml/src/validation/07-Variant Configuration/7b-Variant Configurations.sysml', lane: 'variantConfiguration', allowedUnsupported: ['unsupported:variation', 'unsupported:variant'] },
  { path: 'sysml/src/validation/08-Requirements/8-Requirements.sysml', lane: 'requirements', expectedKinds: ['RequirementDef', 'RequirementUsage'] },
  { path: 'sysml/src/validation/09-Verification/9-Verification-simplified.sysml', lane: 'verification', expectedKinds: ['VerificationDef', 'VerificationUsage'] },
  { path: 'sysml/src/validation/10-Analysis and Trades/10c-Fuel Economy Analysis.sysml', lane: 'analysisTrades', expectedKinds: ['AnalysisDef', 'AnalysisUsage'], allowedUnsupported: ['unsupported:calc'] },
  { path: 'sysml/src/validation/11-View and Viewpoint/11a-View-Viewpoint.sysml', lane: 'views', expectedKinds: ['ViewDef', 'ViewpointDef'] },
  { path: 'sysml/src/validation/17-Sequence Modeling/17a-Sequence-Modeling.sysml', lane: 'sequence', allowedUnsupported: ['unsupported:message', 'unsupported:event-occurrence'] },
  { path: 'sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml', lane: 'integratedVehicle' },
  { path: 'sysml/src/examples/Simple Tests/IndividualTest.sysml', lane: 'individualSnapshots', allowedUnsupported: ['unsupported:individual'] },
  { path: 'sysml/src/examples/Requirements Examples/RequirementDerivationExample.sysml', lane: 'requirements' },
  { path: 'sysml/src/examples/Simple Tests/VerificationTest.sysml', lane: 'verification' },
  { path: 'sysml/src/examples/Variability Examples/VehicleVariabilityModel.sysml', lane: 'variantConfiguration', allowedUnsupported: ['unsupported:variation', 'unsupported:variant'] },
  { path: 'sysml/src/examples/Metadata Examples/IssueMetadataExample.sysml', lane: 'metadata', allowedUnsupported: ['unsupported:metadata-about'] },
  { path: 'sysml/src/examples/Import Tests/AliasImport.sysml', lane: 'aliasImport', expectedKinds: ['Alias'] },
];

const describeIfRelease = releaseDir && existsSync(releaseDir) ? describe : describe.skip;

describeIfRelease('SysML v2 release corpus smoke fixtures', () => {
  for (const fixture of fixtures) {
    it(`parses or recovers visibly from ${fixture.lane}: ${fixture.path}`, () => {
      const path = join(releaseDir as string, fixture.path);
      expect(existsSync(path), `${fixture.path} should exist in SYSML_V2_RELEASE_DIR`).toBe(true);

      const source = readFileSync(path, 'utf8');
      const parsed = parseSysML(source);
      const unknownCount = countKind(parsed.children, 'Unknown');
      const unknownDiagnosticCount = parsed.errors.filter((error) =>
        error.code?.startsWith('unsupported:')
      ).length;

      expect(parsed.children.length).toBeGreaterThan(0);
      expect(unknownDiagnosticCount).toBeGreaterThanOrEqual(unknownCount);
      expect(parsed.errors.length + unknownCount).toBeLessThan(source.split('\n').length);
      for (const expectedKind of fixture.expectedKinds ?? []) {
        expect(countKind(parsed.children, expectedKind), `${fixture.path} should include ${expectedKind}`).toBeGreaterThan(0);
      }
    });
  }
});

function countKind(nodes: ReturnType<typeof parseSysML>['children'], kind: string): number {
  return nodes.reduce((total, node) => total + (node.kind === kind ? 1 : 0) + countKind(node.children, kind), 0);
}
