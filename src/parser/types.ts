// SysML v2 AST Node Types

export type NodeKind =
    | 'Package'
    | 'PartDef'
    | 'PartUsage'
    | 'PortDef'
    | 'PortUsage'
    | 'ConnectionDef'
    | 'ConnectionUsage'
    | 'InterfaceDef'
    | 'InterfaceUsage'
    | 'ActionDef'
    | 'ActionUsage'
    | 'StateDef'
    | 'StateUsage'
    | 'TransitionUsage'
    | 'RequirementDef'
    | 'RequirementUsage'
    | 'ConstraintDef'
    | 'ConstraintUsage'
    | 'AttributeDef'
    | 'AttributeUsage'
    | 'ItemDef'
    | 'ItemUsage'
    | 'EnumDef'
    | 'EnumUsage'
    | 'EnumValueDef'
    | 'FlowUsage'
    | 'BindingUsage'
    | 'Comment'
    | 'Doc'
    | 'Import'
    | 'Alias'
    | 'CalcDef'
    | 'CalcUsage'
    | 'OccurrenceDef'
    | 'OccurrenceUsage'
    | 'IndividualDef'
    | 'IndividualUsage'
    | 'SnapshotUsage'
    | 'TimeSliceUsage'
    | 'VariationDef'
    | 'VariationUsage'
    | 'VariantUsage'
    | 'MetadataUsage'
    | 'SuccessionUsage'
    | 'MessageUsage'
    | 'EventOccurrenceUsage'
    | 'UseCaseDef'
    | 'UseCaseUsage'
    | 'AllocationDef'
    | 'AllocationUsage'
    | 'DependencyUsage'
    | 'ViewDef'
    | 'ViewUsage'
    | 'ViewpointDef'
    | 'ViewpointUsage'
    | 'VerificationDef'
    | 'VerificationUsage'
    | 'AnalysisDef'
    | 'AnalysisUsage'
    | 'MetadataDef'
    | 'Unknown';

export interface SourceLocation {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
}

export interface SysMLNode {
    kind: NodeKind;
    name: string;
    shortName?: string;
    modifiers?: string[];
    visibility?: 'public' | 'private' | 'protected';
    children: SysMLNode[];
    location?: SourceLocation;
}

export interface Package extends SysMLNode {
    kind: 'Package';
}

export interface PartDef extends SysMLNode {
    kind: 'PartDef';
    superTypes: string[];
}

export interface PartUsage extends SysMLNode {
    kind: 'PartUsage';
    typeName?: string;
    multiplicity?: string;
    isRedefine?: boolean;
}

export interface PortDef extends SysMLNode {
    kind: 'PortDef';
    superTypes: string[];
    isConjugated?: boolean;
}

export interface PortUsage extends SysMLNode {
    kind: 'PortUsage';
    typeName?: string;
    isConjugated?: boolean;
    direction?: 'in' | 'out' | 'inout';
}

export interface ConnectionDef extends SysMLNode {
    kind: 'ConnectionDef';
    ends: EndFeature[];
}

export interface EndFeature {
    name: string;
    typeName: string;
    multiplicity?: string;
}

export interface ConnectionUsage extends SysMLNode {
    kind: 'ConnectionUsage';
    typeName?: string;
    source?: string;
    target?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
}

export interface InterfaceDef extends SysMLNode {
    kind: 'InterfaceDef';
    ends: EndFeature[];
}

export interface InterfaceUsage extends SysMLNode {
    kind: 'InterfaceUsage';
    typeName?: string;
    source?: string;
    target?: string;
}

export interface ActionDef extends SysMLNode {
    kind: 'ActionDef';
    params: ActionParam[];
}

export interface ActionParam {
    direction: 'in' | 'out' | 'inout';
    name: string;
    typeName?: string;
}

export interface ActionUsage extends SysMLNode {
    kind: 'ActionUsage';
    typeName?: string;
    params: ActionParam[];
}

