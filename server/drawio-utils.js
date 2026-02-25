function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeId(name, index) {
  const normalized = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `n_${normalized || 'node'}_${index}`;
}

function parseSysmlNodes(sysml) {
  const definitions = [];
  const partDefRegex = /\bpart\s+def\s+([A-Za-z_][\w]*)/g;
  const partUsageRegex = /\bpart\s+([A-Za-z_][\w]*)\s*:\s*([A-Za-z_][\w]*)/g;
  const requirementRegex = /\brequirement\s+def\s+([A-Za-z_][\w]*)/g;
  const verificationRegex = /\bverification\s+def\s+([A-Za-z_][\w]*)/g;

  let match;
  while ((match = partDefRegex.exec(sysml)) !== null) {
    definitions.push({ kind: 'PartDef', name: match[1] });
  }
  while ((match = partUsageRegex.exec(sysml)) !== null) {
    definitions.push({ kind: 'PartUsage', name: match[1], typeName: match[2] });
  }
  while ((match = requirementRegex.exec(sysml)) !== null) {
    definitions.push({ kind: 'RequirementDef', name: match[1] });
  }
  while ((match = verificationRegex.exec(sysml)) !== null) {
    definitions.push({ kind: 'VerificationDef', name: match[1] });
  }

  const unique = [];
  const seen = new Set();
  for (const item of definitions) {
    const key = `${item.kind}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function parseRelations(sysml, nodeMap) {
  const edges = [];

  const connectRegex = /\bconnect\s+([A-Za-z_][\w]*)\s+to\s+([A-Za-z_][\w]*)/g;
  let match;
  let edgeIndex = 0;
  while ((match = connectRegex.exec(sysml)) !== null) {
    const source = nodeMap.get(match[1]);
    const target = nodeMap.get(match[2]);
    if (!source || !target) continue;
    edgeIndex += 1;
    edges.push({ id: `e_conn_${edgeIndex}`, kind: 'connection', sourceId: source.id, targetId: target.id, label: '' });
  }

  const satisfyRegex = /\bsatisfy\s+([A-Za-z_][\w]*)/g;
  const verifyRegex = /\bverify\s+([A-Za-z_][\w]*)/g;

  const firstPart = Array.from(nodeMap.values()).find((node) => node.kind === 'PartDef' || node.kind === 'PartUsage');
  const firstVerification = Array.from(nodeMap.values()).find((node) => node.kind === 'VerificationDef');

  edgeIndex = 0;
  while ((match = satisfyRegex.exec(sysml)) !== null) {
    const target = nodeMap.get(match[1]);
    if (!target || !firstPart) continue;
    edgeIndex += 1;
    edges.push({ id: `e_sat_${edgeIndex}`, kind: 'satisfy', sourceId: firstPart.id, targetId: target.id, label: 'satisfy' });
  }

  edgeIndex = 0;
  while ((match = verifyRegex.exec(sysml)) !== null) {
    const target = nodeMap.get(match[1]);
    if (!target || !firstVerification) continue;
    edgeIndex += 1;
    edges.push({ id: `e_ver_${edgeIndex}`, kind: 'verify', sourceId: firstVerification.id, targetId: target.id, label: 'verify' });
  }

  return edges;
}

function nodeStyle(kind) {
  const styles = {
    PartDef: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;sysmlKind=PartDef;',
    PartUsage: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;sysmlKind=PartUsage;',
    RequirementDef: 'shape=requirement;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;sysmlKind=RequirementDef;',
    VerificationDef: 'shape=process;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;sysmlKind=VerificationDef;',
  };
  return styles[kind] || 'rounded=1;whiteSpace=wrap;html=1;fillColor=#e0e0e0;strokeColor=#9e9e9e;sysmlKind=Unknown;';
}

function edgeStyle(kind) {
  const styles = {
    connection: 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;sysmlEdge=connection;',
    satisfy: 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;dashed=1;strokeColor=#10b981;sysmlEdge=satisfy;',
    verify: 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;dashed=1;strokeColor=#ef4444;sysmlEdge=verify;',
  };
  return styles[kind] || styles.connection;
}

export function sysmlToDrawioXml(sysml) {
  const nodes = parseSysmlNodes(sysml);

  if (nodes.length === 0) {
    return [
      '<mxfile host="app.diagrams.net" modified="local">',
      '<diagram id="empty" name="Page-1">',
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
      '</diagram>',
      '</mxfile>',
    ].join('');
  }

  const nodeMap = new Map();
  const nodeXml = [];

  const gridWidth = 4;
  nodes.forEach((node, index) => {
    const id = safeId(node.name, index + 1);
    nodeMap.set(node.name, { ...node, id });

    const col = index % gridWidth;
    const row = Math.floor(index / gridWidth);
    const x = 60 + col * 260;
    const y = 60 + row * 160;

    const label = node.typeName ? `${node.name}: ${node.typeName}` : node.name;

    nodeXml.push(
      `<mxCell id="${id}" value="${escapeXml(label)}" style="${nodeStyle(node.kind)}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="220" height="90" as="geometry"/>` +
      '</mxCell>',
    );
  });

  const edges = parseRelations(sysml, nodeMap);
  const edgeXml = edges.map((edge) =>
    `<mxCell id="${edge.id}" value="${escapeXml(edge.label || '')}" style="${edgeStyle(edge.kind)}" edge="1" parent="1" source="${edge.sourceId}" target="${edge.targetId}">` +
      '<mxGeometry relative="1" as="geometry"/>' +
    '</mxCell>',
  );

  return [
    `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="sysml-viewer-server" version="24.7.8">`,
    '<diagram id="sysml-generated" name="Page-1">',
    '<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" math="0" shadow="0">',
    '<root>',
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    nodeXml.join(''),
    edgeXml.join(''),
    '</root>',
    '</mxGraphModel>',
    '</diagram>',
    '</mxfile>',
  ].join('');
}

export function validateDrawioXml(drawioXml) {
  const diagnostics = [];
  if (!drawioXml || typeof drawioXml !== 'string') diagnostics.push('Draw.io XML payload is missing.');
  if (!drawioXml.includes('<mxfile')) diagnostics.push('Missing <mxfile> root.');
  if (!drawioXml.includes('<mxGraphModel')) diagnostics.push('Missing <mxGraphModel>.');
  if (!drawioXml.includes('<mxCell id="0"')) diagnostics.push('Missing root cell id="0".');
  if (!drawioXml.includes('<mxCell id="1"')) diagnostics.push('Missing root cell id="1".');

  const nodeCount = (drawioXml.match(/vertex="1"/g) || []).length;
  const edgeCount = (drawioXml.match(/edge="1"/g) || []).length;

  if (nodeCount === 0) diagnostics.push('No vertex cells found.');
  if (edgeCount === 0) diagnostics.push('No edge cells found.');

  return {
    valid: diagnostics.length === 0,
    diagnostics,
    stats: { nodeCount, edgeCount },
  };
}
