import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import type { SemanticEdge, SemanticNode } from '../bridge/semantic-types';
import { sysmlCheck } from './kernel';
import type { AgentToolContext, AgentToolFile } from './types';

export type ReviewerKind = 'traceability' | 'requirement-parent' | 'interface' | 'semantic-compatibility' | 'release';
export type FindingSeverity = 'error' | 'warning' | 'info';

export interface ReviewerFinding {
  findingId: string;
  reviewer: ReviewerKind;
  ruleId: string;
  severity: FindingSeverity;
  message: string;
  file: string;
  elementIds: string[];
  evidenceIds: string[];
  sourceLocations: Array<{ file: string; line?: number; column?: number }>;
  rationale: string;
  proposedDisposition: 'repair' | 'supply_evidence' | 'review' | 'hold_release';
  requiresHumanReview: true;
}

export interface ReviewerResult {
  schemaVersion: '1.0';
  filesExamined: string[];
  findings: ReviewerFinding[];
  counts: Record<FindingSeverity, number>;
  limitations: string[];
}

interface IndexedFile { file: AgentToolFile; nodes: SemanticNode[]; edges: SemanticEdge[] }

function index(files: AgentToolFile[]): IndexedFile[] {
  return files.map((file) => {
    const model = buildSemanticModelFromSource(file.content);
    return { file, nodes: model.nodes, edges: model.edges };
  });
}

function finding(
  reviewer: ReviewerKind,
  ruleId: string,
  severity: FindingSeverity,
  message: string,
  file: string,
  elementIds: string[],
  disposition: ReviewerFinding['proposedDisposition'],
  line?: number,
  column?: number,
): ReviewerFinding {
  return {
    findingId: `${reviewer}:${ruleId}:${file}:${elementIds.join(',') || 'file'}`,
    reviewer,
    ruleId,
    severity,
    message,
    file,
    elementIds,
    evidenceIds: elementIds.map((id) => `${file}#${id}`),
    sourceLocations: [{ file, ...(line ? { line } : {}), ...(column ? { column } : {}) }],
    rationale: `Deterministic rule ${ruleId} matched the parsed semantic graph.`,
    proposedDisposition: disposition,
    requiresHumanReview: true,
  };
}

function sourceLine(file: AgentToolFile, node: SemanticNode): number | undefined {
  const offset = file.content.indexOf(node.name);
  return offset < 0 ? undefined : file.content.slice(0, offset).split('\n').length;
}

function hasEdge(edges: SemanticEdge[], nodeId: string, kinds: string[]): boolean {
  return edges.some((edge) => kinds.includes(edge.kind) && (edge.sourceId === nodeId || edge.targetId === nodeId));
}

export function runTraceabilityReviewer(files: AgentToolFile[]): ReviewerResult {
  const findings: ReviewerFinding[] = [];
  for (const entry of index(files)) {
    for (const requirement of entry.nodes.filter((node) => node.kind === 'RequirementDef' || node.kind === 'RequirementUsage')) {
      if (!hasEdge(entry.edges, requirement.id, ['satisfy'])) {
        findings.push(finding('traceability', 'SYSML-TRACE-001', 'warning',
          `Requirement '${requirement.name}' has no visible satisfy relationship.`, entry.file.path,
          [requirement.id], 'supply_evidence', sourceLine(entry.file, requirement)));
      }
      if (!hasEdge(entry.edges, requirement.id, ['verify'])) {
        findings.push(finding('traceability', 'SYSML-TRACE-002', 'warning',
          `Requirement '${requirement.name}' has no visible verification relationship.`, entry.file.path,
          [requirement.id], 'supply_evidence', sourceLine(entry.file, requirement)));
      }
    }
  }
  return result(files, findings, ['Cross-file and imported relationship resolution is not yet performed.']);
}

