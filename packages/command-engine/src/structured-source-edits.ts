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
  WorkbenchCommand,
} from './index.js'

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
  command: Exclude<WorkbenchCommand, { kind: 'rename-element' | 'replace-document' | 'undo-command' | 'redo-command' }>,
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
    const closingIndent = source.text.slice(closingLineStart, block.close)
    const ownerIndent = lineIndent(source.document.text, source.start)
    const childIndent = `${ownerIndent}    `
    const rendered = declaration
      .split('\n')
      .map((line) => `${childIndent}${line}`)
      .join('\n')
    const insertionOffset = closingLineStart > block.open
      ? source.start + closingLineStart
      : source.start + block.close
    const newText = closingLineStart > block.open
      ? `${rendered}\n`
      : `\n${rendered}\n${closingIndent}`
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
    const existing = /\bdoc\s*\/\*[\s\S]*?\*\//u.exec(source.text)
    const rendered = `doc /* ${documentation.trim()} */`
    if (existing?.index !== undefined) {
      const start = source.start + existing.index
      return plan(source.document.uri, [
        editAt(source.document.text, start, start + existing[0].length, rendered),
      ], [target.id])
    }
    return this.insertInOwner(target, rendered, [target.id])
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
