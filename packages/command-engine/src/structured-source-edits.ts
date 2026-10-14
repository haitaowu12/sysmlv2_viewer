import { quantityField, referenceField, interfaceAgreementField, AGREEMENT_STATUSES } from './contributor-profile.js'
import type {
  WorkbenchRange,
  WorkbenchTextEdit,
  WorkbenchWorkspaceEdit,
} from '../../workbench-protocol/src/index.js'
import type {
  NormalizedElementKind,
  SemanticElement,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import type {
  CommandWorkspaceDocument,
  ContributorFieldCommand,
  WorkbenchCommand,
} from './index.js'
import {
  directDocumentation,
  type DirectDocumentation,
} from './documentation.js'

export interface StructuredSourceEditPlan {
  edits: WorkbenchWorkspaceEdit
  affectedElementIds: string[]
}

export class StructuredSourceEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StructuredSourceEditError'
  }
}

export function planStructuredSourceEdits(
  command: Exclude<WorkbenchCommand, { kind: 'rename-element' | 'replace-document' | 'undo-command' | 'redo-command' | 'batch-edit' }>,
  snapshot: SemanticSnapshot,
  documents: CommandWorkspaceDocument[],
): StructuredSourceEditPlan {
  const context = new SourceContext(snapshot, documents)
  switch (command.kind) {
    case 'create-element': {
      const owner = context.editable(command.ownerId)
      const declaration = renderElement(
        command.elementKind,
        command.name,
        command.typeQualifiedName,
      )
      return context.insertInOwner(owner, declaration, [owner.id])
    }
    case 'create-relationship': {
      const owner = context.editable(command.ownerId)
      const source = context.element(command.sourceId)
      const target = context.element(command.targetId)
      const declaration = renderRelationship(command, source, target)
      return context.insertInOwner(
        owner,
        declaration,
        [owner.id, source.id, target.id],
      )
    }
    case 'delete-element': {
      const target = context.editable(command.targetId)
      return context.delete(target)
    }
    case 'move-element': {
      const target = context.editable(command.targetId)
      const owner = context.editable(command.newOwnerId)
      return context.move(target, owner)
    }
    case 'change-type': {
      const target = context.editable(command.targetId)
      return context.replaceType(target, command.typeQualifiedName)
    }
    case 'change-multiplicity': {
      const target = context.editable(command.targetId)
      return context.replaceMultiplicity(target, command.lower, command.upper)
    }
    case 'set-property': {
      const target = context.editable(command.targetId)
      const declaration = `attribute :>> ${qualifiedName(command.propertyQualifiedName)} = ${literal(command.value)};`
      return context.insertInOwner(target, declaration, [target.id])
    }
    case 'set-attribute-value': {
      const target = context.editable(command.targetId)
      return context.setAttributeValue(target, command.value)
    }
    case 'set-quantity-value':
    case 'set-reference-target':
    case 'set-interface-agreement': {
      return context.contributorField(command)
    }
    case 'update-documentation': {
      const target = context.editable(command.targetId)
      return context.updateDocumentation(target, command.documentation)
    }
    case 'apply-pattern': {
      if (
        command.patternId !== 'sysml-workbench/interface-assurance-stub' ||
        command.patternVersion !== '1.0.0'
      ) {
        throw new StructuredSourceEditError(
          `Unknown modeling pattern: ${command.patternId}@${command.patternVersion}`,
        )
      }
      const owner = context.editable(command.ownerId)
      const name = identifier(String(command.parameters.name ?? 'Interface'))
      const source = qualifiedName(String(command.parameters.source ?? 'source'))
      const target = qualifiedName(String(command.parameters.target ?? 'target'))
      const declaration = [
        `interface ${name} connect ${source} to ${target};`,
        `// TODO verify interface ${name}`,
      ].join('\n')
      return context.insertInOwner(owner, declaration, [owner.id])
    }
  }
}

/**
 * Plan bounded contributor field edits against one immutable source snapshot.
 * The caller applies the merged edit set once, preserving one proposal,
 * authority validation, approval, transaction, and inverse for the batch.
 */
