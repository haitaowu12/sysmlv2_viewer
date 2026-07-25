import { createHash } from 'node:crypto'
import type {
  WorkbenchPosition,
  WorkbenchWorkspaceEdit,
} from '../../workbench-protocol/src/index.js'
import type {
  NormalizedElementKind,
  SemanticElement,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'

export const COMMAND_KINDS = [
  'create-element',
  'create-relationship',
  'delete-element',
  'rename-element',
  'move-element',
  'change-type',
  'change-multiplicity',
  'set-property',
  'update-documentation',
  'apply-pattern',
] as const

export type CommandKind = (typeof COMMAND_KINDS)[number]

export type CreatableElementKind = Exclude<
  NormalizedElementKind,
  'OpaqueElement' | 'TransitionUsage'
>

export type CreatableRelationshipKind =
  | 'connection'
  | 'flow'
  | 'interface'
  | 'satisfaction'
  | 'verification'

export type WorkbenchCommand =
  | {
      kind: 'create-element'
      ownerId: string
      elementKind: CreatableElementKind
      name: string
      typeQualifiedName?: string
    }
  | {
      kind: 'create-relationship'
      ownerId: string
      relationshipKind: CreatableRelationshipKind
      name?: string
      sourceId: string
      targetId: string
      itemQualifiedName?: string
    }
  | { kind: 'delete-element'; targetId: string }
  | { kind: 'rename-element'; targetId: string; newName: string }
  | { kind: 'move-element'; targetId: string; newOwnerId: string }
  | { kind: 'change-type'; targetId: string; typeQualifiedName: string }
  | {
      kind: 'change-multiplicity'
      targetId: string
      lower: number
      upper: number | '*'
    }
  | {
      kind: 'set-property'
      targetId: string
      propertyQualifiedName: string
      value: string | number | boolean
    }
  | { kind: 'update-documentation'; targetId: string; documentation: string }
  | {
      kind: 'apply-pattern'
      patternId: string
      patternVersion: string
      ownerId: string
      parameters: Record<string, string | number | boolean>
    }

export interface CommandEnvelope {
  schemaVersion: 1
  commandId: string
  workspaceId: string
  baseSnapshotSha256: string
  baseDocuments: Record<string, string>
  requestedBy: {
    kind: 'user' | 'ai'
    id: string
  }
  command: WorkbenchCommand
}

export interface CommandWorkspaceDocument {
  uri: string
  workspacePath: string
  text: string
  sha256: string
  version: number
}

export interface SourceEditApplication {
  documents: CommandWorkspaceDocument[]
  inverse: WorkbenchWorkspaceEdit
}

export interface CommandProposal {
  schemaVersion: 1
  proposalId: string
  commandId: string
  state: 'proposed'
  envelope: CommandEnvelope
  edits: WorkbenchWorkspaceEdit
  overlayDocuments: CommandWorkspaceDocument[]
  affectedElementIds: string[]
  diagnosticsBefore: unknown[]
  diagnosticsAfter: unknown[]
  semanticDiff: null
  conflicts: Array<{ code: string; message: string }>
  approval: {
    required: true
    approved: false
  }
  undo: WorkbenchWorkspaceEdit
  authority: SemanticSnapshot['authority']
  validation: {
    state: 'pending-authoritative-validation'
  }
}

export interface PlanCommandInput {
  envelope: CommandEnvelope
  snapshot: SemanticSnapshot
  documents: CommandWorkspaceDocument[]
  renameProvider: (
    target: SemanticElement,
    newName: string,
  ) => Promise<WorkbenchWorkspaceEdit>
}

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommandValidationError'
  }
}

export class SourceEditConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceEditConflictError'
  }
}

export async function planCommand(
  input: PlanCommandInput,
): Promise<CommandProposal> {
  const { envelope, snapshot, documents } = input
  validateEnvelope(envelope)
  if (envelope.workspaceId !== snapshot.workspace.id) {
    throw new CommandValidationError('Command workspace does not match snapshot')
  }
  if (envelope.baseSnapshotSha256 !== snapshot.snapshotSha256) {
    throw new CommandValidationError('Command base snapshot is stale')
  }
  if (snapshot.freshness !== 'current') {
    throw new CommandValidationError('Command requires a current semantic snapshot')
  }
  validateDocumentHashes(documents)
  const documentsByUri = new Map(documents.map((document) => [document.uri, document]))
  for (const [uri, expected] of Object.entries(envelope.baseDocuments)) {
    const document = documentsByUri.get(uri)
    if (!document || document.sha256 !== expected) {
      throw new CommandValidationError(`Command base document is stale: ${uri}`)
    }
  }

  if (envelope.command.kind !== 'rename-element') {
    throw new CommandValidationError(
      `Command ${envelope.command.kind} is not implemented by the active command profile`,
    )
  }
  const target = requireTarget(snapshot, envelope.command.targetId)
  requireEditableTarget(target)
  const edits = await input.renameProvider(target, envelope.command.newName)
  for (const uri of Object.keys(edits.changes)) {
    if (envelope.baseDocuments[uri] === undefined) {
      throw new CommandValidationError(
        `Command edit does not have a declared base document hash: ${uri}`,
      )
    }
  }
  const application = applySourceEdits(documents, edits)
  const proposalId = `proposal:${digest(stableJson({ envelope, edits })).slice(0, 32)}`
  return {
    schemaVersion: 1,
    proposalId,
    commandId: envelope.commandId,
    state: 'proposed',
    envelope: structuredClone(envelope),
    edits: structuredClone(edits),
    overlayDocuments: application.documents,
    affectedElementIds: [target.id],
    diagnosticsBefore: [],
    diagnosticsAfter: [],
    semanticDiff: null,
    conflicts: [],
    approval: { required: true, approved: false },
    undo: application.inverse,
    authority: structuredClone(snapshot.authority),
    validation: { state: 'pending-authoritative-validation' },
  }
}

