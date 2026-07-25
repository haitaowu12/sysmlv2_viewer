import { createHash } from 'node:crypto'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  WorkbenchDocumentSymbol,
  WorkbenchRange,
  WorkspaceStatusResult,
} from '../../workbench-protocol/src/index.js'
import type {
  LanguageAdapterMetadata,
  WorkspaceDocument,
} from '../../language-adapter/src/index.js'
import {
  IdentityRegistry,
  type IdentityLocator,
} from './identity-registry.js'

export const SEMANTIC_SNAPSHOT_SCHEMA_VERSION = 1
const MAX_SNAPSHOT_ELEMENTS = 100_000
const MAX_SYMBOL_DEPTH = 256

export type NormalizedElementKind =
  | 'Package'
  | 'PartDefinition'
  | 'PartUsage'
  | 'PortDefinition'
  | 'PortUsage'
  | 'ConnectionDefinition'
  | 'ConnectionUsage'
  | 'InterfaceDefinition'
  | 'InterfaceUsage'
  | 'RequirementDefinition'
  | 'RequirementUsage'
  | 'VerificationDefinition'
  | 'VerificationUsage'
  | 'ActionDefinition'
  | 'ActionUsage'
  | 'StateDefinition'
  | 'StateUsage'
  | 'TransitionUsage'
  | 'AttributeDefinition'
  | 'AttributeUsage'
  | 'ItemDefinition'
  | 'ItemUsage'
  | 'ConstraintDefinition'
  | 'ConstraintUsage'
  | 'AnalysisDefinition'
  | 'AnalysisUsage'
  | 'MetadataDefinition'
  | 'MetadataUsage'
  | 'OpaqueElement'

export const NORMALIZED_ELEMENT_KINDS: readonly NormalizedElementKind[] = [
  'Package',
  'PartDefinition',
  'PartUsage',
  'PortDefinition',
  'PortUsage',
  'ConnectionDefinition',
  'ConnectionUsage',
  'InterfaceDefinition',
  'InterfaceUsage',
  'RequirementDefinition',
  'RequirementUsage',
  'VerificationDefinition',
  'VerificationUsage',
  'ActionDefinition',
  'ActionUsage',
  'StateDefinition',
  'StateUsage',
  'TransitionUsage',
  'AttributeDefinition',
  'AttributeUsage',
  'ItemDefinition',
  'ItemUsage',
  'ConstraintDefinition',
  'ConstraintUsage',
  'AnalysisDefinition',
  'AnalysisUsage',
  'MetadataDefinition',
  'MetadataUsage',
  'OpaqueElement',
]

export interface SemanticSource {
  uri: string
  workspacePath: string
  range: WorkbenchRange
  documentSha256: string
}

export interface SemanticElement {
  id: string
  kind: NormalizedElementKind
  rawKind: string
  name: string
  qualifiedName: string
  ownerId?: string
  source: SemanticSource
  fingerprint: string
  provenance: {
    authority: 'qualified-language-engine'
    extraction: 'document-symbol+bounded-source-classification'
    classification: 'recognized-declaration' | 'opaque'
  }
}

export interface SemanticRelationship {
  id: string
  kind: 'containment'
  sourceId: string
  targetId: string
  provenance: {
    authority: 'qualified-language-engine'
    extraction: 'document-symbol-tree'
  }
}

export interface SemanticSnapshot {
  schemaVersion: 1
  snapshotSha256: string
  workspace: {
    id: string
    rootUri: string
    configurationName: string
  }
  authority: LanguageAdapterMetadata
  freshness: 'current' | 'stale'
  documents: WorkspaceStatusResult['documents']
  elements: SemanticElement[]
  relationships: SemanticRelationship[]
}

export interface SnapshotInput {
  status: WorkspaceStatusResult
  authority: LanguageAdapterMetadata
  documents: WorkspaceDocument[]
  symbols: Map<string, WorkbenchDocumentSymbol[]>
  identities: IdentityRegistry
  freshness?: SemanticSnapshot['freshness']
}