export function runRequirementParentReviewer(files: AgentToolFile[]): ReviewerResult {
  const findings: ReviewerFinding[] = [];
  for (const entry of index(files)) {
    for (const requirement of entry.nodes.filter((node) => node.kind === 'RequirementUsage' && !node.parentId)) {
      findings.push(finding('requirement-parent', 'SYSML-REQ-PARENT-001', 'warning',
        `Requirement usage '${requirement.name}' has no containing model element.`, entry.file.path,
        [requirement.id], 'review', sourceLine(entry.file, requirement)));
    }
  }
  return result(files, findings, ['Containment is a structural signal, not proof of an approved requirement hierarchy.']);
}

export function runInterfaceReviewer(files: AgentToolFile[]): ReviewerResult {
  const findings: ReviewerFinding[] = [];
  for (const entry of index(files)) {
    for (const iface of entry.nodes.filter((node) => node.kind === 'InterfaceUsage')) {
      if (!hasEdge(entry.edges, iface.id, ['connection', 'flow', 'typing'])) {
        findings.push(finding('interface', 'SYSML-IFACE-001', 'warning',
          `Interface usage '${iface.name}' has no visible typing, connection, or flow relationship.`,
          entry.file.path, [iface.id], 'review', sourceLine(entry.file, iface)));
      }
    }
    for (const flow of entry.nodes.filter((node) => node.kind === 'FlowUsage')) {
      if (!flow.sourceRef || !flow.targetRef) {
        findings.push(finding('interface', 'SYSML-FLOW-001', 'error',
          `Flow '${flow.name}' is missing a source or target endpoint.`, entry.file.path,
          [flow.id], 'repair', sourceLine(entry.file, flow)));
      }
    }
  }
  return result(files, findings, [
    'Direction, unit, timing, state applicability, ownership, and domain compatibility require a project rule pack.',
  ]);
}

export function runSemanticCompatibilityReviewer(files: AgentToolFile[]): ReviewerResult {
  const findings: ReviewerFinding[] = [];
  for (const entry of index(files)) {
    const byName = new Map(entry.nodes.map((node) => [node.name, node]));
    for (const connection of entry.nodes.filter((node) => node.kind === 'ConnectionUsage')) {
      const source = connection.sourceRef ? byName.get(connection.sourceRef.split('.').at(-1) ?? '') : undefined;
      const target = connection.targetRef ? byName.get(connection.targetRef.split('.').at(-1) ?? '') : undefined;
      if (source?.typeName && target?.typeName && source.typeName !== target.typeName) {
        findings.push(finding('semantic-compatibility', 'SYSML-COMPAT-001', 'warning',
          `Connection '${connection.name}' joins endpoints typed '${source.typeName}' and '${target.typeName}'.`,
          entry.file.path, [connection.id, source.id, target.id], 'review', sourceLine(entry.file, connection)));
      }
    }
  }
  return result(files, findings, [
    'Type-name equality is only a structural screen; physical, information, unit, timing, and safety compatibility require domain rules and human review.',
  ]);
}

export function runReleaseReviewer(files: AgentToolFile[], context: AgentToolContext): ReviewerResult {
  const check = sysmlCheck({ context, files, maxDiagnostics: 10_000 });
  const findings = check.diagnostics.map((diagnostic) => finding(
    'release', diagnostic.code, diagnostic.severity, diagnostic.message, diagnostic.file, [],
    diagnostic.severity === 'error' ? 'hold_release' : 'review',
    diagnostic.sourceLocation?.start.line,
    diagnostic.sourceLocation?.start.column,
  ));
  if (!check.supportedSubsetComplete && findings.length === 0) {
    findings.push(finding('release', 'SYSML-RELEASE-001', 'error',
      'The supported semantic subset is incomplete.', files[0]?.path ?? '<none>', [], 'hold_release'));
  }
  return result(files, findings, [
    'This is an iterative engine gate. Target-tool import and round-trip evidence remain separate release gates.',
  ]);
}

function result(files: AgentToolFile[], findings: ReviewerFinding[], limitations: string[]): ReviewerResult {
  return {
    schemaVersion: '1.0',
    filesExamined: files.map((file) => file.path),
    findings,
    counts: {
      error: findings.filter((item) => item.severity === 'error').length,
      warning: findings.filter((item) => item.severity === 'warning').length,
      info: findings.filter((item) => item.severity === 'info').length,
    },
    limitations,
  };
}
