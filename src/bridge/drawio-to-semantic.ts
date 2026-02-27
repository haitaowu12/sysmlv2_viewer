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

function inferKindFromLabel(label: string): SemanticNodeKind | null {
  const normalized = label.trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  if (lower.startsWith('package ')) return 'Package';
  if (lower.startsWith('part def ')) return 'PartDef';
  if (lower.startsWith('part ')) return 'PartUsage';
  if (lower.startsWith('port def ')) return 'PortDef';
  if (lower.startsWith('port ')) return 'PortUsage';
  if (lower.startsWith('connection def ')) return 'ConnectionDef';
  if (lower.startsWith('connection ') || lower.startsWith('connect ')) return 'ConnectionUsage';
  if (lower.startsWith('interface def ')) return 'InterfaceDef';
  if (lower.startsWith('interface ')) return 'InterfaceUsage';
  if (lower.startsWith('action def ')) return 'ActionDef';
  if (lower.startsWith('action ') || lower.startsWith('perform action ')) return 'ActionUsage';
  if (lower.startsWith('state def ')) return 'StateDef';
  if (lower.startsWith('state ')) return 'StateUsage';
  if (lower.startsWith('transition ') || lower.startsWith('succession ')) return 'TransitionUsage';
  if (lower.startsWith('flow ')) return 'FlowUsage';
  if (lower.startsWith('bind ')) return 'BindingUsage';
  if (lower.startsWith('requirement def ')) return 'RequirementDef';
  if (lower.startsWith('requirement ') || lower.startsWith('satisfy ')) return 'RequirementUsage';
  if (lower.startsWith('constraint def ')) return 'ConstraintDef';
  if (lower.startsWith('constraint ')) return 'ConstraintUsage';
  if (lower.startsWith('attribute ')) return 'AttributeUsage';
  if (lower.startsWith('item def ')) return 'ItemDef';
  if (lower.startsWith('item ')) return 'ItemUsage';
  if (lower.startsWith('enum def ')) return 'EnumDef';
  if (lower.startsWith('enum ')) return 'EnumUsage';
  if (lower.startsWith('use case def ')) return 'UseCaseDef';
  if (lower.startsWith('use case ')) return 'UseCaseUsage';
  if (lower.startsWith('view def ')) return 'ViewDef';
  if (lower.startsWith('viewpoint def ')) return 'ViewpointDef';
  if (lower.startsWith('viewpoint ')) return 'ViewpointUsage';
  if (lower.startsWith('view ')) return 'ViewUsage';
  if (lower.startsWith('verification def ')) return 'VerificationDef';
  if (lower.startsWith('verification ') || lower.startsWith('verify ')) return 'VerificationUsage';
  if (lower.startsWith('analysis def ')) return 'AnalysisDef';
  if (lower.startsWith('analysis ')) return 'AnalysisUsage';
  if (lower.startsWith('metadata def ')) return 'MetadataDef';
  if (lower.startsWith('allocation def ')) return 'AllocationDef';
  if (lower.startsWith('allocation ') || lower.startsWith('allocate ')) return 'AllocationUsage';
  if (lower.startsWith('dependency ')) return 'DependencyUsage';
  return null;
}

function toSemanticNodeKind(
  style: Record<string, string>,
  label: string,
  defaultKind: SemanticNodeKind = 'PartUsage',
): SemanticNodeKind {
  const fromStyle = style.sysmlKind as SemanticNodeKind | undefined;
  if (fromStyle) return fromStyle;

  const fromLabel = inferKindFromLabel(label);
  if (fromLabel) return fromLabel;

  const shape = style.shape ?? '';
  if (shape.includes('requirement')) return 'RequirementDef';
  if (shape.includes('process')) return 'VerificationUsage';
  if (shape.includes('ellipse')) return 'PortUsage';
  if (shape.includes('rhombus')) return 'ConnectionUsage';
  if (shape.includes('swimlane')) return 'Package';
  if (shape.includes('hexagon')) return 'InterfaceUsage';
  if (shape.includes('folder')) return 'ViewUsage';
  if (shape.includes('cloud')) return 'ViewpointUsage';
  if (shape.includes('document')) return 'ItemUsage';
  if (shape.includes('note')) return 'AttributeUsage';
  if (shape.includes('triangle')) return 'TransitionUsage';
  if (shape.includes('cube')) return 'AnalysisUsage';
  if (shape.includes('doubleBracket')) return 'DependencyUsage';
  if (shape.includes('blockArrow')) return 'AllocationUsage';
  if (shape.includes('hexagon') || shape.includes('rectangle') || shape.includes('mxgraph')) return defaultKind;
  return defaultKind;
}

