import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { createQualifiedHybridAdapter } from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'
import type { CommandEnvelope, WorkbenchCommand } from '../packages/command-engine/src/index.js'
import type { SemanticSnapshot } from '../packages/semantic-model/src/index.js'

// This runner requires artifacts that match the selected runtime lock. An explicit
// candidate lock is labelled separately; no test double or reference JAR is accepted.
const root = resolve(import.meta.dirname, '..')
const outputIndex = process.argv.indexOf('--output')
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1]! : 'generated/qualification/contributor.json')
const lockIndex = process.argv.indexOf('--runtime-lock')
const runtimeLock = resolve(lockIndex >= 0 ? process.argv[lockIndex + 1]! : resolve(root, 'config/language-engine-runtime-lock.json'))
const manifestIndex = process.argv.indexOf('--candidate-manifest')
const candidateManifest = resolve(manifestIndex >= 0 ? process.argv[manifestIndex + 1]! : resolve(root, 'config/language-engine-candidates.json'))
const required = ['SYSML_WORKBENCH_SEMANTIC_ARTIFACT', 'SYSML_WORKBENCH_AUTHORING_ARTIFACT', 'SYSML_WORKBENCH_LIBRARY_ROOT']
const missing = required.filter((name) => !process.env[name])
const observation: Record<string, unknown> = {
  schemaVersion: 1, recordedAt: new Date().toISOString(), result: 'running',
  runtimeLock, candidateManifest, runtimeProfile: lockIndex >= 0 || manifestIndex >= 0 ? 'explicit-candidate' : 'production-lock',
  fixture: 'fixtures/workspaces/contributor-pilot',
  limits: ['Fictional workflow qualification, not human usability acceptance, physical verification or scale qualification.'],
}
let temporary: string | undefined
let manager: WorkspaceManager | undefined
const started = performance.now()
try {
  observation.runtimeLockSha256 = hash(await readFile(runtimeLock, 'utf8'))
  observation.candidateManifestSha256 = hash(await readFile(candidateManifest, 'utf8'))
  observation.implementationRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  observation.implementationDirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0
  if (missing.length) {
    observation.result = 'blocked'
    observation.missingEnvironment = missing
    process.exitCode = 2
  } else {
    temporary = await mkdtemp(resolve(tmpdir(), 'sysml-contributor-'))
    await cp(resolve(root, 'fixtures/workspaces/contributor-pilot/model'), resolve(temporary, 'model'), { recursive: true })
    await cp(resolve(root, 'fixtures/workspaces/contributor-pilot/sysml-workspace.yaml'), resolve(temporary, 'sysml-workspace.yaml'))
    const sourcePath = resolve(temporary, 'model/control.sysml')
    const workspaceFile = resolve(temporary, 'sysml-workspace.yaml')
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Contributor qualification', '-c', 'user.email=qualification@example.invalid', 'commit', '-qm', 'Fictional baseline A']]) {
      execFileSync('git', args, { cwd: temporary, stdio: 'pipe' })
    }
    const adapter = await createQualifiedHybridAdapter(
      candidateManifest,
      runtimeLock,
      { requestTimeoutMs: 180_000, diagnosticSettleMs: 10_000 },
    )
    manager = new WorkspaceManager({ allowedRoots: [temporary], adapter })
    const opened = await manager.open(workspaceFile)
    const before = await manager.semanticSnapshot(opened.workspaceId)
    const sourceBefore = await readFile(sourcePath, 'utf8')
    observation.baselineDiagnostics = manager.diagnostics(opened.workspaceId)
    assert.equal(manager.diagnostics(opened.workspaceId).filter(item => item.severity === 'error').length, 0, 'Baseline has no semantic errors')
    const byName = (snapshot: SemanticSnapshot, name: string) => {
      const found = snapshot.elements.filter((element) => element.qualifiedName === name)
      assert.equal(found.length, 1, `Expected one exact target ${name}`)
      return found[0]!
    }
    const packageElement = byName(before, 'ContributorPilot')
    const requirement = byName(before, 'ContributorPilot::responseWithinBound')
    const attribute = byName(before, 'ContributorPilot::ControlController::responseLimitMs')
    const originalDoc = /requirement responseWithinBound\s*\{\s*doc \/\*([\s\S]*?)\*\//u.exec(sourceBefore)?.[1]
    assert.ok(originalDoc, 'Frozen fixture requirement documentation')
    const envelope = (command: WorkbenchCommand, snapshot = before): CommandEnvelope => ({
      schemaVersion: 1, commandId: `contributor-qualification:${crypto.randomUUID()}`,
      workspaceId: opened.workspaceId, baseSnapshotSha256: snapshot.snapshotSha256,
      baseDocuments: Object.fromEntries(snapshot.documents.map((document) => [document.uri, document.sha256])),
      requestedBy: { kind: 'user', id: 'automated-fictional-qualification' }, command,
    })
    const invalidSource = sourceBefore.replace('responseLimitMs : ScalarValues::Real', 'responseLimitMs : UnknownContributorScalar')
    assert.notEqual(invalidSource, sourceBefore)
    const invalid = await manager.proposeCommand(envelope({ kind: 'replace-document', documentUri: before.documents[0]!.uri, text: invalidSource }))
    observation.rejectedInvalidDiagnostics = invalid.diagnosticsAfter
    assert.ok(invalid.diagnosticsAfter.some(item => item.severity === 'error'), 'Unknown type produces authoritative errors')
    assert.notEqual(invalid.validation.state, 'validated', 'Invalid source must not validate')
    await assert.rejects(() => manager!.applyCommand({ workspaceId: opened.workspaceId, proposalId: invalid.proposalId,
      approvalId: 'invalid-fictional-approval', approvedBy: { kind: 'user', id: 'automated-fictional-qualification' } }))
    assert.equal(await readFile(sourcePath, 'utf8'), sourceBefore, 'Rejected invalid apply preserves baseline')
    await manager.createReview(opened.workspaceId, {
      id: 'CP-REVIEW', title: 'Fictional acknowledgement change',
      scope: { query: { schemaVersion: 1, mode: 'requirements', maxResults: 100, depth: 2 } }, actor: 'qualification', at: new Date().toISOString(),
    })
    await manager.addReviewFinding(opened.workspaceId, {
      reviewId: 'CP-REVIEW', finding: {
        id: 'HIST-A-01', elementId: attribute.id, severity: 'major', category: 'verification',
        statement: 'HIST-A-01: historical 95 ms at FIELD-A is a baseline A observation; review applicability after a provision change. ACK-MEANING-01 remains open.',
        actor: 'qualification', at: new Date().toISOString(),
      },
    })
    const packageDoc = /doc \/\*([\s\S]*?)\*\//u.exec(sourceBefore)?.[1]
    assert.ok(packageDoc, 'Frozen fixture package documentation')
    const command: WorkbenchCommand = { kind: 'batch-edit', commands: [
      { kind: 'update-documentation', targetId: packageElement.id, documentation: packageDoc.trim().replace('CP-A /', 'CP-B /').replace('Baseline A carries a 120 ms', 'Candidate B carries an 80 ms') },
      { kind: 'set-attribute-value', targetId: attribute.id, value: 80 },
      { kind: 'update-documentation', targetId: requirement.id, documentation: originalDoc.trim().replace('Baseline A:', 'Candidate B:').replace('within 120 ms', 'within 80 ms') },
    ] }
    const proposal = await manager.proposeCommand(envelope(command))
    assert.equal(await readFile(sourcePath, 'utf8'), sourceBefore, 'Proposal must not mutate source')
    assert.equal(proposal.validation.state, 'validated')
    assert.deepEqual(proposal.conflicts, [])
    // A second same-base proposal must become stale when the first is applied.
    const stale = await manager.proposeCommand(envelope(command))
    const approved = await manager.applyCommand({ workspaceId: opened.workspaceId, proposalId: proposal.proposalId,
      approvalId: 'automated-fictional-approval', approvedBy: { kind: 'user', id: 'automated-fictional-qualification' } })
    assert.equal(approved.transaction.state, 'FINALIZED')
    const sourceAfter = await readFile(sourcePath, 'utf8')
    assert.equal(sourceAfter, await readFile(resolve(root, 'fixtures/expected/contributor-pilot-candidate.sysml'), 'utf8'), 'Applied source agrees with the independently frozen candidate')
    assert.match(sourceAfter, /responseLimitMs : ScalarValues::Real = 80;/u)
    assert.match(sourceAfter, /within 80 ms/u)
    assert.match(sourceAfter, /historicalObservedResponseMillisecondsAtA : ScalarValues::Real = 95;/u)
    assert.match(sourceAfter, /ACK-MEANING-01 is\s+OPEN/u)
    const untouchedState = sourceBefore.slice(sourceBefore.indexOf('    state def UnrelatedAdvancedLifecycle'), sourceBefore.indexOf('    requirement responseWithinBound'))
    assert.ok(sourceAfter.includes(untouchedState), 'Unrelated advanced source and comments remain byte exact')
    const after = await manager.semanticSnapshot(opened.workspaceId)
    observation.candidateDiagnostics = manager.diagnostics(opened.workspaceId)
    assert.equal(manager.diagnostics(opened.workspaceId).filter(item => item.severity === 'error').length, 0, 'Candidate has no semantic errors')
    assert.equal(byName(after, requirement.qualifiedName).id, requirement.id)
    assert.equal(byName(after, attribute.qualifiedName).id, attribute.id)
    await assert.rejects(() => manager!.applyCommand({ workspaceId: opened.workspaceId, proposalId: stale.proposalId,
      approvalId: 'stale-approval', approvedBy: { kind: 'user', id: 'qualification' } }))
    const staleness = await manager.reviewStaleness(opened.workspaceId, 'CP-REVIEW')
    assert.ok(staleness.stale.some((finding) => finding.findingId === 'HIST-A-01'), 'Changed provision makes the anchored historical observation need review')
    observation.reviewStaleness = staleness
    const report = await manager.generateReport(opened.workspaceId, {
      reportId: 'contributor-review-package', kind: 'review-findings', at: new Date().toISOString(),
      exclusions: ['No physical verification or human pilot acceptance.'],
    })
    observation.report = report
    const undo = await manager.proposeUndo({ workspaceId: opened.workspaceId,
      commandId: 'contributor-undo', appliedProposalId: proposal.proposalId,
      requestedBy: { kind: 'user', id: 'automated-fictional-qualification' } })
    assert.equal(undo.validation.state, 'validated')
    await manager.applyCommand({ workspaceId: opened.workspaceId, proposalId: undo.proposalId,
      approvalId: 'undo-fictional-approval', approvedBy: { kind: 'user', id: 'automated-fictional-qualification' } })
    assert.equal(await readFile(sourcePath, 'utf8'), sourceBefore, 'Undo restores exact bytes')
    await manager.close(opened.workspaceId)
    const reopened = await manager.open(workspaceFile)
    const restored = await manager.semanticSnapshot(reopened.workspaceId)
    observation.restoredDiagnostics = manager.diagnostics(reopened.workspaceId)
    assert.equal(manager.diagnostics(reopened.workspaceId).filter(item => item.severity === 'error').length, 0, 'Restored baseline has no semantic errors')
    assert.equal(restored.snapshotSha256, before.snapshotSha256, 'Reopening retains the restored baseline')
    observation.result = 'pass'
    observation.checks = ['invalid-source-rejected', 'zero-semantic-errors', 'independent-candidate-source-match', 'no-write-before-approval', 'atomic-bulk-apply', 'literal-and-statement-aligned',
      'historical-observation-preserved', 'unrelated-source-preserved', 'durable-ids-preserved',
      'stale-apply-rejected', 'anchored-review-stale', 'report-generated', 'byte-exact-undo', 'clean-reopen']
    observation.source = { before: hash(sourceBefore), after: hash(sourceAfter), restored: hash(await readFile(sourcePath, 'utf8')) }
    observation.elementCount = before.elements.length
    observation.relationshipCount = before.relationships.length
    if (process.argv.includes('--keep-workspace')) observation.workspace = temporary
  }
} catch (error) {
  observation.result = 'fail'
  observation.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  await manager?.dispose()
  observation.durationMs = Math.round(performance.now() - started)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(observation, null, 2) + '\n')
  if (temporary && !process.argv.includes('--keep-workspace')) await rm(temporary, { recursive: true, force: true })
  process.stdout.write(JSON.stringify(observation, null, 2) + '\n')
}

function hash(text: string) { return createHash('sha256').update(text).digest('hex') }
