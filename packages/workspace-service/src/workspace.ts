import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import type {
  WorkbenchCompletionItem,
  WorkbenchDocumentSymbol,
  WorkbenchHover,
  WorkbenchLocation,
  WorkbenchPosition,
  WorkspaceDocumentSummary,
  WorkspaceStatusResult,
} from '../../workbench-protocol/src/index.js'
import type {
  AdapterWorkspace,
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

    if (this.workspaces.has(workspaceId)) {
      await this.options.adapter.closeWorkspace(workspaceId)
    }
    for (const openWorkspaceId of this.workspaces.keys()) {
      if (openWorkspaceId !== workspaceId) {
        await this.options.adapter.closeWorkspace(openWorkspaceId)
        this.workspaces.delete(openWorkspaceId)
      }
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

  private requireDocument(workspaceId: string, uri: string): void {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) {
      throw new WorkspacePathError(`Unknown workspace: ${workspaceId}`)
    }
    if (
      !workspace.adapterWorkspace.documents.some(
        (document) => document.uri === uri,
      )
    ) {
      throw new WorkspacePathError(
        `Document URI is outside the active workspace: ${uri}`,
      )
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

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