export function planBatchStructuredSourceEdits(
  commands: ContributorFieldCommand[],
  snapshot: SemanticSnapshot,
  documents: CommandWorkspaceDocument[],
): StructuredSourceEditPlan {
  if (commands.length < 1 || commands.length > 50) {
    throw new StructuredSourceEditError(
      'Batch edit must contain between 1 and 50 field commands',
    )
  }

  const plans = commands.map((command) => {
    if (!command || typeof command !== 'object') {
      throw new StructuredSourceEditError('Batch edit contains an invalid command')
    }
    if (
      command.kind !== 'set-property' &&
      command.kind !== 'set-attribute-value' &&
      command.kind !== 'update-documentation' &&
      command.kind !== 'set-quantity-value' &&
      command.kind !== 'set-reference-target' &&
      command.kind !== 'set-interface-agreement'
    ) {
      throw new StructuredSourceEditError(
        'Batch edit only supports contributor field commands',
      )
    }
    return planStructuredSourceEdits(command, snapshot, documents)
  })

  const changes: Record<string, WorkbenchTextEdit[]> = {}
  const affectedElementIds = new Set<string>()
  for (const planned of plans) {
    for (const [uri, edits] of Object.entries(planned.edits.changes)) {
      changes[uri] = [...(changes[uri] ?? []), ...edits]
    }
    for (const elementId of planned.affectedElementIds) {
      affectedElementIds.add(elementId)
    }
  }
  validateBatchEdits(changes, documents)
  return {
    edits: { changes },
    affectedElementIds: [...affectedElementIds],
  }
}

function validateBatchEdits(
  changes: Record<string, WorkbenchTextEdit[]>,
  documents: CommandWorkspaceDocument[],
): void {
  if (Object.keys(changes).length === 0) {
    throw new StructuredSourceEditError('Batch edit produced no source edits')
  }
  const documentsByUri = new Map(documents.map((document) => [document.uri, document]))
  for (const [uri, edits] of Object.entries(changes)) {
    const document = documentsByUri.get(uri)
    if (!document || edits.length === 0) {
      throw new StructuredSourceEditError(`Batch edit has no usable edits for ${uri}`)
    }
    const normalized = edits.map((edit) => {
      const start = offsetAt(document.text, edit.range.start)
      const end = offsetAt(document.text, edit.range.end)
      if (end < start) {
        throw new StructuredSourceEditError(`Batch edit has a reversed range: ${uri}`)
      }
      if (start === end && edit.newText.length === 0) {
        throw new StructuredSourceEditError(`Batch edit contains an empty edit: ${uri}`)
      }
      if (document.text.slice(start, end) === edit.newText) {
        throw new StructuredSourceEditError(`Batch edit contains a no-op edit: ${uri}`)
      }
      return { start, end }
    }).sort((left, right) => left.start - right.start || left.end - right.end)

    for (let index = 1; index < normalized.length; index += 1) {
      const prior = normalized[index - 1]!
      const current = normalized[index]!
      if (current.start < prior.end || current.start === prior.start) {
        throw new StructuredSourceEditError(
          `Batch edits overlap or share an ambiguous insertion point: ${uri}`,
        )
      }
    }
  }
}

class SourceContext {
  private readonly documents = new Map<string, CommandWorkspaceDocument>()

  constructor(
    private readonly snapshot: SemanticSnapshot,
    documents: CommandWorkspaceDocument[],
  ) {
    for (const document of documents) this.documents.set(document.uri, document)
  }

  element(id: string): SemanticElement {
    const element = this.snapshot.elements.find((candidate) => candidate.id === id)
    if (!element) throw new StructuredSourceEditError(`Unknown command target: ${id}`)
    return element
  }

  editable(id: string): SemanticElement {
    const element = this.element(id)
    if (
      element.kind === 'OpaqueElement' ||
      element.provenance.classification === 'opaque'
    ) {
      throw new StructuredSourceEditError(`Command target is opaque: ${id}`)
    }
    this.declaration(element)
    return element
  }

  insertInOwner(
    owner: SemanticElement,
    declaration: string,
    affectedElementIds: string[],
  ): StructuredSourceEditPlan {
    const source = this.declaration(owner)
    const block = findBlock(source.text)
    if (!block) {
      throw new StructuredSourceEditError(
        `Command owner has no editable body: ${owner.id}`,
      )
    }
    const closingLineStart = source.text.lastIndexOf('\n', block.close) + 1
    const closingPrefix = source.text.slice(closingLineStart, block.close)
    const ownerIndent = lineIndent(source.document.text, source.start)
    const childIndent = `${ownerIndent}    `
    const rendered = declaration
      .split('\n')
      .map((line) => `${childIndent}${line}`)
      .join('\n')
    const closingLineIsIndentOnly = /^\s*$/u.test(closingPrefix)
    const insertionOffset = closingLineIsIndentOnly
      ? source.start + closingLineStart
      : source.start + block.close
    const newText = closingLineIsIndentOnly
      ? `${rendered}\n`
      : `\n${rendered}\n${ownerIndent}`
    return plan(source.document.uri, [editAt(source.document.text, insertionOffset, insertionOffset, newText)], affectedElementIds)
  }

