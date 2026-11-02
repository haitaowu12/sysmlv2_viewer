import { describe, expect, it } from 'vitest'
import { lifecycleFixture } from '../../semantic-diff/src/test-fixture.js'
import { generateTestCandidates, reviewLifecycleChange, type LifecycleArtifact } from './index.js'
const artifacts: LifecycleArtifact[] = [
  { id: 'drawing', kind: 'design-artifact', revision: 'drawing-A', configuration: 'design-A', modelElementIds: ['design'], dependsOn: [] },
  { id: 'sat', kind: 'test-procedure', revision: 'sat-A', configuration: 'design-A', modelElementIds: ['test'], dependsOn: ['drawing'] },
  { id: 'run', kind: 'test-observation', revision: 'run-A-passed', configuration: 'design-A', modelElementIds: [], dependsOn: ['sat'] },
  { id: 'assurance', kind: 'assurance-claim', revision: 'claim-A', configuration: 'design-A', modelElementIds: [], dependsOn: ['run'] },
]
describe('lifecycle change review', () => {
  it('propagates a requirement edit through drawing, SAT and historical evidence to assurance without changing history', () => {
    const before = lifecycleFixture(), after = structuredClone(before)
    after.snapshotSha256 = 'after'; after.elements[0]!.fingerprint = 'three-pumps'
    const original = JSON.stringify(artifacts), result = reviewLifecycleChange(before, after, artifacts, artifacts)
    expect(result.artifactReviews.map(r => r.artifactId)).toEqual(['assurance', 'drawing', 'run', 'sat'])
    expect(result.artifactReviews.find(r => r.artifactId === 'run')?.status).toBe('applicability-review-required')
    expect(result.artifactReviews.find(r => r.artifactId === 'assurance')?.witness).toContain('artifact:run')
    expect(JSON.stringify(artifacts)).toBe(original)
  })
  it('propagates an external drawing revision even without a model change', () => {
    const snapshot = lifecycleFixture(), current = structuredClone(artifacts); current[0]!.revision = 'drawing-B'
    const result = reviewLifecycleChange(snapshot, snapshot, artifacts, current)
    expect(result.changedArtifactIds).toEqual(['drawing']); expect(result.artifactReviews).toHaveLength(4)
  })
  it('preserves removed dependency impact and terminates cycles', () => {
    const snapshot = lifecycleFixture(), prior = structuredClone(artifacts); prior[0]!.dependsOn = ['assurance']
    const current = structuredClone(prior); current[0]!.revision = 'drawing-B'; current[1]!.dependsOn = []
    expect(reviewLifecycleChange(snapshot, snapshot, prior, current).artifactReviews).toHaveLength(4)
  })
  it('marks unresolved links for review and exposes unlinked coverage', () => {
    const snapshot = lifecycleFixture(), current = structuredClone(artifacts); current[0]!.modelElementIds = ['missing']; current[0]!.dependsOn = ['absent']
    current.push({ ...current[0]!, id: 'unlinked', modelElementIds: [], dependsOn: [] })
    const result = reviewLifecycleChange(snapshot, snapshot, current, current)
    expect(result.unresolvedDependencies).toEqual(['artifact:absent', 'model:missing'])
    expect(result.unlinkedArtifactIds).toEqual(['unlinked']); expect(result.artifactReviews).toHaveLength(4)
  })
  it('rejects mixed configurations and duplicate artifact IDs', () => {
    const snapshot = lifecycleFixture(), current = structuredClone(artifacts); current[0]!.configuration = 'as-built-B'
    expect(() => reviewLifecycleChange(snapshot, snapshot, artifacts, current)).toThrow('configuration')
    expect(() => reviewLifecycleChange(snapshot, snapshot, artifacts, [...artifacts, artifacts[0]!])).toThrow('unique')
  })
  it('creates only explicitly blocked planning candidates and does not invent an oracle', () => {
    const snapshot = lifecycleFixture(); snapshot.elements[2]!.kind = 'VerificationDefinition'; snapshot.elements[0]!.kind = 'RequirementUsage'
    const [candidate] = generateTestCandidates(snapshot)
    expect(candidate).toMatchObject({ requirementIds: ['requirement'], status: 'draft-not-executable', configuration: 'design-A' })
    expect(candidate!.requiredInputs).toHaveLength(7)
    expect(JSON.stringify(candidate)).toContain('Independent acceptance oracle')
    snapshot.relationships = []
    expect(generateTestCandidates(snapshot)[0]!.requiredInputs).toHaveLength(8)
  })
})
