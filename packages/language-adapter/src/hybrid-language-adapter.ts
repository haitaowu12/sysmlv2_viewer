import type {
  WorkbenchCompletionItem,
  WorkbenchDocumentSymbol,
  WorkbenchHover,
  WorkbenchLocation,
  WorkbenchPosition,
  WorkbenchSemanticTokens,
  WorkbenchTextEdit,
  WorkbenchWorkspaceEdit,
} from '../../workbench-protocol/src/index.js'
import type {
  AdapterWorkspace,
  LanguageAdapter,
  LanguageAdapterMetadata,
  LanguageDiagnostic,
  EngineSemanticEvidence,
} from './index.js'
import { LspProcessAdapter } from './lsp-process-adapter.js'

/**
 * An explicit two-engine boundary. The semantic engine remains authoritative for
 * workspace validity and navigation; the authoring engine can only propose
 * editor assistance and source edits. Callers never receive a silent fallback.
 */
export class HybridLanguageAdapter implements LanguageAdapter {
  readonly metadata: LanguageAdapterMetadata
  private authoringSync: Promise<void> = Promise.resolve()
  private authoringSyncError: unknown

  constructor(
    private readonly semantic: LanguageAdapter,
    private readonly authoring: LanguageAdapter,
    metadata: LanguageAdapterMetadata,
  ) {
    this.metadata = metadata
  }

  get capabilities() {
    return {
      workspaceLifecycle:
        this.semantic.capabilities.workspaceLifecycle &&
        this.authoring.capabilities.workspaceLifecycle,
      diagnostics: this.semantic.capabilities.diagnostics,
      documentSymbols: this.semantic.capabilities.documentSymbols,
      workspaceSymbols: this.semantic.capabilities.workspaceSymbols,
      definitions: this.semantic.capabilities.definitions,
      references: this.semantic.capabilities.references,
      completion: this.authoring.capabilities.completion,
      hover: this.semantic.capabilities.hover,
      semanticTokens: this.authoring.capabilities.semanticTokens,
      rename: this.authoring.capabilities.rename,
      formatting: this.authoring.capabilities.formatting,
      semanticEvidence: this.semantic.capabilities.semanticEvidence,
      semanticSnapshot: this.semantic.capabilities.semanticSnapshot,
    }
  }

