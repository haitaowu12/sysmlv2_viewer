import type { SemanticEdge, SemanticModel, SemanticNode, SemanticNodeKind } from './semantic-types';

const KIND_FILL: Record<SemanticNodeKind, string> = {
  Package: '#f5f5f5',
  PartDef: '#dae8fc',
  PartUsage: '#d5e8d4',
  PortDef: '#fff2cc',
  PortUsage: '#f8cecc',
  ConnectionUsage: '#e1d5e7',
  RequirementDef: '#ffe6cc',
  RequirementUsage: '#fff2cc',
  VerificationDef: '#f8cecc',
  VerificationUsage: '#f5f5f5',
  Unknown: '#e0e0e0',
};

const KIND_STROKE: Record<SemanticNodeKind, string> = {
  Package: '#666666',
  PartDef: '#6c8ebf',
  PartUsage: '#82b366',
  PortDef: '#d6b656',
  PortUsage: '#b85450',
  ConnectionUsage: '#9673a6',
  RequirementDef: '#d79b00',
  RequirementUsage: '#d6b656',
  VerificationDef: '#b85450',
  VerificationUsage: '#666666',
  Unknown: '#9e9e9e',
};

const EDGE_STROKE: Record<SemanticEdge['kind'], string> = {
  contains: '#6b7280',
  connection: '#1f2937',
  satisfy: '#10b981',
  verify: '#ef4444',
  typing: '#6366f1',
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
      const dash = edge.kind === 'typing' || edge.kind === 'contains' ? ' stroke-dasharray="6 4"' : '';
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