function stripKeywordPrefix(label: string): string {
  return label
    .replace(/^package\s+/i, '')
    .replace(/^part\s+def\s+/i, '')
    .replace(/^part\s+/i, '')
    .replace(/^port\s+def\s+/i, '')
    .replace(/^port\s+/i, '')
    .replace(/^connection\s+def\s+/i, '')
    .replace(/^connection\s+/i, '')
    .replace(/^connect\s+/i, '')
    .replace(/^interface\s+def\s+/i, '')
    .replace(/^interface\s+/i, '')
    .replace(/^perform\s+action\s+/i, '')
    .replace(/^action\s+def\s+/i, '')
    .replace(/^action\s+/i, '')
    .replace(/^state\s+def\s+/i, '')
    .replace(/^state\s+/i, '')
    .replace(/^transition\s+/i, '')
    .replace(/^succession\s+/i, '')
    .replace(/^flow\s+/i, '')
    .replace(/^bind\s+/i, '')
    .replace(/^requirement\s+def\s+/i, '')
    .replace(/^requirement\s+/i, '')
    .replace(/^satisfy\s+/i, '')
    .replace(/^constraint\s+def\s+/i, '')
    .replace(/^constraint\s+/i, '')
    .replace(/^attribute\s+/i, '')
    .replace(/^item\s+def\s+/i, '')
    .replace(/^item\s+/i, '')
    .replace(/^enum\s+def\s+/i, '')
    .replace(/^enum\s+/i, '')
    .replace(/^use\s+case\s+def\s+/i, '')
    .replace(/^use\s+case\s+/i, '')
    .replace(/^viewpoint\s+def\s+/i, '')
    .replace(/^viewpoint\s+/i, '')
    .replace(/^view\s+def\s+/i, '')
    .replace(/^view\s+/i, '')
    .replace(/^verification\s+def\s+/i, '')
    .replace(/^verification\s+/i, '')
    .replace(/^verify\s+/i, '')
    .replace(/^analysis\s+def\s+/i, '')
    .replace(/^analysis\s+/i, '')
    .replace(/^metadata\s+def\s+/i, '')
    .replace(/^allocation\s+def\s+/i, '')
    .replace(/^allocation\s+/i, '')
    .replace(/^allocate\s+/i, '')
    .replace(/^dependency\s+/i, '')
    .trim();
}

function parseNodeLabel(label: string): { name: string; typeName?: string } {
  const cleaned = stripKeywordPrefix(label).trim();
  if (!cleaned) return { name: '' };

  const colonIndex = cleaned.indexOf(':');
  if (colonIndex <= 0) return { name: cleaned };
  return {
    name: cleaned.slice(0, colonIndex).trim(),
    typeName: cleaned.slice(colonIndex + 1).trim() || undefined,
  };
}

