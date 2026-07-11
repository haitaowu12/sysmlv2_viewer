/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSysML } from '../parser/parser';

const releaseDir = process.env.SYSML_V2_RELEASE_DIR;
const pinnedCorpusCommit = '9baca5908ca28b53da085de69336fde48420ea8f';
const genericRecovery = 'unsupported:unrecognized-construct';

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
    | 'useCases'
    | 'integratedVehicle'
    | 'metadata'
    | 'aliasImport';
  expectedKinds?: string[];
  allowedUnsupported?: string[];
  expectedRelations?: string[];
}

const fixtures: UpstreamFixture[] = [
  { path: 'sysml/src/validation/01-Parts Tree/1a-Parts Tree.sysml', lane: 'structure', expectedKinds: ['Package', 'PartDef'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/02-Parts Interconnection/2a-Parts Interconnection.sysml', lane: 'interconnection', expectedKinds: ['Package', 'PartUsage'], expectedRelations: ['ConnectionUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/03-Function-based Behavior/3a-Function-based Behavior-1.sysml', lane: 'functionBehavior', expectedKinds: ['ActionDef', 'ActionUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/04-Functional Allocation/4a-Functional Allocation.sysml', lane: 'allocation', expectedKinds: ['PartUsage', 'ActionUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/05-State-based Behavior/5-State-based Behavior-1a.sysml', lane: 'stateBehavior', expectedKinds: ['StateDef', 'StateUsage'], expectedRelations: ['TransitionUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/06-Individual and Snapshots/6-Individual and Snapshots.sysml', lane: 'individualSnapshots', expectedKinds: ['IndividualDef', 'IndividualUsage', 'SnapshotUsage'], allowedUnsupported: ['unsupported:individual', 'unsupported:snapshot', 'unsupported:time-slice', genericRecovery] },
  { path: 'sysml/src/validation/07-Variant Configuration/7b-Variant Configurations.sysml', lane: 'variantConfiguration', expectedKinds: ['VariationUsage', 'VariantUsage'], allowedUnsupported: ['unsupported:variation', 'unsupported:variant', genericRecovery] },
  { path: 'sysml/src/validation/08-Requirements/8-Requirements.sysml', lane: 'requirements', expectedKinds: ['RequirementDef', 'RequirementUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/09-Verification/9-Verification-simplified.sysml', lane: 'verification', expectedKinds: ['VerificationDef'], expectedRelations: ['VerificationUsage'], allowedUnsupported: [genericRecovery, 'unsupported:individual', 'unsupported:time-slice'] },
  { path: 'sysml/src/validation/10-Analysis and Trades/10c-Fuel Economy Analysis.sysml', lane: 'analysisTrades', expectedKinds: ['AnalysisDef', 'AnalysisUsage'], allowedUnsupported: ['unsupported:calc', genericRecovery] },
  { path: 'sysml/src/validation/11-View and Viewpoint/11a-View-Viewpoint.sysml', lane: 'views', expectedKinds: ['ViewUsage', 'ViewpointUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/validation/17-Sequence Modeling/17a-Sequence-Modeling.sysml', lane: 'sequence', expectedKinds: ['OccurrenceDef', 'MessageUsage', 'EventOccurrenceUsage'], allowedUnsupported: ['unsupported:message', 'unsupported:event-occurrence', 'unsupported:occurrence', genericRecovery] },
  { path: 'sysml/src/training/10. Ports/Port Example.sysml', lane: 'interconnection', expectedKinds: ['PortDef', 'AttributeUsage'] },
  { path: 'sysml/src/training/13. Flows/Flow Interface Example.sysml', lane: 'interconnection', expectedKinds: ['InterfaceDef', 'InterfaceUsage', 'FlowUsage'] },
  { path: 'sysml/src/training/23. State Definitions/State Definition Example-2.sysml', lane: 'stateBehavior', expectedKinds: ['StateDef', 'StateUsage'], expectedRelations: ['TransitionUsage'] },
  { path: 'sysml/src/training/34. Verification/Verification Case Definition Example.sysml', lane: 'verification', expectedKinds: ['VerificationDef', 'VerificationUsage'] },
  { path: 'sysml/src/training/35. Use Cases/Use Case Definition Example.sysml', lane: 'useCases', expectedKinds: ['UseCaseDef', 'PartUsage'] },
  { path: 'sysml/src/training/35. Use Cases/Use Case Usage Example.sysml', lane: 'useCases', expectedKinds: ['UseCaseUsage', 'TransitionUsage'] },
  { path: 'sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml', lane: 'integratedVehicle', expectedKinds: ['Package', 'PartDef', 'RequirementDef', 'VerificationDef'], allowedUnsupported: [genericRecovery, 'unsupported:occurrence', 'unsupported:event', 'unsupported:event-occurrence', 'unsupported:message', 'unsupported:calc', 'unsupported:snapshot', 'unsupported:time-slice', 'unsupported:individual', 'unsupported:variant', 'unsupported:variation'] },
  { path: 'sysml/src/examples/Simple Tests/IndividualTest.sysml', lane: 'individualSnapshots', expectedKinds: ['IndividualUsage'], allowedUnsupported: ['unsupported:individual'] },
  { path: 'sysml/src/examples/Requirements Examples/RequirementDerivationExample.sysml', lane: 'requirements', expectedKinds: ['RequirementDef', 'RequirementUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/examples/Simple Tests/VerificationTest.sysml', lane: 'verification', expectedKinds: ['VerificationDef', 'VerificationUsage'], allowedUnsupported: [genericRecovery] },
  { path: 'sysml/src/examples/Variability Examples/VehicleVariabilityModel.sysml', lane: 'variantConfiguration', expectedKinds: ['VariationUsage', 'VariantUsage'], allowedUnsupported: ['unsupported:variation', 'unsupported:variant', genericRecovery] },
  { path: 'sysml/src/examples/Metadata Examples/IssueMetadataExample.sysml', lane: 'metadata', expectedKinds: ['MetadataUsage'], allowedUnsupported: ['unsupported:metadata-about', genericRecovery] },
  { path: 'sysml/src/examples/Import Tests/AliasImport.sysml', lane: 'aliasImport', expectedKinds: ['Alias'] },
];

// An unset corpus path is an intentional local/CI skip. A configured but missing,
// unreadable, or unpinned checkout must run and fail closed instead of silently skipping.
const describeIfRelease = releaseDir ? describe : describe.skip;

describeIfRelease('SysML v2 release corpus smoke fixtures', () => {
  it('uses the pinned SysML v2 release corpus commit', () => {
    expect(existsSync(releaseDir as string), 'SYSML_V2_RELEASE_DIR should point to an existing checkout').toBe(true);

    const actualCommit = execFileSync('git', ['-C', releaseDir as string, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(actualCommit, 'SYSML_V2_RELEASE_DIR should resolve to the documented 2026-04 corpus commit').toBe(pinnedCorpusCommit);
  });

  for (const fixture of fixtures) {
    it(`parses or recovers visibly from ${fixture.lane}: ${fixture.path}`, () => {
      const path = join(releaseDir as string, fixture.path);
      expect(existsSync(path), `${fixture.path} should exist in SYSML_V2_RELEASE_DIR`).toBe(true);

      const source = readFileSync(path, 'utf8');
      const parsed = parseSysML(source);
      const unknownCount = countKind(parsed.children, 'Unknown');
      const unsupportedCodes = [...new Set(parsed.errors
        .map((error) => error.code)
        .filter((code): code is string => code?.startsWith('unsupported:') ?? false))];
      const unexpectedUnsupported = unsupportedCodes.filter(
        (code) => !(fixture.allowedUnsupported ?? []).includes(code)
      );
      const unknownDiagnosticCount = parsed.errors.filter((error) => error.code?.startsWith('unsupported:')).length;

      expect(parsed.children.length).toBeGreaterThan(0);
      expect(unknownDiagnosticCount).toBeGreaterThanOrEqual(unknownCount);
      expect(parsed.errors.length + unknownCount).toBeLessThan(source.split('\n').length);
      expect(
        unexpectedUnsupported,
        `${fixture.path} should not recover through unsupported constructs outside its explicit allowance`
      ).toEqual([]);
      for (const expectedKind of fixture.expectedKinds ?? []) {
        expect(countKind(parsed.children, expectedKind), `${fixture.path} should include ${expectedKind}`).toBeGreaterThan(0);
      }
      for (const expectedRelation of fixture.expectedRelations ?? []) {
        expect(
          countKind(parsed.children, expectedRelation),
          `${fixture.path} should include relation ${expectedRelation}`
        ).toBeGreaterThan(0);
      }
    });
  }
});

function countKind(nodes: ReturnType<typeof parseSysML>['children'], kind: string): number {
  return nodes.reduce((total, node) => total + (node.kind === kind ? 1 : 0) + countKind(node.children, kind), 0);
}
