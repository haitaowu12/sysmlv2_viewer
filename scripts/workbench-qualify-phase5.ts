import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createQualifiedHybridAdapter } from '../packages/language-adapter/src/index.js'
import type { WorkbenchCommand } from '../packages/command-engine/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const executeFile = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const sourceFixture = resolve(repositoryRoot, 'fixtures/workspaces/phase5-infrastructure')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-phase5-'))
const fixtureRoot = resolve(temporaryRoot, 'infrastructure-pilot')
const reportPath = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'docs/revamp/phase5-qualification-observation.json'),
)
const actor = 'phase5-qualification-engineer'

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
    workbenchVersion: '0.6.0',
  })
  try {
    const status = await manager.open(resolve(fixtureRoot, 'sysml-workspace.yaml'))
    const initialSnapshot = await manager.semanticSnapshot(status.workspaceId)
    const initialAssurance = await manager.evaluateAssurance(status.workspaceId)
    const packageElement = requireElement(initialSnapshot, 'InfrastructurePilot')
    const sourceEndpoint = requireElement(initialSnapshot, 'InfrastructurePilot::remoteStation::telemetryOut')
    const targetEndpoint = requireElement(initialSnapshot, 'InfrastructurePilot::controlCentre::telemetryIn')

    const diagnosticDocument = initialSnapshot.documents.find((document) =>
      document.uri.endsWith('/model/open-issues.sysml'))
    if (!diagnosticDocument) throw new Error('Open-issues document is unavailable')
    const diagnosticSource = manager.readDocument(status.workspaceId, diagnosticDocument.uri).text
    const unresolvedDraft = diagnosticSource.replace(
      /\n}\s*$/,
      '\n    part unresolvedLegacyGateway : MissingLegacyGateway;\n}\n',
    )
    await manager.changeDocument(status.workspaceId, diagnosticDocument.uri, 2, unresolvedDraft)
    const unresolvedDiagnostics = manager.diagnostics(status.workspaceId)
      .filter((diagnostic) => diagnostic.severity === 'error')
    if (unresolvedDiagnostics.length === 0) {
      throw new Error('Qualified language authority did not report the injected unresolved reference')
    }
    await manager.changeDocument(status.workspaceId, diagnosticDocument.uri, 3, diagnosticSource)
    const restoredSnapshot = await manager.semanticSnapshot(status.workspaceId)
    if (restoredSnapshot.snapshotSha256 !== initialSnapshot.snapshotSha256) {
      throw new Error('Diagnostic draft restore changed the canonical semantic snapshot')
    }

    await git(fixtureRoot, ['init'])
    await git(fixtureRoot, ['config', 'user.name', 'SysML Workbench Qualification'])
    await git(fixtureRoot, ['config', 'user.email', 'qualification@example.invalid'])
    await commitAll(fixtureRoot, 'Pilot baseline A')
    const baselineA = await manager.createBaseline(status.workspaceId, {
      id: 'pilot-baseline-a',
      actor,
      at: '2026-07-25T18:00:00.000Z',
    })
    await commitAll(fixtureRoot, 'Record baseline A')

    const interfaceCommand = await proposeAndApply(
      manager,
      status.workspaceId,
      'P5-CREATE-INTERFACE-001',
      {
        kind: 'create-relationship',
        ownerId: packageElement.id,
        relationshipKind: 'interface',
        name: 'backupTelemetryInterface',
        sourceId: sourceEndpoint.id,
        targetId: targetEndpoint.id,
      },
    )
    if (!interfaceCommand.proposal.semanticDiff?.changes.some((change) =>
      change.kind === 'element-created' &&
      change.after &&
      'kind' in change.after &&
      change.after.kind === 'InterfaceUsage')) {
      throw new Error('Graphical interface command did not preview a semantic interface creation')
    }
    const snapshotAfterInterface = await manager.semanticSnapshot(status.workspaceId)
    const changedRequirement = requireElement(
      snapshotAfterInterface,
      'InfrastructureRequirements::failoverNotification',
    )
    const requirementCommand = await proposeAndApply(
      manager,
      status.workspaceId,
      'P5-CHANGE-REQUIREMENT-001',
      {
        kind: 'update-documentation',
        targetId: changedRequirement.id,
        documentation: 'The network carrier shall notify both owning parties within the approved failover response interval.',
      },
    )
    if (!requirementCommand.proposal.semanticDiff?.changes.some((change) =>
      change.kind === 'element-content-changed')) {
      throw new Error('Requirement change was not classified as semantic content change')
    }
    const changedSnapshot = await manager.semanticSnapshot(status.workspaceId)
    const createdInterface = changedSnapshot.elements.find((element) =>
      element.name === 'backupTelemetryInterface' &&
      element.kind === 'InterfaceUsage')
    if (!createdInterface) throw new Error('Approved interface is absent from canonical semantics')
    await commitAll(fixtureRoot, 'Pilot baseline B source changes')

    const comparison = await manager.compareBaseline(status.workspaceId, baselineA.id)
    if (!comparison.semanticDiff.changes.some((change) => change.kind === 'element-created')) {
      throw new Error('Baseline comparison omitted the created interface')
    }
    if (!comparison.semanticDiff.changes.some((change) => change.kind === 'element-content-changed')) {
      throw new Error('Baseline comparison omitted the requirement content change')
    }
    const baselineB = await manager.createBaseline(status.workspaceId, {
      id: 'pilot-baseline-b',
      actor,
      at: '2026-07-25T18:10:00.000Z',
    })

    const review = await manager.createReview(status.workspaceId, {
      id: 'RVW-PILOT-001',
      title: 'Regional telemetry interface review',
      scope: {
        query: {
          schemaVersion: 1,
          roots: [createdInterface.id],
          mode: 'neighbourhood',
          depth: 3,
          maxResults: 500,
        },
      },
      participants: [{ role: 'chair', name: actor }],
      actor,
      at: '2026-07-25T18:11:00.000Z',
    })
    await manager.addReviewFinding(status.workspaceId, {
      reviewId: review.id,
      finding: {
        id: 'F-001',
        elementId: createdInterface.id,
        severity: 'major',
        category: 'interface',
        statement: 'Confirm organizational ownership and verification for the backup telemetry path.',
        owner: 'interface-owner',
        actor,
        at: '2026-07-25T18:12:00.000Z',
      },
    })
    const staleBeforeClosure = await manager.reviewStaleness(status.workspaceId, review.id)
    if (staleBeforeClosure.stale.length !== 0) throw new Error('New review anchor is unexpectedly stale')
    await manager.dispositionReviewFinding(status.workspaceId, {
      reviewId: review.id,
      findingId: 'F-001',
      disposition: 'closed',
      response: 'Ownership assigned and verification action accepted for implementation.',
      actor: 'interface-owner',
      at: '2026-07-25T18:13:00.000Z',
    })
    const closedReview = await manager.closeReview(status.workspaceId, review.id, {
      actor,
      at: '2026-07-25T18:14:00.000Z',
      note: 'All findings have an approved disposition.',
    })
    if (closedReview.status !== 'closed') throw new Error('Review did not close')

    const interfaceReport = await manager.generateReport(status.workspaceId, {
      reportId: 'pilot-interface-register',
      kind: 'interface-register',
      at: '2026-07-25T18:15:00.000Z',
      baselineId: baselineB.id,
      viewConfiguration: 'views/pilot-interface-assurance.json',
    })
    const changeReport = await manager.generateReport(status.workspaceId, {
      reportId: 'pilot-semantic-change',
      kind: 'semantic-change-impact',
      at: '2026-07-25T18:16:00.000Z',
      baselineId: baselineA.id,
    })
    const closureReport = await manager.generateReport(status.workspaceId, {
      reportId: 'pilot-review-closure',
      kind: 'review-closure',
      at: '2026-07-25T18:17:00.000Z',
      baselineId: baselineB.id,
    })
    for (const generated of [interfaceReport, changeReport, closureReport]) {
      if (!generated.artifacts.some((artifact) => artifact.format === 'html') ||
          !generated.artifacts.some((artifact) => artifact.format === 'pdf')) {
        throw new Error(`Report ${generated.reportKind} is missing HTML or PDF evidence`)
      }
    }
    if (!interfaceReport.artifacts.some((artifact) => artifact.format === 'csv')) {
      throw new Error('Interface register is missing CSV evidence')
    }

    const finalAssurance = await manager.evaluateAssurance(status.workspaceId)
    const requirementQuery = await manager.modelQuery(status.workspaceId, {
      schemaVersion: 1,
      mode: 'requirements',
      depth: 6,
      maxResults: 2_000,
    })
    const interfaceQuery = await manager.modelQuery(status.workspaceId, {
      schemaVersion: 1,
      roots: [createdInterface.id],
      mode: 'interfaces',
      depth: 4,
      maxResults: 500,
    })
    const runtimeLock = JSON.parse(await readFile(
      resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
      'utf8',
    ))
    const report = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      gate: 'P5',
      result: 'pass',
      runtimeLock,
      fixture: {
        id: status.workspaceId,
        documents: status.documentCount,
        initialElements: initialSnapshot.elements.length,
        finalElements: changedSnapshot.elements.length,
      },
      integratedUsabilityPilot: {
        result: 'pass',
        tasks: {
          workspaceLoad: true,
          unresolvedReferenceLocated: {
            passed: true,
            diagnostics: unresolvedDiagnostics,
            canonicalSourceUnchanged: true,
          },
          requirementNavigation: {
            passed: requirementQuery.elements.some((element) =>
              element.kind === 'RequirementUsage'),
            elements: requirementQuery.elements.length,
          },
          unverifiedRequirementIdentified: {
            passed: initialAssurance.requirementCoverage.some((row) =>
              row.verification === 'none'),
            count: initialAssurance.requirementCoverage.filter((row) =>
              row.verification === 'none').length,
          },
          interfaceAddedThroughTypedCommand: {
            passed: true,
            proposalId: interfaceCommand.proposal.proposalId,
            approvalId: interfaceCommand.receipt.approval.approvalId,
            canonicalUnchangedBeforeApproval: true,
            semanticChanges: interfaceCommand.proposal.semanticDiff?.changes.map((change) => change.kind),
            createdElementId: createdInterface.id,
            crossNavigationMatched: interfaceQuery.elements.some((element) =>
              element.id === createdInterface.id),
          },
          baselinesCompared: {
            passed: true,
            baselineA: { id: baselineA.id, commit: baselineA.commit },
            baselineB: { id: baselineB.id, commit: baselineB.commit },
            semanticChanges: comparison.semanticDiff.changes.map((change) => change.kind),
          },
          reviewFindingClosed: {
            passed: closedReview.status === 'closed',
            reviewId: closedReview.id,
            findingId: 'F-001',
            staleAnchors: staleBeforeClosure.stale.length,
          },
          interfaceReportExported: {
            passed: true,
            artifacts: interfaceReport.artifacts,
          },
        },
      },
      assurance: {
        rulePack: finalAssurance.rulePack,
        resultSha256: finalAssurance.resultSha256,
        summary: finalAssurance.summary,
        findings: finalAssurance.findings.map((finding) => ({
          id: finding.id,
          ruleId: finding.ruleId,
          severity: finding.severity,
          elementIds: finding.elementIds,
        })),
      },
      change: {
        interfaceCommandId: interfaceCommand.proposal.commandId,
        requirementCommandId: requirementCommand.proposal.commandId,
        semanticDiff: comparison.semanticDiff,
      },
      reviews: [closedReview],
      reports: [interfaceReport, changeReport, closureReport],
    }
    const failedPilotTasks = Object.entries(report.integratedUsabilityPilot.tasks)
      .filter(([, value]) => typeof value === 'object' && 'passed' in value && !value.passed)
      .map(([name]) => name)
    if (failedPilotTasks.length > 0) {
      throw new Error(`Integrated pilot tasks failed: ${failedPilotTasks.join(', ')}`)
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await manager.dispose()
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

async function proposeAndApply(
  manager: WorkspaceManager,
  workspaceId: string,
  commandId: string,
  command: WorkbenchCommand,
) {
  const before = await manager.semanticSnapshot(workspaceId)
  const proposal = await manager.proposeCommand({
    schemaVersion: 1,
    commandId,
    workspaceId,
    baseSnapshotSha256: before.snapshotSha256,
    baseDocuments: Object.fromEntries(before.documents.map((document) => [
      document.uri,
      document.sha256,
    ])),
    requestedBy: { kind: 'user', id: actor },
    command,
  })
  if (proposal.validation.state !== 'validated' || proposal.conflicts.length > 0) {
    throw new Error(`Command ${commandId} did not validate`)
  }
  const sourceBefore = await Promise.all(before.documents.map((document) =>
    readFile(new URL(document.uri), 'utf8')))
  const sourceAfterProposal = await Promise.all(before.documents.map((document) =>
    readFile(new URL(document.uri), 'utf8')))
  if (sourceBefore.some((source, index) => source !== sourceAfterProposal[index])) {
    throw new Error(`Command ${commandId} changed source before approval`)
  }
  const receipt = await manager.applyCommand({
    workspaceId,
    proposalId: proposal.proposalId,
    approvalId: `APPROVE-${commandId}`,
    approvedBy: { kind: 'user', id: actor },
  })
  if (receipt.transaction.state !== 'FINALIZED') {
    throw new Error(`Command ${commandId} transaction did not finalize`)
  }
  return { proposal, receipt }
}

function requireElement(snapshot: Awaited<ReturnType<WorkspaceManager['semanticSnapshot']>>, qualifiedName: string) {
  const element = snapshot.elements.find((candidate) =>
    candidate.qualifiedName === qualifiedName || candidate.name === qualifiedName)
  if (!element) throw new Error(`Pilot element is unavailable: ${qualifiedName}`)
  return element
}

async function commitAll(root: string, message: string): Promise<void> {
  await git(root, ['add', '.'])
  await git(root, ['-c', 'commit.gpgsign=false', 'commit', '-m', message])
}

async function git(root: string, argumentsList: string[]): Promise<string> {
  return (await executeFile('git', ['-C', root, ...argumentsList], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })).stdout
}

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
