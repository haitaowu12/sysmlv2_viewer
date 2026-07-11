import { buildSemanticModelFromSysMLModel } from '../bridge/sysml-to-semantic';
import { parseSysML } from '../parser/parser';
import type { ParseError } from '../parser/types';
import {
  AGENT_TOOL_SCHEMA_VERSION,
  DEFAULT_RESULT_LIMIT,
  SYSML_V2_CORPUS,
} from './constants';
import type {
  AgentDiagnostic,
  AgentToolContext,
  AgentToolEnvelope,
  AgentToolFile,
  CheckRequest,
  CheckResult,
  DoctorRequest,
  DoctorResult,
  EngineIdentity,
  ExaminedFile,
  ExplainDiagnosticRequest,
  ExplainDiagnosticResult,
  ModelSummaryElement,
  ModelSummaryRequest,
  ModelSummaryResult,
  Truncation,
} from './types';

interface DiagnosticExplanation {
  explanation: string;
  remediation: string[];
}

const DIAGNOSTIC_EXPLANATIONS: Record<string, DiagnosticExplanation> = {
  'parser:syntax-error': {
    explanation: 'SysML textual notation could not be parsed at the reported source location.',
    remediation: [
      'Inspect the reported token and nearby delimiter balance.',
      'Apply the parser suggestion when present, then run sysml_check again.',
    ],
  },
  'unsupported:calc': {
    explanation: 'A calculation construct was recovered as a typed partial node but is not fully interpreted by this engine.',
    remediation: [
      'Retain the source construct and treat derived semantic details as unavailable.',
      'Validate calculation semantics with the pinned official corpus or target tool.',
    ],
  },
  'recovery:nested-parse-failure': {
    explanation: 'A nested construct failed to parse; the engine resumed at a later model element.',
    remediation: [
      'Repair the nested declaration at the reported source location.',
      'Run sysml_check again and confirm no recovered content was unintentionally omitted.',
    ],
  },
};

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_RESULT_LIMIT;
  return Math.max(0, Math.floor(value));
}

function examinedFiles(files: AgentToolFile[]): ExaminedFile[] {
  return files.map((file) => ({
    path: file.path,
    bytes: new TextEncoder().encode(file.content).byteLength,
  }));
}

function engineIdentity(context: AgentToolContext): EngineIdentity {
  return {
    name: 'sysml-viewer',
    version: context.engineVersion,
    packageVersion: context.packageVersion,
  };
}

function truncation(total: number, limit: number): Truncation {
  const returned = Math.min(total, limit);
  return {
    truncated: returned < total,
    limit,
    total,
    returned,
  };
}

function diagnosticCode(error: ParseError): string {
  if (error.code) return error.code;
  if ((error.severity ?? 'error') === 'error') return 'parser:syntax-error';
  return `parser:${error.severity ?? 'error'}`;
}

function collectDiagnostics(files: AgentToolFile[]): AgentDiagnostic[] {
  return files.flatMap((file) => {
    const parsed = parseSysML(file.content);
    return parsed.errors.map((error) => ({
      code: diagnosticCode(error),
      severity: error.severity ?? 'error',
      message: error.message,
      file: file.path,
      ...(error.location ? { sourceLocation: error.location } : {}),
      ...(error.suggestion ? { suggestion: error.suggestion } : {}),
      ...(error.context ? { context: error.context } : {}),
    }));
  });
}

function envelope(
  tool: AgentToolEnvelope['tool'],
  context: AgentToolContext,
  files: AgentToolFile[],
  diagnostics: AgentDiagnostic[],
  limit: number,
): AgentToolEnvelope {
  return {
    schemaVersion: AGENT_TOOL_SCHEMA_VERSION,
    tool,
    engine: engineIdentity(context),
    corpus: SYSML_V2_CORPUS,
    filesExamined: examinedFiles(files),
    diagnostics: diagnostics.slice(0, limit),
    truncation: truncation(diagnostics.length, limit),
  };
}

export function sysmlCheck(request: CheckRequest): CheckResult {
  const limit = normalizeLimit(request.maxDiagnostics);
  const allDiagnostics = collectDiagnostics(request.files);
  const counts = {
    errors: allDiagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warnings: allDiagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
    info: allDiagnostics.filter((diagnostic) => diagnostic.severity === 'info').length,
  };

  return {
    ...envelope('sysml_check', request.context, request.files, allDiagnostics, limit),
    tool: 'sysml_check',
    valid: counts.errors === 0,
    counts,
  };
}

export function sysmlDoctor(request: DoctorRequest): DoctorResult {
  const files = request.files ?? [];
  const limit = normalizeLimit(request.maxDiagnostics);
  const allDiagnostics = collectDiagnostics(files);
  const degraded = allDiagnostics.some((diagnostic) => diagnostic.severity === 'error');

  return {
    ...envelope('sysml_doctor', request.context, files, allDiagnostics, limit),
    tool: 'sysml_doctor',
    status: degraded ? 'degraded' : 'ready',
    capabilities: ['doctor', 'check', 'explain-diagnostic', 'model-summary'],
  };
}

export function sysmlExplainDiagnostic(
  request: ExplainDiagnosticRequest,
): ExplainDiagnosticResult {
  const explanation = DIAGNOSTIC_EXPLANATIONS[request.code];

  return {
    ...envelope('sysml_explain_diagnostic', request.context, [], [], DEFAULT_RESULT_LIMIT),
    tool: 'sysml_explain_diagnostic',
    code: request.code,
    known: explanation !== undefined,
    explanation: explanation?.explanation
      ?? `No engine-specific explanation is registered for diagnostic code '${request.code}'.`,
    remediation: explanation?.remediation
      ?? ['Preserve the diagnostic code and consult the producing engine or target tool.'],
  };
}

export function sysmlModelSummary(request: ModelSummaryRequest): ModelSummaryResult {
  const maxElements = normalizeLimit(request.maxElements);
  const allDiagnostics: AgentDiagnostic[] = [];
  const elements: ModelSummaryElement[] = [];
  const byKind: Record<string, number> = {};
  let edgeCount = 0;

  for (const file of request.files) {
    const parsed = parseSysML(file.content);
    for (const error of parsed.errors) {
      allDiagnostics.push({
        code: diagnosticCode(error),
        severity: error.severity ?? 'error',
        message: error.message,
        file: file.path,
        ...(error.location ? { sourceLocation: error.location } : {}),
        ...(error.suggestion ? { suggestion: error.suggestion } : {}),
        ...(error.context ? { context: error.context } : {}),
      });
    }

    const semantic = buildSemanticModelFromSysMLModel(parsed);
    edgeCount += semantic.edges.length;
    for (const node of semantic.nodes) {
      byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
      elements.push({
        id: node.id,
        kind: node.kind,
        name: node.name,
        qualifiedPath: node.sysmlPath,
        file: file.path,
        ...(node.parentId ? { parentId: node.parentId } : {}),
        ...(node.typeName ? { typeName: node.typeName } : {}),
      });
    }
  }

  const diagnosticLimit = DEFAULT_RESULT_LIMIT;
  const base = envelope(
    'sysml_model_summary',
    request.context,
    request.files,
    allDiagnostics,
    diagnosticLimit,
  );

  return {
    ...base,
    tool: 'sysml_model_summary',
    elementTruncation: truncation(elements.length, maxElements),
    counts: {
      nodes: elements.length,
      edges: edgeCount,
      byKind,
    },
    elements: elements.slice(0, maxElements),
  };
}
