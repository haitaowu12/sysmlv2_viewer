import type { SemanticEdge, SemanticModel, SemanticNode, SemanticNodeKind } from './semantic-types';

const KIND_FILL: Record<SemanticNodeKind, string> = {
  Package: '#f5f5f5',
  PartDef: '#dae8fc',
  PartUsage: '#d5e8d4',
  PortDef: '#fff2cc',
  PortUsage: '#f8cecc',
  ConnectionDef: '#ece3f7',
  ConnectionUsage: '#e1d5e7',
  InterfaceDef: '#e0f2fe',
  InterfaceUsage: '#cffafe',
  ActionDef: '#dbeafe',
  ActionUsage: '#dcfce7',
  StateDef: '#fef3c7',
  StateUsage: '#fde68a',
  TransitionUsage: '#f3f4f6',
  FlowUsage: '#dbeafe',
  BindingUsage: '#ede9fe',
  RequirementDef: '#ffe6cc',
  RequirementUsage: '#fff2cc',
  ConstraintDef: '#fee2e2',
  ConstraintUsage: '#fecaca',
  AttributeUsage: '#f8fafc',
  ItemDef: '#f0fdf4',
  ItemUsage: '#dcfce7',
  EnumDef: '#ffedd5',
  EnumUsage: '#fed7aa',
  UseCaseDef: '#fef9c3',
  UseCaseUsage: '#fef08a',
  ViewDef: '#ecfccb',
  ViewUsage: '#d9f99d',
  ViewpointDef: '#fce7f3',
  ViewpointUsage: '#fbcfe8',
  VerificationDef: '#f8cecc',
  VerificationUsage: '#f5f5f5',
  AnalysisDef: '#e0e7ff',
  AnalysisUsage: '#c7d2fe',
  MetadataDef: '#f1f5f9',
  AllocationDef: '#d1fae5',
  AllocationUsage: '#a7f3d0',
  DependencyUsage: '#f3f4f6',
  Unknown: '#e0e0e0',
};

const KIND_STROKE: Record<SemanticNodeKind, string> = {
  Package: '#666666',
  PartDef: '#6c8ebf',
  PartUsage: '#82b366',
  PortDef: '#d6b656',
  PortUsage: '#b85450',
  ConnectionDef: '#6d28d9',
  ConnectionUsage: '#9673a6',
  InterfaceDef: '#0369a1',
  InterfaceUsage: '#0891b2',
  ActionDef: '#2563eb',
  ActionUsage: '#16a34a',
  StateDef: '#d97706',
  StateUsage: '#b45309',
  TransitionUsage: '#374151',
  FlowUsage: '#1d4ed8',
  BindingUsage: '#6d28d9',
  RequirementDef: '#d79b00',
  RequirementUsage: '#d6b656',
  ConstraintDef: '#dc2626',
  ConstraintUsage: '#b91c1c',
  AttributeUsage: '#64748b',
  ItemDef: '#15803d',
  ItemUsage: '#16a34a',
  EnumDef: '#ea580c',
  EnumUsage: '#c2410c',
  UseCaseDef: '#ca8a04',
  UseCaseUsage: '#a16207',
  ViewDef: '#4d7c0f',
  ViewUsage: '#3f6212',
  ViewpointDef: '#be185d',
  ViewpointUsage: '#9d174d',
  VerificationDef: '#b85450',
  VerificationUsage: '#666666',
  AnalysisDef: '#3730a3',
  AnalysisUsage: '#312e81',
  MetadataDef: '#475569',
  AllocationDef: '#059669',
  AllocationUsage: '#047857',
  DependencyUsage: '#6b7280',
  Unknown: '#9e9e9e',
};

const EDGE_STROKE: Record<SemanticEdge['kind'], string> = {
  contains: '#6b7280',
  connection: '#1f2937',
  satisfy: '#10b981',
  verify: '#ef4444',
  typing: '#6366f1',
  flow: '#1d4ed8',
  binding: '#6d28d9',
  transition: '#374151',
  dependency: '#6b7280',
  allocation: '#059669',
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nodeLabel(node: SemanticNode): string {
  if (node.typeName) {
    return `${node.name}: ${node.typeName}`;
  }
  return node.name;
}

function bounds(model: SemanticModel): { width: number; height: number } {
  let maxX = 400;
  let maxY = 300;

  for (const node of model.nodes) {
    const rect = model.layout[node.id];
    if (!rect) continue;
    maxX = Math.max(maxX, rect.x + rect.width + 40);
    maxY = Math.max(maxY, rect.y + rect.height + 40);
  }

  return { width: maxX, height: maxY };
}

function edgePath(model: SemanticModel, edge: SemanticEdge): string | null {
  const sourceRect = model.layout[edge.sourceId];
  const targetRect = model.layout[edge.targetId];
  if (!sourceRect || !targetRect) return null;

  const startX = sourceRect.x + sourceRect.width / 2;
  const startY = sourceRect.y + sourceRect.height / 2;
  const endX = targetRect.x + targetRect.width / 2;
  const endY = targetRect.y + targetRect.height / 2;

  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

export function semanticModelToSvg(model: SemanticModel): string {
  const canvas = bounds(model);

  const edgeShapes = model.edges
    .map((edge) => {
      const path = edgePath(model, edge);
      if (!path) return '';
      const stroke = EDGE_STROKE[edge.kind] ?? '#4b5563';
      const dash =
        edge.kind === 'typing' ||
        edge.kind === 'contains' ||
        edge.kind === 'flow' ||
        edge.kind === 'binding' ||
        edge.kind === 'dependency' ||
        edge.kind === 'allocation'
          ? ' stroke-dasharray="6 4"'
          : '';
      const label = edge.label
        ? `<text x="${(model.layout[edge.sourceId].x + model.layout[edge.targetId].x) / 2}" y="${(model.layout[edge.sourceId].y + model.layout[edge.targetId].y) / 2}" font-size="11" fill="${stroke}">${esc(edge.label)}</text>`
        : '';

      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="2" marker-end="url(#arrow)"${dash} />${label}`;
    })
    .join('');

  const nodeShapes = model.nodes
    .map((node) => {
      const rect = model.layout[node.id] ?? { x: 40, y: 40, width: 220, height: 90 };
      const fill = KIND_FILL[node.kind] ?? KIND_FILL.Unknown;
      const stroke = KIND_STROKE[node.kind] ?? KIND_STROKE.Unknown;
      const rx = node.kind === 'PortDef' || node.kind === 'PortUsage' ? 30 : 8;
      const label = nodeLabel(node);

      return [
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
        `<text x="${rect.x + 10}" y="${rect.y + 24}" font-size="13" font-family="Inter, Arial, sans-serif" fill="#111827">${esc(label)}</text>`,
      ].join('');
    })
    .join('');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
    '<defs>',
    '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">',
    '<path d="M0,0 L0,6 L9,3 z" fill="#374151" />',
    '</marker>',
    '</defs>',
    '<rect width="100%" height="100%" fill="#ffffff" />',
    edgeShapes,
    nodeShapes,
    '</svg>',
  ].join('');
}
