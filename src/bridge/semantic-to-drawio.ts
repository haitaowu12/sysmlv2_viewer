import type {
  SemanticEdge,
  SemanticEdgeKind,
  SemanticModel,
  SemanticNode,
  SemanticNodeKind,
} from './semantic-types';
import { sysmlPathHash } from './semantic-types';

const NODE_STYLE: Record<SemanticNodeKind, string> = {
  Package: 'swimlane;html=1;rounded=0;fillColor=#f5f5f5;strokeColor=#666666;fontStyle=1;',
  PartDef: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  PartUsage: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;',
  PortDef: 'ellipse;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;',
  PortUsage: 'ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;',
  ConnectionDef: 'rhombus;whiteSpace=wrap;html=1;fillColor=#ece3f7;strokeColor=#6d28d9;',
  ConnectionUsage: 'rhombus;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;',
  InterfaceDef: 'hexagon;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0369a1;',
  InterfaceUsage: 'hexagon;whiteSpace=wrap;html=1;fillColor=#cffafe;strokeColor=#0891b2;',
  ActionDef: 'shape=process;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#2563eb;',
  ActionUsage: 'shape=process;whiteSpace=wrap;html=1;fillColor=#dcfce7;strokeColor=#16a34a;',
  StateDef: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#d97706;',
  StateUsage: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#fde68a;strokeColor=#b45309;',
  TransitionUsage: 'shape=triangle;direction=east;html=1;fillColor=#f3f4f6;strokeColor=#374151;',
  FlowUsage: 'shape=link;html=1;fillColor=#dbeafe;strokeColor=#1d4ed8;',
  BindingUsage: 'shape=link;html=1;fillColor=#ede9fe;strokeColor=#6d28d9;',
  RequirementDef: 'shape=requirement;html=1;boundedLbl=1;fillColor=#ffe6cc;strokeColor=#d79b00;',
  RequirementUsage: 'shape=requirement;html=1;boundedLbl=1;fillColor=#fff2cc;strokeColor=#d6b656;',
  ConstraintDef: 'shape=mxgraph.basic.trapezoid;html=1;fillColor=#fee2e2;strokeColor=#dc2626;',
  ConstraintUsage: 'shape=mxgraph.basic.trapezoid;html=1;fillColor=#fecaca;strokeColor=#b91c1c;',
  AttributeUsage: 'shape=note;html=1;fillColor=#f8fafc;strokeColor=#64748b;',
  ItemDef: 'shape=document;html=1;fillColor=#f0fdf4;strokeColor=#15803d;',
  ItemUsage: 'shape=document;html=1;fillColor=#dcfce7;strokeColor=#16a34a;',
  EnumDef: 'shape=mxgraph.flowchart.data;html=1;fillColor=#ffedd5;strokeColor=#ea580c;',
  EnumUsage: 'shape=mxgraph.flowchart.data;html=1;fillColor=#fed7aa;strokeColor=#c2410c;',
  UseCaseDef: 'ellipse;whiteSpace=wrap;html=1;fillColor=#fef9c3;strokeColor=#ca8a04;',
  UseCaseUsage: 'ellipse;whiteSpace=wrap;html=1;fillColor=#fef08a;strokeColor=#a16207;',
  ViewDef: 'shape=folder;html=1;fillColor=#ecfccb;strokeColor=#4d7c0f;',
  ViewUsage: 'shape=folder;html=1;fillColor=#d9f99d;strokeColor=#3f6212;',
  ViewpointDef: 'shape=cloud;html=1;fillColor=#fce7f3;strokeColor=#be185d;',
  ViewpointUsage: 'shape=cloud;html=1;fillColor=#fbcfe8;strokeColor=#9d174d;',
  VerificationDef: 'shape=process;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;',
  VerificationUsage: 'shape=process;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;',
  AnalysisDef: 'shape=mxgraph.basic.cube;html=1;fillColor=#e0e7ff;strokeColor=#3730a3;',
  AnalysisUsage: 'shape=mxgraph.basic.cube;html=1;fillColor=#c7d2fe;strokeColor=#312e81;',
  MetadataDef: 'shape=note;html=1;fillColor=#f1f5f9;strokeColor=#475569;',
  AllocationDef: 'shape=mxgraph.arrows.blockArrow;html=1;fillColor=#d1fae5;strokeColor=#059669;',
  AllocationUsage: 'shape=mxgraph.arrows.blockArrow;html=1;fillColor=#a7f3d0;strokeColor=#047857;',
  DependencyUsage: 'shape=mxgraph.basic.doubleBracket;html=1;fillColor=#f3f4f6;strokeColor=#6b7280;',
  Unknown: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#e0e0e0;strokeColor=#9e9e9e;',
};

