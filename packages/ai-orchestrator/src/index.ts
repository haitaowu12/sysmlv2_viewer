import { createHash, randomBytes } from 'node:crypto'
import {
  mkdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  AppliedCommandReceipt,
  ApplyCommandApproval,
  CommandProposal,
  WorkbenchCommand,
} from '../../command-engine/src/index.js'
import type { LanguageDiagnostic } from '../../language-adapter/src/index.js'
import type {
  ModelQuery,
  ModelQueryResult,
} from '../../query-engine/src/index.js'
import type {
  SemanticElement,
  SemanticRelationship,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'

export const AI_ORCHESTRATOR_VERSION = '1.0.0'
export const AI_OPERATION_SCHEMA_VERSION = 1

export const AI_TOOL_NAMES = [
  'search_elements',
  'get_element',
  'get_relationships',
  'get_requirements',
  'get_verification',
  'get_interfaces',
  'get_diagnostics',
  'run_model_query',
  'compare_baselines',
  'propose_commands',
  'validate_commands',
  'apply_approved_commands',
] as const

export type AiToolName = (typeof AI_TOOL_NAMES)[number]

export const AI_TOOL_DEFINITIONS: readonly AiToolDefinition[] = [
  {
    name: 'search_elements',
    description: 'Search bounded semantic element metadata by name and kind.',
    mutating: false,
  },
  {
    name: 'get_element',
    description: 'Read one semantic element by stable model identity.',
    mutating: false,
  },
  {
    name: 'get_relationships',
    description: 'Read bounded normalized relationships for one element.',
    mutating: false,
  },
  {
    name: 'get_requirements',
    description: 'Read the bounded requirements projection.',
    mutating: false,
  },
  {
    name: 'get_verification',
    description: 'Read the bounded verification projection.',
    mutating: false,
  },
  {
    name: 'get_interfaces',
    description: 'Read the bounded interface projection.',
    mutating: false,
  },
  {
    name: 'get_diagnostics',
    description: 'Read deterministic language diagnostics.',
    mutating: false,
  },
  {
    name: 'run_model_query',
    description: 'Run one validated bounded model query.',
    mutating: false,
  },
  {
    name: 'compare_baselines',
    description: 'Compare one named baseline with the current semantic snapshot.',
    mutating: false,
  },
  {
    name: 'propose_commands',
    description: 'Check typed commands against the AI command policy.',
    mutating: false,
  },
  {
    name: 'validate_commands',
    description: 'Generate source edits and authoritative validation without applying.',
    mutating: false,
  },
  {
    name: 'apply_approved_commands',
    description: 'Apply prior validated proposals only with a separate user approval.',
    mutating: true,
  },
] as const

const TOOL_NAME_SET = new Set<string>(AI_TOOL_NAMES)
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const MAX_USER_REQUEST_LENGTH = 20_000
const MAX_MESSAGE_LENGTH = 40_000
const MAX_ASSUMPTIONS = 100
const MAX_CITATIONS = 500
const MAX_TOOL_CALLS = 200

export interface AiToolDefinition {
  name: AiToolName
  description: string
  mutating: boolean
}

export interface AiAssistantRequest {
  schemaVersion: 1
  operationId: string
  workspaceId: string
  userRequest: string
  requestedBy: string
  providerId?: string
  baselineId?: string
  at: string
}

export interface AiProviderProposal {
  message: string
  citedElementIds: string[]
  assumptions: string[]
  commands: WorkbenchCommand[]
}

export interface AiProviderContext {
  operationId: string
  workspaceId: string
  snapshotSha256: string
  baselineId?: string
  userRequest: string
  toolDefinitions: readonly AiToolDefinition[]
}

export interface AiToolExecutor {
  call<T = unknown>(name: AiToolName, input: unknown): Promise<T>
}

export interface AiProvider {
  readonly id: string
  readonly displayName: string
  readonly model: string
  readonly networkAccess: boolean
  propose(
    context: AiProviderContext,
    tools: AiToolExecutor,
  ): Promise<AiProviderProposal>
}

export interface AiToolCallRecord {
  sequence: number
  name: AiToolName
  inputSha256: string
  resultSha256?: string
  outcome: 'success' | 'rejected' | 'failed'
  message?: string
}

export interface AiValidationSummary {
  accepted: boolean
  reasons: string[]
  diagnosticsBefore: LanguageDiagnostic[]
  diagnosticsAfter: LanguageDiagnostic[]
}

export interface AiOperationRecord {
  schemaVersion: 1
  orchestratorVersion: string
  operationId: string
  state: 'proposed' | 'rejected' | 'applied'
  request: {
    userRequest: string
    requestedBy: string
    at: string
  }
  context: {
    workspaceId: string
    snapshotSha256: string
    baselineId: string | null
  }
  provider: {
    id: string
    displayName: string
    model: string
    networkAccess: boolean
  }
  answer: string
  citations: SemanticElement[]
  assumptions: string[]
  commands: WorkbenchCommand[]
  proposals: CommandProposal[]
  affectedElementIds: string[]
  validation: AiValidationSummary
  toolCalls: AiToolCallRecord[]
  approval: {
    required: boolean
    approved: boolean
    approvalId?: string
    approvedBy?: string
    approvedAt?: string
  }
  receipts: AppliedCommandReceipt[]
  audit: {
    path: string
    recordSha256: string
  }
}

export interface AiApplyApproval {
  schemaVersion: 1
  operationId: string
  workspaceId: string
  approvalId: string
  approvedBy: {
    kind: 'user'
    id: string
  }
  at: string
}

export interface AiProviderStatus {
  id: string
  displayName: string
  model: string
  networkAccess: boolean
  enabled: boolean
  reason?: string
}

export interface AiOrchestratorStatus {
  schemaVersion: 1
  defaultProviderId: string
  networkProvidersEnabled: boolean
  providers: AiProviderStatus[]
  tools: readonly AiToolDefinition[]
}

export interface ValidateCommandsResult {
  proposals: CommandProposal[]
}

export interface ApplyApprovedCommandsInput {
  operation: AiOperationRecord
  approvals: ApplyCommandApproval[]
}

export interface ApplyApprovedCommandsResult {
  receipts: AppliedCommandReceipt[]
}

export interface AiWorkspaceToolHost {
  snapshot(): Promise<SemanticSnapshot>
  executeTool(name: AiToolName, input: unknown): Promise<unknown>
}

export interface AiAuditStore {
  write(record: AiOperationRecord): Promise<AiOperationRecord>
  read(operationId: string): Promise<AiOperationRecord>
  list(): Promise<AiOperationRecord[]>
}

export interface AiOrchestratorOptions {
  providers: AiProvider[]
  defaultProviderId: string
  networkProvidersEnabled?: boolean
}

export class AiPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiPolicyError'
  }
}

