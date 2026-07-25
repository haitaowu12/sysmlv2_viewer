import { createHash } from 'node:crypto'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  WorkbenchRange,
  WorkspaceStatusResult,
} from '../../workbench-protocol/src/index.js'
import type {
  EngineSemanticElementEvidence,
  EngineSemanticEvidence,
  EngineSemanticRelationshipEvidence,
  LanguageAdapterMetadata,
  WorkspaceDocument,
} from '../../language-adapter/src/index.js'
import {
  IdentityRegistry,
  type IdentityLocator,
} from './identity-registry.js'

export const SEMANTIC_SNAPSHOT_SCHEMA_VERSION = 1
const MAX_SNAPSHOT_ELEMENTS = 100_000
const MAX_SNAPSHOT_RELATIONSHIPS = 1_000_000

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
  | 'FlowDefinition'
  | 'FlowUsage'
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
  'FlowDefinition',
  'FlowUsage',
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

export type SemanticRelationshipKind =
  | 'containment'
  | 'typing'
  | 'dependency'
  | 'satisfaction'
  | 'verification'
  | 'connection'
  | 'flow'
  | 'interface'

export const SEMANTIC_RELATIONSHIP_KINDS: readonly SemanticRelationshipKind[] = [
  'containment',
  'typing',
  'dependency',
  'satisfaction',
  'verification',
  'connection',
  'flow',
  'interface',
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
    extraction: 'pilot-emf-semantic-evidence'
    classification: 'engine-metaclass' | 'opaque'
    engineId: string
  }
}