export interface StateDef extends SysMLNode {
    kind: 'StateDef';
}

export interface StateUsage extends SysMLNode {
    kind: 'StateUsage';
    isParallel?: boolean;
    typeName?: string;
}

export interface TransitionUsage extends SysMLNode {
    kind: 'TransitionUsage';
    source: string;
    trigger?: string;
    guard?: string;
    target: string;
    effectAction?: string;
}

export interface RequirementDef extends SysMLNode {
    kind: 'RequirementDef';
    superTypes: string[];
    doc?: string;
    subject?: { name: string; typeName: string };
}

export interface RequirementUsage extends SysMLNode {
    kind: 'RequirementUsage';
    typeName?: string;
    doc?: string;
    subject?: { name: string; typeName: string };
    sourceRef?: string;
    targetRef?: string;
}

export interface ConstraintDef extends SysMLNode {
    kind: 'ConstraintDef';
    expression?: string;
}

export interface ConstraintUsage extends SysMLNode {
    kind: 'ConstraintUsage';
    expression?: string;
    isAssume?: boolean;
    isRequire?: boolean;
}

export interface AttributeDef extends SysMLNode {
    kind: 'AttributeDef';
}

export interface AttributeUsage extends SysMLNode {
    kind: 'AttributeUsage';
    typeName?: string;
    multiplicity?: string;
    defaultValue?: string;
    direction?: 'in' | 'out' | 'inout';
    isRedefine?: boolean;
}

export interface ItemDef extends SysMLNode {
    kind: 'ItemDef';
    superTypes: string[];
}

export interface ItemUsage extends SysMLNode {
    kind: 'ItemUsage';
    typeName?: string;
}

export interface EnumDef extends SysMLNode {
    kind: 'EnumDef';
}

export interface EnumUsage extends SysMLNode {
    kind: 'EnumUsage';
    typeName?: string;
}

export interface FlowUsage extends SysMLNode {
    kind: 'FlowUsage';
    source: string;
    target: string;
    typeName?: string;
}

export interface BindingUsage extends SysMLNode {
    kind: 'BindingUsage';
    source: string;
    target: string;
}

export interface UseCaseDef extends SysMLNode {
    kind: 'UseCaseDef';
}

export interface UseCaseUsage extends SysMLNode {
    kind: 'UseCaseUsage';
    typeName?: string;
    includeKind?: 'include' | 'extend' | 'normal';
}

export interface AllocationDef extends SysMLNode {
    kind: 'AllocationDef';
}

export interface AllocationUsage extends SysMLNode {
    kind: 'AllocationUsage';
    source?: string;
    target?: string;
    typeName?: string;
}

export interface DependencyUsage extends SysMLNode {
    kind: 'DependencyUsage';
    source?: string;
    targets?: string[];
}

export interface CommentNode extends SysMLNode {
    kind: 'Comment';
    text: string;
}

export interface DocNode extends SysMLNode {
    kind: 'Doc';
    text: string;
}

export interface ImportNode extends SysMLNode {
    kind: 'Import';
    importPath: string;
    isAll?: boolean;
}

export interface AliasNode extends SysMLNode {
    kind: 'Alias';
    targetRef?: string;
}

export interface CalcDef extends SysMLNode {
    kind: 'CalcDef';
    params?: ActionParam[];
    returnType?: string;
}

export interface CalcUsage extends SysMLNode {
    kind: 'CalcUsage';
    typeName?: string;
    args?: string[];
}

export interface OccurrenceDef extends SysMLNode {
    kind: 'OccurrenceDef';
    typeName?: string;
}

export interface OccurrenceUsage extends SysMLNode {
    kind: 'OccurrenceUsage';
    typeName?: string;
    snapshotOf?: string;
    timeSliceOf?: string;
}

export interface IndividualDef extends SysMLNode {
    kind: 'IndividualDef';
    typeName?: string;
}

export interface IndividualUsage extends SysMLNode {
    kind: 'IndividualUsage';
    typeName?: string;
}

