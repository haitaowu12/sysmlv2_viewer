import type {
  LanguageCapabilities,
  WorkbenchCompletionItem,
  WorkbenchDocumentSymbol,
  WorkbenchHover,
  WorkbenchLocation,
  WorkbenchPosition,
  WorkbenchRange,
  WorkbenchSemanticTokens,
  WorkbenchTextEdit,
  WorkbenchWorkspaceEdit,
  WorkspaceStatusResult,
} from '../../workbench-protocol/src/index.js'

export interface WorkspaceDocument {
  uri: string
  absolutePath: string
  languageId: 'sysml' | 'kerml'
  version: number
  text: string
  sha256: string
}

export interface AdapterWorkspace {
  workspaceId: string
  rootUri: string
  configurationName: string
  documents: WorkspaceDocument[]
}

export interface LanguageDiagnostic {
  uri: string
  severity: 'error' | 'warning' | 'information' | 'hint'
  code: string
  message: string
  range?: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface LanguageAdapterMetadata {
  adapterId: string
  adapterVersion: string
  engineName: string
  engineVersion: string
  referenceRelease: string
  qualificationStatus: 'qualified' | 'unqualified' | 'control-only'
}

export interface EngineSemanticElementEvidence {
  engineId: string
  metaclass: string
  name?: string
  qualifiedName?: string
  ownerEngineId?: string
  range?: WorkbenchRange
}

export interface EngineSemanticRelationshipEvidence {
  sourceEngineId: string
  targetEngineId?: string
  targetQualifiedName?: string
  targetUri?: string
  feature: string
  derived: boolean
  resolved: boolean
  sourceRange?: WorkbenchRange
}

export interface EngineSemanticEvidence {
  schemaVersion: 1
  uri: string
  elements: EngineSemanticElementEvidence[]
  relationships: EngineSemanticRelationshipEvidence[]
}

export interface LanguageAdapter {
  readonly metadata: LanguageAdapterMetadata
  readonly capabilities: LanguageCapabilities
  capabilitiesFinal(): boolean
  initialize(): Promise<void>
  prepareWorkspace?(workspace: AdapterWorkspace): Promise<void>
  openWorkspace(workspace: AdapterWorkspace): Promise<LanguageDiagnostic[]>
  closeWorkspace(workspaceId: string): Promise<void>
  dispose(): Promise<void>
  documentSymbols?(uri: string): Promise<WorkbenchDocumentSymbol[]>
  definition?(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]>
  references?(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]>
  hover?(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchHover | null>
  completion?(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchCompletionItem[]>
  semanticTokens?(uri: string): Promise<WorkbenchSemanticTokens>
  rename?(
    uri: string,
    position: WorkbenchPosition,
    newName: string,
  ): Promise<WorkbenchWorkspaceEdit>
  formatting?(uri: string): Promise<WorkbenchTextEdit[]>
  semanticEvidence?(uri: string): Promise<EngineSemanticEvidence>
  changeDocument?(
    uri: string,
    version: number,
    text: string,
  ): Promise<LanguageDiagnostic[]>
  restartWorkspace?(workspace: AdapterWorkspace): Promise<LanguageDiagnostic[]>
  health(): {
    state: 'ready' | 'starting' | 'failed'
    message?: string
  }
}

export class PreservationControlAdapter implements LanguageAdapter {
  readonly metadata: LanguageAdapterMetadata = {
    adapterId: 'preservation-control',
    adapterVersion: '0.1.0',
    engineName: 'none',
    engineVersion: 'none',
    referenceRelease: 'unresolved',
    qualificationStatus: 'control-only',
  }

  readonly capabilities: LanguageCapabilities = {
    workspaceLifecycle: true,
    diagnostics: false,
    documentSymbols: false,
    workspaceSymbols: false,
    definitions: false,
    references: false,
    completion: false,
    hover: false,
    semanticTokens: false,
    rename: false,
    formatting: false,
    semanticEvidence: false,
    semanticSnapshot: false,
  }

  async initialize(): Promise<void> {}

  async openWorkspace(workspace: AdapterWorkspace): Promise<LanguageDiagnostic[]> {
    return [
      {
        uri: workspace.rootUri,
        severity: 'error',
        code: 'WORKBENCH_LANGUAGE_ENGINE_UNQUALIFIED',
        message:
          'No qualified SysML v2 language engine is configured. Source was inventoried and preserved without semantic interpretation.',
      },
    ]
  }

  async closeWorkspace(): Promise<void> {}

  async dispose(): Promise<void> {}

  capabilitiesFinal(): boolean {
    return true
  }

  health(): { state: 'ready' } {
    return { state: 'ready' }
  }
}

export function semanticAuthorityFor(
  adapter: LanguageAdapter,
): WorkspaceStatusResult['semanticAuthority'] {
  if (adapter.metadata.qualificationStatus === 'qualified') {
    return 'qualified-engine'
  }
  if (adapter.metadata.qualificationStatus === 'unqualified') {
    return 'unqualified-engine'
  }
  return 'none'
}

export * from './lsp-process-adapter.js'
export * from './hybrid-language-adapter.js'
export * from './candidate-manifest.js'