export class AiOrchestrator {
  private readonly providers: Map<string, AiProvider>

  constructor(private readonly options: AiOrchestratorOptions) {
    this.providers = new Map(
      options.providers.map((provider) => [provider.id, provider]),
    )
    if (!this.providers.has(options.defaultProviderId)) {
      throw new AiPolicyError(
        `Default AI provider is not registered: ${options.defaultProviderId}`,
      )
    }
  }

  status(): AiOrchestratorStatus {
    return {
      schemaVersion: 1,
      defaultProviderId: this.options.defaultProviderId,
      networkProvidersEnabled: this.options.networkProvidersEnabled === true,
      providers: [...this.providers.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((provider) => {
          const enabled =
            !provider.networkAccess || this.options.networkProvidersEnabled === true
          return {
            id: provider.id,
            displayName: provider.displayName,
            model: provider.model,
            networkAccess: provider.networkAccess,
            enabled,
            ...(!enabled
              ? { reason: 'External provider networking is disabled by policy.' }
              : {}),
          }
        }),
      tools: AI_TOOL_DEFINITIONS,
    }
  }

  async request(
    request: AiAssistantRequest,
    host: AiWorkspaceToolHost,
    audit: AiAuditStore,
  ): Promise<AiOperationRecord> {
    validateRequest(request)
    const snapshot = await host.snapshot()
    if (snapshot.workspace.id !== request.workspaceId) {
      throw new AiPolicyError('AI request workspace does not match the tool host')
    }
    const provider = this.requireProvider(
      request.providerId ?? this.options.defaultProviderId,
    )
    const toolCalls: AiToolCallRecord[] = []
    if (
      provider.networkAccess &&
      this.options.networkProvidersEnabled !== true
    ) {
      return audit.write(await this.buildRejectedRecord(
        request,
        snapshot,
        provider,
        toolCalls,
        `External AI provider is disabled by policy: ${provider.id}`,
      ))
    }
    const tools = createAuditedToolExecutor(host, toolCalls, false)
    let providerProposal: AiProviderProposal
    try {
      providerProposal = await provider.propose(
        {
          operationId: request.operationId,
          workspaceId: request.workspaceId,
          snapshotSha256: snapshot.snapshotSha256,
          ...(request.baselineId ? { baselineId: request.baselineId } : {}),
          userRequest: request.userRequest,
          toolDefinitions: AI_TOOL_DEFINITIONS,
        },
        tools,
      )
      validateProviderProposal(providerProposal)
    } catch (error) {
      const record = await this.buildRejectedRecord(
        request,
        snapshot,
        provider,
        toolCalls,
        errorMessage(error),
      )
      return audit.write(record)
    }

    const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
    const missingCitations = providerProposal.citedElementIds.filter(
      (elementId) => !byId.has(elementId),
    )
    if (missingCitations.length > 0) {
      const record = await this.buildRejectedRecord(
        request,
        snapshot,
        provider,
        toolCalls,
        `Provider cited unknown model identities: ${missingCitations.sort().join(', ')}`,
        providerProposal,
      )
      return audit.write(record)
    }

    const citations = providerProposal.citedElementIds
      .map((elementId) => byId.get(elementId)!)
      .sort((left, right) => left.id.localeCompare(right.id))
    let proposals: CommandProposal[] = []
    const reasons: string[] = []
    if (providerProposal.commands.length > 0) {
      try {
        const result = await tools.call<ValidateCommandsResult>(
          'validate_commands',
          {
            operationId: request.operationId,
            requestedBy: request.requestedBy,
            commands: providerProposal.commands,
          },
        )
        proposals = result.proposals
        if (proposals.some((proposal) => proposal.validation.state !== 'validated')) {
          reasons.push('One or more command proposals failed authoritative validation.')
        }
        for (const proposal of proposals) {
          reasons.push(...proposal.conflicts.map((conflict) => conflict.message))
        }
      } catch (error) {
        reasons.push(errorMessage(error))
      }
    }
    const accepted = reasons.length === 0
    const diagnosticsBefore = uniqueDiagnostics(
      proposals.flatMap((proposal) => proposal.diagnosticsBefore),
    )
    const diagnosticsAfter = uniqueDiagnostics(
      proposals.flatMap((proposal) => proposal.diagnosticsAfter),
    )
    const affectedElementIds = [
      ...new Set(proposals.flatMap((proposal) => proposal.affectedElementIds)),
    ].sort()
    const record = createUnsignedRecord({
      request,
      snapshot,
      provider,
      state: accepted ? 'proposed' : 'rejected',
      answer: providerProposal.message,
      citations,
      assumptions: [...providerProposal.assumptions],
      commands: structuredClone(providerProposal.commands),
      proposals,
      affectedElementIds,
      validation: {
        accepted,
        reasons,
        diagnosticsBefore,
        diagnosticsAfter,
      },
      toolCalls,
    })
    return audit.write(record)
  }

  async apply(
    approval: AiApplyApproval,
    host: AiWorkspaceToolHost,
    audit: AiAuditStore,
  ): Promise<AiOperationRecord> {
    validateApplyApproval(approval)
    const existing = await audit.read(approval.operationId)
    if (existing.context.workspaceId !== approval.workspaceId) {
      throw new AiPolicyError('AI approval workspace does not match the operation')
    }
    if (existing.state !== 'proposed' || !existing.validation.accepted) {
      throw new AiPolicyError('Only an accepted AI proposal can be approved')
    }
    if (existing.proposals.length === 0) {
      throw new AiPolicyError('This AI operation contains no model-changing proposal')
    }
    if (existing.approval.approved || existing.receipts.length > 0) {
      throw new AiPolicyError('AI operation was already approved or applied')
    }
    const snapshot = await host.snapshot()
    if (snapshot.snapshotSha256 !== existing.context.snapshotSha256) {
      throw new AiPolicyError(
        'Workspace changed after AI validation; request a fresh AI proposal',
      )
    }
    const approvals: ApplyCommandApproval[] = existing.proposals.map(
      (proposal, index) => ({
        workspaceId: approval.workspaceId,
        proposalId: proposal.proposalId,
        approvalId:
          existing.proposals.length === 1
            ? approval.approvalId
            : `${approval.approvalId}-${index + 1}`,
        approvedBy: approval.approvedBy,
      }),
    )
    const applied = await host.executeTool('apply_approved_commands', {
      operation: existing,
      approvals,
    }) as ApplyApprovedCommandsResult
    const updated: AiOperationRecord = {
      ...existing,
      state: 'applied',
      approval: {
        required: true,
        approved: true,
        approvalId: approval.approvalId,
        approvedBy: approval.approvedBy.id,
        approvedAt: approval.at,
      },
      receipts: applied.receipts,
    }
    return audit.write(updated)
  }

  private requireProvider(providerId: string): AiProvider {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new AiPolicyError(`AI provider is not registered: ${providerId}`)
    }
    return provider
  }

