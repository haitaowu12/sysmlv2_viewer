import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { createQualifiedHybridAdapter, type EngineSemanticEvidence } from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'
import type { CommandEnvelope, WorkbenchCommand } from '../packages/command-engine/src/index.js'
import type { SemanticSnapshot } from '../packages/semantic-model/src/index.js'

const root = resolve(import.meta.dirname, '..')
const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1] }
const output = resolve(arg('--output') ?? 'generated/qualification/contributor-phase2.json')
const lock = resolve(arg('--runtime-lock') ?? 'config/language-engine-runtime-lock.json')
const manifest = resolve(arg('--candidate-manifest') ?? 'config/language-engine-candidates.json')
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const receipt: Record<string, unknown> = { recordedAt: new Date().toISOString(), result: 'running', profile: 'bounded-contributor-phase2', checks: [],
  limits: ['No authenticated agreement approval, physical verification, full language coverage or clean-machine qualification is implied.'] }
const checks: string[] = []
let temporary: string | undefined
let manager: WorkspaceManager | undefined
try {
  receipt.implementationRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  receipt.implementationDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
  receipt.runtimeLock = lock; receipt.runtimeLockSha256 = hash(await readFile(lock, 'utf8'))
  receipt.candidateManifest = manifest; receipt.candidateManifestSha256 = hash(await readFile(manifest, 'utf8'))
  temporary = await mkdtemp(resolve(tmpdir(), 'sysml-contributor-phase2-'))
  await cp(resolve(root, 'fixtures/workspaces/contributor-phase2/model'), resolve(temporary, 'model'), { recursive: true })
  await cp(resolve(root, 'fixtures/workspaces/contributor-phase2/sysml-workspace.yaml'), resolve(temporary, 'sysml-workspace.yaml'))
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Qualification', '-c', 'user.email=qualification@example.invalid', 'commit', '-qm', 'Fictional phase2 baseline']]) execFileSync('git', args, { cwd: temporary })
  const adapter = await createQualifiedHybridAdapter(manifest, lock, { requestTimeoutMs: 180_000, diagnosticSettleMs: 10_000 })
  manager = new WorkspaceManager({ allowedRoots: [temporary], adapter })
  const open = await manager.open(resolve(temporary, 'sysml-workspace.yaml'))
  const before = await manager.semanticSnapshot(open.workspaceId)
  const source = resolve(temporary, 'model/control.sysml')
  const original = await readFile(source, 'utf8')
  assert.deepEqual(manager.diagnostics(open.workspaceId), [])
  checks.push('baseline-zero-diagnostics')
  const named = (snapshot: SemanticSnapshot, name: string) => {
    const matches = snapshot.elements.filter(e => e.qualifiedName === `ContributorPhase2::system::${name}`)
    assert.equal(matches.length, 1, name); return matches[0]!
  }
  const id = (name: string) => named(before, name).id
  const envelope = (command: WorkbenchCommand, snapshot = before): CommandEnvelope => ({ schemaVersion: 1, commandId: crypto.randomUUID(), workspaceId: open.workspaceId,
    baseSnapshotSha256: snapshot.snapshotSha256, baseDocuments: Object.fromEntries(snapshot.documents.map(d => [d.uri, d.sha256])), requestedBy: { kind: 'user', id: 'fictional-qualification' }, command })
  const agreement: WorkbenchCommand = { kind: 'set-interface-agreement', targetId: id('controlAgreement'), sourceId: id('sender'), targetEndpointId: id('receiverB'),
    status: 'proposed', owner: 'Control interface owner', rationale: 'Proposed field B connection; acknowledgement meaning remains open.' }
  const invalid: Array<[string, WorkbenchCommand]> = [
    ['wrong-dimension-unit', { kind: 'set-quantity-value', targetId: id('responseTime'), value: 80, unitId: 'm' }],
    ['nonfinite-quantity', { kind: 'set-quantity-value', targetId: id('responseTime'), value: Number.NaN, unitId: 'ms' }],
    ['incompatible-reference', { kind: 'set-reference-target', targetId: id('selectedField'), referencedElementId: id('operator') }],
    ['dangling-reference', { kind: 'set-reference-target', targetId: id('selectedField'), referencedElementId: 'absent' }],
    ['wrong-port-type', { ...agreement, targetEndpointId: id('telemetry') }],
    ['wrong-port-direction', { ...agreement, targetEndpointId: id('senderB') }],
    ['missing-agreement-owner', { ...agreement, owner: '' }],
    ['mixed-batch-rejected', { kind: 'batch-edit', commands: [ { kind: 'set-quantity-value', targetId: id('responseTime'), value: 80, unitId: 'ms' }, { kind: 'set-reference-target', targetId: id('selectedField'), referencedElementId: id('operator') }] }],
  ]
  for (const [name, command] of invalid) {
    let rejected = false
    try { const proposal = await manager.proposeCommand(envelope(command)); rejected = proposal.validation.state !== 'validated'
      if (rejected) await assert.rejects(() => manager!.applyCommand({ workspaceId: open.workspaceId, proposalId: proposal.proposalId, approvalId: name, approvedBy: { kind: 'user', id: 'qualification' } }))
    } catch { rejected = true }
    assert.ok(rejected, name); assert.equal(await readFile(source, 'utf8'), original); checks.push(name)
  }
  const invalidType = await manager.proposeCommand(envelope({ kind: 'replace-document', documentUri: before.documents[0]!.uri,
    text: original.replace('ISQ::DurationValue', 'UnknownQuantityType') }))
  assert.notEqual(invalidType.validation.state, 'validated'); assert.ok(invalidType.diagnosticsAfter.some(d => d.severity === 'error'))
  await assert.rejects(() => manager!.applyCommand({ workspaceId: open.workspaceId, proposalId: invalidType.proposalId, approvalId: 'invalid-type', approvedBy: { kind: 'user', id: 'qualification' } }))
  assert.equal(await readFile(source, 'utf8'), original)
  receipt.invalidTypeDiagnostics = invalidType.diagnosticsAfter
  checks.push('authoritative-invalid-type-rejected')
  const command: WorkbenchCommand = { kind: 'batch-edit', commands: [
    { kind: 'set-quantity-value', targetId: id('responseTime'), value: 0.08, unitId: 's' },
    { kind: 'set-quantity-value', targetId: id('cableLength'), value: 2000, unitId: 'mm' },
    { kind: 'set-quantity-value', targetId: id('equipmentMass'), value: 3000, unitId: 'g' },
    { kind: 'set-reference-target', targetId: id('selectedField'), referencedElementId: id('fieldB') }, agreement,
  ] }
  const proposal = await manager.proposeCommand(envelope(command))
  receipt.proposalDiagnostics = proposal.diagnosticsAfter
  assert.equal(proposal.validation.state, 'validated'); assert.equal(await readFile(source, 'utf8'), original)
  const stale = await manager.proposeCommand(envelope(command))
  await manager.applyCommand({ workspaceId: open.workspaceId, proposalId: proposal.proposalId, approvalId: 'fictional-test-approval', approvedBy: { kind: 'user', id: 'qualification' } })
  const candidate = await readFile(source, 'utf8')
  assert.equal(candidate, await readFile(resolve(root, 'fixtures/expected/contributor-phase2-candidate.sysml'), 'utf8'))
  checks.push('no-write-before-approval', 'one-atomic-five-field-batch', 'independent-candidate-source-match')
  const after = await manager.semanticSnapshot(open.workspaceId)
  assert.deepEqual(manager.diagnostics(open.workspaceId), [])
  for (const name of ['responseTime', 'cableLength', 'equipmentMass', 'selectedField', 'controlAgreement', 'fieldA', 'fieldB']) assert.equal(named(after, name).id, id(name))
  assert.ok(after.relationships.some(r => r.kind === 'interface' && r.sourceId === id('controlAgreement') && r.targetId === id('receiverB') && r.provenance.features.includes('target')))
  assert.ok(!after.relationships.some(r => r.kind === 'interface' && r.sourceId === id('controlAgreement') && r.targetId === id('receiver') && r.provenance.features.includes('target')))
  const evidence = await adapter.semanticEvidence!(after.documents[0]!.uri)
  assertReferenceTarget(evidence, 'ContributorPhase2::system::selectedField', 'ContributorPhase2::system::fieldB')
  checks.push('stable-element-identities', 'engine-resolved-interface-target', 'engine-resolved-reference-target', 'candidate-zero-diagnostics')
  assert.match(candidate, /historicalObservation : ISQ::DurationValue = 95 \[SI::milli \* SI::s\]/u)
  assert.ok(candidate.includes(original.slice(original.indexOf('        state def UnrelatedLifecycle'))))
  checks.push('history-and-unrelated-content-preserved')
  await assert.rejects(() => manager!.applyCommand({ workspaceId: open.workspaceId, proposalId: stale.proposalId, approvalId: 'stale', approvedBy: { kind: 'user', id: 'qualification' } }))
  checks.push('stale-apply-rejected')
  const undo = await manager.proposeUndo({ workspaceId: open.workspaceId, commandId: crypto.randomUUID(), appliedProposalId: proposal.proposalId, requestedBy: { kind: 'user', id: 'qualification' } })
  assert.equal(undo.validation.state, 'validated')
  await manager.applyCommand({ workspaceId: open.workspaceId, proposalId: undo.proposalId, approvalId: 'undo', approvedBy: { kind: 'user', id: 'qualification' } })
  assert.equal(await readFile(source, 'utf8'), original)
  await manager.close(open.workspaceId)
  const reopened = await manager.open(resolve(temporary, 'sysml-workspace.yaml'))
  const restored = await manager.semanticSnapshot(reopened.workspaceId)
  assert.equal(restored.snapshotSha256, before.snapshotSha256); assert.deepEqual(manager.diagnostics(reopened.workspaceId), [])
  checks.push('byte-exact-undo', 'clean-reopen')
  receipt.result = 'pass'; receipt.source = { before: hash(original), after: hash(candidate), restored: hash(await readFile(source, 'utf8')) }
  if (process.argv.includes('--keep-workspace')) receipt.workspace = temporary
} catch (error) { receipt.result = 'fail'; receipt.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1 }
finally {
  await manager?.dispose(); receipt.checks = checks
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(receipt, null, 2) + '\n')
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n')
  if (temporary && !process.argv.includes('--keep-workspace')) await rm(temporary, { recursive: true, force: true })
}

function assertReferenceTarget(evidence: EngineSemanticEvidence, reference: string, target: string) {
  const source = evidence.elements.filter(e => e.qualifiedName === reference)
  assert.equal(source.length, 1)
  const range = source[0]!.range!
  assert.ok(evidence.relationships.some(r => r.targetQualifiedName === target && r.resolved && r.feature === 'memberElement' &&
    r.sourceRange && r.sourceRange.start.line >= range.start.line && r.sourceRange.end.line <= range.end.line), 'Engine resolves the reference initializer to the selected field')
}