export function applySourceEdits(
  documents: CommandWorkspaceDocument[],
  workspaceEdit: WorkbenchWorkspaceEdit,
): SourceEditApplication {
  validateDocumentHashes(documents)
  const byUri = new Map(documents.map((document) => [document.uri, document]))
  for (const uri of Object.keys(workspaceEdit.changes)) {
    if (!byUri.has(uri)) {
      throw new SourceEditConflictError(
        `Source edit targets a document outside the authorized workspace: ${uri}`,
      )
    }
  }

  const inverse: WorkbenchWorkspaceEdit = { changes: {} }
  const updated = documents.map((document) => {
    const edits = workspaceEdit.changes[document.uri] ?? []
    if (edits.length === 0) return structuredClone(document)
    const normalized = edits.map((edit) => {
      const start = positionToOffset(document.text, edit.range.start)
      const end = positionToOffset(document.text, edit.range.end)
      if (end < start) {
        throw new SourceEditConflictError(
          `Source edit has a reversed range: ${document.uri}`,
        )
      }
      return { edit, start, end, original: document.text.slice(start, end) }
    }).sort((left, right) => left.start - right.start || left.end - right.end)

    for (let index = 1; index < normalized.length; index += 1) {
      const prior = normalized[index - 1]!
      const current = normalized[index]!
      if (current.start < prior.end || current.start === prior.start) {
        throw new SourceEditConflictError(
          `Source edits overlap or share an ambiguous insertion point: ${document.uri}`,
        )
      }
    }

    let nextText = document.text
    for (const item of [...normalized].reverse()) {
      nextText =
        nextText.slice(0, item.start) +
        item.edit.newText +
        nextText.slice(item.end)
    }

    let delta = 0
    inverse.changes[document.uri] = normalized.map((item) => {
      const start = item.start + delta
      const end = start + item.edit.newText.length
      delta += item.edit.newText.length - (item.end - item.start)
      return {
        range: {
          start: offsetToPosition(nextText, start),
          end: offsetToPosition(nextText, end),
        },
        newText: item.original,
      }
    })
    return {
      ...structuredClone(document),
      text: nextText,
      sha256: digest(nextText),
      version: document.version + 1,
    }
  })
  return { documents: updated, inverse }
}

function validateEnvelope(envelope: CommandEnvelope): void {
  if (envelope.schemaVersion !== 1) {
    throw new CommandValidationError('Command schemaVersion must be 1')
  }
  for (const [name, value] of [
    ['commandId', envelope.commandId],
    ['workspaceId', envelope.workspaceId],
    ['baseSnapshotSha256', envelope.baseSnapshotSha256],
    ['requestedBy.id', envelope.requestedBy.id],
  ] as const) {
    if (!value || value.length > 512) {
      throw new CommandValidationError(`Command ${name} is invalid`)
    }
  }
  if (!COMMAND_KINDS.includes(envelope.command.kind)) {
    throw new CommandValidationError('Unknown command kind')
  }
  if (
    envelope.command.kind === 'rename-element' &&
    !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(envelope.command.newName)
  ) {
    throw new CommandValidationError('Rename target must be a SysML identifier')
  }
}

function validateDocumentHashes(documents: CommandWorkspaceDocument[]): void {
  const uris = new Set<string>()
  for (const document of documents) {
    if (uris.has(document.uri)) {
      throw new SourceEditConflictError(`Duplicate workspace document: ${document.uri}`)
    }
    uris.add(document.uri)
    if (digest(document.text) !== document.sha256) {
      throw new SourceEditConflictError(
        `Workspace document hash does not match content: ${document.uri}`,
      )
    }
  }
}

function requireTarget(
  snapshot: SemanticSnapshot,
  targetId: string,
): SemanticElement {
  const target = snapshot.elements.find((element) => element.id === targetId)
  if (!target) {
    throw new CommandValidationError(`Unknown command target: ${targetId}`)
  }
  return target
}

function requireEditableTarget(target: SemanticElement): void {
  if (
    target.kind === 'OpaqueElement' ||
    target.provenance.classification === 'opaque'
  ) {
    throw new CommandValidationError(
      `Command target is semantically opaque: ${target.id}`,
    )
  }
  if (!target.source.range) {
    throw new CommandValidationError(
      `Command target has no authoritative source range: ${target.id}`,
    )
  }
}

function positionToOffset(text: string, position: WorkbenchPosition): number {
  const starts = lineStarts(text)
  if (position.line < 0 || position.line >= starts.length) {
    throw new SourceEditConflictError('Source edit line is outside the document')
  }
  const start = starts[position.line]!
  const next = starts[position.line + 1] ?? text.length
  const lineEnd =
    next > start && text[next - 1] === '\n'
      ? next - (next > start + 1 && text[next - 2] === '\r' ? 2 : 1)
      : next
  if (position.character < 0 || start + position.character > lineEnd) {
    throw new SourceEditConflictError(
      'Source edit character is outside the document line',
    )
  }
  return start + position.character
}

function offsetToPosition(text: string, offset: number): WorkbenchPosition {
  if (offset < 0 || offset > text.length) {
    throw new SourceEditConflictError('Source edit offset is outside the document')
  }
  const starts = lineStarts(text)
  let low = 0
  let high = starts.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (starts[middle]! <= offset) low = middle + 1
    else high = middle - 1
  }
  const line = Math.max(0, high)
  return { line, character: offset - starts[line]! }
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
