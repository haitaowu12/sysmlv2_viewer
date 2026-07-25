import type {
  SemanticElement,
  SemanticRelationship,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'

export type SemanticChangeKind =
  | 'element-created'
  | 'element-deleted'
  | 'element-renamed'
  | 'element-moved'
  | 'element-kind-changed'
  | 'element-content-changed'
  | 'relationship-created'
  | 'relationship-deleted'

export interface SemanticChange {
  kind: SemanticChangeKind
  elementId?: string
  relationshipId?: string
  before?: SemanticElement | SemanticRelationship
  after?: SemanticElement | SemanticRelationship
}
export interface SemanticDiff {
  beforeSnapshotSha256: string
  afterSnapshotSha256: string
  changes: SemanticChange[]
}

export function compareSemanticSnapshots(
  before: SemanticSnapshot,
  after: SemanticSnapshot,
): SemanticDiff {
  if (before.workspace.id !== after.workspace.id) {
    throw new Error('Semantic diff requires snapshots from the same workspace')
  }
  const changes: SemanticChange[] = []
  const beforeElements = new Map(before.elements.map((element) => [element.id, element]))
  const afterElements = new Map(after.elements.map((element) => [element.id, element]))
  for (const id of [...new Set([...beforeElements.keys(), ...afterElements.keys()])].sort()) {
    const prior = beforeElements.get(id)
    const next = afterElements.get(id)
    if (!prior && next) {
      changes.push({ kind: 'element-created', elementId: id, after: next })
      continue
    }
    if (prior && !next) {
      changes.push({ kind: 'element-deleted', elementId: id, before: prior })
      continue
    }
    if (!prior || !next) continue
    if (prior.name !== next.name || prior.qualifiedName !== next.qualifiedName) {
      changes.push({ kind: 'element-renamed', elementId: id, before: prior, after: next })
    }
    if (prior.source.workspacePath !== next.source.workspacePath || prior.ownerId !== next.ownerId) {
      changes.push({ kind: 'element-moved', elementId: id, before: prior, after: next })
    }
    if (prior.kind !== next.kind) {
      changes.push({ kind: 'element-kind-changed', elementId: id, before: prior, after: next })
    } else if (prior.fingerprint !== next.fingerprint) {
      changes.push({ kind: 'element-content-changed', elementId: id, before: prior, after: next })
    }
  }
  compareRelationships(before.relationships, after.relationships, changes)
  return {
    beforeSnapshotSha256: before.snapshotSha256,
    afterSnapshotSha256: after.snapshotSha256,
    changes,
  }
}

function compareRelationships(
  before: SemanticRelationship[],
  after: SemanticRelationship[],
  changes: SemanticChange[],
): void {
  const prior = new Map(before.map((relationship) => [relationship.id, relationship]))
  const next = new Map(after.map((relationship) => [relationship.id, relationship]))
  for (const id of [...new Set([...prior.keys(), ...next.keys()])].sort()) {
    const beforeRelationship = prior.get(id)
    const afterRelationship = next.get(id)
    if (!beforeRelationship && afterRelationship) {
      changes.push({
        kind: 'relationship-created',
        relationshipId: id,
        after: afterRelationship,
      })
    } else if (beforeRelationship && !afterRelationship) {
      changes.push({
        kind: 'relationship-deleted',
        relationshipId: id,
        before: beforeRelationship,
      })
    }
  }
}
