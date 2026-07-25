import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import type {
  WorkbenchCompletionItem,
  WorkbenchDocumentSymbol,
  WorkbenchHover,
  WorkbenchLocation,
  WorkbenchPosition,
  WorkbenchRange,
  WorkbenchSemanticTokens,
  WorkbenchTextEdit,
  WorkbenchWorkspaceEdit,
  WorkspaceDocumentContent,
  SavedWorkbenchView,
  WorkspaceDocumentSummary,
  WorkspaceStatusResult,
} from '../../workbench-protocol/src/index.js'
import {
  buildSemanticSnapshot,
  IdentityRegistry,
  type IdentityRegistryData,
  type SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import {
  executeModelQuery,
  type ModelQuery,
  type ModelQueryResult,
} from '../../query-engine/src/index.js'
import {
  completeCommandValidation,
  commitWorkspaceTransaction,
  planCommand,
  planExplicitSourceEditCommand,
  readWorkspaceTransaction,
  recoverWorkspaceTransactions,
  toPublicCommandProposal,
  type ApplyCommandApproval,
  type AppliedCommandReceipt,
  type CommandEnvelope,
  type CommandHistoryRequest,
  type CommandTransactionAudit,
  type InternalCommandProposal,
  type CommandProposal,
  type WorkspaceTransactionReceipt,
} from '../../command-engine/src/index.js'
import type {
  AdapterWorkspace,
  EngineSemanticEvidence,
  LanguageAdapter,
  LanguageDiagnostic,
  WorkspaceDocument,
} from '../../language-adapter/src/index.js'
import { semanticAuthorityFor } from '../../language-adapter/src/index.js'
import {
  isPathWithin,
  resolveExistingWithin,
  resolveWithinAnyRoot,
  WorkspacePathError,
} from './path-security.js'
import {
  BaselineRepository,
  readGitStatus,
  type BaselineComparison,
  type BaselineManifest,
  type GitWorkspaceStatus,
} from '../../baseline-service/src/index.js'
import {
  ReviewRepository,
  type FindingDisposition,
  type ModelReview,
  type ReviewStaleness,
} from '../../review-service/src/index.js'
import {
  evaluateAssurance,
  RULE_PACK_VERSION,
  type AssuranceEvaluation,
} from '../../rule-engine/src/index.js'
import {
  writeReportBundle,
  type ReportBundleManifest,
  type ReportKind,
} from '../../report-engine/src/index.js'

const MODEL_EXTENSIONS = new Set(['.sysml', '.kerml'])
const DEFAULT_MAX_FILES = 2_000
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024

interface WorkspaceConfiguration {
  schemaVersion: number
  id?: string
  name?: string
  sourceRoots: string[]
  libraries?: string[]
  activeConfiguration?: string
  modelConfigurations?: Record<string, { sourceRoots?: string[]; libraries?: string[] }>
}

interface OpenWorkspace {
  adapterWorkspace: AdapterWorkspace
  displayName: string
  status: WorkspaceStatusResult
  diagnostics: LanguageDiagnostic[]
  identityRegistry: IdentityRegistry
  identityRegistryPath: string
  rootPath: string
  semanticRevision: number
  semanticSnapshot?: SemanticSnapshot
  semanticSnapshotPromise?: Promise<SemanticSnapshot>
  queryCache: Map<string, ModelQueryResult>
  commandProposals: Map<string, InternalCommandProposal>
  commandLease: boolean
  appliedCommands: Map<string, AppliedCommandReceipt>
}

export interface WorkspaceManagerOptions {
  allowedRoots: string[]
  adapter: LanguageAdapter
  workbenchVersion?: string
  maxFiles?: number
  maxBytes?: number
}

export interface CreateBaselineInput {
  id: string
  actor: string
  at: string
}

export interface CreateReviewInput {
  id: string
  title: string
  scope: ModelReview['scope']
  participants?: ModelReview['participants']
  actor: string
  at: string
}

export interface AddReviewFindingInput {
  reviewId: string
  finding: Omit<Parameters<ReviewRepository['addFinding']>[1], 'actor' | 'at'> & {
    actor: string
    at: string
  }
}

export interface DispositionReviewFindingInput {
  reviewId: string
  findingId: string
  disposition: FindingDisposition
  response: string
  actor: string
  at: string
}

export interface GenerateReportInput {
  reportId: string
  kind: ReportKind
  at: string
  baselineId?: string
  viewConfiguration?: string
  exclusions?: string[]
}

export class WorkspaceManager {
  private readonly workspaces = new Map<string, OpenWorkspace>()
  private initialized = false

  constructor(private readonly options: WorkspaceManagerOptions) {
    if (options.allowedRoots.length === 0) {
      throw new WorkspacePathError('At least one authorized workspace root is required')
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.options.adapter.initialize()
    this.initialized = true
  }

  async open(workspaceFile: string): Promise<WorkspaceStatusResult> {
    await this.initialize()

    const authorized = await resolveWithinAnyRoot(
      this.options.allowedRoots,
      workspaceFile,
    )
    const rootPath = dirname(authorized.path)
    await recoverWorkspaceTransactions(rootPath)
    const rawConfig = await readFile(authorized.path, 'utf8')
    const configuration = validateConfiguration(parse(rawConfig))
    const selection = selectConfiguration(configuration)
    const roots = [...selection.sourceRoots, ...selection.libraries]

    const documentPaths = new Set<string>()
    for (const configuredRoot of roots) {
      const sourceRoot = await resolveExistingWithin(rootPath, configuredRoot)
      await collectModelFiles(rootPath, sourceRoot, documentPaths)
    }

    const maxFiles = this.options.maxFiles ?? DEFAULT_MAX_FILES
    if (documentPaths.size > maxFiles) {
      throw new WorkspacePathError(
        `Workspace contains ${documentPaths.size} model files; limit is ${maxFiles}`,
      )
    }

    let totalBytes = 0
    const documents: WorkspaceDocument[] = []
    for (const absolutePath of [...documentPaths].sort()) {
      const bytes = await readFile(absolutePath)
      totalBytes += bytes.byteLength
      if (totalBytes > (this.options.maxBytes ?? DEFAULT_MAX_BYTES)) {
        throw new WorkspacePathError(
          `Workspace model content exceeds the configured byte limit`,
        )
      }

      const text = bytes.toString('utf8')
      const extension = extname(absolutePath).toLowerCase()
      documents.push({
        uri: pathToFileURL(absolutePath).href,
        absolutePath,
        languageId: extension === '.kerml' ? 'kerml' : 'sysml',
        version: 1,
        text,
        sha256: sha256(bytes),
      })
    }

    const configuredId = configuration.id?.trim()
    const workspaceId =
      configuredId ||
      `workspace-${sha256(Buffer.from(pathToFileURL(authorized.path).href)).slice(0, 16)}`
    const adapterWorkspace: AdapterWorkspace = {
      workspaceId,
      rootUri: pathToFileURL(rootPath).href,
      configurationName: selection.name,
      documents,
    }

    const identityRegistryPath = resolve(
      rootPath,
      'identities/model-identities.json',
    )
    const identityRegistry = await loadIdentityRegistry(
      identityRegistryPath,
      workspaceId,
      rootPath,
    )
    for (const openWorkspaceId of [...this.workspaces.keys()]) {
      await this.options.adapter.closeWorkspace(openWorkspaceId)
      this.workspaces.delete(openWorkspaceId)
    }
    const diagnostics = await this.options.adapter.openWorkspace(adapterWorkspace)
    const status = buildStatus(
      adapterWorkspace,
      this.options.adapter,
      diagnostics,
    )
    this.workspaces.set(workspaceId, {
      adapterWorkspace,
      displayName: configuration.name?.trim() || selection.name,
      status,
      diagnostics,
      identityRegistry,
      identityRegistryPath,
      rootPath,
      semanticRevision: 0,
      queryCache: new Map(),
      commandProposals: new Map(),
      commandLease: false,
      appliedCommands: new Map(),
    })
    return status
  }

  status(workspaceId: string): WorkspaceStatusResult {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) {
      throw new WorkspacePathError(`Unknown workspace: ${workspaceId}`)
    }
    const status = structuredClone(workspace.status)
    if (
      status.indexState === 'ready' &&
      this.options.adapter.health().state === 'failed'
    ) {
      status.indexState = 'stale'
    }
    return status
  }

  diagnostics(workspaceId: string): LanguageDiagnostic[] {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) {
      throw new WorkspacePathError(`Unknown workspace: ${workspaceId}`)
    }
    return structuredClone(workspace.diagnostics)
  }

  readDocument(
    workspaceId: string,
    uri: string,
  ): WorkspaceDocumentContent {
    const workspace = this.requireDocument(workspaceId, uri)
    const document = workspace.adapterWorkspace.documents.find(
      (candidate) => candidate.uri === uri,
    )!
    return {
      uri: document.uri,
      languageId: document.languageId,
      sha256: document.sha256,
      byteLength: Buffer.byteLength(document.text, 'utf8'),
      version: document.version,
      text: document.text,
    }
  }

  async listViews(workspaceId: string): Promise<SavedWorkbenchView[]> {
    const workspace = this.requireWorkspace(workspaceId)
    const viewsDirectory = resolve(workspace.rootPath, 'views')
    await mkdir(viewsDirectory, { recursive: true })
    const entries = await readdir(viewsDirectory, { withFileTypes: true })
    const views: SavedWorkbenchView[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const path = await resolveExistingWithin(viewsDirectory, entry.name)
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
      views.push(validateSavedView(raw))
    }
    return views
  }

  async saveView(
    workspaceId: string,
    value: unknown,
  ): Promise<SavedWorkbenchView> {
    const workspace = this.requireWorkspace(workspaceId)
    const view = validateSavedView(value)
    const viewsDirectory = resolve(workspace.rootPath, 'views')
    await mkdir(viewsDirectory, { recursive: true })
    const canonicalDirectory = await realpath(viewsDirectory)
    if (!isPathWithin(workspace.rootPath, canonicalDirectory)) {
      throw new WorkspacePathError('Views directory resolves outside the workspace')
    }
    const destination = resolve(canonicalDirectory, `${view.id}.json`)
    if (!isPathWithin(canonicalDirectory, destination)) {
      throw new WorkspacePathError('Saved view path escapes the views directory')
    }
    const persisted = {
      ...view,
      updatedAt: new Date().toISOString(),
    }
    const temporary = resolve(
      canonicalDirectory,
      `.${view.id}.${process.pid}.${Date.now()}.tmp`,
    )
    await writeFile(temporary, `${JSON.stringify(persisted, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporary, destination)
    return persisted
  }

  async documentSymbols(
    workspaceId: string,
    uri: string,
  ): Promise<WorkbenchDocumentSymbol[]> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.documentSymbols) {
      throw new WorkspacePathError('Document symbols are not supported')
    }
    return this.options.adapter.documentSymbols!(uri)
  }

  async definition(
    workspaceId: string,
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.definitions) {
      throw new WorkspacePathError('Definition navigation is not supported')
    }
    return this.options.adapter.definition!(uri, position)
  }

  async references(
    workspaceId: string,
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.references) {
      throw new WorkspacePathError('Reference navigation is not supported')
    }
    return this.options.adapter.references!(uri, position)
  }

  async hover(
    workspaceId: string,
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchHover | null> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.hover) {
      throw new WorkspacePathError('Hover is not supported')
    }
    return this.options.adapter.hover!(uri, position)
  }

  async completion(
    workspaceId: string,
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchCompletionItem[]> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.completion) {
      throw new WorkspacePathError('Completion is not supported')
    }
    return this.options.adapter.completion!(uri, position)
  }

  async semanticTokens(
    workspaceId: string,
    uri: string,
  ): Promise<WorkbenchSemanticTokens> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.semanticTokens) {
      throw new WorkspacePathError('Semantic tokens are not supported')
    }
    return this.options.adapter.semanticTokens!(uri)
  }

  async rename(
    workspaceId: string,
    uri: string,
    position: WorkbenchPosition,
    newName: string,
  ): Promise<WorkbenchWorkspaceEdit> {
    const workspace = this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.rename) {
      throw new WorkspacePathError('Rename is not supported')
    }
    const edit = await this.options.adapter.rename!(uri, position, newName)
    const authorizedUris = new Set(
      workspace.adapterWorkspace.documents.map((document) => document.uri),
    )
    for (const changedUri of Object.keys(edit.changes)) {
      if (!authorizedUris.has(changedUri)) {
        throw new WorkspacePathError(
          `Language engine proposed an edit outside the active workspace: ${changedUri}`,
        )
      }
    }
    return edit
  }

  async formatting(
    workspaceId: string,
    uri: string,
  ): Promise<WorkbenchTextEdit[]> {
    this.requireDocument(workspaceId, uri)
    if (!this.options.adapter.capabilities.formatting) {
      throw new WorkspacePathError('Formatting is not supported')
    }
    return this.options.adapter.formatting!(uri)
  }

  async changeDocument(
    workspaceId: string,
    uri: string,
    version: number,
    text: string,
  ): Promise<WorkspaceStatusResult> {
    const workspace = this.requireDocument(workspaceId, uri)
    if (workspace.commandLease) {
      throw new WorkspacePathError(
        'Workspace document changes are blocked during command validation',
      )
    }
    if (!this.options.adapter.changeDocument) {
      throw new WorkspacePathError('Incremental document changes are not supported')
    }
    const document = workspace.adapterWorkspace.documents.find(
      (item) => item.uri === uri,
    )!
    const nextTotalBytes = workspace.adapterWorkspace.documents.reduce(
      (total, item) =>
        total +
        Buffer.byteLength(item.uri === uri ? text : item.text, 'utf8'),
      0,
    )
    if (nextTotalBytes > (this.options.maxBytes ?? DEFAULT_MAX_BYTES)) {
      throw new WorkspacePathError(
        'Workspace model content exceeds the configured byte limit',
      )
    }
    const diagnostics = await this.options.adapter.changeDocument(
      uri,
      version,
      text,
    )
    document.version = version
    document.text = text
    document.sha256 = sha256(Buffer.from(text, 'utf8'))
    workspace.diagnostics = diagnostics
    workspace.status = buildStatus(
      workspace.adapterWorkspace,
      this.options.adapter,
      diagnostics,
    )
    workspace.semanticRevision += 1
    workspace.semanticSnapshot = undefined
    workspace.semanticSnapshotPromise = undefined
    workspace.queryCache.clear()
    workspace.commandProposals.clear()
    return structuredClone(workspace.status)
  }

  async restart(workspaceId: string): Promise<WorkspaceStatusResult> {
    const workspace = this.requireWorkspace(workspaceId)
    if (workspace.commandLease) {
      throw new WorkspacePathError(
        'Language restart is blocked during command validation',
      )
    }
    if (!this.options.adapter.restartWorkspace) {
      throw new WorkspacePathError('Language engine restart is not supported')
    }
    workspace.status.indexState = 'indexing'
    const diagnostics = await this.options.adapter.restartWorkspace(
      workspace.adapterWorkspace,
    )
    workspace.diagnostics = diagnostics
    workspace.status = buildStatus(
      workspace.adapterWorkspace,
      this.options.adapter,
      diagnostics,
    )
    workspace.semanticRevision += 1
    workspace.semanticSnapshot = undefined
    workspace.semanticSnapshotPromise = undefined
    workspace.queryCache.clear()
    workspace.commandProposals.clear()
    return structuredClone(workspace.status)
  }

  async proposeCommand(envelope: CommandEnvelope): Promise<CommandProposal> {
    const workspace = this.requireWorkspace(envelope.workspaceId)
    const existing = workspace.commandProposals.get(envelope.commandId)
    if (existing) {
      if (JSON.stringify(existing.envelope) !== JSON.stringify(envelope)) {
        throw new WorkspacePathError(
          `Command commandId conflict: ${envelope.commandId}`,
        )
      }
      return toPublicCommandProposal(existing)
    }
    if (workspace.commandLease) {
      throw new WorkspacePathError('Another command operation holds the workspace lease')
    }
    workspace.commandLease = true
    try {
      const snapshot = await this.semanticSnapshot(envelope.workspaceId)
      const documents = workspace.adapterWorkspace.documents.map((document) => ({
        uri: document.uri,
        workspacePath: relative(workspace.rootPath, document.absolutePath)
          .replaceAll('\\', '/'),
        text: document.text,
        sha256: document.sha256,
        version: document.version,
      }))
      const planned = await planCommand({
        envelope,
        snapshot,
        documents,
        renameProvider: async (target, newName) => {
          const document = workspace.adapterWorkspace.documents.find(
            (candidate) => candidate.uri === target.source.uri,
          )
          if (!document) {
            throw new WorkspacePathError(
              `Command target source is outside the workspace: ${target.id}`,
            )
          }
          return this.rename(
            envelope.workspaceId,
            target.source.uri,
            locateElementName(document.text, target.source.range, target.name),
            newName,
          )
        },
      })
      const proposal = await this.validateCommandOverlay(
        workspace,
        snapshot,
        planned,
      )
      workspace.commandProposals.set(envelope.commandId, proposal)
      return toPublicCommandProposal(proposal)
    } finally {
      workspace.commandLease = false
    }
  }

  async proposeUndo(request: CommandHistoryRequest): Promise<CommandProposal> {
    return this.proposeHistoryCommand(request, 'undo-command')
  }

  async proposeRedo(request: CommandHistoryRequest): Promise<CommandProposal> {
    return this.proposeHistoryCommand(request, 'redo-command')
  }

  private async proposeHistoryCommand(
    request: CommandHistoryRequest,
    kind: 'undo-command' | 'redo-command',
  ): Promise<CommandProposal> {
    const workspace = this.requireWorkspace(request.workspaceId)
    if (
      !request.commandId ||
      !request.appliedProposalId ||
      request.appliedProposalId.length > 512 ||
      !request.requestedBy?.id
    ) {
      throw new WorkspacePathError('Command history request is incomplete')
    }
    const existing = workspace.commandProposals.get(request.commandId)
    if (existing) {
      const command = existing.envelope.command
      if (
        command.kind !== kind ||
        command.appliedProposalId !== request.appliedProposalId ||
        JSON.stringify(existing.envelope.requestedBy) !==
          JSON.stringify(request.requestedBy)
      ) {
        throw new WorkspacePathError(
          `Command commandId conflict: ${request.commandId}`,
        )
      }
      return toPublicCommandProposal(existing)
    }
    if (workspace.commandLease) {
      throw new WorkspacePathError('Another command operation holds the workspace lease')
    }
    workspace.commandLease = true
    try {
      const transaction = await readWorkspaceTransaction(
        workspace.rootPath,
        commandTransactionId(request.appliedProposalId),
      )
      const priorAudit = requireCommandAudit(transaction, request.appliedProposalId)
      if (
        kind === 'redo-command' &&
        priorAudit.proposal.envelope.command.kind !== 'undo-command'
      ) {
        throw new WorkspacePathError('Redo must target an applied undo proposal')
      }
      const snapshot = await this.semanticSnapshot(request.workspaceId)
      if (snapshot.snapshotSha256 !== priorAudit.expectedSnapshotSha256) {
        throw new WorkspacePathError(
          'Command history is stale; undo and redo require the current head',
        )
      }
      const documents = workspace.adapterWorkspace.documents.map((document) => ({
        uri: document.uri,
        workspacePath: relative(workspace.rootPath, document.absolutePath)
          .replaceAll('\\', '/'),
        text: document.text,
        sha256: document.sha256,
        version: document.version,
      }))
      const envelope: CommandEnvelope = {
        schemaVersion: 1,
        commandId: request.commandId,
        workspaceId: request.workspaceId,
        baseSnapshotSha256: snapshot.snapshotSha256,
        baseDocuments: Object.fromEntries(
          documents.map((document) => [document.uri, document.sha256]),
        ),
        requestedBy: structuredClone(request.requestedBy),
        command: { kind, appliedProposalId: request.appliedProposalId },
      }
      const planned = planExplicitSourceEditCommand({
        envelope,
        snapshot,
        documents,
        edits: priorAudit.proposal.undo,
        affectedElementIds: priorAudit.proposal.affectedElementIds,
      })
      const proposal = await this.validateCommandOverlay(
        workspace,
        snapshot,
        planned,
      )
      workspace.commandProposals.set(request.commandId, proposal)
      return toPublicCommandProposal(proposal)
    } finally {
      workspace.commandLease = false
    }
  }

  async applyCommand(
    approval: ApplyCommandApproval,
  ): Promise<AppliedCommandReceipt> {
    const workspace = this.requireWorkspace(approval.workspaceId)
    if (
      approval.approvedBy?.kind !== 'user' ||
      !approval.approvedBy.id ||
      !approval.approvalId
    ) {
      throw new WorkspacePathError(
        'Command approval must identify an explicit human user',
      )
    }
    const alreadyApplied = workspace.appliedCommands.get(approval.proposalId)
    if (alreadyApplied) return structuredClone(alreadyApplied)
    const proposal = [...workspace.commandProposals.values()].find(
      (candidate) => candidate.proposalId === approval.proposalId,
    )
    if (!proposal) {
      throw new WorkspacePathError(
        `Unknown or expired command proposal: ${approval.proposalId}`,
      )
    }
    if (proposal.validation.state !== 'validated' || proposal.conflicts.length > 0) {
      throw new WorkspacePathError(
        `Command proposal is not valid for apply: ${approval.proposalId}`,
      )
    }
    if (workspace.commandLease) {
      throw new WorkspacePathError('Another command operation holds the workspace lease')
    }
    workspace.commandLease = true
    try {
      const currentSnapshot = await this.semanticSnapshot(approval.workspaceId)
      if (
        currentSnapshot.snapshotSha256 !==
        proposal.envelope.baseSnapshotSha256
      ) {
        throw new WorkspacePathError('Command proposal base snapshot is stale')
      }
      const identities = new IdentityRegistry(workspace.identityRegistry.serialize())
      const identityChanges = new Map(
        proposal.semanticDiff?.changes
          .filter((change) =>
            (change.kind === 'element-renamed' || change.kind === 'element-moved') &&
            change.elementId &&
            change.after &&
            'qualifiedName' in change.after,
          )
          .map((change) => [change.elementId!, change.after!]) ?? [],
      )
      for (const [elementId, after] of identityChanges) {
        if (!('qualifiedName' in after)) continue
        identities.migrate(
          elementId,
          {
            workspacePath: after.source.workspacePath,
            qualifiedName: after.qualifiedName,
            kind: after.kind,
          },
          after.fingerprint,
          proposal.commandId,
        )
      }
      if (!proposal.validatedAfterSnapshot) {
        throw new WorkspacePathError('Command proposal is missing validated identity state')
      }
      identities.beginSnapshot()
      try {
        for (const element of proposal.validatedAfterSnapshot.elements) {
          identities.resolve(
            {
              workspacePath: element.source.workspacePath,
              qualifiedName: element.qualifiedName,
              kind: element.kind,
            },
            element.fingerprint,
          )
        }
        identities.completeSnapshot()
      } catch (error) {
        identities.abortSnapshot()
        throw error
      }
      const files = proposal.overlayDocuments
        .map((overlay) => {
          const current = workspace.adapterWorkspace.documents.find(
            (document) => document.uri === overlay.uri,
          )
          if (!current || current.text === overlay.text) return null
          return {
            absolutePath: current.absolutePath,
            workspacePath: overlay.workspacePath,
            beforeSha256: current.sha256,
            afterSha256: overlay.sha256,
            beforeText: current.text,
            afterText: overlay.text,
          }
        })
        .filter((file): file is NonNullable<typeof file> => file !== null)
      const identityBefore = await readFile(workspace.identityRegistryPath, 'utf8')
      const identityAfter = `${JSON.stringify(identities.serialize(), null, 2)}\n`
      if (identityBefore !== identityAfter) {
        files.push({
          absolutePath: workspace.identityRegistryPath,
          workspacePath: relative(
            workspace.rootPath,
            workspace.identityRegistryPath,
          ).replaceAll('\\', '/'),
          beforeSha256: sha256(Buffer.from(identityBefore)),
          afterSha256: sha256(Buffer.from(identityAfter)),
          beforeText: identityBefore,
          afterText: identityAfter,
        })
      }
      const appliedAt = new Date().toISOString()
      const audit: CommandTransactionAudit = {
        schemaVersion: 1,
        recordType: 'command-application',
        proposal: toPublicCommandProposal(proposal),
        approval: structuredClone(approval),
        expectedSnapshotSha256: proposal.semanticDiff!.afterSnapshotSha256,
        appliedAt,
      }
      const transaction = await commitWorkspaceTransaction({
        rootPath: workspace.rootPath,
        transactionId: commandTransactionId(proposal.proposalId),
        files,
        metadata: { commandAudit: audit },
      })
      workspace.identityRegistry = identities
      workspace.identityRegistry.markPersisted()
      let diagnostics = structuredClone(workspace.diagnostics)
      for (const overlay of proposal.overlayDocuments) {
        const current = workspace.adapterWorkspace.documents.find(
          (document) => document.uri === overlay.uri,
        )
        if (!current || current.text === overlay.text) continue
        diagnostics = await this.options.adapter.changeDocument!(
          overlay.uri,
          current.version + 1,
          overlay.text,
        )
        current.text = overlay.text
        current.sha256 = overlay.sha256
      }
      workspace.diagnostics = diagnostics
      workspace.status = buildStatus(
        workspace.adapterWorkspace,
        this.options.adapter,
        diagnostics,
      )
      workspace.semanticRevision += 1
      workspace.semanticSnapshot = undefined
      workspace.semanticSnapshotPromise = undefined
      workspace.queryCache.clear()
      const appliedSnapshot = await this.semanticSnapshot(approval.workspaceId)
      if (
        proposal.semanticDiff?.afterSnapshotSha256 !==
        appliedSnapshot.snapshotSha256
      ) {
        throw new WorkspacePathError(
          'Applied command semantic snapshot differs from validated proposal',
        )
      }
      const receipt: AppliedCommandReceipt = {
        schemaVersion: 1,
        state: 'applied',
        proposalId: proposal.proposalId,
        commandId: proposal.commandId,
        approval: {
          approvalId: approval.approvalId,
          approvedBy: structuredClone(approval.approvedBy),
        },
        transaction,
        appliedSnapshotSha256: appliedSnapshot.snapshotSha256,
        appliedAt,
        undo: {
          baseSnapshotSha256: appliedSnapshot.snapshotSha256,
          baseDocuments: Object.fromEntries(
            appliedSnapshot.documents.map((document) => [
              document.uri,
              document.sha256,
            ]),
          ),
          edits: structuredClone(proposal.undo),
        },
      }
      workspace.appliedCommands.set(proposal.proposalId, receipt)
      return structuredClone(receipt)
    } finally {
      workspace.commandLease = false
    }
  }

  async semanticSnapshot(workspaceId: string): Promise<SemanticSnapshot> {
    const workspace = this.requireWorkspace(workspaceId)
    const health = this.options.adapter.health()
    if (workspace.semanticSnapshot) {
      return {
        ...structuredClone(workspace.semanticSnapshot),
        freshness: health.state === 'ready' ? 'current' : 'stale',
      }
    }
    if (health.state !== 'ready') {
      throw new WorkspacePathError(
        'No complete semantic snapshot exists and the language authority is not ready',
      )
    }
    if (!this.options.adapter.capabilities.semanticEvidence) {
      throw new WorkspacePathError(
        'The qualified language authority does not provide semantic evidence',
      )
    }
    const snapshotPromise =
      workspace.semanticSnapshotPromise ??=
        this.createSemanticSnapshot(workspace, workspace.semanticRevision)
    try {
      return structuredClone(await snapshotPromise)
    } finally {
      if (workspace.semanticSnapshotPromise === snapshotPromise) {
        workspace.semanticSnapshotPromise = undefined
      }
    }
  }

  async modelQuery(
    workspaceId: string,
    query: ModelQuery,
  ): Promise<ModelQueryResult> {
    const workspace = this.requireWorkspace(workspaceId)
    const snapshot = await this.semanticSnapshot(workspaceId)
    const key = `${snapshot.snapshotSha256}\u0000${JSON.stringify(query)}`
    const cached = workspace.queryCache.get(key)
    if (cached) return structuredClone(cached)
    const result = executeModelQuery(snapshot, query)
    if (workspace.queryCache.size >= 128) {
      const oldest = workspace.queryCache.keys().next().value
      if (oldest) workspace.queryCache.delete(oldest)
    }
    workspace.queryCache.set(key, structuredClone(result))
    return result
  }

  async evaluateAssurance(workspaceId: string): Promise<AssuranceEvaluation> {
    return evaluateAssurance(await this.semanticSnapshot(workspaceId))
  }

  async gitStatus(workspaceId: string): Promise<GitWorkspaceStatus> {
    return readGitStatus(this.requireWorkspace(workspaceId).rootPath)
  }

  async listBaselines(workspaceId: string): Promise<BaselineManifest[]> {
    return new BaselineRepository(this.requireWorkspace(workspaceId).rootPath).list()
  }

  async createBaseline(
    workspaceId: string,
    input: CreateBaselineInput,
  ): Promise<BaselineManifest> {
    const workspace = this.requireWorkspace(workspaceId)
    return new BaselineRepository(workspace.rootPath).create({
      id: input.id,
      snapshot: await this.semanticSnapshot(workspaceId),
      diagnostics: this.diagnostics(workspaceId),
      actor: input.actor,
      at: input.at,
      workbenchVersion: this.options.workbenchVersion ?? '0.0.0',
      rulePackVersion: RULE_PACK_VERSION,
    })
  }

  async compareBaseline(
    workspaceId: string,
    baselineId: string,
  ): Promise<BaselineComparison> {
    const workspace = this.requireWorkspace(workspaceId)
    return new BaselineRepository(workspace.rootPath).compare(
      baselineId,
      await this.semanticSnapshot(workspaceId),
      this.diagnostics(workspaceId),
    )
  }

  async listReviews(workspaceId: string): Promise<ModelReview[]> {
    return new ReviewRepository(this.requireWorkspace(workspaceId).rootPath).list()
  }

  async createReview(
    workspaceId: string,
    input: CreateReviewInput,
  ): Promise<ModelReview> {
    const workspace = this.requireWorkspace(workspaceId)
    const status = await readGitStatus(workspace.rootPath)
    return new ReviewRepository(workspace.rootPath).create(
      {
        ...input,
        baseline: `git:${status.head}`,
      },
      await this.semanticSnapshot(workspaceId),
    )
  }

  async addReviewFinding(
    workspaceId: string,
    input: AddReviewFindingInput,
  ): Promise<ModelReview> {
    const workspace = this.requireWorkspace(workspaceId)
    return new ReviewRepository(workspace.rootPath).addFinding(
      input.reviewId,
      input.finding,
      await this.semanticSnapshot(workspaceId),
    )
  }

  async dispositionReviewFinding(
    workspaceId: string,
    input: DispositionReviewFindingInput,
  ): Promise<ModelReview> {
    const workspace = this.requireWorkspace(workspaceId)
    return new ReviewRepository(workspace.rootPath).dispositionFinding(
      input.reviewId,
      input.findingId,
      {
        disposition: input.disposition,
        response: input.response,
        actor: input.actor,
        at: input.at,
      },
    )
  }

  async closeReview(
    workspaceId: string,
    reviewId: string,
    input: { actor: string; at: string; note?: string },
  ): Promise<ModelReview> {
    return new ReviewRepository(this.requireWorkspace(workspaceId).rootPath)
      .close(reviewId, input)
  }

  async reviewStaleness(
    workspaceId: string,
    reviewId: string,
  ): Promise<ReviewStaleness> {
    const workspace = this.requireWorkspace(workspaceId)
    return new ReviewRepository(workspace.rootPath).staleness(
      reviewId,
      await this.semanticSnapshot(workspaceId),
    )
  }

  async generateReport(
    workspaceId: string,
    input: GenerateReportInput,
  ): Promise<ReportBundleManifest> {
    const workspace = this.requireWorkspace(workspaceId)
    const snapshot = await this.semanticSnapshot(workspaceId)
    const gitStatus = await readGitStatus(workspace.rootPath)
    const baselineRepository = new BaselineRepository(workspace.rootPath)
    const baseline = input.baselineId
      ? await baselineRepository.get(input.baselineId)
      : undefined
    const comparison = input.kind === 'semantic-change-impact'
      ? await baselineRepository.compare(
        requireBaselineId(input.baselineId),
        snapshot,
        workspace.diagnostics,
      )
      : undefined
    const assurance = [
      'requirement-coverage',
      'verification-readiness',
      'interface-register',
      'interface-quality',
    ].includes(input.kind) ? evaluateAssurance(snapshot) : undefined
    const reviews = input.kind === 'review-findings' || input.kind === 'review-closure'
      ? await new ReviewRepository(workspace.rootPath).list()
      : undefined
    return writeReportBundle(workspace.rootPath, input.reportId, {
      kind: input.kind,
      provenance: {
        workspace: {
          id: snapshot.workspace.id,
          name: workspace.displayName,
        },
        commitSha: gitStatus.head,
        baseline: input.baselineId ?? null,
        languageRelease: snapshot.authority.referenceRelease,
        workbenchVersion: this.options.workbenchVersion ?? '0.0.0',
        rulePackVersion: RULE_PACK_VERSION,
        viewConfiguration: input.viewConfiguration ?? null,
        generatedAt: input.at,
        unresolvedDiagnostics: workspace.diagnostics.length,
        exclusions: [...new Set(input.exclusions ?? [])].sort(),
      },
      assurance,
      diagnostics: workspace.diagnostics,
      gitStatus,
      baseline,
      comparison,
      reviews,
    })
  }

  async close(workspaceId: string): Promise<boolean> {
    if (!this.workspaces.has(workspaceId)) return false
    await this.options.adapter.closeWorkspace(workspaceId)
    this.workspaces.delete(workspaceId)
    return true
  }

  async dispose(): Promise<void> {
    for (const workspaceId of this.workspaces.keys()) {
      await this.options.adapter.closeWorkspace(workspaceId)
    }
    this.workspaces.clear()
    await this.options.adapter.dispose()
  }

  private requireDocument(workspaceId: string, uri: string): OpenWorkspace {
    const workspace = this.requireWorkspace(workspaceId)
    if (
      !workspace.adapterWorkspace.documents.some(
        (document) => document.uri === uri,
      )
    ) {
      throw new WorkspacePathError(
        `Document URI is outside the active workspace: ${uri}`,
      )
    }
    return workspace
  }

  private requireWorkspace(workspaceId: string): OpenWorkspace {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) {
      throw new WorkspacePathError(`Unknown workspace: ${workspaceId}`)
    }
    return workspace
  }

  private async createSemanticSnapshot(
    workspace: OpenWorkspace,
    semanticRevision: number,
  ): Promise<SemanticSnapshot> {
    const evidence = new Map<string, EngineSemanticEvidence>()
    for (const document of workspace.adapterWorkspace.documents) {
      evidence.set(
        document.uri,
        await this.options.adapter.semanticEvidence!(document.uri),
      )
    }
    if (workspace.semanticRevision !== semanticRevision) {
      throw new WorkspacePathError(
        'Workspace changed while the semantic snapshot was being built',
      )
    }
    const candidateIdentities = new IdentityRegistry(
      workspace.identityRegistry.serialize(),
    )
    const snapshot = buildSemanticSnapshot({
      status: workspace.status,
      authority: this.options.adapter.metadata,
      documents: workspace.adapterWorkspace.documents,
      evidence,
      identities: candidateIdentities,
    })
    if (workspace.semanticRevision !== semanticRevision) {
      throw new WorkspacePathError(
        'Workspace changed while the semantic snapshot was being built',
      )
    }
    if (candidateIdentities.hasChanges()) {
      await persistIdentityRegistry(
        workspace.identityRegistryPath,
        candidateIdentities,
        workspace.rootPath,
      )
    }
    if (workspace.semanticRevision !== semanticRevision) {
      throw new WorkspacePathError(
        'Workspace changed while the semantic snapshot was being committed',
      )
    }
    workspace.identityRegistry = candidateIdentities
    workspace.semanticSnapshot = snapshot
    return snapshot
  }

  private async validateCommandOverlay(
    workspace: OpenWorkspace,
    beforeSnapshot: SemanticSnapshot,
    proposal: InternalCommandProposal,
  ): Promise<InternalCommandProposal> {
    if (!this.options.adapter.changeDocument) {
      throw new WorkspacePathError(
        'Authoritative overlay validation requires incremental document updates',
      )
    }
    const originals = new Map(
      workspace.adapterWorkspace.documents.map((document) => [
        document.uri,
        {
          text: document.text,
          sha256: document.sha256,
          version: document.version,
        },
      ]),
    )
    const changed = proposal.overlayDocuments.filter((overlay) => {
      const original = originals.get(overlay.uri)
      return original && original.text !== overlay.text
    })
    let diagnosticsAfter = structuredClone(workspace.diagnostics)
    try {
      for (const overlay of changed) {
        const current = workspace.adapterWorkspace.documents.find(
          (document) => document.uri === overlay.uri,
        )!
        diagnosticsAfter = await this.options.adapter.changeDocument(
          overlay.uri,
          current.version + 1,
          overlay.text,
        )
        current.text = overlay.text
        current.sha256 = overlay.sha256
      }
      const overlayWorkspace: AdapterWorkspace = {
        ...workspace.adapterWorkspace,
        documents: workspace.adapterWorkspace.documents.map((document) => ({
          ...document,
          sha256: sha256(Buffer.from(document.text, 'utf8')),
        })),
      }
      const overlayStatus = buildStatus(
        overlayWorkspace,
        this.options.adapter,
        diagnosticsAfter,
      )
      const evidence = new Map<string, EngineSemanticEvidence>()
      for (const document of overlayWorkspace.documents) {
        evidence.set(
          document.uri,
          await this.options.adapter.semanticEvidence!(document.uri),
        )
      }
      const provisional = buildSemanticSnapshot({
        status: overlayStatus,
        authority: this.options.adapter.metadata,
        documents: overlayWorkspace.documents,
        evidence,
        identities: IdentityRegistry.empty(overlayStatus.workspaceId),
      })
      const identities = new IdentityRegistry(workspace.identityRegistry.serialize())
      for (const affectedElementId of proposal.affectedElementIds) {
        const prior = beforeSnapshot.elements.find(
          (element) => element.id === affectedElementId,
        )
        if (!prior?.provenance.engineId) continue
        let next = provisional.elements.find(
          (element) =>
            element.provenance.engineId === prior.provenance.engineId,
        )
        if (!next && proposal.envelope.command.kind === 'rename-element') {
          const renamedElementName = proposal.envelope.command.newName
          const candidates = provisional.elements.filter(
            (element) =>
              element.kind === prior.kind &&
              element.name === renamedElementName &&
              element.source.workspacePath === prior.source.workspacePath,
          )
          if (candidates.length === 1) {
            next = candidates[0]
          } else if (candidates.length > 1) {
            throw new WorkspacePathError(
              `Validated overlay produced an ambiguous renamed element: ${prior.id}`,
            )
          }
        }
        if (!next && proposal.envelope.command.kind === 'rename-element') {
          throw new WorkspacePathError(
            `Validated overlay lost the renamed element: ${prior.id}`,
          )
        }
        if (!next) continue
        identities.migrate(
          prior.id,
          {
            workspacePath: next.source.workspacePath,
            qualifiedName: next.qualifiedName,
            kind: next.kind,
          },
          next.fingerprint,
          proposal.commandId,
        )
      }
      const afterSnapshot = buildSemanticSnapshot({
        status: overlayStatus,
        authority: this.options.adapter.metadata,
        documents: overlayWorkspace.documents,
        evidence,
        identities,
      })
      return completeCommandValidation(proposal, {
        beforeSnapshot,
        afterSnapshot,
        diagnosticsBefore: workspace.diagnostics,
        diagnosticsAfter,
      })
    } finally {
      for (const overlay of [...changed].reverse()) {
        const original = originals.get(overlay.uri)!
        const current = workspace.adapterWorkspace.documents.find(
          (document) => document.uri === overlay.uri,
        )!
        await this.options.adapter.changeDocument(
          overlay.uri,
          current.version + 1,
          original.text,
        )
        current.text = original.text
        current.sha256 = original.sha256
      }
    }
  }
}

function requireBaselineId(value: string | undefined): string {
  if (!value) throw new WorkspacePathError('Report requires a baseline id')
  return value
}

function validateConfiguration(value: unknown): WorkspaceConfiguration {
  if (!isRecord(value)) {
    throw new WorkspacePathError('Workspace configuration must be a YAML object')
  }
  if (value.schemaVersion !== 1) {
    throw new WorkspacePathError('Workspace schemaVersion must be 1')
  }
  if (!isStringArray(value.sourceRoots) || value.sourceRoots.length === 0) {
    throw new WorkspacePathError('Workspace sourceRoots must contain at least one path')
  }
  if (value.libraries !== undefined && !isStringArray(value.libraries)) {
    throw new WorkspacePathError('Workspace libraries must be an array of paths')
  }

  const modelConfigurations = value.modelConfigurations
  if (modelConfigurations !== undefined && !isRecord(modelConfigurations)) {
    throw new WorkspacePathError('modelConfigurations must be an object')
  }

  return value as unknown as WorkspaceConfiguration
}

function selectConfiguration(configuration: WorkspaceConfiguration): {
  name: string
  sourceRoots: string[]
  libraries: string[]
} {
  const name = configuration.activeConfiguration ?? 'default'
  const selected = configuration.modelConfigurations?.[name]
  if (configuration.activeConfiguration && !selected) {
    throw new WorkspacePathError(
      `Active model configuration is not defined: ${configuration.activeConfiguration}`,
    )
  }
  return {
    name,
    sourceRoots: selected?.sourceRoots ?? configuration.sourceRoots,
    libraries: selected?.libraries ?? configuration.libraries ?? [],
  }
}

function locateElementName(
  text: string,
  range: WorkbenchRange,
  name: string,
): WorkbenchPosition {
  const lines = text.split('\n')
  const selected = lines
    .slice(range.start.line, range.end.line + 1)
    .map((line, index) => {
      const absoluteLine = range.start.line + index
      const start = absoluteLine === range.start.line ? range.start.character : 0
      const end =
        absoluteLine === range.end.line ? range.end.character : line.length
      return { absoluteLine, start, text: line.slice(start, end) }
    })
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const token = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'gu')
  const matches: WorkbenchPosition[] = []
  for (const line of selected) {
    for (const match of line.text.matchAll(token)) {
      matches.push({
        line: line.absoluteLine,
        character: line.start + match.index! + match[1]!.length,
      })
    }
  }
  if (matches.length !== 1) {
    throw new WorkspacePathError(
      `Command target name is not uniquely located in its authoritative range: ${name}`,
    )
  }
  return matches[0]!
}

async function collectModelFiles(
  workspaceRoot: string,
  directory: string,
  output: Set<string>,
): Promise<void> {
  const resolvedDirectory = await realpath(directory)
  if (!isPathWithin(workspaceRoot, resolvedDirectory)) {
    throw new WorkspacePathError(
      `Source or library directory escapes the workspace root: ${directory}`,
    )
  }

  for (const entry of await readdir(resolvedDirectory, { withFileTypes: true })) {
    const candidate = resolve(resolvedDirectory, entry.name)
    const metadata = await lstat(candidate)
    if (metadata.isSymbolicLink()) {
      const target = await realpath(candidate)
      if (!isPathWithin(workspaceRoot, target)) {
        throw new WorkspacePathError(
          `Symbolic link escapes the workspace root: ${relative(workspaceRoot, candidate)}`,
        )
      }
      throw new WorkspacePathError(
        `Symbolic links are not accepted in model source roots: ${relative(workspaceRoot, candidate)}`,
      )
    }
    if (metadata.isDirectory()) {
      await collectModelFiles(workspaceRoot, candidate, output)
    } else if (metadata.isFile() && MODEL_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      output.add(await realpath(candidate))
    }
  }
}

function buildStatus(
  workspace: AdapterWorkspace,
  adapter: LanguageAdapter,
  diagnostics: LanguageDiagnostic[],
): WorkspaceStatusResult {
  const documentSummaries: WorkspaceDocumentSummary[] = workspace.documents.map(
    (document) => ({
      uri: document.uri,
      languageId: document.languageId,
      sha256: document.sha256,
      byteLength: Buffer.byteLength(document.text, 'utf8'),
    }),
  )
  const snapshotInput = JSON.stringify({
    adapter: adapter.metadata,
    configurationName: workspace.configurationName,
    documents: documentSummaries,
  })
  return {
    workspaceId: workspace.workspaceId,
    rootUri: workspace.rootUri,
    configurationName: workspace.configurationName,
    indexState:
      adapter.metadata.qualificationStatus === 'control-only' ? 'failed' : 'ready',
    semanticAuthority: semanticAuthorityFor(adapter),
    documentCount: documentSummaries.length,
    snapshotSha256: sha256(Buffer.from(snapshotInput)),
    documents: documentSummaries,
    diagnostics: {
      errors: diagnostics.filter((item) => item.severity === 'error').length,
      warnings: diagnostics.filter((item) => item.severity === 'warning').length,
      information: diagnostics.filter((item) => item.severity === 'information').length,
      hints: diagnostics.filter((item) => item.severity === 'hint').length,
    },
    languageCapabilities: { ...adapter.capabilities },
    capabilitiesFinal: adapter.capabilitiesFinal(),
  }
}

async function loadIdentityRegistry(
  path: string,
  workspaceId: string,
  rootPath: string,
): Promise<IdentityRegistry> {
  await assertNoSymlinkSegments(rootPath, path)
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as IdentityRegistryData
    if (value.workspaceId !== workspaceId) {
      throw new WorkspacePathError(
        `Identity registry belongs to ${value.workspaceId}; expected ${workspaceId}`,
      )
    }
    return new IdentityRegistry(value)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      const backupPath = `${path}.bak`
      await assertNoSymlinkSegments(rootPath, backupPath)
      try {
        const backup = JSON.parse(
          await readFile(backupPath, 'utf8'),
        ) as IdentityRegistryData
        if (backup.workspaceId !== workspaceId) {
          throw new WorkspacePathError(
            `Identity registry backup belongs to ${backup.workspaceId}; expected ${workspaceId}`,
          )
        }
        return new IdentityRegistry(backup)
      } catch (backupError) {
        if (
          backupError &&
          typeof backupError === 'object' &&
          'code' in backupError &&
          backupError.code === 'ENOENT'
        ) {
          return IdentityRegistry.empty(workspaceId)
        }
        throw backupError
      }
    }
    throw error
  }
}

async function persistIdentityRegistry(
  path: string,
  registry: IdentityRegistry,
  rootPath: string,
): Promise<void> {
  await assertNoSymlinkSegments(rootPath, path)
  await mkdir(dirname(path), { recursive: true })
  await assertNoSymlinkSegments(rootPath, path)
  const backupPath = `${path}.bak`
  await assertNoSymlinkSegments(rootPath, backupPath)
  try {
    const previous = await readFile(path)
    const backupTemporaryPath = `${backupPath}.tmp-${process.pid}`
    await writeFile(backupTemporaryPath, previous, { mode: 0o600 })
    await rename(backupTemporaryPath, backupPath)
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error
    }
  }
  const temporaryPath = `${path}.tmp-${process.pid}`
  await writeFile(
    temporaryPath,
    `${JSON.stringify(registry.serialize(), null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await rename(temporaryPath, path)
  registry.markPersisted()
}

async function assertNoSymlinkSegments(
  rootPath: string,
  targetPath: string,
): Promise<void> {
  if (!isPathWithin(rootPath, targetPath)) {
    throw new WorkspacePathError('Identity registry path escapes the workspace')
  }
  const relativePath = relative(rootPath, targetPath)
  let current = rootPath
  for (const segment of relativePath.split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment)
    try {
      const metadata = await lstat(current)
      if (metadata.isSymbolicLink()) {
        throw new WorkspacePathError(
          `Symbolic links are not accepted in identity registry paths: ${relative(rootPath, current)}`,
        )
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return
      }
      throw error
    }
  }
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function commandTransactionId(proposalId: string): string {
  return `command-${sha256(Buffer.from(proposalId)).slice(0, 32)}`
}

function requireCommandAudit(
  transaction: WorkspaceTransactionReceipt | null,
  proposalId: string,
): CommandTransactionAudit {
  const audit = transaction?.metadata?.commandAudit
  if (
    transaction?.state !== 'FINALIZED' ||
    !isRecord(audit) ||
    audit.schemaVersion !== 1 ||
    audit.recordType !== 'command-application' ||
    !isRecord(audit.proposal) ||
    audit.proposal.proposalId !== proposalId ||
    typeof audit.expectedSnapshotSha256 !== 'string'
  ) {
    throw new WorkspacePathError(
      `Applied command audit is unavailable or invalid: ${proposalId}`,
    )
  }
  return structuredClone(audit) as unknown as CommandTransactionAudit
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateSavedView(value: unknown): SavedWorkbenchView {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new WorkspacePathError('Saved view schemaVersion must be 1')
  }
  if (
    typeof value.id !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id)
  ) {
    throw new WorkspacePathError('Saved view id must be a bounded lowercase slug')
  }
  if (
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    value.name.length > 200
  ) {
    throw new WorkspacePathError('Saved view name is invalid')
  }
  if (!isRecord(value.query)) {
    throw new WorkspacePathError('Saved view query must be an object')
  }
  const notations = new Set([
    'model-structure',
    'interconnection',
    'traceability',
    'action-flow',
    'state-transition',
    'verification-context',
    'table',
  ])
  if (typeof value.notation !== 'string' || !notations.has(value.notation)) {
    throw new WorkspacePathError('Saved view notation is unsupported')
  }
  if (
    value.updatedAt !== undefined &&
    (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt)))
  ) {
    throw new WorkspacePathError('Saved view updatedAt is invalid')
  }
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
    throw new WorkspacePathError('Saved view exceeds the 1 MiB limit')
  }
  if (value.layout !== undefined) {
    if (!isRecord(value.layout) || !isRecord(value.layout.positions)) {
      throw new WorkspacePathError('Saved view layout is invalid')
    }
    const positions = Object.entries(value.layout.positions)
    if (positions.length > 5_000) {
      throw new WorkspacePathError('Saved view layout exceeds 5000 positions')
    }
    for (const [identity, position] of positions) {
      if (
        identity.length === 0 ||
        !isRecord(position) ||
        typeof position.x !== 'number' ||
        !Number.isFinite(position.x) ||
        typeof position.y !== 'number' ||
        !Number.isFinite(position.y)
      ) {
        throw new WorkspacePathError('Saved view contains an invalid layout position')
      }
    }
  }
  return structuredClone(value) as unknown as SavedWorkbenchView
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