  delete(target: SemanticElement): StructuredSourceEditPlan {
    const source = this.declaration(target)
    const [start, end] = expandWholeLines(source.document.text, source.start, source.end)
    return plan(source.document.uri, [editAt(source.document.text, start, end, '')], [target.id])
  }

  move(target: SemanticElement, owner: SemanticElement): StructuredSourceEditPlan {
    if (target.id === owner.id || this.isDescendant(owner, target.id)) {
      throw new StructuredSourceEditError('Move would create an ownership cycle')
    }
    if (target.ownerId === owner.id) {
      throw new StructuredSourceEditError('Element is already owned by the target owner')
    }
    const source = this.declaration(target)
    const targetDelete = this.delete(target).edits.changes[source.document.uri]![0]!
    const ownerInsert = this.insertInOwner(owner, reindent(source.text), [owner.id])
      .edits.changes[owner.source.uri]![0]!
    const changes: Record<string, WorkbenchTextEdit[]> = {
      [source.document.uri]: [targetDelete],
    }
    changes[owner.source.uri] = [
      ...(changes[owner.source.uri] ?? []),
      ownerInsert,
    ]
    return {
      edits: { changes },
      affectedElementIds: [target.id, owner.id],
    }
  }

  replaceType(target: SemanticElement, typeName: string): StructuredSourceEditPlan {
    if (!target.kind.endsWith('Usage')) {
      throw new StructuredSourceEditError('Type changes are limited to usages')
    }
    const source = this.declaration(target)
    const type = qualifiedName(typeName)
    const name = tokenRange(source.text, target.name)
    const tail = source.text.slice(name.end)
    const existing = /^\s*:\s*([\p{L}_][\p{L}\p{N}_]*(?:::[\p{L}_][\p{L}\p{N}_]*)*)/u.exec(tail)
    const start = existing
      ? source.start + name.end + existing[0].lastIndexOf(existing[1]!)
      : source.start + name.end
    const end = existing ? start + existing[1]!.length : start
    return plan(source.document.uri, [
      editAt(source.document.text, start, end, existing ? type : ` : ${type}`),
    ], [target.id])
  }

