import type { SemanticElement, SemanticSnapshot } from '../../semantic-model/src/index.js'

export interface SourceSpan { start: number; end: number }
export const AGREEMENT_STATUSES = ['draft', 'proposed', 'agreed', 'rejected'] as const
export type AgreementStatus = typeof AGREEMENT_STATUSES[number]
export interface UnitChoice { id: string; expression: string; label: string }
/** Bounded engineering profile; values are entered explicitly, never converted. */
export const QUANTITY_UNITS: Readonly<Record<string, readonly UnitChoice[]>> = {
  'ISQ::DurationValue': [{ id: 's', expression: 'SI::s', label: 'second (s)' }, { id: 'ms', expression: 'SI::milli * SI::s', label: 'millisecond (ms)' }],
  'ISQ::LengthValue': [{ id: 'm', expression: 'SI::m', label: 'metre (m)' }, { id: 'mm', expression: 'SI::milli * SI::m', label: 'millimetre (mm)' }],
  'ISQ::MassValue': [{ id: 'kg', expression: 'SI::kg', label: 'kilogram (kg)' }, { id: 'g', expression: 'SI::g', label: 'gram (g)' }],
}
const namePattern = '[\\p{L}_][\\p{L}\\p{N}_]*'
const qualifiedPattern = `${namePattern}(?:::${namePattern})*`
const numberPattern = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?'
const stringPattern = '"(?:\\\\.|[^"\\\\])*"'
function hasAliasDeclaration(text: string): boolean {
  const tokens = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu, ' ')
  return /\balias\s/u.test(tokens)
}
function escape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function span(match: RegExpExecArray, group: string): SourceSpan {
  const ranges = (match as RegExpExecArray & { indices?: { groups?: Record<string, [number, number]> } }).indices?.groups
  const range = ranges?.[group]
  if (!range) throw new Error('Contributor source span is unavailable')
  return { start: range[0], end: range[1] }
}
export interface QuantityField {
  value: number; unitId: string; unitExpression: string; quantityType: string
  units: readonly UnitChoice[]; valueRange: SourceSpan; numberRange: SourceSpan; unitRange: SourceSpan
}
export function quantityField(element: SemanticElement, declaration: string, snapshot?: SemanticSnapshot, documentText?: string): QuantityField | null {
  if (documentText && hasAliasDeclaration(documentText)) return null
  if (snapshot?.elements.some((entry) => entry.name === 'ISQ' || entry.name === 'SI')) return null
  if (element.kind !== 'AttributeUsage') return null
  const match = new RegExp(`^\\s*attribute\\s+${escape(element.name)}\\s*:\\s*(?<type>${qualifiedPattern})\\s*=\\s*(?<expression>(?<value>${numberPattern})\\s*\\[\\s*(?<unit>${qualifiedPattern}(?:\\s*\\*\\s*${qualifiedPattern})?)\\s*\\])\\s*;\\s*$`, 'du').exec(declaration)
  if (!match?.groups) return null
  const { type, value, unit } = match.groups
  const units = QUANTITY_UNITS[type!]
  const unitChoice = units?.find((entry) => entry.expression.replace(/\s/g, '') === unit!.replace(/\s/g, ''))
  if (!unitChoice || !roundTripsNumericLiteral(value!)) return null
  return { value: Number(value), unitId: unitChoice.id, unitExpression: unitChoice.expression, quantityType: type!, units: units!, valueRange: span(match, 'expression'), numberRange: span(match, 'value'), unitRange: span(match, 'unit') }
}
/** Reject decimal literals whose value would change at the bounded binary64 command boundary. */
export function roundTripsNumericLiteral(value: string): boolean {
  if (value.length > 128 || !new RegExp(`^${numberPattern}$`, 'u').test(value) || !Number.isFinite(Number(value))) return false
  const normalized = (literal: string): string => {
    const [mantissa, exponentText = '0'] = literal.toLowerCase().split('e')
    const negative = mantissa!.startsWith('-')
    const unsigned = mantissa!.replace(/^[-+]/u, '')
    const fractionDigits = unsigned.includes('.') ? unsigned.length - unsigned.indexOf('.') - 1 : 0
    let digits = unsigned.replace('.', '').replace(/^0+/u, '')
    if (!digits) return '0'
    let exponent = BigInt(exponentText) - BigInt(fractionDigits)
    while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent += 1n }
    return `${negative ? '-' : ''}${digits}e${exponent}`
  }
  return normalized(value) === normalized(String(Number(value)))
}
function typedIdentity(element: SemanticElement, snapshot: SemanticSnapshot): string | null {
  const ids = [...new Set(snapshot.relationships.filter((relation) => relation.kind === 'typing' && relation.sourceId === element.id).map((relation) => relation.targetId))]
  return ids.length === 1 ? ids[0]! : null
}
function uniquelyNamed(snapshot: SemanticSnapshot, name: string): SemanticElement | null {
  const matches = snapshot.elements.filter((element) => element.qualifiedName === name)
  return matches.length === 1 ? matches[0]! : null
}
function resolveName(snapshot: SemanticSnapshot, name: string, context: SemanticElement): SemanticElement | null {
  let ownerId = context.ownerId
  const visited = new Set<string>()
  while (ownerId && !visited.has(ownerId)) {
    visited.add(ownerId)
    const owner = snapshot.elements.find((candidate) => candidate.id === ownerId)
    if (!owner) return null
    const resolved = uniquelyNamed(snapshot, `${owner.qualifiedName}::${name}`)
    if (resolved) return resolved
    ownerId = owner.ownerId
  }
  return uniquelyNamed(snapshot, name)
}
function unshadowedPath(snapshot: SemanticSnapshot, name: string, context: SemanticElement): boolean {
  const first = name.split('::')[0]!
  const root = uniquelyNamed(snapshot, first)
  let ownerId = context.ownerId
  const visited = new Set<string>()
  while (ownerId && !visited.has(ownerId)) {
    visited.add(ownerId)
    if (snapshot.elements.some((entry) => entry.ownerId === ownerId && entry.name === first && entry.id !== root?.id)) return false
    ownerId = snapshot.elements.find((entry) => entry.id === ownerId)?.ownerId
  }
  return true
}
function elementSource(element: SemanticElement, documentText: string): string | null {
  const lines = documentText.split('\n')
  const offset = (position: { line: number; character: number }): number | null => {
    if (position.line < 0 || position.line >= lines.length || position.character < 0 || position.character > lines[position.line]!.length) return null
    return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character
  }
  const start = offset(element.source.range.start), end = offset(element.source.range.end)
  return start === null || end === null || end < start ? null : documentText.slice(start, end)
}
function portType(element: SemanticElement, snapshot: SemanticSnapshot, documentText: string): string | null {
  const source = elementSource(element, documentText)
  if (!source) return null
  const match = new RegExp(`^\\s*port\\s+${escape(element.name)}\\s*:\\s*(?<conjugated>~?)\\s*(?<type>${qualifiedPattern})\\s*;\\s*$`, 'u').exec(source)
  if (!match?.groups) return null
  const type = resolveName(snapshot, match.groups.type!, element)
  if (type?.kind !== 'PortDefinition') return null
  const engineType = typedIdentity(element, snapshot)
  if (engineType && engineType !== type.id) return null
  return `${match.groups.conjugated}${type.id}`
}
/** Conservative profile: same document and owning scope, one identical semantic type. */
function compatible(element: SemanticElement, snapshot: SemanticSnapshot): SemanticElement[] {
  const typeId = typedIdentity(element, snapshot)
  if (!typeId) return []
  return snapshot.elements.filter((candidate) => candidate.id !== element.id && candidate.kind === element.kind &&
    candidate.ownerId === element.ownerId && candidate.source.uri === element.source.uri &&
    candidate.provenance.classification !== 'opaque' && typedIdentity(candidate, snapshot) === typeId &&
    unshadowedPath(snapshot, candidate.qualifiedName, element) && resolveName(snapshot, candidate.qualifiedName, element)?.id === candidate.id &&
    new RegExp(`^${qualifiedPattern}$`, 'u').test(candidate.qualifiedName))
}
export interface ReferenceField {
  referencedElementId: string; referenceQualifiedName: string
  candidates: SemanticElement[]; valueRange: SourceSpan
}
export function referenceField(element: SemanticElement, declaration: string, snapshot: SemanticSnapshot, documentText?: string): ReferenceField | null {
  if (!documentText || hasAliasDeclaration(documentText)) return null
  const kind = { PartUsage: 'part', PortUsage: 'port', ItemUsage: 'item' }[element.kind as 'PartUsage' | 'PortUsage' | 'ItemUsage']
  if (!kind) return null
  const match = new RegExp(`^\\s*ref\\s+${kind}\\s+${escape(element.name)}\\s*:\\s*(?<type>${qualifiedPattern})\\s*=\\s*(?<reference>${qualifiedPattern})\\s*;\\s*$`, 'du').exec(declaration)
  if (!match?.groups) return null
  const typeId = typedIdentity(element, snapshot)
  const type = snapshot.elements.find((candidate) => candidate.id === typeId)
  if (!type || resolveName(snapshot, match.groups.type!, element)?.id !== type.id) return null
  const target = resolveName(snapshot, match.groups.reference!, element)
  const candidates = compatible(element, snapshot).filter((candidate) => {
    const candidateSource = elementSource(candidate, documentText)
    if (!candidateSource) return false
    const concrete = new RegExp(`^\\s*${kind}\\s+${escape(candidate.name)}\\s*:\\s*(?<type>${qualifiedPattern})\\s*;\\s*$`, 'u').exec(candidateSource)
    return !!concrete?.groups && resolveName(snapshot, concrete.groups.type!, candidate)?.id === typeId
  })
  if (!target || !candidates.some((candidate) => candidate.id === target.id)) return null
  return { referencedElementId: target.id, referenceQualifiedName: target.qualifiedName, candidates, valueRange: span(match, 'reference') }
}
export interface InterfaceAgreementField {
  sourceId: string; targetEndpointId: string; status: AgreementStatus; owner: string; rationale: string
  sourceCandidates: SemanticElement[]; targetCandidates: SemanticElement[]
  ranges: { source: SourceSpan; target: SourceSpan; status: SourceSpan; owner: SourceSpan; rationale: SourceSpan }
  statusType: string
}
/** Existing, explicit source fields. The profile records a disposition, not authenticated approval. */
export function interfaceAgreementField(element: SemanticElement, declaration: string, snapshot: SemanticSnapshot, documentText?: string): InterfaceAgreementField | null {
  if (element.kind !== 'InterfaceUsage' || !documentText || hasAliasDeclaration(documentText)) return null
  const header = new RegExp(`^\\s*interface\\s+${escape(element.name)}\\s+connect\\s+(?<source>${qualifiedPattern})\\s+to\\s+(?<target>${qualifiedPattern})\\s*\\{`, 'du').exec(declaration)
  if (!header?.groups || !/\}\s*$/u.test(declaration)) return null
  const source = resolveName(snapshot, header.groups.source!, element)
  const target = resolveName(snapshot, header.groups.target!, element)
  if (!source || !target || source.kind !== 'PortUsage' || target.kind !== 'PortUsage' || source.id === target.id) return null
  if (source.source.uri !== element.source.uri || target.source.uri !== element.source.uri) return null
  const bodyStart = header[0].length
  const body = declaration.slice(bodyStart, declaration.lastIndexOf('}'))
  // Mask nested bodies/comments/strings before locating top-level attribute starts.
  const starts = directAttributeStarts(body)
  if (!starts) return null
  function field(name: string, type: string, value: string): RegExpExecArray | null {
    const namedStarts = starts!.filter((start) => new RegExp(`^attribute\\s+${name}\\b`, 'u').test(body.slice(start)))
    if (namedStarts.length !== 1) return null
    const matches = namedStarts.flatMap((start) => {
      const match = new RegExp(`^attribute\\s+${name}\\s*:\\s*(?<type>${type})\\s*=\\s*(?<value>${value})\\s*;`, 'du').exec(body.slice(start))
      if (!match) return []
      const range = span(match, 'value')
      const indices = (match as RegExpExecArray & { indices: { groups: Record<string, [number, number]> } }).indices
      indices.groups.value = [range.start + bodyStart + start, range.end + bodyStart + start]
      return [match]
    })
    return matches.length === 1 ? matches[0]! : null
  }
  const status = field('agreementStatus', qualifiedPattern, qualifiedPattern)
  const owner = field('agreementOwner', 'ScalarValues::String', stringPattern)
  const rationale = field('agreementRationale', 'ScalarValues::String', stringPattern)
  if (!status?.groups || !owner?.groups || !rationale?.groups) return null
  const statusValue = status.groups.value!.slice(status.groups.type!.length + 2)
  if (status.groups.value !== `${status.groups.type}::${statusValue}` || !AGREEMENT_STATUSES.includes(statusValue as AgreementStatus)) return null
  try {
    const ownerValue: unknown = JSON.parse(owner.groups.value!)
    const rationaleValue: unknown = JSON.parse(rationale.groups.value!)
    if (typeof ownerValue !== 'string' || typeof rationaleValue !== 'string') return null
    if (!documentText) return null
    const sourceType = portType(source, snapshot, documentText)
    const targetType = portType(target, snapshot, documentText)
    if (!sourceType || !targetType) return null
    const ports = snapshot.elements.filter((candidate) => candidate.kind === 'PortUsage' && candidate.source.uri === element.source.uri && candidate.provenance.classification !== 'opaque' && unshadowedPath(snapshot, candidate.qualifiedName, element) && resolveName(snapshot, candidate.qualifiedName, element)?.id === candidate.id)
    const sourceCandidates = ports.filter((candidate) => candidate.ownerId === source.ownerId && candidate.id !== target.id && portType(candidate, snapshot, documentText) === sourceType)
    const targetCandidates = ports.filter((candidate) => candidate.ownerId === target.ownerId && candidate.id !== source.id && portType(candidate, snapshot, documentText) === targetType)
    return { sourceId: source.id, targetEndpointId: target.id, status: statusValue as AgreementStatus, owner: ownerValue, rationale: rationaleValue,
      sourceCandidates, targetCandidates, statusType: status.groups.type!,
      ranges: { source: span(header, 'source'), target: span(header, 'target'), status: span(status, 'value'), owner: span(owner, 'value'), rationale: span(rationale, 'value') } }
  } catch { return null }
}
function directAttributeStarts(text: string): number[] | null {
  const starts: number[] = []
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (text.startsWith('//', index)) { const end = text.indexOf('\n', index); index = end < 0 ? text.length : end; continue }
    if (text.startsWith('/*', index)) { const end = text.indexOf('*/', index + 2); if (end < 0) return null; index = end + 1; continue }
    if (character === '"' || character === "'") {
      let closed = false
      for (index += 1; index < text.length; index += 1) {
        if (text[index] === '\\') index += 1
        else if (text[index] === character) { closed = true; break }
      }
      if (!closed) return null
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') { depth -= 1; if (depth < 0) return null }
    if (depth === 0 && text.startsWith('attribute', index) && !/[\p{L}\p{N}_]/u.test(text[index - 1] ?? '') && /\s/u.test(text[index + 9] ?? '')) starts.push(index)
  }
  return depth === 0 ? starts : null
}
