import {
  WORKBENCH_METHODS,
  WORKBENCH_PROTOCOL_VERSION,
  type InitializeResult,
  type WorkbenchCompletionItem,
  type WorkbenchDocumentSymbol,
  type WorkbenchHover,
  type WorkbenchLocation,
  type WorkbenchPosition,
  type WorkbenchSemanticTokens,
  type WorkbenchTextEdit,
  type WorkbenchWorkspaceEdit,
  type WorkspaceStatusResult,
  type WorkspaceDocumentContent,
  type SavedWorkbenchView,
} from '../../workbench-protocol/src/index.js'
import type { LanguageDiagnostic } from '../../language-adapter/src/index.js'
import type {
  ModelQuery,
  ModelQueryResult,
} from '../../query-engine/src/index.js'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import type {
  CommandEnvelope,
  CommandHistoryRequest,
  CommandProposal,
  ApplyCommandApproval,
  AppliedCommandReceipt,
} from '../../command-engine/src/index.js'
import type {
  BaselineComparison,
  BaselineManifest,
  GitWorkspaceStatus,
} from '../../baseline-service/src/index.js'
import type {
  ModelReview,
  ReviewStaleness,
} from '../../review-service/src/index.js'
import type { AssuranceEvaluation } from '../../rule-engine/src/index.js'
import type { ReportBundleManifest } from '../../report-engine/src/index.js'
import type {
  AiApplyApproval,
  AiAssistantRequest,
  AiOperationRecord,
  AiOrchestratorStatus,
} from '../../ai-orchestrator/src/index.js'
import type {
  AddReviewFindingInput,
  CreateBaselineInput,
  CreateReviewInput,
  DispositionReviewFindingInput,
  GenerateReportInput,
} from '../../workspace-service/src/workspace.js'

export interface WorkbenchTransport {
  request<T>(method: string, params?: unknown): Promise<T>
  close?(): Promise<void>
}

export class WorkbenchClient {
  constructor(private readonly transport: WorkbenchTransport) {}

  initialize(
    client = { name: 'workbench-client-sdk', version: '0.1.0' },
  ): Promise<InitializeResult> {
    return this.transport.request(WORKBENCH_METHODS.initialize, {
      protocolVersion: WORKBENCH_PROTOCOL_VERSION,
      client,
    })
  }

  openWorkspace(workspaceFile: string): Promise<WorkspaceStatusResult> {
    return this.transport.request(WORKBENCH_METHODS.workspaceOpen, {
      workspaceFile,
    })
  }

  workspaceStatus(workspaceId: string): Promise<WorkspaceStatusResult> {
    return this.transport.request(WORKBENCH_METHODS.workspaceStatus, {
      workspaceId,
    })
  }

  readDocument(
    workspaceId: string,
    documentUri: string,
  ): Promise<WorkspaceDocumentContent> {
    return this.transport.request(WORKBENCH_METHODS.workspaceReadDocument, {
      workspaceId,
      documentUri,
    })
  }

  diagnostics(workspaceId: string): Promise<LanguageDiagnostic[]> {
    return this.transport.request(WORKBENCH_METHODS.languageDiagnostics, {
      workspaceId,
    })
  }

  listViews(workspaceId: string): Promise<SavedWorkbenchView[]> {
    return this.transport.request(WORKBENCH_METHODS.workspaceListViews, {
      workspaceId,
    })
  }

  saveView(
    workspaceId: string,
    view: SavedWorkbenchView,
  ): Promise<SavedWorkbenchView> {
    return this.transport.request(WORKBENCH_METHODS.workspaceSaveView, {
      workspaceId,
      view,
    })
  }

  closeWorkspace(workspaceId: string): Promise<{ closed: boolean }> {
    return this.transport.request(WORKBENCH_METHODS.workspaceClose, {
      workspaceId,
    })
  }

  health(): Promise<{ status: 'ok'; initialized: boolean }> {
    return this.transport.request(WORKBENCH_METHODS.health)
  }

  documentSymbols(
    workspaceId: string,
    documentUri: string,
  ): Promise<WorkbenchDocumentSymbol[]> {
    return this.transport.request(WORKBENCH_METHODS.languageDocumentSymbols, {
      workspaceId,
      documentUri,
    })
  }