  replaceMultiplicity(
    target: SemanticElement,
    lower: number,
    upper: number | '*',
  ): StructuredSourceEditPlan {
    if (!Number.isInteger(lower) || lower < 0 || (upper !== '*' && (!Number.isInteger(upper) || upper < lower))) {
      throw new StructuredSourceEditError('Multiplicity bounds are invalid')
    }
    const source = this.declaration(target)
    const name = tokenRange(source.text, target.name)
    const tail = source.text.slice(name.end)
    const existing = /\[\s*\d+\s*\.\.\s*(?:\d+|\*)\s*\]/u.exec(tail)
    const text = `[${lower}..${upper}]`
    if (existing?.index !== undefined) {
      const start = source.start + name.end + existing.index
      return plan(source.document.uri, [
        editAt(source.document.text, start, start + existing[0].length, text),
      ], [target.id])
    }
    const terminator = tail.search(/[;{=]/u)
    if (terminator < 0) {
      throw new StructuredSourceEditError('Cannot locate a safe multiplicity insertion point')
    }
    const offset = source.start + name.end + terminator
    return plan(source.document.uri, [
      editAt(source.document.text, offset, offset, ` ${text}`),
    ], [target.id])
  }

  updateDocumentation(
    target: SemanticElement,
    documentation: string,
  ): StructuredSourceEditPlan {
    if (documentation.includes('*/')) {
      throw new StructuredSourceEditError('Documentation contains a block-comment terminator')
    }
    const source = this.declaration(target)
    let existing: DirectDocumentation | null
    try {
      existing = directDocumentation(source.text)
    } catch (error) {
      throw new StructuredSourceEditError(
        error instanceof Error ? error.message : 'Documentation source is malformed',
      )
    }
    const rendered = `doc /* ${documentation.trim()} */`
    if (existing) {
      const start = source.start + existing.start
      return plan(source.document.uri, [
        editAt(source.document.text, start, source.start + existing.end, rendered),
      ], [target.id])
    }
    return this.insertInOwner(target, rendered, [target.id])
  }

  setAttributeValue(
    target: SemanticElement,
    value: string | number | boolean,
  ): StructuredSourceEditPlan {
    if (target.kind !== 'AttributeUsage') {
      throw new StructuredSourceEditError(
        'Attribute value changes are limited to AttributeUsage declarations',
      )
    }
    const source = this.declaration(target)
    const name = escapeRegex(target.name)
    const literalPattern = '(?:"(?:\\\\.|[^"\\\\])*"|true|false|[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?)'
    const pattern = new RegExp(
      `^\\s*attribute\\s+${name}\\s*:\\s*[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*\\s*=\\s*(?<literal>${literalPattern})\\s*;\\s*$`,
      'u',
    )
    const match = pattern.exec(source.text)
    if (!match?.groups?.literal || match.index === undefined) {
      throw new StructuredSourceEditError(
        'Attribute value change only supports a simple typed literal AttributeUsage',
      )
    }
    const assignment = /=\s*/u.exec(match[0])
    if (!assignment) {
      throw new StructuredSourceEditError('Attribute literal range could not be located')
    }
    const literalStart = match.index + assignment.index + assignment[0].length
    return plan(source.document.uri, [
      editAt(
        source.document.text,
        source.start + literalStart,
        source.start + literalStart + match.groups.literal.length,
        literal(value),
      ),
    ], [target.id])
  }

  contributorField(command: Extract<ContributorFieldCommand, { kind: 'set-quantity-value' | 'set-reference-target' | 'set-interface-agreement' }>): StructuredSourceEditPlan {
    const target = this.editable(command.targetId)
    const source = this.declaration(target)
    const edits: WorkbenchTextEdit[] = []
    const affected = new Set([target.id])
    const replace = (range: { start: number; end: number }, text: string): void => {
      if (source.text.slice(range.start, range.end) !== text) edits.push(editAt(source.document.text, source.start + range.start, source.start + range.end, text))
    }
    if (command.kind === 'set-quantity-value') {
      const field = quantityField(target, source.text, this.snapshot, source.document.text)
      if (!field) throw new StructuredSourceEditError('Unsupported quantity declaration; expected a supported typed literal with explicit unit')
      const unit = field.units.find((entry) => entry.id === command.unitId)
      if (!unit) throw new StructuredSourceEditError('Unit is unknown or incompatible with the quantity dimension')
      if (typeof command.value !== 'number' || !Number.isFinite(command.value)) throw new StructuredSourceEditError('Quantity value must be a finite number')
      if (command.value !== field.value) replace(field.numberRange, String(command.value))
      if (unit.id !== field.unitId) replace(field.unitRange, unit.expression)
    } else if (command.kind === 'set-reference-target') {
      const field = referenceField(target, source.text, this.snapshot, source.document.text)
      if (!field) throw new StructuredSourceEditError('Unsupported reference declaration or unresolved semantic type')
      const chosen = field.candidates.find((entry) => entry.id === command.referencedElementId)
      if (!chosen) throw new StructuredSourceEditError('Reference target must have the same semantic type and supported source scope')
      if (chosen.id !== field.referencedElementId) replace(field.valueRange, qualifiedName(chosen.qualifiedName))
      affected.add(chosen.id)
      affected.add(field.referencedElementId)
    } else {
      const field = interfaceAgreementField(target, source.text, this.snapshot, source.document.text)
      if (!field) throw new StructuredSourceEditError('Unsupported interface agreement; explicit endpoint and typed agreement fields are required')
      const from = field.sourceCandidates.find((entry) => entry.id === command.sourceId)
      const to = field.targetCandidates.find((entry) => entry.id === command.targetEndpointId)
      if (!from || !to || from.id === to.id) throw new StructuredSourceEditError('Interface endpoints must be distinct compatible ports in the supported source scope')
      if (!AGREEMENT_STATUSES.includes(command.status)) throw new StructuredSourceEditError('Unknown recorded agreement status')
      if (typeof command.owner !== 'string' || typeof command.rationale !== 'string' || command.owner.length > 512 || command.rationale.length > 8000) throw new StructuredSourceEditError('Agreement owner/rationale must be bounded text')
      if (command.status !== 'draft' && (!command.owner.trim() || !command.rationale.trim())) throw new StructuredSourceEditError('A non-draft recorded agreement requires an owner and rationale')
      if (from.id !== field.sourceId) replace(field.ranges.source, qualifiedName(from.qualifiedName))
      if (to.id !== field.targetEndpointId) replace(field.ranges.target, qualifiedName(to.qualifiedName))
      replace(field.ranges.status, `${field.statusType}::${command.status}`)
      if (command.owner.trim() !== field.owner) replace(field.ranges.owner, literal(command.owner.trim()))
      if (command.rationale.trim() !== field.rationale) replace(field.ranges.rationale, literal(command.rationale.trim()))
      for (const id of [from.id, to.id, field.sourceId, field.targetEndpointId]) affected.add(id)
    }
    if (!edits.length) throw new StructuredSourceEditError('Contributor command contains no changes')
    return plan(source.document.uri, edits, [...affected])
  }

  private declaration(element: SemanticElement): {
    document: CommandWorkspaceDocument
    start: number
    end: number
    text: string
  } {
    const document = this.documents.get(element.source.uri)
    if (!document) {
      throw new StructuredSourceEditError(`Source document is unavailable: ${element.id}`)
    }
    const start = offsetAt(document.text, element.source.range.start)
    const end = offsetAt(document.text, element.source.range.end)
    const text = document.text.slice(start, end)
    const prefix = declarationPrefix(element.kind)
    const prefixPattern = prefix.split(/\s+/u).map(escapeRegex).join('\\s+')
    const pattern = new RegExp(
      `\\b${prefixPattern}\\s+${escapeRegex(element.name)}\\b`,
      'u',
    )
    if (!pattern.test(text)) {
      throw new StructuredSourceEditError(
        `Language authority did not provide a full declaration range: ${element.id}`,
      )
    }
    return { document, start, end, text }
  }

  private isDescendant(candidate: SemanticElement, ancestorId: string): boolean {
    let current: SemanticElement | undefined = candidate
    while (current?.ownerId) {
      if (current.ownerId === ancestorId) return true
      current = this.snapshot.elements.find((item) => item.id === current!.ownerId)
    }
    return false
  }
}

function renderElement(
  kind: NormalizedElementKind,
  nameValue: string,
  typeQualifiedName?: string,
): string {
  if (kind === 'OpaqueElement' || kind === 'TransitionUsage') {
    throw new StructuredSourceEditError(`Element kind is not creatable: ${kind}`)
  }
  const name = identifier(nameValue)
  const prefix = declarationPrefix(kind)
  const definition = kind === 'Package' || kind.endsWith('Definition')
  const type = typeQualifiedName ? ` : ${qualifiedName(typeQualifiedName)}` : ''
  if (definition) return `${prefix} ${name} {\n}`
  return `${prefix} ${name}${type};`
}

function renderRelationship(
  command: Extract<WorkbenchCommand, { kind: 'create-relationship' }>,
  source: SemanticElement,
  target: SemanticElement,
): string {
  const name = command.name ? ` ${identifier(command.name)}` : ''
  const sourceName = qualifiedName(source.qualifiedName)
  const targetName = qualifiedName(target.qualifiedName)
  switch (command.relationshipKind) {
    case 'connection':
      return `connection${name} connect ${sourceName} to ${targetName};`
    case 'interface':
      return `interface${name} connect ${sourceName} to ${targetName};`
    case 'flow':
      if (!command.itemQualifiedName) {
        throw new StructuredSourceEditError('Flow creation requires an item type')
      }
      return `flow${name} of ${qualifiedName(command.itemQualifiedName)} from ${sourceName} to ${targetName};`
    case 'satisfaction':
      return `satisfy requirement ${targetName} by ${sourceName};`
    case 'verification':
      return `verify requirement ${targetName} by ${sourceName};`
  }
}

function declarationPrefix(kind: NormalizedElementKind): string {
  const prefixes: Record<Exclude<NormalizedElementKind, 'OpaqueElement'>, string> = {
    Package: 'package',
    PartDefinition: 'part def',
    PartUsage: 'part',
    PortDefinition: 'port def',
    PortUsage: 'port',
    ConnectionDefinition: 'connection def',
    ConnectionUsage: 'connection',
    InterfaceDefinition: 'interface def',
    InterfaceUsage: 'interface',
    FlowDefinition: 'flow def',
    FlowUsage: 'flow',
    RequirementDefinition: 'requirement def',
    RequirementUsage: 'requirement',
    VerificationDefinition: 'verification def',
    VerificationUsage: 'verification',
    ActionDefinition: 'action def',
    ActionUsage: 'action',
    StateDefinition: 'state def',
    StateUsage: 'state',
    TransitionUsage: 'transition',
    AttributeDefinition: 'attribute def',
    AttributeUsage: 'attribute',
    ItemDefinition: 'item def',
    ItemUsage: 'item',
    ConstraintDefinition: 'constraint def',
    ConstraintUsage: 'constraint',
    AnalysisDefinition: 'analysis def',
    AnalysisUsage: 'analysis',
    MetadataDefinition: 'metadata def',
    MetadataUsage: 'metadata',
  }
  if (kind === 'OpaqueElement') {
    throw new StructuredSourceEditError('Opaque declarations are not editable')
  }
  return prefixes[kind]
}

function plan(
  uri: string,
  edits: WorkbenchTextEdit[],
  affectedElementIds: string[],
): StructuredSourceEditPlan {
  return { edits: { changes: { [uri]: edits } }, affectedElementIds }
}

function editAt(
  text: string,
  start: number,
  end: number,
  newText: string,
): WorkbenchTextEdit {
  return {
    range: { start: positionAt(text, start), end: positionAt(text, end) },
    newText,
  }
}

function findBlock(text: string): { open: number; close: number } | null {
  let open = -1
  let depth = 0
  let quote = ''
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]!
    const next = text[index + 1] ?? ''
    if (lineComment) {
      if (current === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (current === '\\') index += 1
      else if (current === quote) quote = ''
      continue
    }
    if (current === '/' && next === '/') {
      lineComment = true
      index += 1
    } else if (current === '/' && next === '*') {
      blockComment = true
      index += 1
    } else if (current === '"' || current === "'") {
      quote = current
    } else if (current === '{') {
      if (open < 0) open = index
      depth += 1
    } else if (current === '}' && open >= 0) {
      depth -= 1
      if (depth === 0) return { open, close: index }
    }
  }
  return null
}

