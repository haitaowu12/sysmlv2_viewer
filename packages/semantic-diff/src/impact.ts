import type { SemanticRelationship, SemanticSnapshot } from '../../semantic-model/src/index.js'
import { compareSemanticSnapshots } from './index.js'

export interface ImpactStep {
  fromId: string
  toId: string
  relationshipId: string
  relationshipKind: SemanticRelationship['kind']
  traversal: 'dependent' | 'containing-element' | 'connected-peer'
  snapshot: 'before' | 'after'
}

export interface SemanticImpact {
  beforeSnapshotSha256: string
  afterSnapshotSha256: string
  policyVersion: 'semantic-impact-v1'
  status: 'potential-impact-only'
  seedElementIds: string[]
  affectedElements: Array<{
    elementId: string
    qualifiedName: string
    presentInCurrent: boolean
    reason: 'changed-element-or-relationship-end' | 'dependent-review'
    witnessPath: ImpactStep[]
  }>
  unresolvedEndpointIds: string[]
  opaqueElementIds: string[]
  limitations: string[]
}

/** Conservative review reachability over explicit normalized relationships.
 * A witness is one deterministic shortest path, never proof of physical effect.
 */
export function assessSemanticImpact(before: SemanticSnapshot, after: SemanticSnapshot): SemanticImpact {
  if ([before, after].some(s => s.freshness !== 'current' || s.authority.qualificationStatus !== 'qualified')) {
    throw new Error('Impact assessment requires current qualified snapshots')
  }
  if (before.workspace.id !== after.workspace.id || before.workspace.configurationName !== after.workspace.configurationName) {
    throw new Error('Impact assessment requires the same workspace and configuration')
  }
  for (const key of ['adapterId', 'adapterVersion', 'engineName', 'engineVersion', 'referenceRelease'] as const) {
    if (before.authority[key] !== after.authority[key]) throw new Error('Impact assessment requires matching language authority')
  }
  for (const snapshot of [before, after]) {
    if (snapshot.elements.length > 10000 || snapshot.relationships.length > 50000) throw new Error('Impact incomplete: supported graph limit exceeded')
    if (new Set(snapshot.elements.map(e => e.id)).size !== snapshot.elements.length ||
        new Set(snapshot.relationships.map(r => r.id)).size !== snapshot.relationships.length) {
      throw new Error('Impact assessment requires unique semantic identities')
    }
  }
  const diff = compareSemanticSnapshots(before, after)
  const seeds = new Set<string>()
  for (const change of diff.changes) {
    if (change.elementId) seeds.add(change.elementId)
    for (const value of [change.before, change.after]) {
      if (value && 'sourceId' in value) {
        seeds.add(value.sourceId)
        seeds.add(value.targetId)
      }
    }
  }
  const elements = new Map([...before.elements, ...after.elements].map(e => [e.id, e]))
  const current = new Set(after.elements.map(e => e.id))
  const adjacency = new Map<string, ImpactStep[]>()
  const unresolved = new Set<string>()
  for (const [snapshot, name] of [[before, 'before'], [after, 'after']] as const) {
    const local = new Set(snapshot.elements.map(e => e.id))
    for (const relation of snapshot.relationships) {
      for (const end of [relation.sourceId, relation.targetId]) if (!local.has(end)) unresolved.add(end)
      const add = (fromId: string, toId: string, traversal: ImpactStep['traversal']) => {
        const rows = adjacency.get(fromId) ?? []
        rows.push({ fromId, toId, relationshipId: relation.id, relationshipKind: relation.kind, traversal, snapshot: name })
        adjacency.set(fromId, rows)
      }
      switch (relation.kind) {
        case 'typing': case 'dependency': case 'satisfaction': case 'verification':
          add(relation.targetId, relation.sourceId, 'dependent')
          break
        case 'containment':
          add(relation.targetId, relation.sourceId, 'containing-element')
          break
        case 'connection': case 'flow': case 'interface':
          add(relation.sourceId, relation.targetId, 'connected-peer')
          add(relation.targetId, relation.sourceId, 'connected-peer')
          break
        default:
          throw new Error('Unsupported relationship kind in impact assessment')
      }
    }
  }
  for (const edges of adjacency.values()) edges.sort((a, b) =>
    `${a.toId}/${a.relationshipId}/${a.snapshot}`.localeCompare(`${b.toId}/${b.relationshipId}/${b.snapshot}`))
  const seedElementIds = [...seeds].sort()
  const queue = [...seedElementIds]
  const paths = new Map<string, ImpactStep[]>(queue.map(id => [id, []]))
  let retainedSteps = 0
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]!
    for (const edge of adjacency.get(from) ?? []) {
      if (paths.has(edge.toId)) continue
      retainedSteps += paths.get(from)!.length + 1
      if (retainedSteps > 1000000) throw new Error('Impact incomplete: retained witness limit exceeded')
      paths.set(edge.toId, [...paths.get(from)!, edge])
      queue.push(edge.toId)
    }
  }
  return {
    beforeSnapshotSha256: before.snapshotSha256,
    afterSnapshotSha256: after.snapshotSha256,
    policyVersion: 'semantic-impact-v1',
    status: 'potential-impact-only',
    seedElementIds,
    affectedElements: [...paths].sort(([a], [b]) => a.localeCompare(b)).map(([id, path]) => ({
      elementId: id,
      qualifiedName: elements.get(id)?.qualifiedName ?? '(unresolved)',
      presentInCurrent: current.has(id),
      reason: seeds.has(id) ? 'changed-element-or-relationship-end' : 'dependent-review',
      witnessPath: path,
    })),
    unresolvedEndpointIds: [...unresolved].sort(),
    opaqueElementIds: [...elements.values()].filter(e => e.kind === 'OpaqueElement').map(e => e.id).sort(),
    limitations: [
      'Potential review impact over the union of before/after explicit relationships; connected peers are conservatively included. This is not causal, simulation or safety analysis.',
      'One deterministic shortest witness path is retained per reached element; it is not a complete path enumeration.',
      'Unlinked external design artifacts, physical configurations, test results and assurance claims are outside this model-only graph. Absence from this result does not establish no impact.',
      'No approved model, test observation, verification verdict or stakeholder acceptance is modified by this assessment.',
    ],
  }
}