export interface SemanticRelationship {
  id: string
  kind: SemanticRelationshipKind
  sourceId: string
  targetId: string
  provenance: {
    authority: 'qualified-language-engine'
    extraction: 'pilot-emf-explicit-reference'
    engineMetaclass: string
    features: string[]
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
  evidence: Map<string, EngineSemanticEvidence>
  identities: IdentityRegistry
  freshness?: SemanticSnapshot['freshness']
}

interface RawElement {
  evidence: EngineSemanticElementEvidence
  document: WorkspaceDocument
}

const METACLASS_KIND: Readonly<Record<string, NormalizedElementKind>> = {
  Package: 'Package',
  PartDefinition: 'PartDefinition',
  PartUsage: 'PartUsage',
  PortDefinition: 'PortDefinition',
  PortUsage: 'PortUsage',
  ConnectionDefinition: 'ConnectionDefinition',
  ConnectionUsage: 'ConnectionUsage',
  InterfaceDefinition: 'InterfaceDefinition',
  InterfaceUsage: 'InterfaceUsage',
  FlowDefinition: 'FlowDefinition',
  FlowUsage: 'FlowUsage',
  RequirementDefinition: 'RequirementDefinition',
  RequirementUsage: 'RequirementUsage',
  VerificationCaseDefinition: 'VerificationDefinition',
  VerificationCaseUsage: 'VerificationUsage',
  ActionDefinition: 'ActionDefinition',
  ActionUsage: 'ActionUsage',
  StateDefinition: 'StateDefinition',
  StateUsage: 'StateUsage',
  TransitionUsage: 'TransitionUsage',
  SuccessionAsUsage: 'TransitionUsage',
  AttributeDefinition: 'AttributeDefinition',
  AttributeUsage: 'AttributeUsage',
  ItemDefinition: 'ItemDefinition',
  ItemUsage: 'ItemUsage',
  ConstraintDefinition: 'ConstraintDefinition',
  ConstraintUsage: 'ConstraintUsage',
  AnalysisCaseDefinition: 'AnalysisDefinition',
  AnalysisCaseUsage: 'AnalysisUsage',
  MetadataDefinition: 'MetadataDefinition',
  MetadataUsage: 'MetadataUsage',
}

const INFRASTRUCTURE_METACLAS = new Set([
  'Namespace',
  'Documentation',
  'Multiplicity',
  'Feature',
  'ReferenceUsage',
  'PayloadFeature',
  'FlowEnd',
  'SatisfyRequirementUsage',
  'FeatureReferenceExpression',
  'ConjugatedPortDefinition',
])

export function buildSemanticSnapshot(input: SnapshotInput): SemanticSnapshot {
  input.identities.beginSnapshot()
  try {
    const snapshot = buildSemanticSnapshotWithinReconciliation(input)
    input.identities.completeSnapshot()
    return snapshot
  } catch (error) {
    input.identities.abortSnapshot()
    throw error
  }
}

function buildSemanticSnapshotWithinReconciliation(input: SnapshotInput): SemanticSnapshot {
  if (input.authority.qualificationStatus !== 'qualified') {
    throw new Error('Semantic snapshot requires a qualified language authority')
  }
  const rootPath = fileURLToPath(input.status.rootUri)
  const documentsByUri = new Map(
    input.documents.map((document) => [document.uri, document]),
  )
  const rawById = collectRawEvidence(input.evidence, documentsByUri)
  const relationshipsBySource = groupRelationships(input.evidence)
  const memberChildren = membershipChildren(rawById, relationshipsBySource)
  const publicRaw = [...rawById.values()]
    .filter(isPublicElement)
    .sort(compareRawPosition)
  if (publicRaw.length > MAX_SNAPSHOT_ELEMENTS) {
    throw new Error(
      `Semantic snapshot exceeds the supported limit of ${MAX_SNAPSHOT_ELEMENTS} elements`,
    )
  }

  const semanticByEngineId = new Map<string, SemanticElement>()
  const seenLocators = new Set<string>()
  for (const raw of publicRaw) {
    const { evidence, document } = raw
    const range = evidence.range
    if (!range) continue
    validateRange(document.text, range)
    const kind = METACLASS_KIND[evidence.metaclass] ?? 'OpaqueElement'
    const ownerEngineId = nearestPublicOwner(
      evidence.engineId,
      rawById,
      relationshipsBySource,
    )
    const owner = ownerEngineId
      ? semanticByEngineId.get(ownerEngineId)
      : undefined
    const declaration = sourceTextForRange(document.text, range)
    const qualifiedName = normalizedQualifiedName(
      evidence,
      owner?.qualifiedName,
      declaration,
    )
    const name = evidence.name?.trim() || qualifiedName.split('::').at(-1)!
    const workspacePath = portablePath(relative(rootPath, document.absolutePath))
    const locator: IdentityLocator = { workspacePath, qualifiedName, kind }
    const locatorKey = stableJson(locator)
    if (seenLocators.has(locatorKey)) {
      throw new Error(
        `Ambiguous semantic locator in one snapshot: ${workspacePath} ${qualifiedName} ${kind}`,
      )
    }
    seenLocators.add(locatorKey)
    const fingerprint = sha256(
      stableJson({
        kind,
        rawKind: evidence.metaclass,
        ownerQualifiedName: owner?.qualifiedName,
        declaration: normalizeDeclaration(declaration),
      }),
    )
    const identity = input.identities.resolve(locator, fingerprint)
    semanticByEngineId.set(evidence.engineId, {
      id: identity.id,
      kind,
      rawKind: evidence.metaclass,
      name,
      qualifiedName,
      ownerId: owner?.id,
      source: {
        uri: document.uri,
        workspacePath,
        range,
        documentSha256: document.sha256,
      },
      fingerprint,
      provenance: {
        authority: 'qualified-language-engine',
        extraction: 'pilot-emf-semantic-evidence',
        classification: kind === 'OpaqueElement' ? 'opaque' : 'engine-metaclass',
        engineId: evidence.engineId,
      },
    })
  }

  const relationshipMap = new Map<string, SemanticRelationship>()
  const addRelationship = (
    kind: SemanticRelationshipKind,
    sourceEngineId: string | undefined,
    targetEngineId: string | undefined,
    engineMetaclass: string,
    features: string[],
  ): void => {
    if (!sourceEngineId || !targetEngineId || sourceEngineId === targetEngineId) return
    const source = semanticByEngineId.get(sourceEngineId)
    const target = semanticByEngineId.get(targetEngineId)
    if (!source || !target) return
    const key = `${kind}\u0000${source.id}\u0000${target.id}`
    const existing = relationshipMap.get(key)
    if (existing) {
      existing.provenance.features = [...new Set([
        ...existing.provenance.features,
        ...features,
      ])].sort()
      return
    }
    relationshipMap.set(key, {
      id: `rel:${sha256(key).slice(0, 32)}`,
      kind,
      sourceId: source.id,
      targetId: target.id,
      provenance: {
        authority: 'qualified-language-engine',
        extraction: 'pilot-emf-explicit-reference',
        engineMetaclass,
        features: [...new Set(features)].sort(),
      },
    })
  }

  for (const [engineId, raw] of rawById) {
    const refs = relationshipsBySource.get(engineId) ?? []
    if (isMembership(raw.evidence.metaclass)) {
      addRelationship(
        'containment',
        targetForFeature(refs, 'source'),
        targetForFeature(refs, 'memberElement') ?? targetForFeature(refs, 'target'),
        raw.evidence.metaclass,
        ['source', 'memberElement'],
      )
    } else if (raw.evidence.metaclass === 'FeatureTyping') {
      addRelationship(
        'typing',
        targetForFeature(refs, 'typedFeature') ?? targetForFeature(refs, 'specific'),
        targetForFeature(refs, 'type') ?? targetForFeature(refs, 'general'),
        raw.evidence.metaclass,
        ['typedFeature', 'type'],
      )
    } else if (raw.evidence.metaclass.endsWith('Import')) {
      addRelationship(
        'dependency',
        targetForFeature(refs, 'source'),
        targetForFeature(refs, 'importedNamespace') ?? targetForFeature(refs, 'target'),
        raw.evidence.metaclass,
        ['source', 'importedNamespace'],
      )
    }
  }

  for (const [engineId, semantic] of semanticByEngineId) {
    const raw = rawById.get(engineId)!
    const refs = relationshipsBySource.get(engineId) ?? []
    if (raw.evidence.metaclass === 'InterfaceUsage') {
      const source = targetForFeature(refs, 'source')
      const target = targetForFeature(refs, 'target')
      addRelationship('connection', source, target, 'InterfaceUsage', ['source', 'target'])
      addRelationship('interface', engineId, source, 'InterfaceUsage', ['source'])
      addRelationship('interface', engineId, target, 'InterfaceUsage', ['target'])
    } else if (raw.evidence.metaclass === 'ConnectionUsage') {
      addRelationship(
        'connection',
        targetForFeature(refs, 'source'),
        targetForFeature(refs, 'target'),
        'ConnectionUsage',
        ['source', 'target'],
      )
    } else if (raw.evidence.metaclass === 'FlowUsage') {
      const endpoints = terminalTargets(
        engineId,
        new Set(['Redefinition', 'ReferenceSubsetting']),
        rawById,
        relationshipsBySource,
        memberChildren,
        semanticByEngineId,
        (element) => element.kind === 'PortUsage' || element.kind === 'ItemUsage',
      )
      addRelationship('flow', endpoints[0], endpoints[1], 'FlowUsage', ['redefinedFeature'])
    } else if (semantic.kind === 'VerificationDefinition' || semantic.kind === 'VerificationUsage') {
      const requirements = terminalTargets(
        engineId,
        new Set(['ReferenceSubsetting']),
        rawById,
        relationshipsBySource,
        memberChildren,
        semanticByEngineId,
        (element) => element.kind === 'RequirementUsage' || element.kind === 'RequirementDefinition',
      )
      for (const requirement of requirements) {
        addRelationship('verification', engineId, requirement, raw.evidence.metaclass, ['referencedFeature'])
      }
    }
  }

  for (const [engineId, raw] of rawById) {
    if (raw.evidence.metaclass !== 'SatisfyRequirementUsage') continue
    const requirements = terminalTargets(
      engineId,
      new Set(['ReferenceSubsetting']),
      rawById,
      relationshipsBySource,
      memberChildren,
      semanticByEngineId,
      (element) => element.kind === 'RequirementUsage' || element.kind === 'RequirementDefinition',
    )
    const designs = terminalTargets(
      engineId,
      new Set(['Subsetting', 'Redefinition']),
      rawById,
      relationshipsBySource,
      memberChildren,
      semanticByEngineId,
      (element) => element.kind !== 'RequirementUsage' && element.kind !== 'RequirementDefinition',
    )
    for (const design of designs.slice(0, 1)) {
      for (const requirement of requirements) {
        addRelationship('satisfaction', design, requirement, raw.evidence.metaclass, ['subject', 'referencedFeature'])
      }
    }
  }

  const elements = [...semanticByEngineId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  const relationships = [...relationshipMap.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  if (relationships.length > MAX_SNAPSHOT_RELATIONSHIPS) {
    throw new Error(
      `Semantic snapshot exceeds the supported limit of ${MAX_SNAPSHOT_RELATIONSHIPS} relationships`,
    )
  }
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
          workspacePath: portablePath(relative(rootPath, fileURLToPath(document.uri))),
          languageId: document.languageId,
          sha256: document.sha256,
          byteLength: document.byteLength,
        })),
        elements: snapshotWithoutHash.elements.map((element) => ({
          ...element,
          provenance: {
            ...element.provenance,
            engineId: undefined,
          },
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
}

function collectRawEvidence(
  evidenceByUri: Map<string, EngineSemanticEvidence>,
  documentsByUri: Map<string, WorkspaceDocument>,
): Map<string, RawElement> {
  const result = new Map<string, RawElement>()
  for (const [uri, evidence] of [...evidenceByUri].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const document = documentsByUri.get(uri)
    if (!document || evidence.uri !== uri || evidence.schemaVersion !== 1) {
      throw new Error(`Semantic evidence references an unknown document: ${uri}`)
    }
    for (const element of evidence.elements) {
      const existing = result.get(element.engineId)
      if (existing && stableJson(existing.evidence) !== stableJson(element)) {
        throw new Error(`Conflicting engine semantic identity: ${element.engineId}`)
      }
      result.set(element.engineId, { evidence: element, document })
    }
  }
  return result
}

function groupRelationships(
  evidenceByUri: Map<string, EngineSemanticEvidence>,
): Map<string, EngineSemanticRelationshipEvidence[]> {
  const result = new Map<string, EngineSemanticRelationshipEvidence[]>()
  for (const evidence of evidenceByUri.values()) {
    for (const relationship of evidence.relationships) {
      if (relationship.derived || !relationship.resolved || !relationship.targetEngineId) continue
      const values = result.get(relationship.sourceEngineId) ?? []
      values.push(relationship)
      result.set(relationship.sourceEngineId, values)
    }
  }
  return result
}

function membershipChildren(
  rawById: Map<string, RawElement>,
  relationshipsBySource: Map<string, EngineSemanticRelationshipEvidence[]>,
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const [engineId, raw] of rawById) {
    const ownerId = raw.evidence.ownerEngineId
    if (!ownerId) continue
    const values = result.get(ownerId) ?? []
    if (!values.includes(engineId)) values.push(engineId)
    result.set(ownerId, values)
  }
  for (const [engineId, raw] of rawById) {
    if (!isMembership(raw.evidence.metaclass)) continue
    const refs = relationshipsBySource.get(engineId) ?? []
    const source = targetForFeature(refs, 'source')
    const target = targetForFeature(refs, 'memberElement') ?? targetForFeature(refs, 'target')
    if (!source || !target) continue
    const values = result.get(source) ?? []
    if (!values.includes(target)) values.push(target)
    result.set(source, values)
  }
  return result
}

function terminalTargets(
  root: string,
  relationshipMetaclasses: Set<string>,
  rawById: Map<string, RawElement>,
  relationshipsBySource: Map<string, EngineSemanticRelationshipEvidence[]>,
  memberChildren: Map<string, string[]>,
  semanticByEngineId: Map<string, SemanticElement>,
  predicate: (element: SemanticElement) => boolean,
): string[] {
  const subtree = new Set<string>()
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (subtree.has(current)) continue
    subtree.add(current)
    queue.push(...(memberChildren.get(current) ?? []))
    const currentRaw = rawById.get(current)
    if (
      currentRaw &&
      (isMembership(currentRaw.evidence.metaclass) ||
        currentRaw.evidence.metaclass === 'FeatureValue')
    ) {
      for (const relationship of relationshipsBySource.get(current) ?? []) {
        const targetId = relationship.targetEngineId
        if (targetId && rawById.has(targetId) && !semanticByEngineId.has(targetId)) {
          queue.push(targetId)
        }
      }
    }
  }
  const result: string[] = []
  for (const sourceId of subtree) {
    const raw = rawById.get(sourceId)
    if (!raw || !relationshipMetaclasses.has(raw.evidence.metaclass)) continue
    for (const relationship of relationshipsBySource.get(sourceId) ?? []) {
      const targetId = relationship.targetEngineId
      const target = targetId ? semanticByEngineId.get(targetId) : undefined
      if (
        targetId &&
        target &&
        !subtree.has(targetId) &&
        predicate(target) &&
        !result.includes(targetId)
      ) {
        result.push(targetId)
      }
    }
  }
  return result
}

function nearestPublicOwner(
  engineId: string,
  rawById: Map<string, RawElement>,
  relationshipsBySource: Map<string, EngineSemanticRelationshipEvidence[]>,
): string | undefined {
  let ownerId = rawById.get(engineId)?.evidence.ownerEngineId
  const visited = new Set<string>()
  while (ownerId && visited.add(ownerId)) {
    const owner = rawById.get(ownerId)
    if (!owner) return undefined
    if (isPublicElement(owner)) return ownerId
    const refs = relationshipsBySource.get(ownerId) ?? []
    const semanticOwner = targetForFeature(refs, 'source')
    if (semanticOwner && semanticOwner !== engineId && rawById.has(semanticOwner)) {
      if (isPublicElement(rawById.get(semanticOwner)!)) return semanticOwner
      ownerId = semanticOwner
    } else {
      ownerId = owner.evidence.ownerEngineId
    }
  }
  return undefined
}

function isPublicElement(raw: RawElement): boolean {
  const { evidence } = raw
  if (!evidence.range) return false
  if (METACLASS_KIND[evidence.metaclass]) return true
  if (
    INFRASTRUCTURE_METACLAS.has(evidence.metaclass) ||
    evidence.metaclass.endsWith('Membership') ||
    evidence.metaclass.endsWith('Import') ||
    evidence.metaclass.endsWith('Typing') ||
    evidence.metaclass.endsWith('Subsetting') ||
    evidence.metaclass === 'Redefinition' ||
    evidence.metaclass === 'PortConjugation' ||
    evidence.metaclass === 'FeatureValue'
  ) {
    return false
  }
  return Boolean(evidence.qualifiedName || evidence.name)
}

function isMembership(metaclass: string): boolean {
  return metaclass.endsWith('Membership')
}

function targetForFeature(
  relationships: EngineSemanticRelationshipEvidence[],
  feature: string,
): string | undefined {
  return relationships.find((relationship) => relationship.feature === feature)
    ?.targetEngineId
}

function normalizedQualifiedName(
  evidence: EngineSemanticElementEvidence,
  ownerQualifiedName: string | undefined,
  declaration: string,
): string {
  const engineName = evidence.qualifiedName?.trim() || evidence.name?.trim()
  if (engineName) {
    const normalized = engineName.replaceAll('.', '::')
    if (normalized.includes('::') || !ownerQualifiedName) return normalized
    return `${ownerQualifiedName}::${normalized}`
  }
  const anonymous = `$${evidence.metaclass}-${sha256(normalizeDeclaration(declaration)).slice(0, 12)}`
  return ownerQualifiedName ? `${ownerQualifiedName}::${anonymous}` : anonymous
}

function compareRawPosition(left: RawElement, right: RawElement): number {
  const uri = left.document.uri.localeCompare(right.document.uri)
  if (uri !== 0) return uri
  const leftRange = left.evidence.range
  const rightRange = right.evidence.range
  if (!leftRange || !rightRange) return left.evidence.engineId.localeCompare(right.evidence.engineId)
  return (
    leftRange.start.line - rightRange.start.line ||
    leftRange.start.character - rightRange.start.character ||
    rightRange.end.line - leftRange.end.line ||
    rightRange.end.character - leftRange.end.character ||
    left.evidence.engineId.localeCompare(right.evidence.engineId)
  )
}

function sourceTextForRange(text: string, range: WorkbenchRange): string {
  const lines = text.split(/\r?\n/)
  const selected = lines.slice(range.start.line, range.end.line + 1)
  if (selected.length === 0) return ''
  selected[0] = selected[0]?.slice(range.start.character) ?? ''
  const finalIndex = selected.length - 1
  selected[finalIndex] = selected[finalIndex]?.slice(
    0,
    range.start.line === range.end.line
      ? range.end.character - range.start.character
      : range.end.character,
  ) ?? ''
  return selected.join('\n')
}

function validateRange(text: string, range: WorkbenchRange): void {
  const lines = text.split(/\r?\n/)
  for (const position of [range.start, range.end]) {
    if (
      !Number.isInteger(position.line) ||
      !Number.isInteger(position.character) ||
      position.line < 0 ||
      position.line >= lines.length ||
      position.character < 0 ||
      position.character > (lines[position.line]?.length ?? 0)
    ) {
      throw new Error('Language authority returned an invalid semantic range')
    }
  }
  if (
    range.end.line < range.start.line ||
    (range.end.line === range.start.line &&
      range.end.character < range.start.character)
  ) {
    throw new Error('Language authority returned a reversed semantic range')
  }
}

function normalizeDeclaration(value: string): string {
  return value.replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim()
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
