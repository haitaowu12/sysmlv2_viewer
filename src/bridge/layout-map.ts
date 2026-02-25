import type { LayoutMap, SemanticModel } from './semantic-types';
import dagre from 'dagre';

const START_X = 40;
const START_Y = 40;
const NUDGE_STEP = 32;
const MAX_NUDGE_ATTEMPTS = 32;

const DEFAULT_WIDTH: Record<string, number> = {
  Package: 240,
  PartDef: 220,
  PartUsage: 220,
  PortDef: 180,
  PortUsage: 180,
  ConnectionUsage: 200,
  RequirementDef: 260,
  RequirementUsage: 240,
  VerificationDef: 220,
  VerificationUsage: 220,
  Unknown: 220,
};

const DEFAULT_HEIGHT: Record<string, number> = {
  Package: 120,
  PartDef: 90,
  PartUsage: 90,
  PortDef: 70,
  PortUsage: 70,
  ConnectionUsage: 70,
  RequirementDef: 110,
  RequirementUsage: 100,
  VerificationDef: 90,
  VerificationUsage: 90,
  Unknown: 90,
};

function nodeBand(kind: string): number {
  if (kind === 'RequirementDef' || kind === 'RequirementUsage') return 1;
  if (kind === 'VerificationDef' || kind === 'VerificationUsage') return 2;
  if (kind === 'Unknown') return 3;
  return 0;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function snap(n: number): number {
  return Math.round(n / 10) * 10;
}

function buildSmartLayout(model: SemanticModel): LayoutMap {
  const layout: LayoutMap = {};
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 140,
    marginx: START_X,
    marginy: START_Y,
  });

  for (const node of model.nodes) {
    graph.setNode(node.id, {
      width: DEFAULT_WIDTH[node.kind] ?? 220,
      height: DEFAULT_HEIGHT[node.kind] ?? 90,
    });
  }

  const layoutEdges = model.edges.filter((edge) => edge.kind !== 'contains');
  const effectiveEdges = layoutEdges.length > 0 ? layoutEdges : model.edges;
  for (const edge of effectiveEdges) {
    graph.setEdge(edge.sourceId, edge.targetId);
  }

  dagre.layout(graph);

  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (const node of model.nodes) {
    const measured = graph.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    const width = DEFAULT_WIDTH[node.kind] ?? 220;
    const height = DEFAULT_HEIGHT[node.kind] ?? 90;
    const bandOffset = nodeBand(node.kind) * 320;

    let x = snap((measured?.x ?? START_X + width / 2) - width / 2);
    let y = snap((measured?.y ?? START_Y + height / 2) - height / 2 + bandOffset);

    let attempts = 0;
    let candidate = { x, y, width, height };
    while (placed.some((other) => rectsOverlap(candidate, other)) && attempts < MAX_NUDGE_ATTEMPTS) {
      attempts += 1;
      y += NUDGE_STEP;
      candidate = { x, y, width, height };
    }

    layout[node.id] = candidate;
    placed.push(candidate);
  }

  return layout;
}

export function buildDefaultLayout(model: SemanticModel, previous: LayoutMap = {}): LayoutMap {
  // When no prior layout exists, compute a graph-aware layout instead of plain grid placement.
  if (Object.keys(previous).length === 0) {
    return buildSmartLayout(model);
  }

  const baseline = buildSmartLayout(model);
  const layout: LayoutMap = {};

  // Preserve existing coordinates to avoid jitter during incremental edits,
  // but inherit smart sizing for consistency and place new nodes with smart layout.
  model.nodes.forEach((node, index) => {
    const preserved = previous[node.id];
    const suggested = baseline[node.id];
    const width = DEFAULT_WIDTH[node.kind] ?? 220;
    const height = DEFAULT_HEIGHT[node.kind] ?? 90;

    if (preserved) {
      layout[node.id] = {
        x: preserved.x,
        y: preserved.y,
        width,
        height,
      };
      return;
    }

    layout[node.id] = suggested ?? {
      x: START_X + index * 40,
      y: START_Y + index * 20,
      width,
      height,
    };
  });

  return layout;
}
