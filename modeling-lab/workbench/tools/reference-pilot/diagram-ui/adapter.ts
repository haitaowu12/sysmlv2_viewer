// Lab host adapter; donor canvas modules remain unchanged. See README.md.
import type { RenderResult, RenderNode, RenderEdge, RenderStyle } from './vendor/protocol';

export interface SourceSpan { file: string; startLine: number; startCol: number; endLine: number; endCol: number }
export interface SDKNode {
  id: string; kind: string; name?: string; type?: string; detail?: string; parent?: string;
  nameSynthesized?: boolean; standIn?: boolean; origin?: SourceSpan;
  ports?: readonly { id: string; name: string; type?: string; direction?: string }[];
  geometry?: { x: number; y: number; width?: number; height?: number; hasSize?: boolean; collapsed?: boolean };
  style?: Record<string, unknown>;
}
export interface SDKEdge {
  from: string; to: string; fromPort?: string; toPort?: string; label?: string; kind: string;
  origin?: SourceSpan; route?: readonly { x: number; y: number }[]; style?: Record<string, unknown>;
}
export interface SDKView {
  view: string; kind: string; stated?: string; nodes?: readonly SDKNode[]; edges?: readonly SDKEdge[];
  notices?: readonly string[]; columns?: readonly string[];
  rows?: readonly { cells: readonly string[]; origin?: SourceSpan }[];
  notes?: readonly { text: string; anchor?: string; edgeFrom?: string; edgeTo?: string; origin?: SourceSpan }[];
  canvas?: { unit?: string; width?: number; height?: number; hasSize?: boolean };
}
export interface DiagramSummary {
  totalNodes: number; visibleNodes: number; omittedNodes: number;
  totalEdges: number; visibleEdges: number; omittedEdges: number;
  invalidEdges: number; depth: number | null; notes: number; missingOrigins: number;
  notices: string[];
}

// Protobuf supplies empty strings for unstated optional fields. Keep them absent
// at the editor seam: e.g. an empty parent is a root, and an empty port is no port.
function styleOf(style?: Record<string, unknown>): RenderStyle | undefined {
  if (!style) return undefined;
  const clean: Record<string, unknown> = {};
  for (const key of ['fill', 'line', 'text', 'font']) if (typeof style[key] === 'string' && style[key]) clean[key] = style[key];
  if (typeof style.fontSize === 'number' && style.fontSize > 0) clean.fontSize = style.fontSize;
  for (const key of ['bold', 'italic']) if (style[key] === true) clean[key] = true;
  return Object.keys(clean).length ? clean as RenderStyle : undefined;
}

