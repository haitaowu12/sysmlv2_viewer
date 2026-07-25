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
  planCommand,
  type CommandEnvelope,
  type CommandProposal,
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
  status: WorkspaceStatusResult
  diagnostics: LanguageDiagnostic[]
  identityRegistry: IdentityRegistry
  identityRegistryPath: string
  rootPath: string
  semanticRevision: number
  semanticSnapshot?: SemanticSnapshot
  semanticSnapshotPromise?: Promise<SemanticSnapshot>
  queryCache: Map<string, ModelQueryResult>
  commandProposals: Map<string, CommandProposal>
  commandLease: boolean
}

export interface WorkspaceManagerOptions {
  allowedRoots: string[]
  adapter: LanguageAdapter
  maxFiles?: number
  maxBytes?: number
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
      status,
      diagnostics,
      identityRegistry,
      identityRegistryPath,
      rootPath,
      semanticRevision: 0,
      queryCache: new Map(),
      commandProposals: new Map(),
      commandLease: false,
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
      return structuredClone(existing)
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
      return structuredClone(proposal)
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
    proposal: CommandProposal,
  ): Promise<CommandProposal> {
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
      const command = proposal.envelope.command
      if (command.kind === 'rename-element') {
        const prior = beforeSnapshot.elements.find(
          (element) => element.id === command.targetId,
        )!
        const next = provisional.elements.find(
          (element) =>
            element.provenance.engineId === prior.provenance.engineId,
        )
        if (!next) {
          throw new WorkspacePathError(
            `Validated overlay lost the renamed element: ${prior.id}`,
          )
        }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