function defaultNodeName(kind: SemanticNodeKind, index: number): string {
  switch (kind) {
    case 'Package':
      return `NewPackage${index}`;
    case 'PartDef':
      return `NewPartDef${index}`;
    case 'PartUsage':
      return `newPart${index}`;
    case 'PortDef':
      return `NewPortDef${index}`;
    case 'PortUsage':
      return `newPort${index}`;
    case 'ConnectionDef':
      return `NewConnectionDef${index}`;
    case 'ConnectionUsage':
      return `newConnection${index}`;
    case 'InterfaceDef':
      return `NewInterfaceDef${index}`;
    case 'InterfaceUsage':
      return `newInterface${index}`;
    case 'ActionDef':
      return `NewActionDef${index}`;
    case 'ActionUsage':
      return `newAction${index}`;
    case 'StateDef':
      return `NewStateDef${index}`;
    case 'StateUsage':
      return `newState${index}`;
    case 'TransitionUsage':
      return `newTransition${index}`;
    case 'FlowUsage':
      return `newFlow${index}`;
    case 'BindingUsage':
      return `newBinding${index}`;
    case 'RequirementDef':
      return `NewRequirement${index}`;
    case 'RequirementUsage':
      return `newRequirement${index}`;
    case 'ConstraintDef':
      return `NewConstraintDef${index}`;
    case 'ConstraintUsage':
      return `newConstraint${index}`;
    case 'AttributeUsage':
      return `newAttribute${index}`;
    case 'ItemDef':
      return `NewItemDef${index}`;
    case 'ItemUsage':
      return `newItem${index}`;
    case 'EnumDef':
      return `NewEnumDef${index}`;
    case 'EnumUsage':
      return `newEnum${index}`;
    case 'UseCaseDef':
      return `NewUseCaseDef${index}`;
    case 'UseCaseUsage':
      return `newUseCase${index}`;
    case 'ViewDef':
      return `NewViewDef${index}`;
    case 'ViewUsage':
      return `newView${index}`;
    case 'ViewpointDef':
      return `NewViewpointDef${index}`;
    case 'ViewpointUsage':
      return `newViewpoint${index}`;
    case 'VerificationDef':
      return `NewVerification${index}`;
    case 'VerificationUsage':
      return `newVerification${index}`;
    case 'AnalysisDef':
      return `NewAnalysisDef${index}`;
    case 'AnalysisUsage':
      return `newAnalysis${index}`;
    case 'MetadataDef':
      return `NewMetadataDef${index}`;
    case 'AllocationDef':
      return `NewAllocationDef${index}`;
    case 'AllocationUsage':
      return `newAllocation${index}`;
    case 'DependencyUsage':
      return `newDependency${index}`;
    default:
      return `NewElement${index}`;
  }
}

function toSemanticEdgeKind(style: Record<string, string>): SemanticEdgeKind {
  const fromStyle = style.sysmlEdge as SemanticEdgeKind | undefined;
  if (fromStyle) return fromStyle;

  if (style.strokeColor === '#1d4ed8') return 'flow';
  if (style.strokeColor === '#059669') return 'allocation';
  if (style.strokeColor === '#6b7280') return 'dependency';
  if (style.strokeColor === '#374151') return 'transition';
  if (style.strokeColor === '#6d28d9' && style.endArrow === 'none') return 'binding';
  if (style.strokeColor === '#10b981') return 'satisfy';
  if (style.strokeColor === '#ef4444') return 'verify';
  if (style.endArrow === 'none' && style.dashed === '1') return 'binding';
  if (style.endArrow === 'open' && style.dashed === '1') return 'flow';
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

export interface ParseDrawioOptions {
  defaultNodeKind?: SemanticNodeKind;
}

export function parseDrawioToSemanticModel(xml: string, options: ParseDrawioOptions = {}): SemanticModel {
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
  let generatedNameCount = 0;

  for (const cell of allCells) {
    const id = cell.getAttribute('id') ?? '';
    const isVertex = cell.getAttribute('vertex') === '1';

    if (!isVertex || id === '0' || id === '1') {
      continue;
    }

    const style = parseStyle(cell.getAttribute('style') ?? '');
    const rawValue = cell.getAttribute('value') ?? '';
    const label = decodeValue(rawValue).replace(/<[^>]+>/g, '').trim();
    const semanticKind = toSemanticNodeKind(style, label, options.defaultNodeKind ?? 'PartUsage');
    const parsedLabel = parseNodeLabel(label);
    const syntheticName = defaultNodeName(semanticKind, ++generatedNameCount);
    const name = parsedLabel.name && parsedLabel.name.toLowerCase() !== 'text' ? parsedLabel.name : syntheticName;
    const parentId = cell.getAttribute('parent') ?? undefined;
    const geometry = readGeometry(cell);

    nodeIdSet.add(id);

    nodes.push({
      id,
      kind: semanticKind,
      name,
      sysmlPath: cell.getAttribute('sysmlPath') ?? `drawio/${id}`,
      parentId: parentId && parentId !== '1' ? parentId : undefined,
      typeName: parsedLabel.typeName,
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