  private async buildRejectedRecord(
    request: AiAssistantRequest,
    snapshot: SemanticSnapshot,
    provider: AiProvider,
    toolCalls: AiToolCallRecord[],
    reason: string,
    proposal?: AiProviderProposal,
  ): Promise<AiOperationRecord> {
    const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
    const citations = (proposal?.citedElementIds ?? [])
      .map((elementId) => byId.get(elementId))
      .filter((element): element is SemanticElement => Boolean(element))
      .sort((left, right) => left.id.localeCompare(right.id))
    return createUnsignedRecord({
      request,
      snapshot,
      provider,
      state: 'rejected',
      answer: proposal?.message ?? '',
      citations,
      assumptions: proposal?.assumptions ?? [],
      commands: proposal?.commands ?? [],
      proposals: [],
      affectedElementIds: [],
      validation: {
        accepted: false,
        reasons: [reason],
        diagnosticsBefore: [],
        diagnosticsAfter: [],
      },
      toolCalls,
    })
  }
}

export class LocalDeterministicAiProvider implements AiProvider {
  readonly id = 'local-deterministic'
  readonly displayName = 'Local deterministic assistant'
  readonly model = 'bounded-rules-1.0.0'
  readonly networkAccess = false

  async propose(
    context: AiProviderContext,
    tools: AiToolExecutor,
  ): Promise<AiProviderProposal> {
    const rename = context.userRequest.match(
      /^rename\s+(wb:[^\s]+)\s+to\s+([A-Za-z_][A-Za-z0-9_]*)$/i,
    )
    if (rename) {
      const elementId = rename[1]!
      const element = await tools.call<SemanticElement | null>('get_element', {
        elementId,
      })
      if (!element) {
        return {
          message: `No model element exists with identity ${elementId}.`,
          citedElementIds: [elementId],
          assumptions: [],
          commands: [],
        }
      }
      return {
        message: `Proposed renaming ${element.qualifiedName} to ${rename[2]}.`,
        citedElementIds: [element.id],
        assumptions: [
          'The requested stable identity is the intended rename target.',
        ],
        commands: [
          {
            kind: 'rename-element',
            targetId: element.id,
            newName: rename[2]!,
          },
        ],
      }
    }

    const queryText = context.userRequest.replace(/^find\s+/i, '').trim()
    const elements = await tools.call<SemanticElement[]>('search_elements', {
      nameContains: queryText,
      maxResults: 20,
    })
    return {
      message:
        elements.length > 0
          ? `Found ${elements.length} grounded model element(s).`
          : 'No matching model elements were found.',
      citedElementIds: elements.map((element) => element.id),
      assumptions: [
        'The request is treated as a bounded semantic element search.',
      ],
      commands: [],
    }
  }
}

