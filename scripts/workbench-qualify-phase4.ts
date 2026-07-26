import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createQualifiedHybridAdapter } from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourceFixture = resolve(repositoryRoot, 'fixtures/workspaces/phase2-semantic')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-phase4-'))
const fixtureRoot = resolve(temporaryRoot, 'phase4-product-shell')
const reportPath = resolve(
  valueAfter('--output') ?? resolve(repositoryRoot, 'docs/revamp/phase4-qualification-observation.json'),
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
    const sourceUri = beforeSnapshot.documents.find((document) => document.uri.endsWith('/model/assurance.sysml'))?.uri
    if (!sourceUri) throw new Error('Phase 4 source document is unavailable')
    const document = manager.readDocument(status.workspaceId, sourceUri)
    const sourceBefore = document.text
    const sourceDraft = sourceBefore.replace(/\n}\s*$/, '\n\n    port qualificationSourcePort : CommandPort;\n}\n')
    if (sourceDraft === sourceBefore) throw new Error('Phase 4 source draft was not constructed')

    const queryModes = ['containment', 'type-hierarchy', 'dependency', 'neighbourhood', 'requirements', 'verification', 'interfaces'] as const
    const queryEvidence = []
    for (const mode of queryModes) {
      const result = await manager.modelQuery(status.workspaceId, {
        schemaVersion: 1,
        mode,
        depth: 6,
        maxResults: 2_000,
      })
      queryEvidence.push({ mode, elements: result.elements.length, relationships: result.relationships.length, truncated: result.truncated })
    }

    const savedView = await manager.saveView(status.workspaceId, {
      schemaVersion: 1,
      id: 'qualification-interface-review',
      name: 'Qualification interface review',
      query: { mode: 'interfaces', depth: 4, maxResults: 500 },
      notation: 'interconnection',
      layout: {
        positions: Object.fromEntries(beforeSnapshot.elements.slice(0, 500).map((element, index) => [element.id, { x: (index % 4) * 220, y: Math.floor(index / 4) * 112 }])),
      },
      updatedAt: new Date().toISOString(),
    })
    const listedViews = await manager.listViews(status.workspaceId)
    if (!listedViews.some((view) => view.id === savedView.id)) {
      throw new Error('Saved projection was not persisted')
    }

    const proposal = await manager.proposeCommand({
      schemaVersion: 1,
      commandId: 'P4-SOURCE-DRAFT-001',
      workspaceId: status.workspaceId,
      baseSnapshotSha256: beforeSnapshot.snapshotSha256,
      baseDocuments: Object.fromEntries(beforeSnapshot.documents.map((item) => [item.uri, item.sha256])),
      requestedBy: { kind: 'user', id: 'phase4-qualification' },
      command: { kind: 'replace-document', documentUri: sourceUri, text: sourceDraft },
    })
    if (proposal.validation.state !== 'validated' || proposal.editProfile.id !== 'source-text-replace') {
      throw new Error('Source draft did not produce a validated reviewable patch')
    }
    if (await readFile(resolve(fixtureRoot, 'model/assurance.sysml'), 'utf8') !== sourceBefore) {
      throw new Error('Source draft changed canonical source before approval')
    }
    const applied = await manager.applyCommand({
      workspaceId: status.workspaceId,
      proposalId: proposal.proposalId,
      approvalId: 'P4-SOURCE-APPROVAL-001',
      approvedBy: { kind: 'user', id: 'phase4-qualification' },
    })
    const afterSnapshot = await manager.semanticSnapshot(status.workspaceId)
    const created = afterSnapshot.elements.find((element) => element.name === 'qualificationSourcePort')
    if (!created || created.source.uri !== sourceUri) {
      throw new Error('Approved source draft is absent from the semantic projection')
    }
    const interfaceProjection = await manager.modelQuery(status.workspaceId, {
      schemaVersion: 1,
      roots: ['Phase2Assurance'],
      mode: 'interfaces',
      depth: 6,
      maxResults: 2_000,
    })
    if (!interfaceProjection.elements.some((element) => element.id === created.id)) {
      throw new Error('Source/visual cross-navigation identity is absent from interface projection')
    }

    const undo = await manager.proposeUndo({
      workspaceId: status.workspaceId,
      commandId: 'P4-SOURCE-UNDO-001',
      appliedProposalId: proposal.proposalId,
      requestedBy: { kind: 'user', id: 'phase4-qualification' },
    })
    const undone = await manager.applyCommand({
      workspaceId: status.workspaceId,
      proposalId: undo.proposalId,
      approvalId: 'P4-SOURCE-UNDO-APPROVAL-001',
      approvedBy: { kind: 'user', id: 'phase4-qualification' },
    })
    const sourceAfterUndo = await readFile(resolve(fixtureRoot, 'model/assurance.sysml'), 'utf8')
    if (sourceAfterUndo !== sourceBefore) throw new Error('Source edit undo was not byte exact')

    const report = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      gate: 'P4-SERVICE-PRODUCT-SHELL-FOUNDATION',
      evidenceLayer: 'service-integration',
      result: 'service-integration-pass',
      productGate: {
        id: 'P4',
        state: 'invalidated',
        reason: 'This qualifier bypasses the delivered UI and cannot prove product or usability acceptance.',
      },
      fixture: { id: status.workspaceId, documents: status.documentCount },
      shell: {
        primaryRoute: 'service-backed-workbench',
        compatibilityRoute: '?legacy=1',
        activities: ['Explorer', 'Model', 'Diagrams', 'Traceability', 'Interfaces', 'Verification', 'Reviews', 'Changes', 'Reports', 'Settings'],
        surfaces: ['source', 'diagram', 'matrix', 'properties', 'problems'],
        languageFeatures: ['completion', 'hover', 'definition', 'references', 'formatting'],
        uiExercised: false,
        exactArtifactExercised: false,
        practitionerEvidence: false,
      },
      projections: queryEvidence,
      savedView: { id: savedView.id, listedAfterSave: true, layoutIdentities: Object.keys(savedView.layout?.positions ?? {}).length },
      sourceEdit: {
        proposalId: proposal.proposalId,
        validation: proposal.validation.state,
        editProfile: proposal.editProfile,
        canonicalUnchangedBeforeApproval: true,
        approvalId: applied.approval.approvalId,
        transactionState: applied.transaction.state,
        createdElementId: created.id,
        crossNavigationIdentityMatched: true,
        semanticChanges: proposal.semanticDiff?.changes.map((change) => change.kind) ?? [],
      },
      undo: { proposalId: undo.proposalId, transactionState: undone.transaction.state, byteExactRestore: true },
      diagnostics: manager.diagnostics(status.workspaceId),
      deferredToRecovery: [
        'exact-artifact UI qualification',
        'native source-authoring qualification',
        'notation-specific Interconnection View',
        'practitioner workflow evidence',
      ],
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
