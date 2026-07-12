export const OFFICIAL_CORPUS = {
  repository: 'https://github.com/Systems-Modeling/SysML-v2-Release',
  tag: '2026-04',
  commit: '9baca5908ca28b53da085de69336fde48420ea8f',
  license: {
    path: 'LICENSE',
    spdx: 'EPL-2.0',
  },
} as const;

export const GENERIC_RECOVERY_DIAGNOSTIC = 'unsupported:unrecognized-construct';

export type OfficialFixtureLane =
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

export interface OfficialFixtureExpectation {
  path: string;
  lane: OfficialFixtureLane;
  expectedKinds?: string[];
  allowedUnsupported?: string[];
  expectedRelations?: string[];
}

const genericRecovery = GENERIC_RECOVERY_DIAGNOSTIC;

export const OFFICIAL_FIXTURES: OfficialFixtureExpectation[] = [
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