export class AiAuditRepository implements AiAuditStore {
  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceId: string,
  ) {}

  async write(record: AiOperationRecord): Promise<AiOperationRecord> {
    validateOperationId(record.operationId)
    if (record.context.workspaceId !== this.workspaceId) {
      throw new AiPolicyError('AI audit workspace identity mismatch')
    }
    const directory = await this.auditDirectory()
    const relativePath = `.sysml-workbench/audit/ai/${record.operationId}.json`
    const target = resolve(directory, `${record.operationId}.json`)
    const unsigned: AiOperationRecord = {
      ...structuredClone(record),
      audit: {
        path: relativePath,
        recordSha256: '',
      },
    }
    const recordSha256 = sha256(canonicalJson(unsigned))
    const signed: AiOperationRecord = {
      ...unsigned,
      audit: {
        path: relativePath,
        recordSha256,
      },
    }
    const bytes = `${canonicalJson(signed)}\n`
    const temporary = resolve(
      directory,
      `.${record.operationId}.${randomBytes(8).toString('hex')}.tmp`,
    )
    await writeFile(temporary, bytes, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, target)
    return signed
  }

  async read(operationId: string): Promise<AiOperationRecord> {
    validateOperationId(operationId)
    const directory = await this.auditDirectory()
    const target = resolve(directory, `${operationId}.json`)
    const parsed = JSON.parse(await readFile(target, 'utf8')) as AiOperationRecord
    validateStoredRecord(parsed, this.workspaceId, operationId)
    const expectedSha = parsed.audit.recordSha256
    const unsigned: AiOperationRecord = {
      ...structuredClone(parsed),
      audit: {
        ...parsed.audit,
        recordSha256: '',
      },
    }
    if (sha256(canonicalJson(unsigned)) !== expectedSha) {
      throw new AiPolicyError(`AI audit record hash mismatch: ${operationId}`)
    }
    return parsed
  }

  async list(): Promise<AiOperationRecord[]> {
    const directory = await this.auditDirectory()
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(directory, { withFileTypes: true })
    const records: AiOperationRecord[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      records.push(await this.read(entry.name.slice(0, -'.json'.length)))
    }
    return records.sort((left, right) =>
      left.request.at.localeCompare(right.request.at) ||
      left.operationId.localeCompare(right.operationId),
    )
  }

  private async auditDirectory(): Promise<string> {
    const workspaceRoot = await realpath(this.workspaceRoot)
    const directory = resolve(workspaceRoot, '.sysml-workbench/audit/ai')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const authorized = await realpath(directory)
    if (!isWithin(workspaceRoot, authorized)) {
      throw new AiPolicyError('AI audit directory escapes the workspace root')
    }
    return authorized
  }
}

