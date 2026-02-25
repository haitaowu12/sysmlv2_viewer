import type { LayoutMap, SemanticEdge, SemanticEdgeKind, SemanticModel, SemanticNode, SemanticNodeKind } from './semantic-types';
import { edgeHash } from './semantic-types';

function parseStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const token of style.split(';')) {
    if (!token.trim()) continue;
    const [rawKey, rawValue] = token.split('=');
    if (!rawKey) continue;
    result[rawKey.trim()] = (rawValue ?? '').trim();
  }
  return result;
}

function decodeValue(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<root>${raw}</root>`, 'text/xml');
  return (doc.documentElement.textContent ?? raw).trim();
}

function toSemanticNodeKind(style: Record<string, string>): SemanticNodeKind {
  const fromStyle = style.sysmlKind as SemanticNodeKind | undefined;
  if (fromStyle) return fromStyle;

  const shape = style.shape ?? '';
  if (shape.includes('requirement')) return 'RequirementDef';
  if (shape.includes('process')) return 'VerificationUsage';
  if (shape.includes('ellipse')) return 'PortUsage';
  if (shape.includes('rhombus')) return 'ConnectionUsage';
  if (shape.includes('swimlane')) return 'Package';
  return 'Unknown';
}

function toSemanticEdgeKind(style: Record<string, string>): SemanticEdgeKind {
  const fromStyle = style.sysmlEdge as SemanticEdgeKind | undefined;
  if (fromStyle) return fromStyle;

  if (style.strokeColor === '#10b981') return 'satisfy';
  if (style.strokeColor === '#ef4444') return 'verify';
  if (style.dashed === '1') return 'typing';
  return 'connection';
}

function readGeometry(cell: Element): { x: number; y: number; width: number; height: number } {
  const geometry = cell.querySelector('mxGeometry');
  return {
    x: Number(geometry?.getAttribute('x') ?? '40'),
    y: Number(geometry?.getAttribute('y') ?? '40'),
    width: Number(geometry?.getAttribute('width') ?? '220'),
    height: Number(geometry?.getAttribute('height') ?? '90'),
  };
}

function isParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0;
}

export function parseDrawioToSemanticModel(xml: string): SemanticModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  if (isParserError(doc)) {
    throw new Error('Invalid Draw.io XML payload.');
  }

  const allCells = Array.from(doc.querySelectorAll('mxCell'));
  const nodeIdSet = new Set<string>();
  const nodes: SemanticNode[] = [];
  const edges: SemanticEdge[] = [];
  const layout: LayoutMap = {};

  for (const cell of allCells) {
    const id = cell.getAttribute('id') ?? '';
    const isVertex = cell.getAttribute('vertex') === '1';

    if (!isVertex || id === '0' || id === '1') {
      continue;
    }

    const style = parseStyle(cell.getAttribute('style') ?? '');
    const rawValue = cell.getAttribute('value') ?? '';
    const label = decodeValue(rawValue).replace(/<[^>]+>/g, '').trim();
    const parentId = cell.getAttribute('parent') ?? undefined;
    const geometry = readGeometry(cell);

    nodeIdSet.add(id);

    nodes.push({
      id,
      kind: toSemanticNodeKind(style),
      name: label || id,
      sysmlPath: cell.getAttribute('sysmlPath') ?? `drawio/${id}`,
      parentId: parentId && parentId !== '1' ? parentId : undefined,
    });

    layout[id] = geometry;
  }

  for (const cell of allCells) {
    const id = cell.getAttribute('id') ?? '';
    const isEdge = cell.getAttribute('edge') === '1';

    if (!isEdge || !id) {
      continue;
    }

    const sourceId = cell.getAttribute('source') ?? '';
    const targetId = cell.getAttribute('target') ?? '';

    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) {
      continue;
    }

    const style = parseStyle(cell.getAttribute('style') ?? '');
    const label = decodeValue(cell.getAttribute('value') ?? '').replace(/<[^>]+>/g, '').trim();
    const kind = toSemanticEdgeKind(style);

    edges.push({
      id: id || edgeHash(sourceId, targetId, kind, label),
      kind,
      sourceId,
      targetId,
      label: label || undefined,
    });
  }

  return {
    nodes,
    edges,
    layout,
    version: 'drawio-import-v1',
  };
}
