export type SemanticNodeKind =
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
  | 'FlowUsage'
  | 'BindingUsage'
  | 'RequirementDef'
  | 'RequirementUsage'
  | 'ConstraintDef'
  | 'ConstraintUsage'
  | 'AttributeUsage'
  | 'ItemDef'
  | 'ItemUsage'
  | 'EnumDef'
  | 'EnumUsage'
  | 'UseCaseDef'
  | 'UseCaseUsage'
  | 'ViewDef'
  | 'ViewUsage'
  | 'ViewpointDef'
  | 'ViewpointUsage'
  | 'VerificationDef'
  | 'VerificationUsage'
  | 'AnalysisDef'
  | 'AnalysisUsage'
  | 'MetadataDef'
  | 'AllocationDef'
  | 'AllocationUsage'
  | 'DependencyUsage'
  | 'Unknown';

export type SemanticEdgeKind =
  | 'contains'
  | 'connection'
  | 'satisfy'
  | 'verify'
  | 'typing'
  | 'flow'
  | 'binding'
  | 'transition'
  | 'dependency'
  | 'allocation';

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutMap = Record<string, LayoutRect>;

export interface SemanticNode {
  id: string;
  kind: SemanticNodeKind;
  name: string;
  sysmlPath: string;
  parentId?: string;
  typeName?: string;
  sourceRef?: string;
  targetRef?: string;
}

export interface SemanticEdge {
  id: string;
  kind: SemanticEdgeKind;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface SemanticModel {
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  layout: LayoutMap;
  version: string;
}

export type SyncPatchOp =
  | 'add_node'
  | 'remove_node'
  | 'rename_node'
  | 'reconnect'
  | 'relabel'
  | 'move_resize';

export type SyncPatchSafety = 'safe' | 'review_required';

export interface SyncPatch {
  id: string;
  op: SyncPatchOp;
  safety: SyncPatchSafety;
  targetId: string;
  payload: Record<string, unknown>;
}

export interface SyncDiffResult {
  patches: SyncPatch[];
}

export interface SyncState {
  isSyncing: boolean;
  sourceHash: string;
  drawioSnapshotHash: string;
  lastSyncedAt?: string;
  conflict?: string;
  diagnostics: string[];
}

export interface ApplySyncPatchResult {
  sourceCode: string;
  appliedPatches: SyncPatch[];
  reviewPatches: SyncPatch[];
  diagnostics: string[];
}

// FNV-1a hash used to generate stable draw.io-compatible IDs from SysML paths.
export function sysmlPathHash(path: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const unsigned = hash >>> 0;
  return `n_${unsigned.toString(16)}`;
}

export function edgeHash(sourceId: string, targetId: string, kind: SemanticEdgeKind, label = ''): string {
  return sysmlPathHash(`${kind}:${sourceId}->${targetId}:${label}`);
}

export function normalizeRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/::|\./g).filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}