export interface SearchElementsInput {
  nameContains?: string
  includeKinds?: string[]
  maxResults?: number
}

export interface GetRelationshipsResult {
  element: SemanticElement
  relationships: SemanticRelationship[]
}

export interface AiWorkspaceToolResults {
  search_elements: SemanticElement[]
  get_element: SemanticElement | null
  get_relationships: GetRelationshipsResult
  get_requirements: ModelQueryResult
  get_verification: ModelQueryResult
  get_interfaces: ModelQueryResult
  get_diagnostics: LanguageDiagnostic[]
  run_model_query: ModelQueryResult
  compare_baselines: unknown
  propose_commands: { accepted: true; commands: WorkbenchCommand[] }
  validate_commands: ValidateCommandsResult
  apply_approved_commands: ApplyApprovedCommandsResult
}

export type RunModelQueryInput = { query: ModelQuery }

function createAuditedToolExecutor(
  host: AiWorkspaceToolHost,
  records: AiToolCallRecord[],
  allowMutating: boolean,
): AiToolExecutor {
  return {
    async call<T>(name: AiToolName, input: unknown): Promise<T> {
      if (!TOOL_NAME_SET.has(name)) {
        throw new AiPolicyError(`Unknown AI tool: ${String(name)}`)
      }
      if (records.length >= MAX_TOOL_CALLS) {
        throw new AiPolicyError('AI tool-call limit exceeded')
      }
      const definition = AI_TOOL_DEFINITIONS.find((item) => item.name === name)!
      const record: AiToolCallRecord = {
        sequence: records.length + 1,
        name,
        inputSha256: sha256(canonicalJson(input)),
        outcome: 'failed',
      }
      records.push(record)
      if (definition.mutating && !allowMutating) {
        record.outcome = 'rejected'
        record.message =
          'Mutating AI tools require a separate explicit user approval operation.'
        throw new AiPolicyError(record.message)
      }
      try {
        const result = await host.executeTool(name, input)
        record.resultSha256 = sha256(canonicalJson(result))
        record.outcome = 'success'
        return result as T
      } catch (error) {
        record.outcome =
          error instanceof AiPolicyError ? 'rejected' : 'failed'
        record.message = errorMessage(error)
        throw error
      }
    },
  }
}