  definition(
    workspaceId: string,
    documentUri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    return this.transport.request(WORKBENCH_METHODS.languageDefinition, {
      workspaceId,
      documentUri,
      position,
    })
  }

  references(
    workspaceId: string,
    documentUri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchLocation[]> {
    return this.transport.request(WORKBENCH_METHODS.languageReferences, {
      workspaceId,
      documentUri,
      position,
    })
  }

  hover(
    workspaceId: string,
    documentUri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchHover | null> {
    return this.transport.request(WORKBENCH_METHODS.languageHover, {
      workspaceId,
      documentUri,
      position,
    })
  }

  completion(
    workspaceId: string,
    documentUri: string,
    position: WorkbenchPosition,
  ): Promise<WorkbenchCompletionItem[]> {
    return this.transport.request(WORKBENCH_METHODS.languageCompletion, {
      workspaceId,
      documentUri,
      position,
    })
  }

  semanticTokens(
    workspaceId: string,
    documentUri: string,
  ): Promise<WorkbenchSemanticTokens> {
    return this.transport.request(WORKBENCH_METHODS.languageSemanticTokens, {
      workspaceId,
      documentUri,
    })
  }

  rename(
    workspaceId: string,
    documentUri: string,
    position: WorkbenchPosition,
    newName: string,
  ): Promise<WorkbenchWorkspaceEdit> {
    return this.transport.request(WORKBENCH_METHODS.languageRename, {
      workspaceId,
      documentUri,
      position,
      newName,
    })
  }

  formatting(
    workspaceId: string,
    documentUri: string,
  ): Promise<WorkbenchTextEdit[]> {
    return this.transport.request(WORKBENCH_METHODS.languageFormatting, {
      workspaceId,
      documentUri,
    })
  }

  changeDocument(
    workspaceId: string,
    documentUri: string,
    version: number,
    text: string,
  ): Promise<WorkspaceStatusResult> {
    return this.transport.request(WORKBENCH_METHODS.languageDocumentChange, {
      workspaceId,
      documentUri,
      version,
      text,
    })
  }

  restartLanguageEngine(
    workspaceId: string,
  ): Promise<WorkspaceStatusResult> {
    return this.transport.request(WORKBENCH_METHODS.languageRestart, {
      workspaceId,
    })
  }

  semanticSnapshot(workspaceId: string): Promise<SemanticSnapshot> {
    return this.transport.request(WORKBENCH_METHODS.semanticSnapshot, {
      workspaceId,
    })
  }

  modelQuery(
    workspaceId: string,
    query: ModelQuery,
  ): Promise<ModelQueryResult> {
    return this.transport.request(WORKBENCH_METHODS.modelQuery, {
      workspaceId,
      query,
    })
  }

  evaluateAssurance(workspaceId: string): Promise<AssuranceEvaluation> {
    return this.transport.request(WORKBENCH_METHODS.assuranceEvaluate, {
      workspaceId,
    })
  }

  gitStatus(workspaceId: string): Promise<GitWorkspaceStatus> {
    return this.transport.request(WORKBENCH_METHODS.gitStatus, { workspaceId })
  }

  listBaselines(workspaceId: string): Promise<BaselineManifest[]> {
    return this.transport.request(WORKBENCH_METHODS.baselineList, { workspaceId })
  }

  createBaseline(
    workspaceId: string,
    input: CreateBaselineInput,
  ): Promise<BaselineManifest> {
    return this.transport.request(WORKBENCH_METHODS.baselineCreate, {
      workspaceId,
      input,
    })
  }

  compareBaseline(
    workspaceId: string,
    baselineId: string,
  ): Promise<BaselineComparison> {
    return this.transport.request(WORKBENCH_METHODS.baselineCompare, {
      workspaceId,
      baselineId,
    })
  }

  listReviews(workspaceId: string): Promise<ModelReview[]> {
    return this.transport.request(WORKBENCH_METHODS.reviewList, { workspaceId })
  }

  createReview(
    workspaceId: string,
    input: CreateReviewInput,
  ): Promise<ModelReview> {
    return this.transport.request(WORKBENCH_METHODS.reviewCreate, {
      workspaceId,
      input,
    })
  }

  addReviewFinding(
    workspaceId: string,
    input: AddReviewFindingInput,
  ): Promise<ModelReview> {
    return this.transport.request(WORKBENCH_METHODS.reviewAddFinding, {
      workspaceId,
      input,
    })
  }

  dispositionReviewFinding(
    workspaceId: string,
    input: DispositionReviewFindingInput,
  ): Promise<ModelReview> {
    return this.transport.request(WORKBENCH_METHODS.reviewDispositionFinding, {
      workspaceId,
      input,
    })
  }

  closeReview(
    workspaceId: string,
    reviewId: string,
    input: { actor: string; at: string; note?: string },
  ): Promise<ModelReview> {
    return this.transport.request(WORKBENCH_METHODS.reviewClose, {
      workspaceId,
      reviewId,
      input,
    })
  }

  reviewStaleness(
    workspaceId: string,
    reviewId: string,
  ): Promise<ReviewStaleness> {
    return this.transport.request(WORKBENCH_METHODS.reviewStaleness, {
      workspaceId,
      reviewId,
    })
  }

  generateReport(
    workspaceId: string,
    input: GenerateReportInput,
  ): Promise<ReportBundleManifest> {
    return this.transport.request(WORKBENCH_METHODS.reportGenerate, {
      workspaceId,
      input,
    })
  }

  aiStatus(): Promise<AiOrchestratorStatus> {
    return this.transport.request(WORKBENCH_METHODS.aiStatus)
  }

  requestAi(
    workspaceId: string,
    input: AiAssistantRequest,
  ): Promise<AiOperationRecord> {
    return this.transport.request(WORKBENCH_METHODS.aiRequest, {
      workspaceId,
      input,
    })
  }

  listAiAudit(workspaceId: string): Promise<AiOperationRecord[]> {
    return this.transport.request(WORKBENCH_METHODS.aiListAudit, {
      workspaceId,
    })
  }

  applyAi(
    workspaceId: string,
    approval: AiApplyApproval,
  ): Promise<AiOperationRecord> {
    return this.transport.request(WORKBENCH_METHODS.aiApply, {
      workspaceId,
      approval,
    })
  }

  proposeCommand(envelope: CommandEnvelope): Promise<CommandProposal> {
    return this.transport.request(WORKBENCH_METHODS.commandPropose, envelope)
  }

  proposeUndo(request: CommandHistoryRequest): Promise<CommandProposal> {
    return this.transport.request(WORKBENCH_METHODS.commandProposeUndo, request)
  }

  proposeRedo(request: CommandHistoryRequest): Promise<CommandProposal> {
    return this.transport.request(WORKBENCH_METHODS.commandProposeRedo, request)
  }

  applyCommand(
    approval: ApplyCommandApproval,
  ): Promise<AppliedCommandReceipt> {
    return this.transport.request(WORKBENCH_METHODS.commandApply, approval)
  }

  async close(): Promise<void> {
    await this.transport.close?.()
  }
}

export interface HttpWorkbenchTransportOptions {
  endpoint: string
  token: string
  csrf: string
}

export interface LoopbackPairingResult {
  token: string
  csrf: string
  expiresAt: string
}

export async function pairLoopbackService(
  serviceOrigin: string,
  pairingCode: string,
): Promise<LoopbackPairingResult> {
  const origin = new URL(serviceOrigin)
  if (
    origin.protocol !== 'http:' ||
    (origin.hostname !== '127.0.0.1' && origin.hostname !== '[::1]')
  ) {
    throw new Error('Workbench pairing requires an HTTP loopback service origin')
  }
  const response = await fetch(new URL('/pair', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode }),
  })
  if (!response.ok) {
    throw new Error(`Workbench pairing failed with HTTP ${response.status}`)
  }
  return response.json() as Promise<LoopbackPairingResult>
}

export class HttpWorkbenchTransport implements WorkbenchTransport {
  private nextId = 1

  constructor(private readonly options: HttpWorkbenchTransportOptions) {}

  async request<T>(method: string, params?: unknown): Promise<T> {
    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        'Content-Type': 'application/json',
        'X-Workbench-CSRF': this.options.csrf,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method,
        params,
      }),
    })
    if (!response.ok) {
      throw new Error(`Workbench service returned HTTP ${response.status}`)
    }
    const payload = (await response.json()) as {
      result?: T
      error?: { code: number; message: string }
    }
    if (payload.error) {
      throw new Error(
        `Workbench request failed (${payload.error.code}): ${payload.error.message}`,
      )
    }
    return payload.result as T
  }
}