const EDGE_STYLE: Record<SemanticEdgeKind, string> = {
  // Keep containment links for deterministic roundtrip, but render them unobtrusively.
  contains: 'edgeStyle=elbowEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeColor=#d1d5db;dashed=1;opacity=25;',
  connection: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;',
  satisfy: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;dashed=1;strokeColor=#10b981;',
  verify: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;dashed=1;strokeColor=#ef4444;',
  typing: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=classicThin;dashed=1;',
  flow: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;strokeColor=#1d4ed8;dashed=1;',
  binding: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeColor=#6d28d9;dashed=1;',
  transition: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;strokeColor=#374151;',
  dependency: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;strokeColor=#6b7280;dashed=1;',
  allocation: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;strokeColor=#059669;dashed=1;',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeLabel(node: SemanticNode): string {
  if (node.typeName) {
    return `${node.name}: ${node.typeName}`;
  }
  return node.name;
}

function serializeNodeCell(node: SemanticNode, geometry: { x: number; y: number; width: number; height: number }): string {
  const style = `${NODE_STYLE[node.kind] ?? NODE_STYLE.Unknown}sysmlKind=${node.kind};`;
  const value = escapeXml(safeLabel(node));
  const sysmlPath = escapeXml(node.sysmlPath);

  return [
    `<mxCell id="${node.id}" value="${value}" style="${style}" parent="1" vertex="1" sysmlPath="${sysmlPath}">`,
    `<mxGeometry x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" as="geometry" />`,
    '</mxCell>',
  ].join('');
}

function serializeEdgeCell(edge: SemanticEdge): string {
  const style = `${EDGE_STYLE[edge.kind] ?? EDGE_STYLE.connection}sysmlEdge=${edge.kind};`;
  const value = edge.kind === 'contains' ? '' : edge.label ? escapeXml(edge.label) : '';

  return [
    `<mxCell id="${edge.id}" value="${value}" style="${style}" parent="1" source="${edge.sourceId}" target="${edge.targetId}" edge="1">`,
    '<mxGeometry relative="1" as="geometry" />',
    '</mxCell>',
  ].join('');
}

export function semanticModelToDrawioXml(model: SemanticModel): string {
  const timestamp = new Date().toISOString();
  const diagramId = sysmlPathHash(`diagram:${timestamp}:${model.nodes.length}:${model.edges.length}`);

  const nodeXml = model.nodes
    .map((node) => {
      const geometry = model.layout[node.id] ?? { x: 40, y: 40, width: 220, height: 90 };
      return serializeNodeCell(node, geometry);
    })
    .join('');

  const edgeXml = model.edges
    .filter((edge) => model.nodes.some((node) => node.id === edge.sourceId))
    .filter((edge) => model.nodes.some((node) => node.id === edge.targetId))
    .map((edge) => serializeEdgeCell(edge))
    .join('');

  return [
    `<mxfile host="app.diagrams.net" modified="${timestamp}" agent="sysml-viewer-bridge" version="24.7.8">`,
    `<diagram id="${diagramId}" name="Page-1">`,
    '<mxGraphModel dx="1610" dy="1048" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" math="0" shadow="0">',
    '<root>',
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    nodeXml,
    edgeXml,
    '</root>',
    '</mxGraphModel>',
    '</diagram>',
    '</mxfile>',
  ].join('');
}

export function validateDrawioXml(xml: string): { valid: boolean; diagnostics: string[] } {
  const diagnostics: string[] = [];

  if (!xml.includes('<mxfile')) diagnostics.push('Missing <mxfile> root element.');
  if (!xml.includes('<mxGraphModel')) diagnostics.push('Missing <mxGraphModel> element.');
  if (!xml.includes('<mxCell id="0"')) diagnostics.push('Missing root cell id="0".');
  if (!xml.includes('<mxCell id="1"')) diagnostics.push('Missing root cell id="1".');

  const vertexCount = (xml.match(/vertex="1"/g) ?? []).length;
  if (vertexCount === 0) diagnostics.push('No vertex cells found.');

  const edgeCount = (xml.match(/edge="1"/g) ?? []).length;
  if (edgeCount === 0) diagnostics.push('No edge cells found.');

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
