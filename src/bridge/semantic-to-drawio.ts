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
  ConnectionUsage: 'rhombus;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;',
  RequirementDef: 'shape=requirement;html=1;boundedLbl=1;fillColor=#ffe6cc;strokeColor=#d79b00;',
  RequirementUsage: 'shape=requirement;html=1;boundedLbl=1;fillColor=#fff2cc;strokeColor=#d6b656;',
  VerificationDef: 'shape=process;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;',
  VerificationUsage: 'shape=process;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;',
  Unknown: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#e0e0e0;strokeColor=#9e9e9e;',
};

const EDGE_STYLE: Record<SemanticEdgeKind, string> = {
  // Keep containment links for deterministic roundtrip, but render them unobtrusively.
  contains: 'edgeStyle=elbowEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeColor=#d1d5db;dashed=1;opacity=25;',
  connection: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;',
  satisfy: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;dashed=1;strokeColor=#10b981;',
  verify: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;dashed=1;strokeColor=#ef4444;',
  typing: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=classicThin;dashed=1;',
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
