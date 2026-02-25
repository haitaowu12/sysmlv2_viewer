import { parseSysML } from '../parser/parser';
import type {
  ConnectionUsage,
  RequirementUsage,
  SysMLModel,
  SysMLNode,
  VerificationUsage,
} from '../parser/types';
import { buildDefaultLayout } from './layout-map';
import type {
  LayoutMap,
  SemanticEdge,
  SemanticEdgeKind,
  SemanticModel,
  SemanticNode,
  SemanticNodeKind,
} from './semantic-types';
import { edgeHash, normalizeRef, sysmlPathHash } from './semantic-types';

const KIND_MAP: Partial<Record<SysMLNode['kind'], SemanticNodeKind>> = {
  Package: 'Package',
  PartDef: 'PartDef',
  PartUsage: 'PartUsage',
  PortDef: 'PortDef',
  PortUsage: 'PortUsage',
  ConnectionUsage: 'ConnectionUsage',
  RequirementDef: 'RequirementDef',
  RequirementUsage: 'RequirementUsage',
  VerificationDef: 'VerificationDef',
  VerificationUsage: 'VerificationUsage',
};

interface SemanticIndexEntry {
  id: string;
  path: string;
  node: SysMLNode;
  kind: SemanticNodeKind;
  parentId?: string;
}

