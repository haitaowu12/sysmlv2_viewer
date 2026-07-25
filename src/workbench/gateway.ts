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
  proposeCommand(envelope: CommandEnvelope): Promise<CommandProposal>
  applyCommand(approval: ApplyCommandApproval): Promise<AppliedCommandReceipt>
}

export interface LoadedWorkspace {
  status: WorkspaceStatusResult
  snapshot: SemanticSnapshot
  diagnostics: LanguageDiagnostic[]
  views: SavedWorkbenchView[]
}
