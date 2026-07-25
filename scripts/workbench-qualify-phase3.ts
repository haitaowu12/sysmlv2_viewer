import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createQualifiedHybridAdapter } from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourceFixture = resolve(repositoryRoot, 'fixtures/workspaces/phase2-semantic')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-phase3-'))
const fixtureRoot = resolve(temporaryRoot, 'phase3-command-editing')
const reportPath = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'docs/revamp/phase3-qualification-observation.json'),
)

try {
  await cp(sourceFixture, fixtureRoot, { recursive: true })
  const adapter = await createQualifiedHybridAdapter(
    resolve(repositoryRoot, 'config/language-engine-candidates.json'),
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    { requestTimeoutMs: 180_000, diagnosticSettleMs: 10_000 },
  )
  const manager = new WorkspaceManager({ allowedRoots: [fixtureRoot], adapter })
  try {
    const status = await manager.open(resolve(fixtureRoot, 'sysml-workspace.yaml'))
    const beforeSnapshot = await manager.semanticSnapshot(status.workspaceId)
    const owner = beforeSnapshot.elements.find(
      (element) => element.kind === 'Package' && element.name === 'Phase2Assurance',
    )
    if (!owner) throw new Error('Phase 3 fixture package is unavailable')
    const sourcePath = resolve(fixtureRoot, 'model/assurance.sysml')
    const sourceBefore = await readFile(sourcePath, 'utf8')
    const proposal = await manager.proposeCommand({
      schemaVersion: 1,
      commandId: 'P3-CREATE-PORT-001',
      workspaceId: status.workspaceId,
      baseSnapshotSha256: beforeSnapshot.snapshotSha256,
      baseDocuments: Object.fromEntries(
        beforeSnapshot.documents.map((document) => [document.uri, document.sha256]),
      ),
      requestedBy: { kind: 'user', id: 'phase3-qualification' },
      command: {
        kind: 'create-element',
        ownerId: owner.id,
        elementKind: 'PortUsage',
        name: 'qualificationPort',
        typeQualifiedName: 'CommandPort',
      },
    })
    if (
      proposal.validation.state !== 'validated' ||
      proposal.conflicts.length > 0 ||
      proposal.semanticDiff?.changes.some((change) => change.kind === 'element-created') !== true
    ) {
      throw new Error('Phase 3 create proposal did not pass authoritative validation')
    }
    if (await readFile(sourcePath, 'utf8') !== sourceBefore) {
      throw new Error('Proposal changed canonical source before approval')
    }
    const applied = await manager.applyCommand({
      workspaceId: status.workspaceId,
      proposalId: proposal.proposalId,
      approvalId: 'P3-APPROVAL-CREATE-001',
      approvedBy: { kind: 'user', id: 'phase3-qualification' },
    })
    if (applied.transaction.state !== 'FINALIZED') {
      throw new Error('Approved Phase 3 transaction did not finalize')
    }
    const sourceAfterCreate = await readFile(sourcePath, 'utf8')
    if (!sourceAfterCreate.includes('port qualificationPort : CommandPort;')) {
      throw new Error('Approved Phase 3 source edit was not applied')
    }
    const afterCreateSnapshot = await manager.semanticSnapshot(status.workspaceId)
    const created = afterCreateSnapshot.elements.find(
      (element) => element.name === 'qualificationPort',
    )
    if (!created) throw new Error('Created element is absent from semantic snapshot')

    const undoProposal = await manager.proposeUndo({
      workspaceId: status.workspaceId,
      commandId: 'P3-UNDO-CREATE-001',
      appliedProposalId: proposal.proposalId,
      requestedBy: { kind: 'user', id: 'phase3-qualification' },
    })
    if (undoProposal.validation.state !== 'validated') {
      throw new Error('Phase 3 undo proposal did not validate')
    }
    const undone = await manager.applyCommand({
      workspaceId: status.workspaceId,
      proposalId: undoProposal.proposalId,
      approvalId: 'P3-APPROVAL-UNDO-001',
      approvedBy: { kind: 'user', id: 'phase3-qualification' },
    })
    const sourceAfterUndo = await readFile(sourcePath, 'utf8')
    if (sourceAfterUndo !== sourceBefore) {
      throw new Error('Undo did not restore canonical source bytes')
    }
    const afterUndoSnapshot = await manager.semanticSnapshot(status.workspaceId)
    if (afterUndoSnapshot.snapshotSha256 !== beforeSnapshot.snapshotSha256) {
      throw new Error('Undo did not restore the original semantic snapshot')
    }

    await manager.close(status.workspaceId)
    const reopened = await manager.open(resolve(fixtureRoot, 'sysml-workspace.yaml'))
    const reopenedSnapshot = await manager.semanticSnapshot(reopened.workspaceId)
    if (reopenedSnapshot.snapshotSha256 !== beforeSnapshot.snapshotSha256) {
      throw new Error('Clean reopen changed the restored semantic snapshot')
    }
    const runtimeLock = JSON.parse(await readFile(
      resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
      'utf8',
    ))
    const report = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      gate: 'P3',
      result: 'pass',
      runtimeLock,
      fixture: {
        id: status.workspaceId,
        documents: status.documentCount,
        diagnosticsBefore: proposal.diagnosticsBefore,
        diagnosticsAfter: proposal.diagnosticsAfter,
      },
      command: {
        commandId: proposal.commandId,
        proposalId: proposal.proposalId,
        editProfile: proposal.editProfile,
        affectedElementIds: proposal.affectedElementIds,
        semanticChanges: proposal.semanticDiff.changes.map((change) => change.kind),
        approvalId: applied.approval.approvalId,
        transactionId: applied.transaction.transactionId,
        transactionState: applied.transaction.state,
        createdElementId: created.id,
      },
      undo: {
        commandId: undoProposal.commandId,
        proposalId: undoProposal.proposalId,
        editProfile: undoProposal.editProfile,
        transactionId: undone.transaction.transactionId,
        transactionState: undone.transaction.state,
        byteExactRestore: sourceAfterUndo === sourceBefore,
        semanticSnapshotRestore: afterUndoSnapshot.snapshotSha256 === beforeSnapshot.snapshotSha256,
      },
      source: {
        beforeSha256: digest(sourceBefore),
        afterCreateSha256: digest(sourceAfterCreate),
        afterUndoSha256: digest(sourceAfterUndo),
      },
      reopen: {
        snapshotSha256: reopenedSnapshot.snapshotSha256,
        matchesOriginal: reopenedSnapshot.snapshotSha256 === beforeSnapshot.snapshotSha256,
      },
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await manager.dispose()
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