export function buildSemanticSnapshot(input: SnapshotInput): SemanticSnapshot {
  if (input.authority.qualificationStatus !== 'qualified') {
    throw new Error('Semantic snapshot requires a qualified language authority')
  }
  const rootPath = fileURLToPath(input.status.rootUri)
  const elements: SemanticElement[] = []
  const relationships: SemanticRelationship[] = []
  const seenLocators = new Set<string>()
  const documentsByUri = new Map(
    input.documents.map((document) => [document.uri, document]),
  )

  for (const [uri, symbols] of [...input.symbols.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const document = documentsByUri.get(uri)
    if (!document) {
      throw new Error(`Semantic symbols reference an unknown document: ${uri}`)
    }
    for (const symbol of symbols) {
      appendSymbol(symbol, document, undefined, undefined, 0)
    }
  }

  elements.sort((left, right) => left.id.localeCompare(right.id))
  relationships.sort((left, right) => left.id.localeCompare(right.id))
  const snapshotWithoutHash = {
    schemaVersion: SEMANTIC_SNAPSHOT_SCHEMA_VERSION,
    workspace: {
      id: input.status.workspaceId,
      rootUri: input.status.rootUri,
      configurationName: input.status.configurationName,
    },
    authority: input.authority,
    freshness: input.freshness ?? 'current',
    documents: [...input.status.documents].sort((left, right) =>
      left.uri.localeCompare(right.uri),
    ),
    elements,
    relationships,
  } as const
  return {
    ...snapshotWithoutHash,
    snapshotSha256: sha256(
      stableJson({
        schemaVersion: snapshotWithoutHash.schemaVersion,
        workspace: {
          id: snapshotWithoutHash.workspace.id,
          configurationName: snapshotWithoutHash.workspace.configurationName,
        },
        authority: snapshotWithoutHash.authority,
        documents: snapshotWithoutHash.documents.map((document) => ({
          workspacePath: portablePath(
            relative(rootPath, fileURLToPath(document.uri)),
          ),
          languageId: document.languageId,
          sha256: document.sha256,
          byteLength: document.byteLength,
        })),
        elements: snapshotWithoutHash.elements.map((element) => ({
          ...element,
          source: {
            workspacePath: element.source.workspacePath,
            range: element.source.range,
            documentSha256: element.source.documentSha256,
          },
        })),
        relationships: snapshotWithoutHash.relationships,
      }),
    ),
  }

  function appendSymbol(
    symbol: WorkbenchDocumentSymbol,
    document: WorkspaceDocument,
    ownerId: string | undefined,
    ownerQualifiedName: string | undefined,
    depth: number,
  ): void {
    if (depth > MAX_SYMBOL_DEPTH) {
      throw new Error(
        `Semantic symbol nesting exceeds the supported depth of ${MAX_SYMBOL_DEPTH}`,
      )
    }
    if (elements.length >= MAX_SNAPSHOT_ELEMENTS) {
      throw new Error(
        `Semantic snapshot exceeds the supported limit of ${MAX_SNAPSHOT_ELEMENTS} elements`,
      )
    }
    validateRange(document.text, symbol.range)
    const qualifiedName = normalizeQualifiedName(symbol.name, ownerQualifiedName)
    const name = qualifiedName.split('::').at(-1) ?? qualifiedName
    const declaration = sourceTextForRange(document.text, symbol.range)
    const kind = classifyDeclaration(declaration)
    const workspacePath = portablePath(relative(rootPath, document.absolutePath))
    const locator: IdentityLocator = {
      workspacePath,
      qualifiedName,
      kind,
    }
    const locatorKey = [
      locator.workspacePath,
      locator.qualifiedName,
      locator.kind,
    ].join('\u0000')
    if (seenLocators.has(locatorKey)) {
      throw new Error(
        `Ambiguous semantic locator in one snapshot: ${workspacePath} ${qualifiedName} ${kind}`,
      )
    }
    seenLocators.add(locatorKey)
    const fingerprint = sha256(
      stableJson({
        kind,
        ownerQualifiedName,
        declaration: normalizeDeclaration(declaration),
      }),
    )
    const identity = input.identities.resolve(locator, fingerprint)
    elements.push({
      id: identity.id,
      kind,
      rawKind: symbol.kind,
      name,
      qualifiedName,
      ownerId,
      source: {
        uri: document.uri,
        workspacePath,
        range: symbol.range,
        documentSha256: document.sha256,
      },
      fingerprint,
      provenance: {
        authority: 'qualified-language-engine',
        extraction: 'document-symbol+bounded-source-classification',
        classification:
          kind === 'OpaqueElement' ? 'opaque' : 'recognized-declaration',
      },
    })
    if (ownerId) {
      relationships.push({
        id: `rel:${sha256(`${ownerId}\u0000${identity.id}\u0000containment`).slice(0, 32)}`,
        kind: 'containment',
        sourceId: ownerId,
        targetId: identity.id,
        provenance: {
          authority: 'qualified-language-engine',
          extraction: 'document-symbol-tree',
        },
      })
    }
    for (const child of symbol.children) {
      appendSymbol(child, document, identity.id, qualifiedName, depth + 1)
    }
  }
}

function normalizeQualifiedName(
  rawName: string,
  ownerQualifiedName: string | undefined,
): string {
  const normalized = rawName.replace(/\./g, '::')
  if (normalized.includes('::') || !ownerQualifiedName) return normalized
  return `${ownerQualifiedName}::${normalized}`
}

function sourceTextForRange(text: string, range: WorkbenchRange): string {
  const lines = text.split(/\r?\n/)
  const selected = lines.slice(range.start.line, range.end.line + 1)
  if (selected.length === 0) return ''
  selected[0] = selected[0]?.slice(range.start.character) ?? ''
  const finalIndex = selected.length - 1
  selected[finalIndex] =
    selected[finalIndex]?.slice(
      0,
      range.start.line === range.end.line
        ? range.end.character - range.start.character
        : range.end.character,
    ) ?? ''
  return selected.join('\n')
}

function validateRange(text: string, range: WorkbenchRange): void {
  const lines = text.split(/\r?\n/)
  const positions = [range.start, range.end]
  for (const position of positions) {
    if (
      !Number.isInteger(position.line) ||
      !Number.isInteger(position.character) ||
      position.line < 0 ||
      position.line >= lines.length ||
      position.character < 0 ||
      position.character > (lines[position.line]?.length ?? 0)
    ) {
      throw new Error('Language authority returned an invalid symbol range')
    }
  }
  if (
    range.end.line < range.start.line ||
    (range.end.line === range.start.line &&
      range.end.character < range.start.character)
  ) {
    throw new Error('Language authority returned a reversed symbol range')
  }
}

function normalizeDeclaration(value: string): string {
  return value
    .split(/[;{\n]/, 1)[0]!
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyDeclaration(source: string): NormalizedElementKind {
  const declaration = normalizeDeclaration(source)
    .replace(/^(?:public|private|protected)\s+/, '')
    .replace(/^(?:abstract|variation)\s+/, '')
  const definitions: Array<[RegExp, NormalizedElementKind]> = [
    [/^package\b/, 'Package'],
    [/^part\s+def\b/, 'PartDefinition'],
    [/^port\s+def\b/, 'PortDefinition'],
    [/^connection\s+def\b/, 'ConnectionDefinition'],
    [/^interface\s+def\b/, 'InterfaceDefinition'],
    [/^requirement\s+def\b/, 'RequirementDefinition'],
    [/^verification\s+def\b/, 'VerificationDefinition'],
    [/^action\s+def\b/, 'ActionDefinition'],
    [/^state\s+def\b/, 'StateDefinition'],
    [/^attribute\s+def\b/, 'AttributeDefinition'],
    [/^item\s+def\b/, 'ItemDefinition'],
    [/^constraint\s+def\b/, 'ConstraintDefinition'],
    [/^analysis\s+def\b/, 'AnalysisDefinition'],
    [/^metadata\s+def\b/, 'MetadataDefinition'],
    [/^part\b/, 'PartUsage'],
    [/^port\b/, 'PortUsage'],
    [/^(?:connect|connection)\b/, 'ConnectionUsage'],
    [/^interface\b/, 'InterfaceUsage'],
    [/^requirement\b/, 'RequirementUsage'],
    [/^(?:verify|verification)\b/, 'VerificationUsage'],
    [/^(?:perform\s+)?action\b/, 'ActionUsage'],
    [/^state\b/, 'StateUsage'],
    [/^(?:transition|succession)\b/, 'TransitionUsage'],
    [/^(?:attribute|attr)\b/, 'AttributeUsage'],
    [/^item\b/, 'ItemUsage'],
    [/^(?:require\s+|assume\s+)?constraint\b/, 'ConstraintUsage'],
    [/^analysis\b/, 'AnalysisUsage'],
    [/^metadata\b/, 'MetadataUsage'],
  ]
  return definitions.find(([pattern]) => pattern.test(declaration))?.[1] ??
    'OpaqueElement'
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function portablePath(value: string): string {
  return value.replaceAll('\\', '/')
}

export * from './identity-registry.js'
