import type { ModelQuery, ModelQueryMode } from '../../query-engine/src/index.js'
import { executeModelQuery } from '../../query-engine/src/index.js'
import type {
  NormalizedElementKind,
  SemanticRelationshipKind,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'

export interface ExplorerProjectionNode {
  id: string
  label: string
  qualifiedName: string
  kind: NormalizedElementKind
  sourceUri: string
  ownerId?: string
}
export interface ExplorerProjectionEdge {
  id: string
  kind: SemanticRelationshipKind
  sourceId: string
  targetId: string
}

export interface ExplorerProjection {
  schemaVersion: 1
  snapshotSha256: string
  mode: ModelQueryMode
  roots: string[]
  nodes: ExplorerProjectionNode[]
  edges: ExplorerProjectionEdge[]
  truncated: boolean
}

export function buildExplorerProjection(
  snapshot: SemanticSnapshot,
  query: Omit<ModelQuery, 'schemaVersion'> & { mode?: ModelQueryMode } = {},
): ExplorerProjection {
  const mode = query.mode ?? 'containment'
  const result = executeModelQuery(snapshot, {
    ...query,
    schemaVersion: 1,
    mode,
  })
  return {
    schemaVersion: 1,
    snapshotSha256: result.snapshotSha256,
    mode,
    roots: result.resolvedRoots,
    nodes: result.elements.map((element) => ({
      id: element.id,
      label: element.name,
      qualifiedName: element.qualifiedName,
      kind: element.kind,
      sourceUri: element.source.uri,
      ownerId: element.ownerId,
    })),
    edges: result.relationships.map((relationship) => ({
      id: relationship.id,
      kind: relationship.kind,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
    })),
    truncated: result.truncated,
  }
}
