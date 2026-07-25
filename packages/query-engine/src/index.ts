import type {
  NormalizedElementKind,
  SemanticElement,
  SemanticRelationship,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import { NORMALIZED_ELEMENT_KINDS } from '../../semantic-model/src/index.js'

export const MODEL_QUERY_SCHEMA_VERSION = 1
const MAX_QUERY_ROOTS = 100
const MAX_QUERY_STRING_LENGTH = 1_024
const MAX_NAME_FILTER_LENGTH = 256
const NORMALIZED_KINDS = new Set<string>(NORMALIZED_ELEMENT_KINDS)

export interface ModelQuery {
  schemaVersion: 1
  roots?: string[]
  relationships?: Array<'containment'>
  depth?: number
  filters?: {
    includeKinds?: NormalizedElementKind[]
    excludeKinds?: NormalizedElementKind[]
    nameContains?: string
  }
  maxResults?: number
}

export interface ModelQueryResult {
  schemaVersion: 1
  snapshotSha256: string
  resolvedRoots: string[]
  elements: SemanticElement[]
  relationships: SemanticRelationship[]
  truncated: boolean
  warnings: string[]
}

export function executeModelQuery(
  snapshot: SemanticSnapshot,
  query: ModelQuery,
): ModelQueryResult {
  validateQuery(query)
  const depth = query.depth ?? 3
  const maxResults = query.maxResults ?? 1_000
  const relationshipKinds = new Set(query.relationships ?? ['containment'])
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  const byQualifiedName = snapshot.elements.reduce(
    (index, element) => {
      const values = index.get(element.qualifiedName) ?? []
      values.push(element)
      index.set(element.qualifiedName, values)
      return index
    },
    new Map<string, SemanticElement[]>(),
  )
  const resolvedRoots =
    query.roots && query.roots.length > 0
      ? query.roots.map((root) => resolveRoot(root, byId, byQualifiedName))
      : snapshot.elements.filter((element) => !element.ownerId)
  const roots = [
    ...new Map(resolvedRoots.map((element) => [element.id, element])).values(),
  ]
  const outgoing = snapshot.relationships.reduce(
    (index, relationship) => {
      if (!relationshipKinds.has(relationship.kind)) return index
      const values = index.get(relationship.sourceId) ?? []
      values.push(relationship)
      index.set(relationship.sourceId, values)
      return index
    },
    new Map<string, SemanticRelationship[]>(),
  )
  for (const relationships of outgoing.values()) {
    relationships.sort((left, right) => left.id.localeCompare(right.id))
  }

  const visited = new Set<string>()
  const queue = roots
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((element) => ({ id: element.id, depth: 0 }))
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)
    if (current.depth >= depth) continue
    for (const relationship of outgoing.get(current.id) ?? []) {
      if (!visited.has(relationship.targetId)) {
        queue.push({
          id: relationship.targetId,
          depth: current.depth + 1,
        })
      }
    }
  }

  const matching = [...visited]
    .map((id) => byId.get(id))
    .filter((element): element is SemanticElement => element !== undefined)
    .filter((element) => matchesFilters(element, query.filters))
    .sort((left, right) => left.id.localeCompare(right.id))
  const truncated = matching.length > maxResults
  const elements = matching.slice(0, maxResults)
  const included = new Set(elements.map((element) => element.id))
  const relationships = snapshot.relationships
    .filter(
      (relationship) =>
        relationshipKinds.has(relationship.kind) &&
        included.has(relationship.sourceId) &&
        included.has(relationship.targetId),
    )
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    schemaVersion: MODEL_QUERY_SCHEMA_VERSION,
    snapshotSha256: snapshot.snapshotSha256,
    resolvedRoots: roots.map((element) => element.id),
    elements,
    relationships,
    truncated,
    warnings: truncated
      ? [`Result exceeded maxResults=${maxResults}; output was truncated`]
      : [],
  }
}

function resolveRoot(
  value: string,
  byId: Map<string, SemanticElement>,
  byQualifiedName: Map<string, SemanticElement[]>,
): SemanticElement {
  const byIdentity = byId.get(value)
  if (byIdentity) return byIdentity
  const matches = byQualifiedName.get(value) ?? []
  if (matches.length === 0) {
    throw new Error(`Model query root was not found: ${value}`)
  }
  if (matches.length > 1) {
    throw new Error(`Model query root is ambiguous: ${value}`)
  }
  return matches[0]!
}

function matchesFilters(
  element: SemanticElement,
  filters: ModelQuery['filters'],
): boolean {
  if (!filters) return true
  if (
    filters.includeKinds &&
    !filters.includeKinds.includes(element.kind)
  ) {
    return false
  }
  if (
    filters.excludeKinds &&
    filters.excludeKinds.includes(element.kind)
  ) {
    return false
  }
  if (
    filters.nameContains &&
    !element.name
      .toLocaleLowerCase()
      .includes(filters.nameContains.toLocaleLowerCase())
  ) {
    return false
  }
  return true
}

function validateQuery(query: ModelQuery): void {
  if (!isRecord(query) || query.schemaVersion !== 1) {
    throw new Error('Model query schemaVersion must be 1')
  }
  if (
    query.roots !== undefined &&
    (!Array.isArray(query.roots) ||
      query.roots.length > MAX_QUERY_ROOTS ||
      query.roots.some(
        (root) =>
          typeof root !== 'string' ||
          root.length === 0 ||
          root.length > MAX_QUERY_STRING_LENGTH,
      ))
  ) {
    throw new Error(
      `Model query roots must contain at most ${MAX_QUERY_ROOTS} bounded strings`,
    )
  }
  if (
    query.depth !== undefined &&
    (!Number.isInteger(query.depth) || query.depth < 0 || query.depth > 20)
  ) {
    throw new Error('Model query depth must be an integer from 0 to 20')
  }
  if (
    query.maxResults !== undefined &&
    (!Number.isInteger(query.maxResults) ||
      query.maxResults < 1 ||
      query.maxResults > 10_000)
  ) {
    throw new Error('Model query maxResults must be an integer from 1 to 10000')
  }
  if (
    query.relationships !== undefined &&
    (!Array.isArray(query.relationships) ||
      query.relationships.length > 1 ||
      query.relationships.some(
        (relationship) => relationship !== 'containment',
      ))
  ) {
    throw new Error('Only qualified containment relationships are supported')
  }
  if (query.filters !== undefined) {
    if (!isRecord(query.filters)) {
      throw new Error('Model query filters must be an object')
    }
    validateKinds(query.filters.includeKinds, 'includeKinds')
    validateKinds(query.filters.excludeKinds, 'excludeKinds')
    if (
      query.filters.nameContains !== undefined &&
      (typeof query.filters.nameContains !== 'string' ||
        query.filters.nameContains.length === 0 ||
        query.filters.nameContains.length > MAX_NAME_FILTER_LENGTH)
    ) {
      throw new Error(
        `Model query nameContains must be a non-empty string of at most ${MAX_NAME_FILTER_LENGTH} characters`,
      )
    }
  }
}

function validateKinds(value: unknown, name: string): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      value.length > NORMALIZED_ELEMENT_KINDS.length ||
      value.some(
        (kind) => typeof kind !== 'string' || !NORMALIZED_KINDS.has(kind),
      ))
  ) {
    throw new Error(`Model query ${name} contains an unsupported element kind`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
