export const WORKBENCH_PROTOCOL_VERSION = '0.3.0'

export const WORKBENCH_METHODS = {
  initialize: 'workbench/initialize',
  health: 'health/status',
  workspaceOpen: 'workspace/open',
  workspaceStatus: 'workspace/status',
  workspaceClose: 'workspace/close',
  languageDiagnostics: 'language/diagnostics',
  languageDocumentSymbols: 'language/documentSymbols',
  languageDefinition: 'language/definition',
  languageReferences: 'language/references',
  languageHover: 'language/hover',
  languageCompletion: 'language/completion',
  languageSemanticTokens: 'language/semanticTokens',
  languageRename: 'language/rename',
  languageFormatting: 'language/formatting',
  languageDocumentChange: 'language/documentChange',
  languageRestart: 'language/restart',
  semanticSnapshot: 'semantic/snapshot',
  modelQuery: 'model/query',
  commandPropose: 'command/propose',
} as const

export type WorkbenchMethod =
  (typeof WORKBENCH_METHODS)[keyof typeof WORKBENCH_METHODS]

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0'
  id: string | number
  result: unknown
}

export interface JsonRpcFailure {
  jsonrpc: '2.0'
  id: string | number | null
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

export interface LanguageCapabilities {
  workspaceLifecycle: boolean
  diagnostics: boolean
  documentSymbols: boolean
  workspaceSymbols: boolean
  definitions: boolean
  references: boolean
  completion: boolean
  hover: boolean
  semanticTokens: boolean
  rename: boolean
  formatting: boolean
  semanticEvidence: boolean
  semanticSnapshot: boolean
}

export interface InitializeParams {
  protocolVersion: string
  client: {
    name: string
    version: string
  }
}

export interface InitializeResult {
  protocolVersion: string
  service: {
    name: string
    version: string
  }
  languageAuthority: {
    adapterId: string
    adapterVersion: string
    engineName: string
    engineVersion: string
    referenceRelease: string
    qualificationStatus: 'qualified' | 'unqualified' | 'control-only'
  }
  transport: {
    kind: 'stdio' | 'loopback'
    secure: boolean
  }
  serviceCapabilities: {
    normalizedSemanticSnapshot: boolean
    durableIdentityPersistence: boolean
    boundedModelQuery: boolean
    typedCommandProposals: boolean
  }
  capabilities: LanguageCapabilities
  capabilitiesFinal: boolean
}

export interface WorkspaceOpenParams {
  workspaceFile: string
}

export interface WorkspaceStatusParams {
  workspaceId: string
}

export interface WorkspaceCloseParams {
  workspaceId: string
}

export interface WorkbenchPosition {
  line: number
  character: number
}

export interface WorkbenchRange {
  start: WorkbenchPosition
  end: WorkbenchPosition
}

export interface WorkbenchLocation {
  uri: string
  range: WorkbenchRange
}

export interface WorkbenchDocumentSymbol {
  name: string
  detail?: string
  kind: string
  range: WorkbenchRange
  selectionRange: WorkbenchRange
  children: WorkbenchDocumentSymbol[]
}

export interface WorkbenchHover {
  format: 'plaintext' | 'markdown'
  value: string
  range?: WorkbenchRange
}

export interface WorkbenchCompletionItem {
  label: string
  detail?: string
  documentation?: string
  kind?: string
  insertText?: string
}

export interface WorkbenchSemanticTokens {
  legend: {
    tokenTypes: string[]
    tokenModifiers: string[]
  }
  data: number[]
}

export interface WorkbenchTextEdit {
  range: WorkbenchRange
  newText: string
}

export interface WorkbenchWorkspaceEdit {
  changes: Record<string, WorkbenchTextEdit[]>
}

export interface WorkspaceDocumentSummary {
  uri: string
  languageId: 'sysml' | 'kerml'
  sha256: string
  byteLength: number
}

export interface WorkspaceStatusResult {
  workspaceId: string
  rootUri: string
  configurationName: string
  indexState: 'ready' | 'indexing' | 'stale' | 'failed'
  semanticAuthority: 'qualified-engine' | 'unqualified-engine' | 'none'
  documentCount: number
  snapshotSha256: string
  documents: WorkspaceDocumentSummary[]
  diagnostics: {
    errors: number
    warnings: number
    information: number
    hints: number
  }
  languageCapabilities: LanguageCapabilities
  capabilitiesFinal: boolean
}

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  notInitialized: -32002,
  capabilityUnavailable: -32004,
  workspaceRejected: -32010,
} as const

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) return false
  return (
    value.jsonrpc === '2.0' &&
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    typeof value.method === 'string'
  )
}

export function success(
  id: string | number,
  result: unknown,
): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result }
}

export function failure(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  }
}

export function requireRecord(
  value: unknown,
  description = 'parameters',
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${description} must be an object`)
  }
  return value
}

export function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
