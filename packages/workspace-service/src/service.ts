import {
  failure,
  JSON_RPC_ERRORS,
  requireRecord,
  requireString,
  success,
  WORKBENCH_METHODS,
  WORKBENCH_PROTOCOL_VERSION,
  type InitializeParams,
  type InitializeResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../../workbench-protocol/src/index.js'
import type { LanguageAdapter } from '../../language-adapter/src/index.js'
import type { ModelQuery } from '../../query-engine/src/index.js'
import type {
  CommandEnvelope,
  CommandHistoryRequest,
} from '../../command-engine/src/index.js'
import type { ApplyCommandApproval } from '../../command-engine/src/index.js'
import type {
  AiApplyApproval,
  AiAssistantRequest,
  AiProvider,
} from '../../ai-orchestrator/src/index.js'
import { WorkspaceManager } from './workspace.js'
import type {
  AddReviewFindingInput,
  CreateBaselineInput,
  CreateReviewInput,
  DispositionReviewFindingInput,
  GenerateReportInput,
} from './workspace.js'

export interface WorkbenchServiceOptions {
  adapter: LanguageAdapter
  allowedRoots: string[]
  transport: InitializeResult['transport']
  serviceVersion?: string
  aiProviders?: AiProvider[]
  allowNetworkAi?: boolean
}

export class WorkbenchService {
  readonly workspaces: WorkspaceManager
  private initialized = false

  constructor(private readonly options: WorkbenchServiceOptions) {
    this.workspaces = new WorkspaceManager({
      allowedRoots: options.allowedRoots,
      adapter: options.adapter,
      workbenchVersion: options.serviceVersion,
      aiProviders: options.aiProviders,
      allowNetworkAi: options.allowNetworkAi,
    })
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      if (
        !this.initialized &&
        request.method !== WORKBENCH_METHODS.initialize &&
        request.method !== WORKBENCH_METHODS.health
      ) {
        return failure(
          request.id,
          JSON_RPC_ERRORS.notInitialized,
          'workbench/initialize must be called before this method',
        )
      }

      switch (request.method) {
        case WORKBENCH_METHODS.initialize:
          return success(request.id, await this.initialize(request.params))
        case WORKBENCH_METHODS.health:
          return success(request.id, {
            status: 'ok',
            initialized: this.initialized,
            languageEngine: this.options.adapter.health(),
          })
        case WORKBENCH_METHODS.workspaceOpen: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.open(
              requireString(params.workspaceFile, 'workspaceFile'),
            ),
          )
        }
        case WORKBENCH_METHODS.workspaceStatus: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            this.workspaces.status(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.workspaceReadDocument: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            this.workspaces.readDocument(params.workspaceId, params.documentUri),
          )
        }
        case WORKBENCH_METHODS.workspaceListViews: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.listViews(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.workspaceSaveView: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.saveView(
              requireString(params.workspaceId, 'workspaceId'),
              params.view,
            ),
          )
        }
        case WORKBENCH_METHODS.workspaceClose: {
          const params = requireRecord(request.params)
          return success(request.id, {
            closed: await this.workspaces.close(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          })
        }
        case WORKBENCH_METHODS.languageDiagnostics: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            this.workspaces.diagnostics(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.languageDocumentSymbols: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            await this.workspaces.documentSymbols(
              params.workspaceId,
              params.documentUri,
            ),
          )
        }
        case WORKBENCH_METHODS.languageDefinition: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.definition(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageReferences: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.references(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageHover: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.hover(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageCompletion: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.completion(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageSemanticTokens: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            await this.workspaces.semanticTokens(
              params.workspaceId,
              params.documentUri,
            ),
          )
        }
        case WORKBENCH_METHODS.languageRename: {
          const params = languagePositionParams(request.params)
          const values = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.rename(
              params.workspaceId,
              params.documentUri,
              params.position,
              requireString(values.newName, 'newName'),
            ),
          )
        }
        case WORKBENCH_METHODS.languageFormatting: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            await this.workspaces.formatting(
              params.workspaceId,
              params.documentUri,
            ),
          )
        }
        case WORKBENCH_METHODS.languageDocumentChange: {
          const params = languageDocumentParams(request.params)
          const values = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.changeDocument(
              params.workspaceId,
              params.documentUri,
              requirePositiveInteger(values.version, 'version'),
              requireStringValue(values.text, 'text'),
            ),
          )
        }
        case WORKBENCH_METHODS.languageRestart: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.restart(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.semanticSnapshot: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.semanticSnapshot(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.modelQuery: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.modelQuery(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.query, 'query') as unknown as ModelQuery,
            ),
          )
        }
        case WORKBENCH_METHODS.assuranceEvaluate: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.evaluateAssurance(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.gitStatus: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.gitStatus(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.baselineList: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.listBaselines(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.baselineCreate: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.createBaseline(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.input, 'input') as unknown as CreateBaselineInput,
            ),
          )
        }
        case WORKBENCH_METHODS.baselineCompare: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.compareBaseline(
              requireString(params.workspaceId, 'workspaceId'),
              requireString(params.baselineId, 'baselineId'),
            ),
          )
        }
        case WORKBENCH_METHODS.reviewList: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.listReviews(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.reviewCreate: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.createReview(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.input, 'input') as unknown as CreateReviewInput,
            ),
          )
        }
        case WORKBENCH_METHODS.reviewAddFinding: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.addReviewFinding(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.input, 'input') as unknown as AddReviewFindingInput,
            ),
          )
        }
        case WORKBENCH_METHODS.reviewDispositionFinding: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.dispositionReviewFinding(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.input, 'input') as unknown as DispositionReviewFindingInput,
            ),
          )
        }
        case WORKBENCH_METHODS.reviewClose: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.closeReview(
              requireString(params.workspaceId, 'workspaceId'),
              requireString(params.reviewId, 'reviewId'),
              requireRecord(params.input, 'input') as {
                actor: string
                at: string
                note?: string
              },
            ),
          )
        }
        case WORKBENCH_METHODS.reviewStaleness: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.reviewStaleness(
              requireString(params.workspaceId, 'workspaceId'),
              requireString(params.reviewId, 'reviewId'),
            ),
          )
        }
        case WORKBENCH_METHODS.reportGenerate: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.generateReport(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.input, 'input') as unknown as GenerateReportInput,
            ),
          )
        }
        case WORKBENCH_METHODS.aiStatus:
          return success(request.id, this.workspaces.aiStatus())
        case WORKBENCH_METHODS.aiRequest: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.requestAi(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.input, 'input') as unknown as AiAssistantRequest,
            ),
          )
        }
        case WORKBENCH_METHODS.aiListAudit: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.listAiAudit(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.aiApply: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.applyAi(
              requireString(params.workspaceId, 'workspaceId'),
              requireRecord(params.approval, 'approval') as unknown as AiApplyApproval,
            ),
          )
        }
        case WORKBENCH_METHODS.commandPropose:
          return success(
            request.id,
            await this.workspaces.proposeCommand(
              requireRecord(request.params) as unknown as CommandEnvelope,
            ),
          )
        case WORKBENCH_METHODS.commandProposeUndo:
          return success(
            request.id,
            await this.workspaces.proposeUndo(
              requireRecord(request.params) as unknown as CommandHistoryRequest,
            ),
          )
        case WORKBENCH_METHODS.commandProposeRedo:
          return success(
            request.id,
            await this.workspaces.proposeRedo(
              requireRecord(request.params) as unknown as CommandHistoryRequest,
            ),
          )
        case WORKBENCH_METHODS.commandApply:
          return success(
            request.id,
            await this.workspaces.applyCommand(
              requireRecord(request.params) as unknown as ApplyCommandApproval,
            ),
          )
        default:
          return failure(
            request.id,
            JSON_RPC_ERRORS.methodNotFound,
            `Unknown method: ${request.method}`,
          )
      }
    } catch (error) {
      if (error instanceof TypeError) {
        return failure(
          request.id,
          JSON_RPC_ERRORS.invalidParams,
          error.message,
        )
      }
      return failure(
        request.id,
        JSON_RPC_ERRORS.workspaceRejected,
        error instanceof Error ? error.message : 'Workbench operation failed',
      )
    }
  }

  async dispose(): Promise<void> {
    await this.workspaces.dispose()
  }

  private async initialize(paramsValue: unknown): Promise<InitializeResult> {
    const params = requireRecord(paramsValue) as unknown as InitializeParams
    const version = requireString(params.protocolVersion, 'protocolVersion')
    if (version.split('.')[0] !== WORKBENCH_PROTOCOL_VERSION.split('.')[0]) {
      throw new TypeError(
        `Unsupported protocol version ${version}; service supports ${WORKBENCH_PROTOCOL_VERSION}`,
      )
    }
    await this.workspaces.initialize()
    this.initialized = true
    return {
      protocolVersion: WORKBENCH_PROTOCOL_VERSION,
      service: {
        name: 'SysML Engineering Workbench Service',
        version: this.options.serviceVersion ?? '0.1.0',
      },
      languageAuthority: this.options.adapter.metadata,
      transport: this.options.transport,
      serviceCapabilities: {
        normalizedSemanticSnapshot: true,
        durableIdentityPersistence: true,
        boundedModelQuery: true,
        typedCommandProposals: true,
        deterministicAssurance: true,
        gitBaselines: true,
        modelAnchoredReviews: true,
        reproducibleReports: true,
        controlledAi: true,
      },
      capabilities: this.options.adapter.capabilities,
      capabilitiesFinal: this.options.adapter.capabilitiesFinal(),
    }
  }
}

function languageDocumentParams(value: unknown): {
  workspaceId: string
  documentUri: string
} {
  const params = requireRecord(value)
  return {
    workspaceId: requireString(params.workspaceId, 'workspaceId'),
    documentUri: requireString(params.documentUri, 'documentUri'),
  }
}

function languagePositionParams(value: unknown): {
  workspaceId: string
  documentUri: string
  position: { line: number; character: number }
} {
  const params = languageDocumentParams(value)
  const valueRecord = requireRecord(value)
  const position = requireRecord(valueRecord.position, 'position')
  const line = requireNonNegativeInteger(position.line, 'position.line')
  const character = requireNonNegativeInteger(
    position.character,
    'position.character',
  )
  return {
    ...params,
    position: { line, character },
  }
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`)
  }
  return value as number
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer`)
  }
  return value as number
}

function requireStringValue(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`)
  }
  return value
}
