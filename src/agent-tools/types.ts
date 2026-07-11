import type { ErrorSeverity, SourceLocation } from '../parser/types';

export interface AgentToolContext {
  engineVersion: string;
  packageVersion: string;
}

export interface AgentToolFile {
  path: string;
  content: string;
}

export interface ExaminedFile {
  path: string;
  bytes: number;
}

export interface CorpusPin {
  repository: string;
  tag: string;
  commit: string;
}

export interface EngineIdentity {
  name: 'sysml-viewer';
  version: string;
  packageVersion: string;
}

export interface Truncation {
  truncated: boolean;
  limit: number;
  total: number;
  returned: number;
}

export interface AgentDiagnostic {
  code: string;
  severity: ErrorSeverity;
  message: string;
  file: string;
  sourceLocation?: SourceLocation;
  suggestion?: string;
  context?: string;
}

export interface AgentToolEnvelope {
  schemaVersion: '1.0';
  tool: 'sysml_doctor' | 'sysml_check' | 'sysml_explain_diagnostic' | 'sysml_model_summary';
  engine: EngineIdentity;
  corpus: CorpusPin;
  filesExamined: ExaminedFile[];
  diagnostics: AgentDiagnostic[];
  truncation: Truncation;
}

export interface DoctorRequest {
  context: AgentToolContext;
  files?: AgentToolFile[];
  maxDiagnostics?: number;
}

export interface DoctorResult extends AgentToolEnvelope {
  tool: 'sysml_doctor';
  status: 'ready' | 'degraded';
  capabilities: ['doctor', 'check', 'explain-diagnostic', 'model-summary'];
}

export interface CheckRequest {
  context: AgentToolContext;
  files: AgentToolFile[];
  maxDiagnostics?: number;
}

export interface CheckResult extends AgentToolEnvelope {
  tool: 'sysml_check';
  valid: boolean;
  supportedSubsetComplete: boolean;
  counts: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface ExplainDiagnosticRequest {
  context: AgentToolContext;
  code: string;
}

export interface ExplainDiagnosticResult extends AgentToolEnvelope {
  tool: 'sysml_explain_diagnostic';
  code: string;
  known: boolean;
  explanation: string;
  remediation: string[];
}

export interface ModelSummaryRequest {
  context: AgentToolContext;
  files: AgentToolFile[];
  maxElements?: number;
}

export interface ModelSummaryElement {
  id: string;
  kind: string;
  name: string;
  qualifiedPath: string;
  file: string;
  parentId?: string;
  typeName?: string;
}

export interface ModelSummaryResult extends AgentToolEnvelope {
  tool: 'sysml_model_summary';
  elementTruncation: Truncation;
  counts: {
    nodes: number;
    edges: number;
    byKind: Record<string, number>;
  };
  elements: ModelSummaryElement[];
}
