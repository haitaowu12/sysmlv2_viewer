import type {
  SavedWorkbenchView,
  WorkbenchCompletionItem,
  WorkbenchHover,
  WorkbenchLocation,
  WorkbenchPosition,
  WorkbenchTextEdit,
  WorkspaceDocumentContent,
  WorkspaceStatusResult,
} from '../../packages/workbench-protocol/src/index.js'
import type { LanguageDiagnostic } from '../../packages/language-adapter/src/index.js'
import type { SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import type { ModelQuery, ModelQueryResult } from '../../packages/query-engine/src/index.js'
import type {
  ApplyCommandApproval,
  AppliedCommandReceipt,
  CommandEnvelope,
  CommandProposal,
} from '../../packages/command-engine/src/index.js'
import type {
  BaselineComparison,
  BaselineManifest,
  GitWorkspaceStatus,
} from '../../packages/baseline-service/src/index.js'
import type {
  ModelReview,
  ReviewStaleness,
} from '../../packages/review-service/src/index.js'
import type { AssuranceEvaluation } from '../../packages/rule-engine/src/index.js'
import type { ReportBundleManifest, ReportKind } from '../../packages/report-engine/src/index.js'

export interface WorkbenchGateway {
  readDocument(workspaceId: string, documentUri: string): Promise<WorkspaceDocumentContent>
  diagnostics(workspaceId: string): Promise<LanguageDiagnostic[]>
  semanticSnapshot(workspaceId: string): Promise<SemanticSnapshot>
  modelQuery(workspaceId: string, query: ModelQuery): Promise<ModelQueryResult>
  listViews(workspaceId: string): Promise<SavedWorkbenchView[]>
  saveView(workspaceId: string, view: SavedWorkbenchView): Promise<SavedWorkbenchView>
  completion(workspaceId: string, documentUri: string, position: WorkbenchPosition): Promise<WorkbenchCompletionItem[]>
  hover(workspaceId: string, documentUri: string, position: WorkbenchPosition): Promise<WorkbenchHover | null>
  definition(workspaceId: string, documentUri: string, position: WorkbenchPosition): Promise<WorkbenchLocation[]>
  references(workspaceId: string, documentUri: string, position: WorkbenchPosition): Promise<WorkbenchLocation[]>
  formatting(workspaceId: string, documentUri: string): Promise<WorkbenchTextEdit[]>
  evaluateAssurance(workspaceId: string): Promise<AssuranceEvaluation>
  gitStatus(workspaceId: string): Promise<GitWorkspaceStatus>
  listBaselines(workspaceId: string): Promise<BaselineManifest[]>
  createBaseline(workspaceId: string, input: { id: string; actor: string; at: string }): Promise<BaselineManifest>
  compareBaseline(workspaceId: string, baselineId: string): Promise<BaselineComparison>
  listReviews(workspaceId: string): Promise<ModelReview[]>
  createReview(workspaceId: string, input: {
    id: string
    title: string
    scope: ModelReview['scope']
    participants?: ModelReview['participants']
    actor: string
    at: string
  }): Promise<ModelReview>
  addReviewFinding(workspaceId: string, input: {
    reviewId: string
    finding: {
      id: string
      elementId?: string
      relationshipId?: string
      severity: 'critical' | 'major' | 'minor' | 'advisory'
      category: 'requirement' | 'verification' | 'interface' | 'change' | 'quality' | 'other'
      statement: string
      owner?: string
      dueDate?: string
      evidence?: string[]
      actor: string
      at: string
    }
  }): Promise<ModelReview>
  dispositionReviewFinding(workspaceId: string, input: {
    reviewId: string
    findingId: string
    disposition: 'open' | 'accepted' | 'rejected' | 'deferred' | 'closed'
    response: string
    actor: string
    at: string
  }): Promise<ModelReview>
  closeReview(workspaceId: string, reviewId: string, input: { actor: string; at: string; note?: string }): Promise<ModelReview>
  reviewStaleness(workspaceId: string, reviewId: string): Promise<ReviewStaleness>
  generateReport(workspaceId: string, input: {
    reportId: string
    kind: ReportKind
    at: string
    baselineId?: string
    viewConfiguration?: string
    exclusions?: string[]
  }): Promise<ReportBundleManifest>
  proposeCommand(envelope: CommandEnvelope): Promise<CommandProposal>
  applyCommand(approval: ApplyCommandApproval): Promise<AppliedCommandReceipt>
}

export interface LoadedWorkspace {
  status: WorkspaceStatusResult
  snapshot: SemanticSnapshot
  diagnostics: LanguageDiagnostic[]
  views: SavedWorkbenchView[]
}
