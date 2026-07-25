import { createHash } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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
} from '../../workbench-protocol/src/index.js'
import type {
  AdapterWorkspace,
  LanguageAdapter,
  LanguageAdapterMetadata,
  LanguageDiagnostic,
  EngineSemanticEvidence,
} from './index.js'

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024
const MAX_SEMANTIC_EVIDENCE_ELEMENTS = 100_000
const MAX_SEMANTIC_EVIDENCE_RELATIONSHIPS = 1_000_000

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
  timeout: NodeJS.Timeout
}

export interface LspProcessAdapterOptions {
  metadata: LanguageAdapterMetadata
  command: string
  arguments?: string[]
  cwd?: string
  environment?: Record<string, string>
  startupTimeoutMs?: number
  requestTimeoutMs?: number
  diagnosticSettleMs?: number
  semanticEvidenceMethod?: string
}

export interface ProcessEvidence {
  command: string
  arguments: string[]
  stdoutSha256: string
  stderrSha256: string
  stdoutBytes: number
  stderrBytes: number
  captureTruncated: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  processId: number | null
}

export class LspProcessAdapter implements LanguageAdapter {
  readonly metadata: LanguageAdapterMetadata
  capabilities: LanguageCapabilities = emptyCapabilities()

  private process?: ChildProcessWithoutNullStreams
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly diagnostics = new Map<string, LanguageDiagnostic[]>()
  private lastDiagnosticAt = 0
  private stdoutCapture: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private stderrCapture: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private captureTruncated = false
  private exitCode: number | null = null
  private signal: NodeJS.Signals | null = null
  private activeWorkspace?: AdapterWorkspace
  private negotiated = false
  private initializedRootUri?: string
  private semanticTokenLegend = {
    tokenTypes: [] as string[],
    tokenModifiers: [] as string[],
  }
  private healthState: {
    state: 'ready' | 'starting' | 'failed'
    message?: string
  } = { state: 'starting' }

  constructor(private readonly options: LspProcessAdapterOptions) {
    this.metadata = options.metadata
  }

