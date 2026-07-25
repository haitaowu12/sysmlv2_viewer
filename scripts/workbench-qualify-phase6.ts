import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  createQualifiedHybridAdapter,
} from '../packages/language-adapter/src/index.js'
import type {
  AiProvider,
  AiProviderContext,
  AiProviderProposal,
  AiToolExecutor,
} from '../packages/ai-orchestrator/src/index.js'
import type { SemanticElement } from '../packages/semantic-model/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourceFixture = resolve(
  repositoryRoot,
  'fixtures/workspaces/phase5-infrastructure',
)
const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-phase6-'))
const fixtureRoot = resolve(temporaryRoot, 'controlled-ai-pilot')
const reportPath = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'docs/revamp/phase6-qualification-observation.json'),
)
const actor = 'phase6-qualification-engineer'
const provider = qualificationProvider()

try {
  await cp(sourceFixture, fixtureRoot, { recursive: true })
  const adapter = await createQualifiedHybridAdapter(
    resolve(repositoryRoot, 'config/language-engine-candidates.json'),
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    { requestTimeoutMs: 180_000, diagnosticSettleMs: 10_000 },
  )
  const manager = new WorkspaceManager({
    allowedRoots: [fixtureRoot],
    adapter,
    workbenchVersion: '0.7.0',
    aiProviders: [provider],
  })
  try {
    const status = await manager.open(
      resolve(fixtureRoot, 'sysml-workspace.yaml'),
    )
    const beforeSnapshot = await manager.semanticSnapshot(status.workspaceId)
    const target = beforeSnapshot.elements.find(
      (element) =>
        element.kind === 'PartDefinition' &&
        element.name === 'ControlCentre',
    )
    if (!target) {
      throw new Error('Controlled AI qualification target is unavailable')
    }
    provider.targetId = target.id
    const sourceBefore = await readCanonicalSource(beforeSnapshot)
    const aiStatus = manager.aiStatus()
    if (
      aiStatus.networkProvidersEnabled ||
      aiStatus.providers.some((candidate) =>
        candidate.networkAccess || !candidate.enabled) ||
      aiStatus.tools.length !== 12
    ) {
      throw new Error('Controlled AI default policy is not local and bounded')
    }

    const hallucinated = await manager.requestAi(status.workspaceId, {
      schemaVersion: 1,
      operationId: 'AI-P6-HALLUCINATION-001',
      workspaceId: status.workspaceId,
      userRequest: 'Return a hallucinated identity for qualification.',
      requestedBy: actor,
      providerId: provider.id,
      at: '2026-07-25T22:40:00.000Z',
    })
    if (
      hallucinated.state !== 'rejected' ||
      !hallucinated.validation.reasons.some((reason) =>
        reason.includes('unknown model identities'))
    ) {
      throw new Error('Hallucinated model identity was not rejected')
    }
    assertCanonicalUnchanged(
      sourceBefore,
      await readCanonicalSource(beforeSnapshot),
      'hallucinated response',
    )

    const proposal = await manager.requestAi(status.workspaceId, {
      schemaVersion: 1,
      operationId: 'AI-P6-RENAME-001',
      workspaceId: status.workspaceId,
      userRequest: 'Propose a reviewed control-centre rename.',
      requestedBy: actor,
      providerId: provider.id,
      at: '2026-07-25T22:41:00.000Z',
    })
    if (
      proposal.state !== 'proposed' ||
      !proposal.validation.accepted ||
      proposal.citations[0]?.id !== target.id ||
      proposal.proposals.length !== 1 ||
      proposal.proposals[0]?.validation.state !== 'validated' ||
      !proposal.proposals[0]?.semanticDiff?.changes.some(
        (change) => change.kind === 'element-renamed',
      ) ||
      proposal.approval.approved
    ) {
      throw new Error(
        `Grounded AI proposal is incomplete or unvalidated: ${JSON.stringify(proposal)}`,
      )
    }
    assertCanonicalUnchanged(
      sourceBefore,
      await readCanonicalSource(beforeSnapshot),
      'validated proposal',
    )

    let nonUserApprovalRejected = false
    try {
      await manager.applyAi(
        status.workspaceId,
        {
          schemaVersion: 1,
          operationId: proposal.operationId,
          workspaceId: status.workspaceId,
          approvalId: 'INVALID-AI-SELF-APPROVAL',
          approvedBy: { kind: 'ai', id: provider.id },
          at: '2026-07-25T22:42:00.000Z',
        } as never,
      )
    } catch (error) {
      nonUserApprovalRejected =
        error instanceof Error &&
        error.message.includes('approval by a user')
    }
    if (!nonUserApprovalRejected) {
      throw new Error('Non-user AI approval was not rejected')
    }
    assertCanonicalUnchanged(
      sourceBefore,
      await readCanonicalSource(beforeSnapshot),
      'rejected self-approval',
    )

    await manager.close(status.workspaceId)
    const reopened = await manager.open(
      resolve(fixtureRoot, 'sysml-workspace.yaml'),
    )
    const applied = await manager.applyAi(reopened.workspaceId, {
      schemaVersion: 1,
      operationId: proposal.operationId,
      workspaceId: reopened.workspaceId,
      approvalId: 'APPROVE-AI-P6-RENAME-001',
      approvedBy: { kind: 'user', id: actor },
      at: '2026-07-25T22:43:00.000Z',
    })
    if (
      applied.state !== 'applied' ||
      !applied.approval.approved ||
      applied.approval.approvedBy !== actor ||
      applied.receipts.length !== 1
    ) {
      throw new Error('User-approved AI proposal did not apply')
    }
    const afterSnapshot = await manager.semanticSnapshot(reopened.workspaceId)
    const renamed = afterSnapshot.elements.find(
      (element) =>
        element.id === target.id &&
        element.name === 'AIReviewedControlCentre',
    )
    if (!renamed) {
      throw new Error('Approved AI rename did not preserve identity')
    }
    const audit = await manager.listAiAudit(reopened.workspaceId)
    const persisted = audit.find(
      (operation) => operation.operationId === proposal.operationId,
    )
    if (
      persisted?.state !== 'applied' ||
      persisted.audit.recordSha256.length !== 64
    ) {
      throw new Error('Applied AI operation audit is unavailable or invalid')
    }
    const runtimeLock = JSON.parse(await readFile(
      resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
      'utf8',
    ))
    const report = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      gate: 'P6',
      result: 'pass',
      runtimeLock,
      fixture: {
        id: reopened.workspaceId,
        documents: reopened.documentCount,
        elements: beforeSnapshot.elements.length,
      },
      policy: {
        defaultProviderId: aiStatus.defaultProviderId,
        networkProvidersEnabled: aiStatus.networkProvidersEnabled,
        provider: aiStatus.providers[0],
        toolNames: aiStatus.tools.map((tool) => tool.name),
      },
      hallucinationRejection: {
        operationId: hallucinated.operationId,
        state: hallucinated.state,
        reasons: hallucinated.validation.reasons,
        canonicalSourceUnchanged: true,
        auditSha256: hallucinated.audit.recordSha256,
      },
      proposal: {
        operationId: proposal.operationId,
        stateBeforeApproval: proposal.state,
        citedElementIds: proposal.citations.map((element) => element.id),
        assumptions: proposal.assumptions,
        commandKinds: proposal.commands.map((command) => command.kind),
        affectedElementIds: proposal.affectedElementIds,
        validationState: proposal.proposals.map(
          (candidate) => candidate.validation.state,
        ),
        semanticChanges: proposal.proposals.flatMap(
          (candidate) =>
            candidate.semanticDiff?.changes.map((change) => change.kind) ?? [],
        ),
        diagnosticsBefore: proposal.validation.diagnosticsBefore.length,
        diagnosticsAfter: proposal.validation.diagnosticsAfter.length,
        toolCalls: proposal.toolCalls,
        canonicalSourceUnchangedBeforeApproval: true,
        nonUserApprovalRejected,
      },
      approval: {
        operationId: applied.operationId,
        state: applied.state,
        approvalId: applied.approval.approvalId,
        approvedBy: applied.approval.approvedBy,
        receipts: applied.receipts.map((receipt) => ({
          proposalId: receipt.proposalId,
          transactionState: receipt.transaction.state,
          snapshotSha256: receipt.appliedSnapshotSha256,
        })),
        identityPreserved: renamed.id === target.id,
        renamedQualifiedName: renamed.qualifiedName,
        restartSafe: true,
        auditPath: applied.audit.path,
        auditSha256: applied.audit.recordSha256,
      },
      auditRecords: audit.map((operation) => ({
        operationId: operation.operationId,
        state: operation.state,
        recordSha256: operation.audit.recordSha256,
      })),
      legacyWholeDocumentMutation: {
        implementationDeleted: true,
        endpoints: [
          '/api/ai/generate-model',
          '/api/ai/edit-model',
        ],
        response: '410 Gone',
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

function qualificationProvider(): AiProvider & { targetId: string } {
  return {
    id: 'qualification-grounded-provider',
    displayName: 'Qualification grounded provider',
    model: 'mock-contract-1',
    networkAccess: false,
    targetId: '',
    async propose(
      context: AiProviderContext,
      tools: AiToolExecutor,
    ): Promise<AiProviderProposal> {
      if (context.userRequest.includes('hallucinated')) {
        return {
          message: 'This response deliberately cites an unknown identity.',
          citedElementIds: ['wb:hallucinated:does-not-exist'],
          assumptions: ['Qualification negative control.'],
          commands: [],
        }
      }
      const target = await tools.call<SemanticElement | null>('get_element', {
        elementId: this.targetId,
      })
      await tools.call('get_relationships', {
        elementId: this.targetId,
        direction: 'both',
      })
      if (!target) {
        throw new Error('Qualification provider could not resolve its target')
      }
      return {
        message:
          `Proposed a source-backed rename for ${target.qualifiedName}.`,
        citedElementIds: [target.id],
        assumptions: [
          'The cited control-centre definition is the intended review target.',
        ],
        commands: [{
          kind: 'rename-element',
          targetId: target.id,
          newName: 'AIReviewedControlCentre',
        }],
      }
    },
  }
}

async function readCanonicalSource(
  snapshot: Awaited<ReturnType<WorkspaceManager['semanticSnapshot']>>,
): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(
    snapshot.documents.map(async (document) => [
      document.uri,
      await readFile(new URL(document.uri), 'utf8'),
    ]),
  ))
}

function assertCanonicalUnchanged(
  expected: Record<string, string>,
  actual: Record<string, string>,
  stage: string,
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Canonical source changed during ${stage}`)
  }
}

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