function tokenRange(text: string, name: string): { start: number; end: number } {
  const match = new RegExp(`\\b${escapeRegex(name)}\\b`, 'u').exec(text)
  if (!match || match.index === undefined) {
    throw new StructuredSourceEditError(`Cannot locate declaration name: ${name}`)
  }
  return { start: match.index, end: match.index + name.length }
}

function expandWholeLines(text: string, start: number, end: number): [number, number] {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextNewline = text.indexOf('\n', end)
  const lineEnd = nextNewline < 0 ? text.length : nextNewline + 1
  if (
    /^\s*$/u.test(text.slice(lineStart, start)) &&
    /^\s*$/u.test(text.slice(end, nextNewline < 0 ? text.length : nextNewline))
  ) {
    return [lineStart, lineEnd]
  }
  return [start, end]
}

function reindent(text: string): string {
  const lines = text.trim().split('\n')
  const indentation = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/u)![0].length),
  )
  return lines.map((line) => line.slice(indentation)).join('\n')
}

function lineIndent(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  return /^\s*/u.exec(text.slice(start, offset))![0]
}

function identifier(value: string): string {
  if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(value)) {
    throw new StructuredSourceEditError(`Invalid SysML identifier: ${value}`)
  }
  return value
}

function qualifiedName(value: string): string {
  const parts = value.split('::')
  if (parts.length === 0) throw new StructuredSourceEditError('Qualified name is empty')
  return parts.map(identifier).join('::')
}

function literal(value: string | number | boolean): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new StructuredSourceEditError('Property number must be finite')
  }
  if (typeof value !== 'number' && typeof value !== 'boolean') {
    throw new StructuredSourceEditError(
      'Property value must be a finite number, string, or boolean',
    )
  }
  return String(value)
}

function offsetAt(text: string, position: WorkbenchRange['start']): number {
  const starts = lineStarts(text)
  const start = starts[position.line]
  if (start === undefined) throw new StructuredSourceEditError('Source range line is invalid')
  const offset = start + position.character
  if (offset > (starts[position.line + 1] ?? text.length)) {
    throw new StructuredSourceEditError('Source range character is invalid')
  }
  return offset
}

function positionAt(text: string, offset: number): WorkbenchRange['start'] {
  const starts = lineStarts(text)
  let line = 0
  while (line + 1 < starts.length && starts[line + 1]! <= offset) line += 1
  return { line, character: offset - starts[line]! }
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