  async initialize(): Promise<void> {
    if (this.process) return
    this.healthState = { state: 'starting' }
    this.process = spawn(
      this.options.command,
      this.options.arguments ?? [],
      {
        cwd: this.options.cwd,
        env: {
          ...process.env,
          ...this.options.environment,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      },
    )
    this.process.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk))
    this.process.stderr.on('data', (chunk: Buffer) => {
      this.stderrCapture = capture(
        this.stderrCapture,
        chunk,
        () => (this.captureTruncated = true),
      )
    })
    this.process.once('exit', (code, signal) => {
      this.exitCode = code
      this.signal = signal
      this.process = undefined
      this.healthState = {
        state: 'failed',
        message: `Language engine exited (code=${String(code)}, signal=${String(signal)})`,
      }
      this.rejectPending(
        new Error(
          `Language engine exited unexpectedly (code=${String(code)}, signal=${String(signal)})`,
        ),
      )
    })
    await waitForSpawn(this.process, this.options.startupTimeoutMs ?? 10_000)
    this.healthState = { state: 'ready' }
  }

  async prepareWorkspace(workspace: AdapterWorkspace): Promise<void> {
    if (this.negotiated && !this.process) {
      await this.restartProcess()
    } else {
      await this.initialize()
    }
    if (this.negotiated && this.initializedRootUri !== workspace.rootUri) {
      await this.restartProcess()
    }
    if (!this.negotiated) {
      const initializeResult = await this.request('initialize', {
      processId: process.pid,
      rootUri: workspace.rootUri,
      workspaceFolders: [
        {
          uri: workspace.rootUri,
          name: workspace.configurationName,
        },
      ],
      capabilities: {
        workspace: {
          workspaceFolders: true,
          configuration: true,
        },
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
            codeDescriptionSupport: true,
          },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          definition: {},
          references: {},
          completion: {
            completionItem: {
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          semanticTokens: {
            requests: {
              range: true,
              full: { delta: true },
            },
            tokenTypes: [
              'namespace',
              'type',
              'class',
              'enum',
              'interface',
              'struct',
              'typeParameter',
              'parameter',
              'variable',
              'property',
              'enumMember',
              'event',
              'function',
              'method',
              'macro',
              'keyword',
              'modifier',
              'comment',
              'string',
              'number',
              'regexp',
              'operator',
              'decorator',
            ],
            tokenModifiers: [
              'declaration',
              'definition',
              'readonly',
              'static',
              'deprecated',
              'abstract',
              'async',
              'modification',
              'documentation',
              'defaultLibrary',
            ],
            formats: ['relative'],
            overlappingTokenSupport: false,
            multilineTokenSupport: false,
          },
          rename: {
            prepareSupport: true,
          },
          formatting: {},
        },
      },
      clientInfo: {
        name: 'SysML Engineering Workbench',
        version: '0.1.0',
      },
      })
      this.capabilities = capabilitiesFromInitialize(initializeResult)
      this.capabilities.semanticEvidence = Boolean(
        this.options.semanticEvidenceMethod,
      )
      this.semanticTokenLegend = semanticTokenLegendFromInitialize(initializeResult)
      this.negotiated = true
      this.initializedRootUri = workspace.rootUri
      this.notify('initialized', {})
    }
  }

  async openWorkspace(
    workspace: AdapterWorkspace,
  ): Promise<LanguageDiagnostic[]> {
    await this.prepareWorkspace(workspace)
    this.activeWorkspace = workspace
    this.diagnostics.clear()
    this.lastDiagnosticAt = 0
    for (const document of workspace.documents) {
      this.notify('textDocument/didOpen', {
        textDocument: {
          uri: document.uri,
          languageId: document.languageId,
          version: document.version,
          text: document.text,
        },
      })
    }
    await this.waitForDiagnostics(
      workspace.documents.map((document) => document.uri),
      this.options.diagnosticSettleMs ?? 500,
    )
    return [...this.diagnostics.values()].flat()
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    if (this.activeWorkspace?.workspaceId !== workspaceId) return
    if (this.process) {
      for (const document of this.activeWorkspace.documents) {
        this.notify('textDocument/didClose', {
          textDocument: { uri: document.uri },
        })
      }
    }
    this.activeWorkspace = undefined
    this.diagnostics.clear()
  }

  async dispose(): Promise<void> {
    const child = this.process
    if (!child) return
    try {
      await this.request('shutdown', null)
      this.notify('exit', null)
      await waitForExit(child, 2_000)
    } catch {
      child.kill('SIGTERM')
      try {
        await waitForExit(child, 1_000)
      } catch {
        child.kill('SIGKILL')
      }
    } finally {
      this.process = undefined
    }
  }

  async documentSymbols(uri: string): Promise<WorkbenchDocumentSymbol[]> {
    this.requireActiveDocument(uri)
    const value = await this.request('textDocument/documentSymbol', {
      textDocument: { uri },
    })
    if (!Array.isArray(value)) return []
    return value
      .map(normalizeDocumentSymbol)
      .filter(
        (symbol): symbol is WorkbenchDocumentSymbol => symbol !== undefined,
      )
  }

  async definition(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    this.requireActiveDocument(uri)
    return normalizeLocations(
      await this.request('textDocument/definition', {
        textDocument: { uri },
        position,
      }),
    )
  }

  async semanticEvidence(uri: string): Promise<EngineSemanticEvidence> {
    this.requireActiveDocument(uri)
    const method = this.options.semanticEvidenceMethod
    if (!method) {
      throw new Error('Semantic evidence endpoint is not configured')
    }
    return normalizeSemanticEvidence(
      await this.request(method, { uri }),
      uri,
    )
  }

  async references(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    this.requireActiveDocument(uri)
    return normalizeLocations(
      await this.request('textDocument/references', {
        textDocument: { uri },
        position,
        context: { includeDeclaration: true },
      }),
    )
  }

  async hover(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchHover | null> {
    this.requireActiveDocument(uri)
    return normalizeHover(
      await this.request('textDocument/hover', {
        textDocument: { uri },
        position,
      }),
    )
  }

  async completion(
    uri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchCompletionItem[]> {
    this.requireActiveDocument(uri)
    const value = await this.request('textDocument/completion', {
      textDocument: { uri },
      position,
    })
    const items = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.items)
        ? value.items
        : []
    return items
      .map(normalizeCompletionItem)
      .filter(
        (item): item is WorkbenchCompletionItem => item !== undefined,
      )
  }

  async semanticTokens(uri: string): Promise<WorkbenchSemanticTokens> {
    this.requireActiveDocument(uri)
    const value = await this.request('textDocument/semanticTokens/full', {
      textDocument: { uri },
    })
    return {
      legend: structuredClone(this.semanticTokenLegend),
      data:
        isRecord(value) &&
        Array.isArray(value.data) &&
        value.data.every((item) => Number.isInteger(item) && item >= 0)
          ? (value.data as number[])
          : [],
    }
  }

  async rename(
    uri: string,
    position: WorkbenchPosition,
    newName: string,
  ): Promise<WorkbenchWorkspaceEdit> {
    this.requireActiveDocument(uri)
    return normalizeWorkspaceEdit(
      await this.request('textDocument/rename', {
        textDocument: { uri },
        position,
        newName,
      }),
    )
  }

  async formatting(uri: string): Promise<WorkbenchTextEdit[]> {
    this.requireActiveDocument(uri)
    const value = await this.request('textDocument/formatting', {
      textDocument: { uri },
      options: {
        tabSize: 4,
        insertSpaces: true,
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
        trimFinalNewlines: true,
      },
    })
    return Array.isArray(value)
      ? value
          .map(normalizeTextEdit)
          .filter((edit): edit is WorkbenchTextEdit => edit !== undefined)
      : []
  }

  async changeDocument(
    uri: string,
    version: number,
    text: string,
  ): Promise<LanguageDiagnostic[]> {
    this.requireActiveDocument(uri)
    const document = this.activeWorkspace!.documents.find(
      (item) => item.uri === uri,
    )!
    if (!Number.isInteger(version) || version <= document.version) {
      throw new Error(
        `Document version must increase from ${document.version}; received ${version}`,
      )
    }
    document.version = version
    document.text = text
    this.diagnostics.delete(uri)
    this.lastDiagnosticAt = 0
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    })
    await this.waitForDiagnostics(
      [uri],
      this.options.diagnosticSettleMs ?? 500,
    )
    return [...this.diagnostics.values()].flat()
  }

  async restartWorkspace(
    workspace: AdapterWorkspace,
  ): Promise<LanguageDiagnostic[]> {
    await this.restartProcess()
    return this.openWorkspace(workspace)
  }

  evidence(): ProcessEvidence {
    return {
      command: this.options.command,
      arguments: [...(this.options.arguments ?? [])],
      stdoutSha256: sha256(this.stdoutCapture),
      stderrSha256: sha256(this.stderrCapture),
      stdoutBytes: this.stdoutCapture.byteLength,
      stderrBytes: this.stderrCapture.byteLength,
      captureTruncated: this.captureTruncated,
      exitCode: this.exitCode,
      signal: this.signal,
      processId: this.process?.pid ?? null,
    }
  }

  health(): {
    state: 'ready' | 'starting' | 'failed'
    message?: string
  } {
    return { ...this.healthState }
  }

  capabilitiesFinal(): boolean {
    return this.negotiated
  }

  rawEvidence(): { stdout: Buffer; stderr: Buffer } {
    return {
      stdout: Buffer.from(this.stdoutCapture),
      stderr: Buffer.from(this.stderrCapture),
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    const timeoutMs = this.options.requestTimeoutMs ?? 15_000
    return new Promise((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        if (this.process) {
          this.notify('$/cancelRequest', { id })
        }
        rejectRequest(
          new Error(`Language engine request timed out: ${method} (${timeoutMs} ms)`),
        )
      }, timeoutMs)
      this.pending.set(id, {
        resolve: resolveRequest,
        reject: rejectRequest,
        timeout,
      })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  private async restartProcess(): Promise<void> {
    await this.dispose()
    this.buffer = Buffer.alloc(0)
    this.diagnostics.clear()
    this.capabilities = emptyCapabilities()
    this.semanticTokenLegend = { tokenTypes: [], tokenModifiers: [] }
    this.negotiated = false
    this.initializedRootUri = undefined
    this.exitCode = null
    this.signal = null
    this.healthState = { state: 'starting' }
    await this.initialize()
  }

  private send(message: unknown): void {
    if (!this.process) {
      throw new Error('Language engine process is not running')
    }
    const payload = Buffer.from(JSON.stringify(message), 'utf8')
    this.process.stdin.write(
      Buffer.concat([
        Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, 'ascii'),
        payload,
      ]),
    )
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutCapture = capture(
      this.stdoutCapture,
      chunk,
      () => (this.captureTruncated = true),
    )
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      if (headerEnd > 8_192) {
        this.rejectPending(new Error('Language engine sent an oversized LSP header'))
        this.process?.kill('SIGTERM')
        return
      }
      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i.exec(header)
      if (!match?.[1]) {
        this.rejectPending(new Error('Language engine sent an invalid LSP header'))
        this.process?.kill('SIGTERM')
        return
      }
      const length = Number.parseInt(match[1], 10)
      const bodyStart = headerEnd + 4
      if (length > MAX_CAPTURE_BYTES) {
        this.rejectPending(new Error('Language engine sent an oversized LSP message'))
        this.process?.kill('SIGTERM')
        return
      }
      if (this.buffer.byteLength < bodyStart + length) return
      const body = this.buffer.subarray(bodyStart, bodyStart + length)
      this.buffer = this.buffer.subarray(bodyStart + length)
      this.handleMessage(body)
    }
  }

  private handleMessage(body: Buffer): void {
    let message: unknown
    try {
      message = JSON.parse(body.toString('utf8'))
    } catch {
      this.rejectPending(new Error('Language engine sent invalid JSON'))
      this.process?.kill('SIGTERM')
      return
    }
    if (!isRecord(message)) return
    if (typeof message.method === 'string' && message.id !== undefined) {
      this.handleServerRequest(message)
      return
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(message.id)
      if (isRecord(message.error)) {
        pending.reject(
          new Error(
            `Language engine error ${String(message.error.code)}: ${String(message.error.message)}`,
          ),
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }
    if (
      message.method === 'textDocument/publishDiagnostics' &&
      isRecord(message.params) &&
      typeof message.params.uri === 'string' &&
      Array.isArray(message.params.diagnostics)
    ) {
      const params = message.params as {
        uri: string
        diagnostics: unknown[]
      }
      this.diagnostics.set(
        params.uri,
        params.diagnostics
          .map((diagnostic) => normalizeDiagnostic(params.uri, diagnostic))
          .filter((diagnostic): diagnostic is LanguageDiagnostic => diagnostic !== undefined),
      )
      this.lastDiagnosticAt = performance.now()
    }
  }

  private handleServerRequest(message: Record<string, unknown>): void {
    const id = message.id
    if (typeof id !== 'number' && typeof id !== 'string') return
    if (message.method === 'workspace/configuration') {
      const items =
        isRecord(message.params) && Array.isArray(message.params.items)
          ? message.params.items
          : []
      this.send({
        jsonrpc: '2.0',
        id,
        result: items.map(() => null),
      })
      return
    }
    if (message.method === 'workspace/workspaceFolders') {
      this.send({
        jsonrpc: '2.0',
        id,
        result: this.activeWorkspace
          ? [
              {
                uri: this.activeWorkspace.rootUri,
                name: this.activeWorkspace.configurationName,
              },
            ]
          : null,
      })
      return
    }
    if (
      message.method === 'client/registerCapability' ||
      message.method === 'client/unregisterCapability' ||
      message.method === 'window/workDoneProgress/create'
    ) {
      this.send({ jsonrpc: '2.0', id, result: null })
      return
    }
    this.send({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Unsupported server request: ${message.method}`,
      },
    })
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private requireActiveDocument(uri: string): void {
    if (!this.activeWorkspace?.documents.some((document) => document.uri === uri)) {
      throw new Error(`Document is not open in the active workspace: ${uri}`)
    }
    if (this.healthState.state !== 'ready') {
      throw new Error(
        this.healthState.message ?? 'Language engine is not ready',
      )
    }
  }

  private async waitForDiagnostics(
    documentUris: string[],
    timeoutMs: number,
  ): Promise<void> {
    const deadline = performance.now() + timeoutMs
    const quietPeriodMs = Math.min(
      125,
      Math.max(20, Math.floor(timeoutMs / 4)),
    )
    while (performance.now() < deadline) {
      if (this.healthState.state === 'failed') {
        throw new Error(
          this.healthState.message ?? 'Language engine failed while indexing',
        )
      }
      if (
        documentUris.every((uri) => this.diagnostics.has(uri)) &&
        this.lastDiagnosticAt > 0 &&
        performance.now() - this.lastDiagnosticAt >= quietPeriodMs
      ) {
        return
      }
      await delay(10)
    }
  }
}

function capabilitiesFromInitialize(value: unknown): LanguageCapabilities {
  const result = isRecord(value) ? value : {}
  const capabilities = isRecord(result.capabilities) ? result.capabilities : {}
  return {
    workspaceLifecycle: true,
    diagnostics: true,
    documentSymbols: Boolean(capabilities.documentSymbolProvider),
    workspaceSymbols: Boolean(capabilities.workspaceSymbolProvider),
    definitions: Boolean(capabilities.definitionProvider),
    references: Boolean(capabilities.referencesProvider),
    completion: Boolean(capabilities.completionProvider),
    hover: Boolean(capabilities.hoverProvider),
    semanticTokens: Boolean(capabilities.semanticTokensProvider),
    rename: Boolean(capabilities.renameProvider),
    formatting: Boolean(capabilities.documentFormattingProvider),
    semanticEvidence: false,
    semanticSnapshot: false,
  }
}

function semanticTokenLegendFromInitialize(value: unknown): {
  tokenTypes: string[]
  tokenModifiers: string[]
} {
  const result = isRecord(value) ? value : {}
  const capabilities = isRecord(result.capabilities) ? result.capabilities : {}
  const provider = isRecord(capabilities.semanticTokensProvider)
    ? capabilities.semanticTokensProvider
    : {}
  const legend = isRecord(provider.legend) ? provider.legend : {}
  return {
    tokenTypes: stringArray(legend.tokenTypes),
    tokenModifiers: stringArray(legend.tokenModifiers),
  }
}

function normalizeWorkspaceEdit(value: unknown): WorkbenchWorkspaceEdit {
  if (!isRecord(value)) return { changes: {} }
  const normalized: Record<string, WorkbenchTextEdit[]> = {}
  if (isRecord(value.changes)) {
    for (const [uri, edits] of Object.entries(value.changes)) {
      if (!Array.isArray(edits)) continue
      normalized[uri] = edits
        .map(normalizeTextEdit)
        .filter((edit): edit is WorkbenchTextEdit => edit !== undefined)
    }
  }
  if (Array.isArray(value.documentChanges)) {
    for (const change of value.documentChanges) {
      if (
        !isRecord(change) ||
        !isRecord(change.textDocument) ||
        typeof change.textDocument.uri !== 'string' ||
        !Array.isArray(change.edits)
      ) {
        continue
      }
      const uri = change.textDocument.uri
      normalized[uri] = [
        ...(normalized[uri] ?? []),
        ...change.edits
          .map(normalizeTextEdit)
          .filter((edit): edit is WorkbenchTextEdit => edit !== undefined),
      ]
    }
  }
  return { changes: normalized }
}

function normalizeSemanticEvidence(
  value: unknown,
  expectedUri: string,
): EngineSemanticEvidence {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.uri !== expectedUri ||
    !Array.isArray(value.elements) ||
    !Array.isArray(value.relationships)
  ) {
    throw new Error('Language engine returned invalid semantic evidence')
  }
  if (value.elements.length > MAX_SEMANTIC_EVIDENCE_ELEMENTS) {
    throw new Error('Language engine semantic evidence exceeds element limit')
  }
  if (value.relationships.length > MAX_SEMANTIC_EVIDENCE_RELATIONSHIPS) {
    throw new Error(
      'Language engine semantic evidence exceeds relationship limit',
    )
  }
  const elements = value.elements.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.engineId !== 'string' ||
      item.engineId.length === 0 ||
      typeof item.metaclass !== 'string' ||
      item.metaclass.length === 0
    ) {
      throw new Error('Language engine returned invalid semantic element evidence')
    }
    return {
      engineId: item.engineId,
      metaclass: item.metaclass,
      name: optionalString(item.name),
      qualifiedName: optionalString(item.qualifiedName),
      ownerEngineId: optionalString(item.ownerEngineId),
      range: optionalRange(item.range),
    }
  })
  const relationships = value.relationships.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.sourceEngineId !== 'string' ||
      item.sourceEngineId.length === 0 ||
      typeof item.feature !== 'string' ||
      item.feature.length === 0 ||
      typeof item.derived !== 'boolean' ||
      typeof item.resolved !== 'boolean'
    ) {
      throw new Error(
        'Language engine returned invalid semantic relationship evidence',
      )
    }
    return {
      sourceEngineId: item.sourceEngineId,
      targetEngineId: optionalString(item.targetEngineId),
      targetQualifiedName: optionalString(item.targetQualifiedName),
      targetUri: optionalString(item.targetUri),
      feature: item.feature,
      derived: item.derived,
      resolved: item.resolved,
      sourceRange: optionalRange(item.sourceRange),
    }
  })
  return {
    schemaVersion: 1,
    uri: expectedUri,
    elements,
    relationships,
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalRange(value: unknown): WorkbenchRange | undefined {
  if (value === undefined || value === null) return undefined
  const range = normalizeWorkbenchRange(value)
  if (!range) {
    throw new Error('Language engine returned an invalid semantic evidence range')
  }
  return range
}

function normalizeTextEdit(value: unknown): WorkbenchTextEdit | undefined {
  if (!isRecord(value) || typeof value.newText !== 'string') return undefined
  const range = normalizeWorkbenchRange(value.range)
  return range ? { range, newText: value.newText } : undefined
}

function normalizeDiagnostic(
  uriValue: unknown,
  value: unknown,
): LanguageDiagnostic | undefined {
  if (typeof uriValue !== 'string' || !isRecord(value)) return undefined
  const severity =
    value.severity === 1
      ? 'error'
      : value.severity === 2
        ? 'warning'
        : value.severity === 3
          ? 'information'
          : 'hint'
  return {
    uri: uriValue,
    severity,
    code: String(value.code ?? 'LSP'),
    message: String(value.message ?? ''),
    range: normalizeRange(value.range),
  }
}

function normalizeRange(value: unknown): LanguageDiagnostic['range'] {
  if (!isRecord(value) || !isRecord(value.start) || !isRecord(value.end)) {
    return undefined
  }
  const startLine = numberOrZero(value.start.line)
  const startCharacter = numberOrZero(value.start.character)
  const endLine = numberOrZero(value.end.line)
  const endCharacter = numberOrZero(value.end.character)
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  }
}

function normalizeDocumentSymbol(
  value: unknown,
): WorkbenchDocumentSymbol | undefined {
  if (!isRecord(value) || typeof value.name !== 'string') return undefined
  const range = normalizeWorkbenchRange(
    value.range ?? (isRecord(value.location) ? value.location.range : undefined),
  )
  if (!range) return undefined
  const selectionRange = normalizeWorkbenchRange(value.selectionRange) ?? range
  const children = Array.isArray(value.children)
    ? value.children
        .map(normalizeDocumentSymbol)
        .filter(
          (child): child is WorkbenchDocumentSymbol => child !== undefined,
        )
    : []
  return {
    name: value.name,
    detail: typeof value.detail === 'string' ? value.detail : undefined,
    kind: symbolKind(value.kind),
    range,
    selectionRange,
    children,
  }
}

function normalizeLocations(value: unknown): WorkbenchLocation[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values
    .map((item): WorkbenchLocation | undefined => {
      if (!isRecord(item)) return undefined
      const uri =
        typeof item.uri === 'string'
          ? item.uri
          : typeof item.targetUri === 'string'
            ? item.targetUri
            : undefined
      const range = normalizeWorkbenchRange(
        item.range ?? item.targetSelectionRange ?? item.targetRange,
      )
      return uri && range ? { uri, range } : undefined
    })
    .filter((item): item is WorkbenchLocation => item !== undefined)
}

function normalizeHover(value: unknown): WorkbenchHover | null {
  if (!isRecord(value)) return null
  const contents = value.contents
  const range = normalizeWorkbenchRange(value.range)
  if (typeof contents === 'string') {
    return { format: 'plaintext', value: contents, range }
  }
  if (isRecord(contents) && typeof contents.value === 'string') {
    return {
      format: contents.kind === 'markdown' ? 'markdown' : 'plaintext',
      value: contents.value,
      range,
    }
  }
  if (Array.isArray(contents)) {
    const parts = contents
      .map((part) => {
        if (typeof part === 'string') return part
        if (isRecord(part) && typeof part.value === 'string') return part.value
        return ''
      })
      .filter(Boolean)
    return parts.length > 0
      ? { format: 'plaintext', value: parts.join('\n\n'), range }
      : null
  }
  return null
}

function normalizeCompletionItem(
  value: unknown,
): WorkbenchCompletionItem | undefined {
  if (!isRecord(value) || typeof value.label !== 'string') return undefined
  const documentation =
    typeof value.documentation === 'string'
      ? value.documentation
      : isRecord(value.documentation) &&
          typeof value.documentation.value === 'string'
        ? value.documentation.value
        : undefined
  return {
    label: value.label,
    detail: typeof value.detail === 'string' ? value.detail : undefined,
    documentation,
    kind:
      typeof value.kind === 'number' ? symbolKind(value.kind) : undefined,
    insertText:
      typeof value.insertText === 'string' ? value.insertText : undefined,
  }
}

function normalizeWorkbenchRange(value: unknown): WorkbenchRange | undefined {
  const range = normalizeRange(value)
  return range
}

function symbolKind(value: unknown): string {
  const kinds = [
    'unknown',
    'file',
    'module',
    'namespace',
    'package',
    'class',
    'method',
    'property',
    'field',
    'constructor',
    'enum',
    'interface',
    'function',
    'variable',
    'constant',
    'string',
    'number',
    'boolean',
    'array',
    'object',
    'key',
    'null',
    'enumMember',
    'struct',
    'event',
    'operator',
    'typeParameter',
  ]
  return typeof value === 'number' ? (kinds[value] ?? 'unknown') : 'unknown'
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function emptyCapabilities(): LanguageCapabilities {
  return {
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
}

function capture(
  current: Buffer,
  addition: Buffer,
  onTruncated: () => void,
): Buffer {
  const remaining = MAX_CAPTURE_BYTES - current.byteLength
  if (remaining <= 0) {
    onTruncated()
    return current
  }
  if (addition.byteLength > remaining) {
    onTruncated()
    return Buffer.concat([current, addition.subarray(0, remaining)])
  }
  return Buffer.concat([current, addition])
}

function waitForSpawn(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (child.pid !== undefined) return Promise.resolve()
  return new Promise((resolveSpawn, rejectSpawn) => {
    const timeout = setTimeout(
      () => rejectSpawn(new Error('Language engine spawn timed out')),
      timeoutMs,
    )
    child.once('spawn', () => {
      clearTimeout(timeout)
      resolveSpawn()
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectSpawn(error)
    })
  })
}

function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(
      () => rejectExit(new Error('Language engine shutdown timed out')),
      timeoutMs,
    )
    child.once('exit', () => {
      clearTimeout(timeout)
      resolveExit()
    })
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
