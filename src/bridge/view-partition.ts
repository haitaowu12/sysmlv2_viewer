import { buildDefaultLayout } from './layout-map';
import type { LayoutMap, SemanticEdge, SemanticModel, SemanticNode } from './semantic-types';

export type DrawioViewMode = 'general' | 'interconnection' | 'requirements' | 'verification' | 'all';

function includeNodeByView(node: SemanticNode, view: DrawioViewMode): boolean {
  if (view === 'all') return true;

  if (view === 'general') {
    return (
      node.kind === 'Package' ||
      node.kind === 'PartDef' ||
      node.kind === 'PartUsage' ||
      node.kind === 'PortDef' ||
      node.kind === 'PortUsage'
    );
  }

  if (view === 'interconnection') {
    return node.kind === 'PartUsage' || node.kind === 'PortUsage' || node.kind === 'ConnectionUsage';
  }

  if (view === 'requirements') {
    return (
      node.kind === 'RequirementDef' ||
      node.kind === 'RequirementUsage' ||
      node.kind === 'PartDef' ||
      node.kind === 'PartUsage' ||
      node.kind === 'VerificationDef' ||
      node.kind === 'VerificationUsage'
    );
  }

  if (view === 'verification') {
    return (
      node.kind === 'VerificationDef' ||
      node.kind === 'VerificationUsage' ||
      node.kind === 'RequirementDef' ||
      node.kind === 'RequirementUsage'
    );
  }

  return true;
}

function includeEdgeByView(edge: SemanticEdge, view: DrawioViewMode): boolean {
  if (view === 'all') return true;

  if (view === 'general') {
    return edge.kind === 'contains' || edge.kind === 'typing';
  }

  if (view === 'interconnection') {
    return edge.kind === 'connection' || edge.kind === 'typing';
  }

  if (view === 'requirements') {
    return edge.kind === 'satisfy' || edge.kind === 'verify' || edge.kind === 'typing';
  }

  if (view === 'verification') {
    return edge.kind === 'verify' || edge.kind === 'typing';
  }

  return true;
}

export function partitionSemanticModelForDrawio(
  model: SemanticModel,
  view: DrawioViewMode,
  previousLayout: LayoutMap = {},
): SemanticModel {
  if (view === 'all') {
    const layout = buildDefaultLayout(model, previousLayout);
    return {
      nodes: model.nodes,
      edges: model.edges,
      layout,
      version: model.version,
    };
  }

  const candidateNodes = model.nodes.filter((node) => includeNodeByView(node, view));
  const nodeIdSet = new Set(candidateNodes.map((node) => node.id));

  const filteredEdges = model.edges.filter((edge) => {
    if (!nodeIdSet.has(edge.sourceId) || !nodeIdSet.has(edge.targetId)) return false;
    return includeEdgeByView(edge, view);
  });

  // Ensure relation endpoints remain visible in scoped views.
  const connectedNodeIds = new Set<string>();
  for (const edge of filteredEdges) {
    connectedNodeIds.add(edge.sourceId);
    connectedNodeIds.add(edge.targetId);
  }

  const nodes = candidateNodes.filter((node) => nodeIdSet.has(node.id) && (connectedNodeIds.size === 0 || connectedNodeIds.has(node.id) || node.kind === 'Package'));
  const finalNodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = filteredEdges.filter((edge) => finalNodeIdSet.has(edge.sourceId) && finalNodeIdSet.has(edge.targetId));

  const scoped: SemanticModel = {
    nodes,
    edges,
    layout: {},
    version: model.version,
  };

  const layout = buildDefaultLayout(scoped, previousLayout);
  return {
    ...scoped,
    layout,
  };
}
