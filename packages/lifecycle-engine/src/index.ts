import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import { assessSemanticImpact, type SemanticImpact } from '../../semantic-diff/src/impact.js'

export interface LifecycleArtifact {
  id: string
  kind: 'design-artifact' | 'test-procedure' | 'test-observation' | 'assurance-claim'
  revision: string
  configuration: string
  modelElementIds: string[]
  dependsOn: string[]
}
export interface TestCandidate {
  id: string
  verificationElementId: string
  requirementIds: string[]
  modelRevision: string
  configuration: string
  status: 'draft-not-executable'
  purpose: string
  requiredInputs: string[]
}
const REQUIRED_TEST_INPUTS = [
  'Independent acceptance oracle with authoritative source revision, tolerances and units or explicit not-applicable rationale',
  'Test item identity and installed hardware/software/configuration revisions',
  'Preconditions, environment, isolation and restoration arrangements',
  'Ordered stimuli, observations and explicit expected results',
  'Instrumentation, measurement uncertainty and calibration applicability',
  'Evidence capture locations, anomaly handling and stop conditions',
  'Procedure review, authorized execution roles and approval bound to procedure revision',
]

/** Produces planning prompts only. A verify relationship supplies no execution oracle. */
export function generateTestCandidates(snapshot: SemanticSnapshot): TestCandidate[] {
  assessSemanticImpact(snapshot, snapshot) // same qualification and identity gates as change review
  const byId = new Map(snapshot.elements.map(e => [e.id, e]))
  return snapshot.elements.filter(e => ['VerificationDefinition', 'VerificationUsage'].includes(e.kind))
    .sort((a, b) => a.id.localeCompare(b.id)).map(e => {
      const requirementIds = [...new Set(snapshot.relationships.filter(r => r.kind === 'verification' && r.sourceId === e.id).map(r => r.targetId))].sort()
      const unresolved = requirementIds.filter(id => !['RequirementDefinition', 'RequirementUsage'].includes(byId.get(id)?.kind ?? ''))
      return { id: `candidate:${e.id}`, verificationElementId: e.id, requirementIds,
        modelRevision: snapshot.snapshotSha256, configuration: snapshot.workspace.configurationName,
        status: 'draft-not-executable', purpose: `Review a verification procedure for ${e.qualifiedName}`,
        requiredInputs: [...(!requirementIds.length || unresolved.length ? ['Resolve verification targets to current requirements'] : []), ...REQUIRED_TEST_INPUTS],
      }
    })
}

export interface LifecycleReview {
  schemaVersion: 1
  semanticImpact: SemanticImpact
  changedArtifactIds: string[]
  artifactReviews: Array<{
    artifactId: string
    kind: LifecycleArtifact['kind']
    presentInCurrent: boolean
    status: 'applicability-review-required' | 'revision-review-required'
    witness: string[]
  }>
  unlinkedArtifactIds: string[]
  unresolvedDependencies: string[]
  testCandidates: TestCandidate[]
  limitations: string[]
}

/** Recompute this derived review after each accepted snapshot / artifact register update.
 * It never mutates model sources, approved procedures, historical observations or acceptance.
 */
export function reviewLifecycleChange(before: SemanticSnapshot, after: SemanticSnapshot,
  prior: LifecycleArtifact[], current: LifecycleArtifact[]): LifecycleReview {
  const impact = assessSemanticImpact(before, after)
  const allowedKinds = new Set(['design-artifact', 'test-procedure', 'test-observation', 'assurance-claim'])
  for (const rows of [prior, current]) {
    if (!Array.isArray(rows) || rows.length > 1000 || new Set(rows.map(a => a.id)).size !== rows.length) throw new Error('Lifecycle artifacts require unique IDs')
    for (const a of rows) {
      if (![a.id, a.revision, a.configuration].every(v => typeof v === 'string' && v.trim()) || !allowedKinds.has(a.kind) ||
          ![a.modelElementIds, a.dependsOn].every(v => Array.isArray(v) && v.every(id => typeof id === 'string' && id.trim()) && new Set(v).size === v.length)) {
        throw new Error('Malformed lifecycle artifact')
      }
      if (a.configuration !== before.workspace.configurationName) throw new Error('Lifecycle artifact configuration mismatch')
    }
  }
  const old = new Map(prior.map(a => [a.id, a])), now = new Map(current.map(a => [a.id, a]))
  const union = new Map([...prior, ...current].map(a => [a.id, a]))
  const fingerprint = (a: LifecycleArtifact | undefined) => a && JSON.stringify([a.kind, a.revision, a.configuration, [...a.modelElementIds].sort(), [...a.dependsOn].sort()])
  const changed = [...union.keys()].filter(id => fingerprint(old.get(id)) !== fingerprint(now.get(id))).sort()
  const affected = new Map<string, string[]>(changed.map(id => [id, [`artifact:${id}`]]))
  const modelImpacts = new Map(impact.affectedElements.map(e => [e.elementId, e]))
  const unresolved = new Set<string>()
  const knownModelIds = new Set([...before.elements, ...after.elements].map(e => e.id))
  for (const a of [...prior, ...current].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const id of a.modelElementIds) {
      if (!knownModelIds.has(id)) { unresolved.add(`model:${id}`); if (!affected.has(a.id)) affected.set(a.id, [`unresolved-model:${id}`, `artifact:${a.id}`]) }
      if (modelImpacts.has(id) && !affected.has(a.id)) affected.set(a.id, [`model:${id}`, `artifact:${a.id}`])
    }
    for (const id of a.dependsOn) if (!union.has(id)) {
      unresolved.add(`artifact:${id}`)
      if (!affected.has(a.id)) affected.set(a.id, [`unresolved-artifact:${id}`, `artifact:${a.id}`])
    }
  }
  // Union retains deleted links; fixed point handles cyclic review dependencies.
  const rows = [...prior, ...current].sort((a, b) => a.id.localeCompare(b.id))
  let expanded = true
  while (expanded) {
    expanded = false
    for (const a of rows) for (const dep of [...a.dependsOn].sort()) if (affected.has(dep) && !affected.has(a.id)) {
      affected.set(a.id, [...affected.get(dep)!, `artifact:${a.id}`]); expanded = true
    }
  }
  return {
    schemaVersion: 1, semanticImpact: impact, changedArtifactIds: changed,
    artifactReviews: [...affected].sort(([a], [b]) => a.localeCompare(b)).map(([id, witness]) => ({ artifactId: id,
      kind: union.get(id)!.kind, presentInCurrent: now.has(id),
      status: union.get(id)!.kind === 'test-observation' ? 'applicability-review-required' : 'revision-review-required', witness })),
    unlinkedArtifactIds: current.filter(a => !a.modelElementIds.length && !a.dependsOn.length).map(a => a.id).sort(),
    unresolvedDependencies: [...unresolved].sort(), testCandidates: generateTestCandidates(after),
    limitations: [
      'Potential review impact over explicitly registered links only. Missing links and unregistered artifacts remain unknown.',
      'Artifact revisions are supplied by the caller; this function does not fetch or authenticate external artifact content.',
      'Historical test observations retain their original result. Applicability to the changed configuration requires review or retest.',
      'Generated candidates are incomplete planning drafts, not executable FAT/SAT/commissioning procedures, verification verdicts or stakeholder validation.',
      'No automatic requirement change, design approval, physical test execution, waiver or assurance acceptance is performed.',
    ],
  }
}
