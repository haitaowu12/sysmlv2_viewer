// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import { lifecycleFixture, edge } from './test-fixture.js'
import { assessSemanticImpact } from './impact.js'

function change(before: SemanticSnapshot): SemanticSnapshot {
  const after = structuredClone(before); after.snapshotSha256 = 'after'; after.elements[0]!.fingerprint = 'threshold-three'; return after
}

describe('conservative semantic change impact', () => {
  it('traces requirement changes to design, verification and dependent artifacts with witnesses', () => {
    const before = lifecycleFixture(), after = change(before)
    const result = assessSemanticImpact(before, after)
    expect(result.affectedElements.map(e => e.elementId)).toEqual(['design', 'drawing', 'requirement', 'test'])
    expect(result.affectedElements.find(e => e.elementId === 'drawing')!.witnessPath.map(p => p.fromId)).toEqual(['requirement', 'design'])
    expect(before.elements[0]!.fingerprint).toBe('requirement')
    expect(result.status).toBe('potential-impact-only')
  })
  it('retains removed relationships and deleted elements for impact review', () => {
    const before = lifecycleFixture(), after = structuredClone(before)
    after.snapshotSha256 = 'after'; after.elements = after.elements.filter(e => e.id !== 'requirement'); after.relationships = after.relationships.filter(e => e.targetId !== 'requirement')
    const result = assessSemanticImpact(before, after)
    expect(result.affectedElements.find(e => e.elementId === 'requirement')?.presentInCurrent).toBe(false)
    expect(result.affectedElements.map(e => e.elementId)).toContain('drawing')
  })
  it('terminates cyclic dependencies and is independent of input ordering', () => {
    const before = lifecycleFixture(); before.relationships.push(edge('requirement', 'drawing', 'dependency'))
    const after = change(before), result = assessSemanticImpact(before, after)
    before.elements.reverse(); before.relationships.reverse(); after.elements.reverse(); after.relationships.reverse()
    expect(assessSemanticImpact(before, after)).toEqual(result)
  })
  it('reports unresolved and opaque coverage rather than treating absence as no impact', () => {
    const before = lifecycleFixture(); before.elements[4]!.kind = 'OpaqueElement'; before.relationships.push(edge('missing', 'requirement', 'dependency'))
    const result = assessSemanticImpact(before, change(before))
    expect(result.unresolvedEndpointIds).toEqual(['missing']); expect(result.opaqueElementIds).toEqual(['unlinked'])
    expect(result.affectedElements.find(e => e.elementId === 'missing')?.qualifiedName).toBe('(unresolved)')
  })
  it('seeds both old and new endpoints of retained relationships', () => {
    const before = lifecycleFixture(), after = structuredClone(before); after.snapshotSha256 = 'after'; after.relationships[0]!.targetId = 'unlinked'
    expect(assessSemanticImpact(before, after).seedElementIds).toEqual(['design', 'requirement', 'unlinked'])
  })
  it('returns no affected elements for unchanged semantics', () => {
    const before = lifecycleFixture(); expect(assessSemanticImpact(before, before).affectedElements).toEqual([])
  })
  it('rejects stale, unqualified, incompatible and ambiguous snapshots', () => {
    const before = lifecycleFixture()
    for (const mutate of [
      (s: SemanticSnapshot) => { s.freshness = 'stale' },
      (s: SemanticSnapshot) => { s.authority.engineVersion = 'different' },
      (s: SemanticSnapshot) => { s.workspace.configurationName = 'as-built-B' },
      (s: SemanticSnapshot) => { s.elements.push(s.elements[0]!) },
    ]) { const after = change(before); mutate(after); expect(() => assessSemanticImpact(before, after)).toThrow() }
  })
})
