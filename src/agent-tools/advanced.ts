import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import type { SemanticEdge, SemanticNode } from '../bridge/semantic-types';
import { SYSML_V2_CORPUS } from './constants';
import type { AgentToolContext, AgentToolFile, CorpusPin, EngineIdentity } from './types';

interface AdvancedEnvelope {
  schemaVersion: '1.0';
  engine: EngineIdentity;
  corpus: CorpusPin;
  filesExamined: string[];
}

export interface RenderViewResult extends AdvancedEnvelope {
  tool: 'sysml_render_view';
  format: 'mermaid';
  content: string;
  nodeCount: number;
  edgeCount: number;
}

export interface TraceCoverageResult extends AdvancedEnvelope {
  tool: 'sysml_trace_coverage';
  requirements: number;
  satisfied: number;
  verified: number;
  fullyCovered: number;
  uncoveredRequirementIds: string[];
}

export interface ModelDelta {
  identity: string;
  kind: string;
  qualifiedPath: string;
  beforeType?: string;
  afterType?: string;
}

export interface CompareModelsResult extends AdvancedEnvelope {
  tool: 'sysml_compare_models';
  added: ModelDelta[];
  removed: ModelDelta[];
  changed: ModelDelta[];
}

function envelope(context: AgentToolContext, files: AgentToolFile[]): AdvancedEnvelope {
  return {
    schemaVersion: '1.0',
    engine: { name: 'sysml-viewer', version: context.engineVersion, packageVersion: context.packageVersion },
    corpus: SYSML_V2_CORPUS,
    filesExamined: files.map((file) => file.path),
  };
}

function indexed(files: AgentToolFile[]): Array<{ file: string; nodes: SemanticNode[]; edges: SemanticEdge[] }> {
  return files.map((file) => {
    const model = buildSemanticModelFromSource(file.content);
    return { file: file.path, nodes: model.nodes, edges: model.edges };
  });
}

function safeLabel(value: string): string {
  return value.replace(/["\n\r]/g, ' ').replace(/\]/g, ')').trim();
}

export function sysmlRenderView(files: AgentToolFile[], context: AgentToolContext): RenderViewResult {
  const models = indexed(files);
  const nodeLines: string[] = [];
  const edgeLines: string[] = [];
  for (const entry of models) {
    const ids = new Map(entry.nodes.map((node, index) => [node.id, `n${models.indexOf(entry)}_${index}`]));
    for (const node of entry.nodes) {
      nodeLines.push(`  ${ids.get(node.id)}["${safeLabel(node.kind)}: ${safeLabel(node.name)}"]`);
    }
    for (const edge of entry.edges) {
      const source = ids.get(edge.sourceId);
      const target = ids.get(edge.targetId);
      if (source && target) edgeLines.push(`  ${source} -->|"${safeLabel(edge.kind)}"| ${target}`);
    }
  }
  return {
    ...envelope(context, files),
    tool: 'sysml_render_view',
    format: 'mermaid',
    content: ['flowchart TD', ...nodeLines.sort(), ...edgeLines.sort()].join('\n') + '\n',
    nodeCount: nodeLines.length,
    edgeCount: edgeLines.length,
  };
}

export function sysmlTraceCoverage(files: AgentToolFile[], context: AgentToolContext): TraceCoverageResult {
  const models = indexed(files);
  let requirements = 0;
  let satisfied = 0;
  let verified = 0;
  let fullyCovered = 0;
  const uncoveredRequirementIds: string[] = [];
  for (const entry of models) {
    for (const requirement of entry.nodes.filter((node) => node.kind === 'RequirementDef' || node.kind === 'RequirementUsage')) {
      requirements += 1;
      const hasSatisfy = entry.edges.some((edge) => edge.kind === 'satisfy' && (edge.targetId === requirement.id || edge.sourceId === requirement.id));
      const hasVerify = entry.edges.some((edge) => edge.kind === 'verify' && (edge.targetId === requirement.id || edge.sourceId === requirement.id));
      if (hasSatisfy) satisfied += 1;
      if (hasVerify) verified += 1;
      if (hasSatisfy && hasVerify) fullyCovered += 1;
      else uncoveredRequirementIds.push(`${entry.file}#${requirement.id}`);
    }
  }
  return { ...envelope(context, files), tool: 'sysml_trace_coverage', requirements, satisfied, verified, fullyCovered, uncoveredRequirementIds };
}

function elementMap(files: AgentToolFile[]): Map<string, SemanticNode> {
  const result = new Map<string, SemanticNode>();
  for (const entry of indexed(files)) {
    for (const node of entry.nodes) result.set(`${entry.file}:${node.kind}:${node.sysmlPath}`, node);
  }
  return result;
}

export function sysmlCompareModels(
  before: AgentToolFile[],
  after: AgentToolFile[],
  context: AgentToolContext,
): CompareModelsResult {
  const left = elementMap(before);
  const right = elementMap(after);
  const delta = (identity: string, node: SemanticNode, other?: SemanticNode): ModelDelta => ({
    identity,
    kind: node.kind,
    qualifiedPath: node.sysmlPath,
    ...(other ? { beforeType: node.typeName, afterType: other.typeName } : node.typeName ? { beforeType: node.typeName } : {}),
  });
  const added = [...right.entries()].filter(([key]) => !left.has(key)).map(([key, node]) => delta(key, node));
  const removed = [...left.entries()].filter(([key]) => !right.has(key)).map(([key, node]) => delta(key, node));
  const changed = [...left.entries()].filter(([key, node]) => right.has(key) && right.get(key)?.typeName !== node.typeName)
    .map(([key, node]) => delta(key, node, right.get(key)));
  return {
    ...envelope(context, [...before, ...after]),
    tool: 'sysml_compare_models',
    added: added.sort((a, b) => a.identity.localeCompare(b.identity)),
    removed: removed.sort((a, b) => a.identity.localeCompare(b.identity)),
    changed: changed.sort((a, b) => a.identity.localeCompare(b.identity)),
  };
}
