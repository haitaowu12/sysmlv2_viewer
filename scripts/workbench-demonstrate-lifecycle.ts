/** Synthetic normalized-graph demonstration, separate from reference-runtime qualification. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { lifecycleFixture } from '../packages/semantic-diff/src/test-fixture.js'
import { reviewLifecycleChange, type LifecycleArtifact } from '../packages/lifecycle-engine/src/index.js'
import { renderReport } from '../packages/report-engine/src/index.js'
import { compareSemanticSnapshots } from '../packages/semantic-diff/src/index.js'
const output = process.argv[2]
if (!output) throw new Error('Supply a new output directory')
await mkdir(output, { recursive: false })
const before = lifecycleFixture(), after = structuredClone(before)
before.elements[0]!.kind = 'RequirementUsage'; before.elements[2]!.kind = 'VerificationDefinition'
after.elements[0]!.kind = 'RequirementUsage'; after.elements[2]!.kind = 'VerificationDefinition'
after.elements[0]!.fingerprint = 'minimum-three'; after.snapshotSha256 = 'synthetic-model-B'
const artifacts: LifecycleArtifact[] = [
  { id: 'drawing-A', kind: 'design-artifact', revision: 'drawing-revision-1', configuration: 'design-A', modelElementIds: ['design'], dependsOn: [] },
  { id: 'SAT-count', kind: 'test-procedure', revision: 'procedure-revision-1', configuration: 'design-A', modelElementIds: ['test'], dependsOn: ['drawing-A'] },
  { id: 'RUN-count-1', kind: 'test-observation', revision: 'synthetic-observation-1', configuration: 'design-A', modelElementIds: [], dependsOn: ['SAT-count'] },
  { id: 'capacity-claim', kind: 'assurance-claim', revision: 'claim-revision-1', configuration: 'design-A', modelElementIds: [], dependsOn: ['RUN-count-1'] },
  { id: 'unlinked-manual', kind: 'design-artifact', revision: 'manual-1', configuration: 'design-A', modelElementIds: [], dependsOn: [] },
]
const observation = { id: 'RUN-count-1', synthetic: true, configuration: 'design-A', modelRevision: before.snapshotSha256,
  criterion: 'declared count >= 2', observedCount: 2, recordedOutcome: 'pass', scope: 'Synthetic evidence only; no physical test occurred' }
const observationBytes = JSON.stringify(observation, null, 2)+'\n'
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
await writeFile(resolve(output, 'historical-observation.json'), observationBytes, { flag: 'wx' })
const review = reviewLifecycleChange(before, after, artifacts, artifacts)
const comparison = { schemaVersion: 1 as const, workspace: { id: 'pump', configurationName: 'design-A' }, baseline: { id: 'synthetic-A', commit: 'a'.repeat(40), snapshotSha256: before.snapshotSha256 },
  current: { commit: 'b'.repeat(40), branch: 'synthetic', snapshotSha256: after.snapshotSha256, dirty: true },
  semanticDiff: compareSemanticSnapshots(before, after), semanticImpact: review.semanticImpact, lifecycleReview: review,
  diagnostics: { introduced: [], resolved: [] }, changedFiles: [], reviewOnlyFiles: [], layoutOnlyFiles: [] }
const report = await renderReport({ kind: 'semantic-change-impact', comparison, provenance: {
  workspace: { id: 'pump', name: 'Synthetic lifecycle graph demonstration' }, commitSha: comparison.current.commit,
  snapshotSha256: after.snapshotSha256, configurationName: after.workspace.configurationName,
  baseline: 'synthetic-A', languageRelease: 'synthetic-normalized-input', workbenchVersion: 'local-audit', rulePackVersion: '1.1.0', viewConfiguration: null,
  generatedAt: '2026-10-03T21:00:00Z', unresolvedDiagnostics: 0, exclusions: ['Synthetic graph; not production-adapter qualification', ...review.limitations],
} })
await writeFile(resolve(output, 'review.json'), JSON.stringify(review,null,2)+'\n', { flag: 'wx' })
await writeFile(resolve(output, 'review.html'), report.html, { flag: 'wx' })
await writeFile(resolve(output, 'review.pdf'), report.pdf, { flag: 'wx' })
const preserved = hash(await readFile(resolve(output,'historical-observation.json'))) === hash(observationBytes)
if (!preserved || review.artifactReviews.length !== 4 || review.testCandidates.length !== 1) throw new Error('Synthetic lifecycle demonstration failed')
await writeFile(resolve(output,'receipt.json'),JSON.stringify({ synthetic: true, historicalObservationSha256: hash(observationBytes), historicalObservationPreserved: preserved,
  affectedArtifacts: review.artifactReviews.length, unlinkedArtifactIds: review.unlinkedArtifactIds, blockedTestCandidates: review.testCandidates.length,
  reports: report.contentSha256, limitations: review.limitations },null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({ output, historicalObservationPreserved: preserved, affectedArtifacts: review.artifactReviews.length }))
