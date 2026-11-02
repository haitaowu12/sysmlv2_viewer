import type { SemanticElement, SemanticRelationship, SemanticSnapshot } from '../../semantic-model/src/index.js'

/** Presentation state only. Never creates or mutates model elements. */
export type DiagramViewpoint = 'structure' | 'interconnection' | 'requirements' | 'verification'
export interface DiagramScope {
  viewpoint: DiagramViewpoint
  rootId?: string
  depth: number
}
export interface DiagramNode {
  element: SemanticElement
  typeNames: string[]
  hiddenIds: string[]
}
export interface DiagramEdge {
  id: string
  sourceId: string
  targetId: string
  kind: SemanticRelationship['kind']
  aggregated: boolean
  relationshipIds: string[]
}
export interface DiagramProjection {
  snapshotSha256: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  excludedIds: string[]
  internalRelationshipIds: string[]
  boundaryRelationshipIds: string[]
}

const edgeKinds: Record<DiagramViewpoint, SemanticRelationship['kind'][]> = {
  structure: ['containment', 'typing'],
  interconnection: ['connection', 'flow', 'interface'],
  requirements: ['satisfaction'],
  verification: ['satisfaction', 'verification'],
}
const relevant = (element: SemanticElement, viewpoint: DiagramViewpoint) => {
  if (viewpoint === 'structure') return true
  if (viewpoint === 'interconnection') return /^(Part|Port|Interface|Connection|Flow)/.test(element.kind)
  if (viewpoint === 'requirements') return /^(Part|Requirement)/.test(element.kind)
  return /^(Part|Requirement|Verification)/.test(element.kind)
}

export function projectDiagram(snapshot: SemanticSnapshot, scope: DiagramScope): DiagramProjection {
  if (!Number.isInteger(scope.depth) || scope.depth < 0 || scope.depth > 20) throw new Error('Diagram depth must be an integer from 0 to 20')
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  if (scope.rootId && !byId.has(scope.rootId)) throw new Error('Diagram root is absent from this snapshot')
  const distances = new Map<string, number>()
  // Follow ownership, not arbitrary relationship traversal: reduction must not
  // accidentally absorb the external end of a connector into the subsystem.
  for (const element of snapshot.elements) {
    let current: SemanticElement | undefined = element
    let distance = 0
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (scope.rootId ? current.id === scope.rootId : !current.ownerId) {
        distances.set(element.id, distance)
        break
      }
      current = current.ownerId ? byId.get(current.ownerId) : undefined
      distance++
    }
  }
  const included = new Set(snapshot.elements.filter((element) =>
    distances.has(element.id) && distances.get(element.id)! <= scope.depth && relevant(element, scope.viewpoint),
  ).map((element) => element.id))
  const representative = (id: string): string | undefined => {
    // Never aggregate an excluded type/category merely because its owner is
    // visible. Only a depth collapse has an ancestor representation.
    if (!distances.has(id)) return undefined
    if (included.has(id)) return id
    if (distances.get(id)! <= scope.depth) return undefined
    let current = byId.get(id)
    const seen = new Set<string>()
    while (current?.ownerId && !seen.has(current.id)) {
      seen.add(current.id)
      if (included.has(current.ownerId)) return current.ownerId
      current = byId.get(current.ownerId)
    }
    return undefined
  }
  const nodes = snapshot.elements.filter((element) => included.has(element.id)).map((element) => ({
    element,
    typeNames: snapshot.relationships.filter((edge) => edge.kind === 'typing' && edge.sourceId === element.id)
      .map((edge) => byId.get(edge.targetId)?.name ?? edge.targetId).sort(),
    hiddenIds: snapshot.elements.filter((other) => other.id !== element.id && representative(other.id) === element.id).map((other) => other.id).sort(),
  })).sort((a, b) => a.element.qualifiedName.localeCompare(b.element.qualifiedName))
  const edges = new Map<string, DiagramEdge>()
  const internalRelationshipIds: string[] = []
  const boundaryRelationshipIds: string[] = []
  for (const relationship of snapshot.relationships) {
    if (!edgeKinds[scope.viewpoint].includes(relationship.kind)) continue
    const sourceId = representative(relationship.sourceId)
    const targetId = representative(relationship.targetId)
    if (!sourceId || !targetId) {
      if (sourceId || targetId) boundaryRelationshipIds.push(relationship.id)
      continue
    }
    const aggregated = sourceId !== relationship.sourceId || targetId !== relationship.targetId
    if (sourceId === targetId && aggregated) {
      internalRelationshipIds.push(relationship.id)
      continue
    }
    // A collapsed ownership relation is not a new direct ownership fact.
    if (aggregated && (relationship.kind === 'containment' || relationship.kind === 'typing')) {
      internalRelationshipIds.push(relationship.id)
      continue
    }
    const key = `${relationship.kind}:${sourceId}:${targetId}:${aggregated}`
    const edge = edges.get(key) ?? { id: key, sourceId, targetId, kind: relationship.kind, aggregated, relationshipIds: [] }
    edge.relationshipIds.push(relationship.id)
    edges.set(key, edge)
  }
  return {
    snapshotSha256: snapshot.snapshotSha256,
    nodes,
    edges: [...edges.values()].map((edge) => ({ ...edge, relationshipIds: edge.relationshipIds.sort() })).sort((a, b) => a.id.localeCompare(b.id)),
    excludedIds: snapshot.elements.filter((element) => !included.has(element.id)).map((element) => element.id).sort(),
    internalRelationshipIds: internalRelationshipIds.sort(),
    boundaryRelationshipIds: boundaryRelationshipIds.sort(),
  }
}