interface PendingRelation {
  kind: SemanticEdgeKind;
  sourceId: string;
  targetRef: string;
  label?: string;
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

export function toSemanticKind(kind: SysMLNode['kind']): SemanticNodeKind | null {
  return KIND_MAP[kind] ?? null;
}

function kindOrder(kind: SemanticNodeKind): number {
  const order: Record<SemanticNodeKind, number> = {
    Package: 0,
    PartDef: 1,
    PartUsage: 2,
    PortDef: 3,
    PortUsage: 4,
    ConnectionUsage: 5,
    RequirementDef: 6,
    RequirementUsage: 7,
    VerificationDef: 8,
    VerificationUsage: 9,
    Unknown: 99,
  };
  return order[kind] ?? 99;
}

export function buildNodePath(parentPath: string, node: SysMLNode, occurrence: number): string {
  return `${parentPath}/${node.kind}:${node.name}#${occurrence}`;
}

function collectSemanticIndex(
  nodes: SysMLNode[],
  parentSemanticId: string | undefined,
  parentPath: string,
  output: SemanticIndexEntry[],
): void {
  const counters = new Map<string, number>();

  for (const node of nodes) {
    const key = `${node.kind}:${node.name}`;
    const nextOccurrence = (counters.get(key) ?? 0) + 1;
    counters.set(key, nextOccurrence);

    const semanticKind = toSemanticKind(node.kind);
    const path = buildNodePath(parentPath, node, nextOccurrence);

    let nextParentId = parentSemanticId;
    let nextParentPath = parentPath;

    if (semanticKind) {
      const id = sysmlPathHash(path);
      output.push({
        id,
        path,
        node,
        kind: semanticKind,
        parentId: parentSemanticId,
      });
      nextParentId = id;
      nextParentPath = path;
    }

    if (node.children.length > 0) {
      collectSemanticIndex(node.children, nextParentId, nextParentPath, output);
    }
  }
}

export function indexSysmlSemanticNodes(model: SysMLModel): SemanticIndexEntry[] {
  const entries: SemanticIndexEntry[] = [];
  collectSemanticIndex(model.children, undefined, 'root', entries);
  entries.sort((a, b) => {
    if (a.path === b.path) {
      return kindOrder(a.kind) - kindOrder(b.kind);
    }
    return a.path.localeCompare(b.path);
  });
  return entries;
}

function buildNodeRefIndex(nodes: SemanticNode[]): Map<string, SemanticNode[]> {
  const index = new Map<string, SemanticNode[]>();

  for (const node of nodes) {
    const tokens = [node.name, normalizeRef(node.name), normalizeRef(node.sysmlPath)]
      .map(lower)
      .filter(Boolean);

    for (const token of tokens) {
      const bucket = index.get(token) ?? [];
      bucket.push(node);
      index.set(token, bucket);
    }
  }

  return index;
}

function pickByKind(candidates: SemanticNode[], preferredKinds: SemanticNodeKind[]): SemanticNode | undefined {
  for (const preferred of preferredKinds) {
    const exact = candidates.find((candidate) => candidate.kind === preferred);
    if (exact) return exact;
  }
  return candidates[0];
}

function resolveRef(
  refIndex: Map<string, SemanticNode[]>,
  rawRef: string,
  preferredKinds: SemanticNodeKind[],
): SemanticNode | undefined {
  if (!rawRef.trim()) return undefined;
  const byNormalized = refIndex.get(lower(normalizeRef(rawRef))) ?? [];
  if (byNormalized.length > 0) {
    return pickByKind(byNormalized, preferredKinds);
  }

  const byRaw = refIndex.get(lower(rawRef)) ?? [];
  if (byRaw.length > 0) {
    return pickByKind(byRaw, preferredKinds);
  }

  return undefined;
}

export function buildSemanticModelFromSysMLModel(
  model: SysMLModel,
  previousLayout: LayoutMap = {},
): SemanticModel {
  const semanticNodes: SemanticNode[] = [];
  const semanticEdges: SemanticEdge[] = [];
  const pendingRelations: PendingRelation[] = [];

  const indexed = indexSysmlSemanticNodes(model);

  for (const entry of indexed) {
    const astNode = entry.node;

    const semanticNode: SemanticNode = {
      id: entry.id,
      kind: entry.kind,
      name: astNode.name,
      sysmlPath: entry.path,
      parentId: entry.parentId,
    };

    if ('typeName' in astNode && typeof astNode.typeName === 'string') {
      semanticNode.typeName = astNode.typeName;
    }

    if (entry.kind === 'ConnectionUsage') {
      const connection = astNode as ConnectionUsage;
      semanticNode.sourceRef = connection.source;
      semanticNode.targetRef = connection.target;
    }

    semanticNodes.push(semanticNode);

    if (entry.parentId) {
      semanticEdges.push({
        id: edgeHash(entry.parentId, entry.id, 'contains'),
        kind: 'contains',
        sourceId: entry.parentId,
        targetId: entry.id,
      });
    }

    if (entry.kind === 'PartUsage' || entry.kind === 'PortUsage') {
      if (semanticNode.typeName) {
        pendingRelations.push({
          kind: 'typing',
          sourceId: entry.id,
          targetRef: semanticNode.typeName,
        });
      }
    }

    if (entry.kind === 'RequirementUsage') {
      const requirement = astNode as RequirementUsage;
      if (requirement.typeName) {
        pendingRelations.push({
          kind: 'typing',
          sourceId: entry.id,
          targetRef: requirement.typeName,
        });
      }

      const satisfyParentId = entry.parentId;
      const isSatisfyCall = !requirement.typeName && !requirement.children.length && Boolean(satisfyParentId);
      if (isSatisfyCall && satisfyParentId) {
        pendingRelations.push({
          kind: 'satisfy',
          sourceId: satisfyParentId,
          targetRef: requirement.name,
          label: 'satisfy',
        });
      }
    }

    if (entry.kind === 'VerificationUsage') {
      const verification = astNode as VerificationUsage;
      if (verification.typeName) {
        pendingRelations.push({
          kind: 'typing',
          sourceId: entry.id,
          targetRef: verification.typeName,
        });
      }

      const verifyParentId = entry.parentId;
      const isVerifyCall = !verification.typeName && !verification.children.length && Boolean(verifyParentId);
      if (isVerifyCall && verifyParentId) {
        pendingRelations.push({
          kind: 'verify',
          sourceId: verifyParentId,
          targetRef: verification.name,
          label: 'verify',
        });
      }
    }

    if (entry.kind === 'ConnectionUsage') {
      const connection = astNode as ConnectionUsage;
      if (connection.source && connection.target) {
        pendingRelations.push({
          kind: 'connection',
          sourceId: entry.id,
          targetRef: connection.source,
          label: 'source',
        });
        pendingRelations.push({
          kind: 'connection',
          sourceId: entry.id,
          targetRef: connection.target,
          label: 'target',
        });
      }
    }
  }

  const refIndex = buildNodeRefIndex(semanticNodes);

  for (const relation of pendingRelations) {
    if (relation.kind === 'connection') {
      const endpointKinds: SemanticNodeKind[] = ['PartUsage', 'PortUsage', 'PartDef', 'PortDef'];
      const endpoint = resolveRef(refIndex, relation.targetRef, endpointKinds);
      if (!endpoint) continue;

      semanticEdges.push({
        id: edgeHash(relation.sourceId, endpoint.id, 'connection', relation.label),
        kind: 'connection',
        sourceId: relation.sourceId,
        targetId: endpoint.id,
        label: relation.label,
      });
      continue;
    }

    if (relation.kind === 'typing') {
      const typeKinds: SemanticNodeKind[] = ['PartDef', 'PortDef', 'RequirementDef', 'VerificationDef'];
      const typeNode = resolveRef(refIndex, relation.targetRef, typeKinds);
      if (!typeNode) continue;

      semanticEdges.push({
        id: edgeHash(relation.sourceId, typeNode.id, 'typing'),
        kind: 'typing',
        sourceId: relation.sourceId,
        targetId: typeNode.id,
      });
      continue;
    }

    if (relation.kind === 'satisfy' || relation.kind === 'verify') {
      const requirementKinds: SemanticNodeKind[] = ['RequirementDef', 'RequirementUsage'];
      const requirementNode = resolveRef(refIndex, relation.targetRef, requirementKinds);
      if (!requirementNode) continue;

      semanticEdges.push({
        id: edgeHash(relation.sourceId, requirementNode.id, relation.kind),
        kind: relation.kind,
        sourceId: relation.sourceId,
        targetId: requirementNode.id,
        label: relation.label,
      });
    }
  }

  const layout = buildDefaultLayout({
    nodes: semanticNodes,
    edges: semanticEdges,
    layout: previousLayout,
    version: 'bridge-v1',
  }, previousLayout);

  return {
    nodes: semanticNodes,
    edges: semanticEdges,
    layout,
    version: 'bridge-v1',
  };
}

export function buildSemanticModelFromSource(sourceCode: string, previousLayout: LayoutMap = {}): SemanticModel {
  const parsed = parseSysML(sourceCode);
  return buildSemanticModelFromSysMLModel(parsed, previousLayout);
}