function createUnsignedRecord(input: {
  request: AiAssistantRequest
  snapshot: SemanticSnapshot
  provider: AiProvider
  state: AiOperationRecord['state']
  answer: string
  citations: SemanticElement[]
  assumptions: string[]
  commands: WorkbenchCommand[]
  proposals: CommandProposal[]
  affectedElementIds: string[]
  validation: AiValidationSummary
  toolCalls: AiToolCallRecord[]
}): AiOperationRecord {
  return {
    schemaVersion: 1,
    orchestratorVersion: AI_ORCHESTRATOR_VERSION,
    operationId: input.request.operationId,
    state: input.state,
    request: {
      userRequest: input.request.userRequest,
      requestedBy: input.request.requestedBy,
      at: input.request.at,
    },
    context: {
      workspaceId: input.request.workspaceId,
      snapshotSha256: input.snapshot.snapshotSha256,
      baselineId: input.request.baselineId ?? null,
    },
    provider: {
      id: input.provider.id,
      displayName: input.provider.displayName,
      model: input.provider.model,
      networkAccess: input.provider.networkAccess,
    },
    answer: input.answer,
    citations: structuredClone(input.citations),
    assumptions: [...input.assumptions],
    commands: structuredClone(input.commands),
    proposals: structuredClone(input.proposals),
    affectedElementIds: [...input.affectedElementIds],
    validation: structuredClone(input.validation),
    toolCalls: structuredClone(input.toolCalls),
    approval: {
      required: input.proposals.length > 0,
      approved: false,
    },
    receipts: [],
    audit: {
      path: '',
      recordSha256: '',
    },
  }
}