/** Filter only presentation depth. Never infer semantic membership from labels. */
export function readableName(name: string): string {
  // Readability transform only: no abbreviations expanded, qualified path
  // segments discarded, or replacement labels inferred from model contents.
  return name.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

export function adaptDiagram(view: SDKView, depth?: number, audience?: string) {
  const sourceNodes = view.nodes ?? [];
  const byId = new Map<string, SDKNode>();
  for (const node of sourceNodes) {
    if (!node.id || byId.has(node.id)) throw new Error('Diagram has a missing or repeated node identity.');
    byId.set(node.id, node);
  }
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  function level(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visiting.has(id)) throw new Error('Diagram ownership contains a cycle.');
    visiting.add(id);
    const node = byId.get(id)!;
    const value = node.parent && byId.has(node.parent) ? level(node.parent) + 1 : 0;
    visiting.delete(id); depths.set(id, value); return value;
  }
  const limit = typeof depth === 'number' && Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : Infinity;
  // Calculate all levels first so a cycle cannot disappear behind a depth cap.
  for (const node of sourceNodes) level(node.id);
  function underCollapsedOwner(node: SDKNode): boolean {
    let parent = node.parent ? byId.get(node.parent) : undefined;
    while (parent) {
      if (parent.geometry?.collapsed) return true;
      parent = parent.parent ? byId.get(parent.parent) : undefined;
    }
    return false;
  }
  const shown = sourceNodes.filter(node => level(node.id) <= limit && !underCollapsedOwner(node));
  const shownIds = new Set(shown.map(node => node.id));
  const nodes: RenderNode[] = shown.map(node => {
    const geometry = node.geometry;
    const hasXY = geometry && Number.isFinite(geometry.x) && Number.isFinite(geometry.y);
    const hasSize = geometry?.hasSize === true && Number.isFinite(geometry.width) && Number.isFinite(geometry.height) && geometry.width! > 0 && geometry.height! > 0;
    const hiddenChildren = sourceNodes.some(child => child.parent === node.id && !shownIds.has(child.id));
    return {
      id: node.id, kind: node.kind, name: audience?.toLowerCase() === 'stakeholder' ? readableName(node.name ?? '') : node.name ?? '', type: node.type ?? '', detail: node.detail ?? '',
      ...(node.parent && shownIds.has(node.parent) ? { parent: node.parent } : {}),
      ports: (node.ports ?? []).map(port => ({ ...port, ...(port.type ? { type: port.type } : {}), ...(port.direction ? { direction: port.direction } : {}) })),
      ...(hasXY ? { x: geometry.x, y: geometry.y } : {}),
      ...(hasSize ? { width: geometry.width, height: geometry.height } : {}),
      ...(geometry?.collapsed || hiddenChildren ? { collapsed: true } : {}),
      ...(styleOf(node.style) ? { style: styleOf(node.style), fill: styleOf(node.style)?.fill, border: styleOf(node.style)?.line } : {}),
      // No FQN or editor declaration is fabricated. Source spans stay in the
      // selection map and are handed to the host unchanged.
    };
  });
  let invalidEdges = 0;
  const edges: RenderEdge[] = [];
  const sourceEdges: SDKEdge[] = [];
  for (const edge of view.edges ?? []) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) { invalidEdges++; continue; }
    if (!shownIds.has(edge.from) || !shownIds.has(edge.to)) continue;
    const from = byId.get(edge.from)!, to = byId.get(edge.to)!;
    if ((edge.fromPort && !from.ports?.some(port => port.id === edge.fromPort)) || (edge.toPort && !to.ports?.some(port => port.id === edge.toPort))) { invalidEdges++; continue; }
    sourceEdges.push(edge);
    edges.push({ from: edge.from, to: edge.to, kind: edge.kind, label: edge.label ?? '',
      ...(edge.fromPort ? { fromPort: edge.fromPort } : {}), ...(edge.toPort ? { toPort: edge.toPort } : {}),
      ...(edge.route?.length ? { route: edge.route.map(point => ({ ...point })) } : {}),
      ...(styleOf(edge.style) ? { style: styleOf(edge.style) } : {}) });
  }
  const result: RenderResult = {
    view: view.view, kind: view.kind, stated: view.stated ?? '', form: 'json', artifact: '',
    nodes, edges, notices: [...view.notices ?? []], columns: [...view.columns ?? []],
    rows: (view.rows ?? []).map(row => ({ cells: [...row.cells] })), version: 0,
    ...(view.canvas?.hasSize === true ? { canvas: { ...view.canvas } } : {}),
  };
  const summary: DiagramSummary = {
    totalNodes: sourceNodes.length, visibleNodes: nodes.length, omittedNodes: sourceNodes.length - nodes.length,
    totalEdges: view.edges?.length ?? 0, visibleEdges: edges.length, omittedEdges: (view.edges?.length ?? 0) - edges.length,
    invalidEdges, depth: Number.isFinite(limit) ? limit : null, notes: view.notes?.length ?? 0,
    missingOrigins: shown.filter(node => !node.origin).length,
    notices: [...view.notices ?? []],
  };
  if (summary.omittedNodes || summary.omittedEdges) summary.notices.push(`${summary.omittedNodes} elements and ${summary.omittedEdges} relationships are omitted by presentation depth, stated collapsed owners, or endpoint availability.`);
  if (invalidEdges) summary.notices.push(`${invalidEdges} relationships have unavailable node or port endpoints.`);
  if (summary.missingOrigins) summary.notices.push(`${summary.missingOrigins} displayed elements have no source location from the engine.`);
  return { result, summary, sourceNodes: new Map(shown.map(node => [node.id, node])), sourceEdges };
}