export interface SnapshotUsage extends SysMLNode {
    kind: 'SnapshotUsage';
    typeName?: string;
    snapshotOf?: string;
}

export interface TimeSliceUsage extends SysMLNode {
    kind: 'TimeSliceUsage';
    typeName?: string;
    timeSliceOf?: string;
}

export interface VariationDef extends SysMLNode {
    kind: 'VariationDef';
    variants?: string[];
}

export interface VariationUsage extends SysMLNode {
    kind: 'VariationUsage';
    typeName?: string;
    variants?: string[];
}

export interface VariantUsage extends SysMLNode {
    kind: 'VariantUsage';
    typeName?: string;
    variantOf?: string;
}

export interface MetadataUsage extends SysMLNode {
    kind: 'MetadataUsage';
    typeName?: string;
    about?: string;
}

export interface SuccessionUsage extends SysMLNode {
    kind: 'SuccessionUsage';
    source?: string;
    target?: string;
    guard?: string;
}

export interface MessageUsage extends SysMLNode {
    kind: 'MessageUsage';
    source?: string;
    target?: string;
    payloadType?: string;
}

export interface EventOccurrenceUsage extends SysMLNode {
    kind: 'EventOccurrenceUsage';
    typeName?: string;
}

export interface ViewpointDef extends SysMLNode {
    kind: 'ViewpointDef';
    concerns?: string[];
    stakeholder?: string;
}

export interface ViewpointUsage extends SysMLNode {
    kind: 'ViewpointUsage';
    typeName?: string;
}

export interface ViewDef extends SysMLNode {
    kind: 'ViewDef';
    viewpoint?: string;
    stakeholder?: string;
}

export interface ViewUsage extends SysMLNode {
    kind: 'ViewUsage';
    typeName?: string;
}

export interface VerificationDef extends SysMLNode {
    kind: 'VerificationDef';
    subject?: { name: string; typeName?: string };
}

export interface VerificationUsage extends SysMLNode {
    kind: 'VerificationUsage';
    typeName?: string;
    subject?: { name: string; typeName?: string };
    targetRef?: string;
}

export interface AnalysisDef extends SysMLNode {
    kind: 'AnalysisDef';
    params?: ActionParam[];
}

export interface AnalysisUsage extends SysMLNode {
    kind: 'AnalysisUsage';
    typeName?: string;
}

export interface MetadataDef extends SysMLNode {
    kind: 'MetadataDef';
    attributes?: { name: string; typeName?: string; value?: string }[];
}

export interface EnumValueDef extends SysMLNode {
    kind: 'EnumValueDef';
    value?: string;
}

export interface SysMLModel {
    children: SysMLNode[];
    errors: ParseError[];
}

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ParseError {
    message: string;
    location?: SourceLocation;
    severity?: ErrorSeverity;
    code?: string;
    suggestion?: string;
    context?: string;
}

export type AnyDefinition = PartDef | PortDef | ConnectionDef | InterfaceDef | ActionDef | StateDef | RequirementDef | ConstraintDef | AttributeDef | ItemDef | EnumDef | ViewpointDef | ViewDef | VerificationDef | AnalysisDef | MetadataDef | UseCaseDef | AllocationDef | CalcDef | OccurrenceDef | IndividualDef | VariationDef;
export type AnyUsage = PartUsage | PortUsage | ConnectionUsage | InterfaceUsage | ActionUsage | StateUsage | RequirementUsage | ConstraintUsage | AttributeUsage | ItemUsage | EnumUsage | ViewpointUsage | ViewUsage | VerificationUsage | AnalysisUsage | UseCaseUsage | AllocationUsage | DependencyUsage | CalcUsage | OccurrenceUsage | IndividualUsage | SnapshotUsage | TimeSliceUsage | VariationUsage | VariantUsage | MetadataUsage | SuccessionUsage | MessageUsage | EventOccurrenceUsage;