function validateRequest(request: AiAssistantRequest): void {
  if (request.schemaVersion !== 1) {
    throw new AiPolicyError('Unsupported AI request schema version')
  }
  validateOperationId(request.operationId)
  requireNonEmpty(request.workspaceId, 'workspaceId', 512)
  requireNonEmpty(request.userRequest, 'userRequest', MAX_USER_REQUEST_LENGTH)
  requireNonEmpty(request.requestedBy, 'requestedBy', 512)
  requireIsoTimestamp(request.at, 'at')
  if (request.providerId !== undefined) {
    requireNonEmpty(request.providerId, 'providerId', 128)
  }
  if (request.baselineId !== undefined) {
    requireNonEmpty(request.baselineId, 'baselineId', 128)
  }
}

function validateProviderProposal(proposal: AiProviderProposal): void {
  if (!proposal || typeof proposal !== 'object') {
    throw new AiPolicyError('AI provider returned an invalid proposal')
  }
  requireNonEmpty(proposal.message, 'provider message', MAX_MESSAGE_LENGTH)
  if (
    !Array.isArray(proposal.citedElementIds) ||
    proposal.citedElementIds.length > MAX_CITATIONS ||
    proposal.citedElementIds.some((item) => typeof item !== 'string')
  ) {
    throw new AiPolicyError('AI provider returned invalid model citations')
  }
  if (
    !Array.isArray(proposal.assumptions) ||
    proposal.assumptions.length > MAX_ASSUMPTIONS ||
    proposal.assumptions.some(
      (item) => typeof item !== 'string' || item.length > 2_000,
    )
  ) {
    throw new AiPolicyError('AI provider returned invalid assumptions')
  }
  if (!Array.isArray(proposal.commands)) {
    throw new AiPolicyError('AI provider returned invalid typed commands')
  }
  if (proposal.commands.length > 1) {
    throw new AiPolicyError(
      'The current controlled-AI profile accepts one command per approval',
    )
  }
}

function validateApplyApproval(approval: AiApplyApproval): void {
  if (approval.schemaVersion !== 1) {
    throw new AiPolicyError('Unsupported AI approval schema version')
  }
  validateOperationId(approval.operationId)
  requireNonEmpty(approval.workspaceId, 'workspaceId', 512)
  requireNonEmpty(approval.approvalId, 'approvalId', 256)
  if (approval.approvedBy?.kind !== 'user') {
    throw new AiPolicyError('AI proposals require approval by a user')
  }
  requireNonEmpty(approval.approvedBy.id, 'approvedBy.id', 512)
  requireIsoTimestamp(approval.at, 'at')
}

function validateStoredRecord(
  record: AiOperationRecord,
  workspaceId: string,
  operationId: string,
): void {
  if (
    record.schemaVersion !== 1 ||
    record.operationId !== operationId ||
    record.context?.workspaceId !== workspaceId ||
    record.audit?.path !==
      `.sysml-workbench/audit/ai/${operationId}.json` ||
    typeof record.audit.recordSha256 !== 'string'
  ) {
    throw new AiPolicyError(`Invalid AI audit record: ${operationId}`)
  }
}

function validateOperationId(operationId: string): void {
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new AiPolicyError(
      'AI operation id must contain only letters, numbers, dot, underscore, and dash',
    )
  }
}

function requireNonEmpty(
  value: string,
  field: string,
  maxLength: number,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new AiPolicyError(`${field} must be a non-empty bounded string`)
  }
}

function requireIsoTimestamp(value: string, field: string): void {
  requireNonEmpty(value, field, 64)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new AiPolicyError(`${field} must be an ISO-8601 UTC timestamp`)
  }
}

function uniqueDiagnostics(
  diagnostics: LanguageDiagnostic[],
): LanguageDiagnostic[] {
  return [
    ...new Map(
      diagnostics.map((diagnostic) => [
        canonicalJson(diagnostic),
        diagnostic,
      ]),
    ).values(),
  ]
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    )
  }
  return value
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isWithin(root: string, candidate: string): boolean {
  if (!isAbsolute(root) || !isAbsolute(candidate)) return false
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..')
}