  capabilitiesFinal(): boolean {
    return (
      this.semantic.capabilitiesFinal() && this.authoring.capabilitiesFinal()
    )
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.semantic.initialize(),
      this.authoring.initialize(),
    ])
  }

  async openWorkspace(
    workspace: AdapterWorkspace,
  ): Promise<LanguageDiagnostic[]> {
    try {
      const [diagnostics] = await Promise.all([
        this.semantic.openWorkspace(workspace),
        this.authoring.openWorkspace(structuredClone(workspace)),
      ])
      return diagnostics
    } catch (error) {
      await Promise.allSettled([
        this.semantic.closeWorkspace(workspace.workspaceId),
        this.authoring.closeWorkspace(workspace.workspaceId),
      ])
      throw error
    }
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    await this.authoringSync
    const syncError = this.authoringSyncError
    await Promise.all([
      this.semantic.closeWorkspace(workspaceId),
      this.authoring.closeWorkspace(workspaceId),
    ])
    this.authoringSyncError = undefined
    if (syncError) throw syncError
  }

  async dispose(): Promise<void> {
    await this.authoringSync.catch(() => undefined)
    await Promise.allSettled([
      this.semantic.dispose(),
      this.authoring.dispose(),
    ])
  }

  documentSymbols(uri: string): Promise<WorkbenchDocumentSymbol[]> {
    return this.requireOperation(
      this.semantic.documentSymbols,
      'semantic document symbols',
    ).call(this.semantic, uri)
  }

  definition(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    return this.requireOperation(
      this.semantic.definition,
      'semantic definition',
    ).call(this.semantic, uri, position)
  }

  references(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    return this.requireOperation(
      this.semantic.references,
      'semantic references',
    ).call(this.semantic, uri, position)
  }

  hover(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchHover | null> {
    return this.requireOperation(this.semantic.hover, 'semantic hover').call(
      this.semantic,
      uri,
      position,
    )
  }

  async completion(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchCompletionItem[]> {
    await this.awaitAuthoringSync()
    return this.requireOperation(
      this.authoring.completion,
      'authoring completion',
    ).call(this.authoring, uri, position)
  }

  async semanticTokens(uri: string): Promise<WorkbenchSemanticTokens> {
    await this.awaitAuthoringSync()
    return this.requireOperation(
      this.authoring.semanticTokens,
      'authoring semantic tokens',
    ).call(this.authoring, uri)
  }

  async rename(
    uri: string,
    position: WorkbenchPosition,
    newName: string,
  ): Promise<WorkbenchWorkspaceEdit> {
    await this.awaitAuthoringSync()
    return this.requireOperation(
      this.authoring.rename,
      'authoring rename',
    ).call(this.authoring, uri, position, newName)
  }

  async formatting(uri: string): Promise<WorkbenchTextEdit[]> {
    await this.awaitAuthoringSync()
    return this.requireOperation(
      this.authoring.formatting,
      'authoring formatting',
    ).call(this.authoring, uri)
  }

  semanticEvidence(uri: string): Promise<EngineSemanticEvidence> {
    return this.requireOperation(
      this.semantic.semanticEvidence,
      'semantic evidence',
    ).call(this.semantic, uri)
  }

  async changeDocument(
    uri: string,
    version: number,
    text: string,
  ): Promise<LanguageDiagnostic[]> {
    if (this.authoringSyncError) throw this.authoringSyncError
    const authoringChange = this.requireOperation(
      this.authoring.changeDocument,
      'authoring incremental update',
    )
    const priorSync = this.authoringSync
    const nextSync = priorSync.then(() =>
      authoringChange.call(this.authoring, uri, version, text),
    )
    this.authoringSync = nextSync.then(
      () => undefined,
      (error: unknown) => {
        this.authoringSyncError = error
      },
    )
    return this.requireOperation(
      this.semantic.changeDocument,
      'semantic incremental update',
    ).call(this.semantic, uri, version, text)
  }

  async restartWorkspace(
    workspace: AdapterWorkspace,
  ): Promise<LanguageDiagnostic[]> {
    await this.authoringSync.catch(() => undefined)
    this.authoringSyncError = undefined
    const [diagnostics] = await Promise.all([
      this.requireOperation(
        this.semantic.restartWorkspace,
        'semantic restart',
      ).call(this.semantic, workspace),
      this.requireOperation(
        this.authoring.restartWorkspace,
        'authoring restart',
      ).call(this.authoring, structuredClone(workspace)),
    ])
    return diagnostics
  }

  private async awaitAuthoringSync(): Promise<void> {
    await this.authoringSync
    if (this.authoringSyncError) {
      throw this.authoringSyncError
    }
  }

  health(): ReturnType<LanguageAdapter['health']> {
    const semantic = this.semantic.health()
    if (semantic.state !== 'ready') {
      return {
        state: semantic.state,
        message: `Semantic engine: ${semantic.message ?? semantic.state}`,
      }
    }
    const authoring = this.authoring.health()
    if (authoring.state !== 'ready') {
      return {
        state: authoring.state,
        message: `Authoring engine: ${authoring.message ?? authoring.state}`,
      }
    }
    return { state: 'ready' }
  }

  evidence(): {
    semantic: ReturnType<LspProcessAdapter['evidence']> | null
    authoring: ReturnType<LspProcessAdapter['evidence']> | null
  } {
    return {
      semantic:
        this.semantic instanceof LspProcessAdapter
          ? this.semantic.evidence()
          : null,
      authoring:
        this.authoring instanceof LspProcessAdapter
          ? this.authoring.evidence()
          : null,
    }
  }

  private requireOperation<T>(
    operation: T | undefined,
    name: string,
  ): NonNullable<T> {
    if (!operation) {
      throw new Error(`Selected hybrid runtime lacks ${name}`)
    }
    return operation as NonNullable<T>
  }
}
