// @vitest-environment node
import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { access, cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PreservationControlAdapter,
  type LanguageAdapter,
} from '../../language-adapter/src/index.js'
import { LspProcessAdapter } from '../../language-adapter/src/lsp-process-adapter.js'
import {
  WORKBENCH_METHODS,
  WORKBENCH_PROTOCOL_VERSION,
} from '../../workbench-protocol/src/index.js'
import { WorkbenchService } from './service.js'

const sampleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/workspaces/phase1-sample',
)
const phase5PilotRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/workspaces/phase5-infrastructure',
)
const fakeServer = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../language-adapter/test-fixtures/fake-lsp.mjs',
)
const sampleDocument = pathToFileURL(
  resolve(sampleRoot, 'model/vehicle.sysml'),
).href
const workspacesRoot = resolve(sampleRoot, '..')
const services: WorkbenchService[] = []
const temporaryDirectories: string[] = []
const executeFile = promisify(execFile)

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('WorkbenchService', () => {
  it('requires initialize and negotiates visible capabilities', async () => {
    const service = createService()
    const blocked = await service.handle({
      jsonrpc: '2.0',
      id: 1,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: {
        workspaceFile: resolve(sampleRoot, 'sysml-workspace.yaml'),
      },
    })
    expect('error' in blocked && blocked.error.code).toBe(-32002)

    const initialized = await initialize(service)
    expect('result' in initialized && initialized.result).toMatchObject({
      protocolVersion: WORKBENCH_PROTOCOL_VERSION,
      languageAuthority: {
        qualificationStatus: 'control-only',
      },
      serviceCapabilities: {
        normalizedSemanticSnapshot: true,
        durableIdentityPersistence: true,
        boundedModelQuery: true,
      },
      capabilities: {
        workspaceLifecycle: true,
        diagnostics: false,
      },
    })
  })

  it('opens, queries, and closes an authorized workspace', async () => {
    const service = createService()
    await initialize(service)
    const opened = await service.handle({
      jsonrpc: '2.0',
      id: 2,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: {
        workspaceFile: resolve(sampleRoot, 'sysml-workspace.yaml'),
      },
    })
    expect('result' in opened && opened.result).toMatchObject({
      workspaceId: 'phase1-sample',
      documentCount: 3,
      semanticAuthority: 'none',
    })
    const readDocument = await service.handle({
      jsonrpc: '2.0',
      id: 21,
      method: WORKBENCH_METHODS.workspaceReadDocument,
      params: {
        workspaceId: 'phase1-sample',
        documentUri: sampleDocument,
      },
    })
    expect(readDocument).toMatchObject({
      result: {
        uri: sampleDocument,
        languageId: 'sysml',
        version: 1,
        text: expect.stringContaining('package'),
      },
    })
    const closed = await service.handle({
      jsonrpc: '2.0',
      id: 3,
      method: WORKBENCH_METHODS.workspaceClose,
      params: { workspaceId: 'phase1-sample' },
    })
    expect(closed).toMatchObject({ result: { closed: true } })
  })

  it('keeps the multi-file infrastructure pilot in mandatory workspace CI', async () => {
    const service = createService(createFakeLspAdapter(), [phase5PilotRoot])
    await initialize(service)
    const opened = await service.handle({
      jsonrpc: '2.0',
      id: 10,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: { workspaceFile: resolve(phase5PilotRoot, 'sysml-workspace.yaml') },
    })
    expect(opened).toMatchObject({
      result: {
        workspaceId: 'phase5-infrastructure-pilot',
        documentCount: 4,
        configurationName: 'default',
      },
    })
    expect(await readFile(resolve(phase5PilotRoot, 'model/system.sysml'), 'utf8'))
      .toContain('interface telemetryInterface connect')
    expect(await readFile(resolve(phase5PilotRoot, 'model/requirements.sysml'), 'utf8'))
      .toContain('requirement failoverNotification')
  })

  it('persists bounded saved views as workspace-owned JSON', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-views-'))
    temporaryDirectories.push(temporaryRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    const service = createService(createFakeLspAdapter(), [temporaryRoot])
    await initialize(service)
    await service.handle({
      jsonrpc: '2.0', id: 30, method: WORKBENCH_METHODS.workspaceOpen,
      params: { workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml') },
    })
    const saved = await service.handle({
      jsonrpc: '2.0', id: 31, method: WORKBENCH_METHODS.workspaceSaveView,
      params: {
        workspaceId: 'phase1-sample',
        view: {
          schemaVersion: 1,
          id: 'interface-review',
          name: 'Interface review',
          query: { mode: 'interfaces', depth: 3 },
          notation: 'interconnection',
          layout: { positions: { 'element:one': { x: 10, y: 20 } } },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
    expect(saved).toMatchObject({ result: { id: 'interface-review' } })
    await expect(service.handle({
      jsonrpc: '2.0', id: 32, method: WORKBENCH_METHODS.workspaceListViews,
      params: { workspaceId: 'phase1-sample' },
    })).resolves.toMatchObject({ result: [{ id: 'interface-review' }] })
    expect(JSON.parse(await readFile(resolve(temporaryRoot, 'views/interface-review.json'), 'utf8'))).toMatchObject({ id: 'interface-review' })

    await expect(service.handle({
      jsonrpc: '2.0', id: 33, method: WORKBENCH_METHODS.workspaceSaveView,
      params: { workspaceId: 'phase1-sample', view: { schemaVersion: 1, id: '../escape', name: 'bad', query: {}, notation: 'table', updatedAt: '2026-01-01T00:00:00.000Z' } },
    })).resolves.toMatchObject({ error: { code: -32010 } })
  })

  it('negotiates language capabilities after open and protects document scope', async () => {
    const service = createService(createFakeLspAdapter())
    const initialized = await initialize(service)
    expect(initialized).toMatchObject({
      result: { capabilitiesFinal: false },
    })

    const opened = await openSample(service)
    expect(opened).toMatchObject({
      result: {
        workspaceId: 'phase1-sample',
        capabilitiesFinal: true,
        languageCapabilities: {
          diagnostics: true,
          documentSymbols: true,
          definitions: true,
          references: true,
          hover: true,
          completion: true,
        },
      },
    })
    await expect(openSample(service)).resolves.toMatchObject({
      result: {
        workspaceId: 'phase1-sample',
        capabilitiesFinal: true,
      },
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 3,
        method: WORKBENCH_METHODS.languageDocumentSymbols,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: sampleDocument,
        },
      }),
    ).resolves.toMatchObject({
      result: [{ name: 'Fake', detail: 'package' }],
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 4,
        method: WORKBENCH_METHODS.languageDefinition,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: sampleDocument,
          position: { line: 0, character: 1 },
        },
      }),
    ).resolves.toMatchObject({
      result: [{ uri: sampleDocument }],
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 5,
        method: WORKBENCH_METHODS.languageDocumentSymbols,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: 'file:///tmp/outside.sysml',
        },
      }),
    ).resolves.toMatchObject({
      error: {
        code: -32010,
        message: expect.stringContaining('outside the active workspace'),
      },
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 6,
        method: WORKBENCH_METHODS.languageSemanticTokens,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: sampleDocument,
        },
      }),
    ).resolves.toMatchObject({
      result: {
        legend: { tokenTypes: ['namespace'] },
        data: [0, 0, 4, 0, 1],
      },
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 7,
        method: WORKBENCH_METHODS.languageRename,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: sampleDocument,
          position: { line: 0, character: 1 },
          newName: 'Vehicle2',
        },
      }),
    ).resolves.toMatchObject({
      result: {
        changes: {
          [sampleDocument]: [{ newText: 'Vehicle2' }],
        },
      },
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 8,
        method: WORKBENCH_METHODS.languageFormatting,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: sampleDocument,
        },
      }),
    ).resolves.toMatchObject({
      result: [{ newText: 'package Fake {}\\n' }],
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 9,
        method: WORKBENCH_METHODS.languageDocumentChange,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: sampleDocument,
          version: 2,
          text: 'package Changed {}',
        },
      }),
    ).resolves.toMatchObject({
      result: {
        indexState: 'ready',
        diagnostics: { errors: 0 },
      },
    })
  })

  it('marks an indexed workspace stale when the language process crashes', async () => {
    const service = createService(
      createFakeLspAdapter({
        FAKE_LSP_CRASH_AFTER_OPEN: '1',
        FAKE_LSP_CRASH_DELAY_MS: '150',
      }),
    )
    await initialize(service)
    await expect(openSample(service)).resolves.toMatchObject({
      result: { workspaceId: 'phase1-sample' },
    })
    await waitForLanguageFailure(service)

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 6,
        method: WORKBENCH_METHODS.workspaceStatus,
        params: { workspaceId: 'phase1-sample' },
      }),
    ).resolves.toMatchObject({
      result: { indexState: 'stale' },
    })

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 7,
        method: WORKBENCH_METHODS.languageRestart,
        params: { workspaceId: 'phase1-sample' },
      }),
    ).resolves.toMatchObject({
      result: { indexState: 'ready' },
    })
  })

  it('restarts the language process when the workspace root changes', async () => {
    const service = createService(createFakeLspAdapter(), [workspacesRoot])
    await initialize(service)
    await openSample(service)

    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 7,
        method: WORKBENCH_METHODS.workspaceOpen,
        params: {
          workspaceFile: resolve(
            workspacesRoot,
            'phase1-standard-library/sysml-workspace.yaml',
          ),
        },
      }),
    ).resolves.toMatchObject({
      result: {
        workspaceId: 'phase1-standard-library',
        capabilitiesFinal: true,
      },
    })
  })

  it('builds a persisted normalized snapshot and runs bounded identity queries', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'sysml-workbench-semantic-'),
    )
    temporaryDirectories.push(temporaryRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    const service = createService(
      createFakeLspAdapter({}, 'qualified'),
      [temporaryRoot],
    )
    await initialize(service)
    const opened = await service.handle({
      jsonrpc: '2.0',
      id: 20,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: {
        workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml'),
      },
    })
    expect(opened).toMatchObject({
      result: { semanticAuthority: 'qualified-engine' },
    })
    if (!('result' in opened)) throw new Error('Workspace open failed')
    const snapshot = await service.handle({
      jsonrpc: '2.0',
      id: 21,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    expect(snapshot).toMatchObject({
      result: {
        schemaVersion: 1,
        freshness: 'current',
        elements: expect.any(Array),
        relationships: expect.any(Array),
      },
    })
    if (!('result' in snapshot)) throw new Error('Snapshot request failed')
    const semantic = snapshot.result as {
      snapshotSha256: string
      elements: Array<{ id: string }>
    }
    expect(semantic.elements).toHaveLength(3)
    const identityFile = JSON.parse(
      await readFile(
        resolve(temporaryRoot, 'identities/model-identities.json'),
        'utf8',
      ),
    ) as { records: unknown[] }
    expect(identityFile.records).toHaveLength(3)

    const queryRequest = {
      jsonrpc: '2.0' as const,
      id: 22,
      method: WORKBENCH_METHODS.modelQuery,
      params: {
        workspaceId: 'phase1-sample',
        query: {
          schemaVersion: 1,
          roots: [semantic.elements[0]!.id],
          depth: 0,
          maxResults: 10,
        },
      },
    }
    await expect(service.handle(queryRequest)).resolves.toMatchObject({
      result: {
        snapshotSha256: semantic.snapshotSha256,
        elements: [{ id: semantic.elements[0]!.id }],
        truncated: false,
      },
    })
    const cached = await service.handle({ ...queryRequest, id: 23 })
    expect(cached).toMatchObject({
      result: { snapshotSha256: semantic.snapshotSha256 },
    })
    const openedStatus = opened.result as { documents: Array<{ uri: string }> }
    const changedUri = openedStatus.documents[0]!.uri
    const changedText = await readFile(fileURLToPath(changedUri), 'utf8')
    await service.handle({
      jsonrpc: '2.0',
      id: 24,
      method: WORKBENCH_METHODS.languageDocumentChange,
      params: {
        workspaceId: 'phase1-sample',
        documentUri: changedUri,
        version: 2,
        text: `${changedText}\n`,
      },
    })
    const refreshed = await service.handle({ ...queryRequest, id: 25 })
    expect(refreshed).toMatchObject({ result: { truncated: false } })
    if (!('result' in refreshed)) throw new Error('Refreshed query failed')
    expect((refreshed.result as { snapshotSha256: string }).snapshotSha256)
      .not.toBe(semantic.snapshotSha256)
  })

  it('exposes assurance, Git baselines, anchored reviews, and reproducible reports', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-assurance-'))
    temporaryDirectories.push(temporaryRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    const service = createService(
      createFakeLspAdapter({}, 'qualified'),
      [temporaryRoot],
    )
    await initialize(service)
    await service.handle({
      jsonrpc: '2.0',
      id: 40,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: { workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml') },
    })
    const snapshotResponse = await service.handle({
      jsonrpc: '2.0',
      id: 41,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    if (!('result' in snapshotResponse)) throw new Error('Snapshot failed')
    const snapshot = snapshotResponse.result as { elements: Array<{ id: string }> }
    await git(temporaryRoot, ['init'])
    await git(temporaryRoot, ['config', 'user.email', 'test@example.invalid'])
    await git(temporaryRoot, ['config', 'user.name', 'Workbench Test'])
    await git(temporaryRoot, ['add', '.'])
    await git(temporaryRoot, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'baseline'])

    await expect(service.handle({
      jsonrpc: '2.0',
      id: 42,
      method: WORKBENCH_METHODS.assuranceEvaluate,
      params: { workspaceId: 'phase1-sample' },
    })).resolves.toMatchObject({
      result: { schemaVersion: 1, rulePack: { version: '1.0.0' } },
    })
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 43,
      method: WORKBENCH_METHODS.gitStatus,
      params: { workspaceId: 'phase1-sample' },
    })).resolves.toMatchObject({ result: { dirty: false } })
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 44,
      method: WORKBENCH_METHODS.baselineCreate,
      params: {
        workspaceId: 'phase1-sample',
        input: { id: 'baseline-a', actor: 'engineer', at: '2026-07-25T12:00:00.000Z' },
      },
    })).resolves.toMatchObject({ result: { id: 'baseline-a' } })
    await git(temporaryRoot, ['add', 'baselines'])
    await git(temporaryRoot, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'record baseline'])

    await expect(service.handle({
      jsonrpc: '2.0',
      id: 45,
      method: WORKBENCH_METHODS.reviewCreate,
      params: {
        workspaceId: 'phase1-sample',
        input: {
          id: 'RVW-001',
          title: 'Engineering assurance review',
          scope: { query: { schemaVersion: 1, depth: 1, maxResults: 100 } },
          actor: 'chair',
          at: '2026-07-25T12:01:00.000Z',
        },
      },
    })).resolves.toMatchObject({ result: { id: 'RVW-001', status: 'open' } })
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 46,
      method: WORKBENCH_METHODS.reviewAddFinding,
      params: {
        workspaceId: 'phase1-sample',
        input: {
          reviewId: 'RVW-001',
          finding: {
            id: 'F-001',
            elementId: snapshot.elements[0]!.id,
            severity: 'major',
            category: 'quality',
            statement: 'Confirm package ownership.',
            actor: 'reviewer',
            at: '2026-07-25T12:02:00.000Z',
          },
        },
      },
    })).resolves.toMatchObject({ result: { status: 'in-review', findings: [{ id: 'F-001' }] } })
    await service.handle({
      jsonrpc: '2.0',
      id: 47,
      method: WORKBENCH_METHODS.reviewDispositionFinding,
      params: {
        workspaceId: 'phase1-sample',
        input: {
          reviewId: 'RVW-001',
          findingId: 'F-001',
          disposition: 'closed',
          response: 'Ownership confirmed.',
          actor: 'owner',
          at: '2026-07-25T12:03:00.000Z',
        },
      },
    })
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 48,
      method: WORKBENCH_METHODS.reviewClose,
      params: {
        workspaceId: 'phase1-sample',
        reviewId: 'RVW-001',
        input: { actor: 'chair', at: '2026-07-25T12:04:00.000Z' },
      },
    })).resolves.toMatchObject({ result: { status: 'closed' } })
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 49,
      method: WORKBENCH_METHODS.reportGenerate,
      params: {
        workspaceId: 'phase1-sample',
        input: {
          reportId: 'review-closure-001',
          kind: 'review-closure',
          at: '2026-07-25T12:05:00.000Z',
          baselineId: 'baseline-a',
        },
      },
    })).resolves.toMatchObject({
      result: {
        reportKind: 'review-closure',
        artifacts: expect.arrayContaining([
          expect.objectContaining({ format: 'html' }),
          expect.objectContaining({ format: 'pdf' }),
        ]),
      },
    })
  })

  it('returns a proposal-only typed rename without changing canonical source', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'sysml-workbench-command-proposal-'),
    )
    temporaryDirectories.push(temporaryRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    const service = createService(
      createFakeLspAdapter(
        { FAKE_LSP_DYNAMIC_SEMANTICS: '1' },
        'qualified',
      ),
      [temporaryRoot],
    )
    await initialize(service)
    const opened = await service.handle({
      jsonrpc: '2.0',
      id: 60,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: {
        workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml'),
      },
    })
    if (!('result' in opened)) throw new Error('Workspace open failed')
    const snapshotResponse = await service.handle({
      jsonrpc: '2.0',
      id: 61,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    if (!('result' in snapshotResponse)) throw new Error('Snapshot failed')
    const snapshot = snapshotResponse.result as {
      snapshotSha256: string
      documents: Array<{ uri: string; sha256: string }>
      elements: Array<{ id: string }>
    }
    const sourcePath = resolve(temporaryRoot, 'model/vehicle.sysml')
    const sourceBefore = await readFile(sourcePath, 'utf8')
    const proposal = await service.handle({
      jsonrpc: '2.0',
      id: 62,
      method: WORKBENCH_METHODS.commandPropose,
      params: {
        schemaVersion: 1,
        commandId: 'CMD-SERVICE-001',
        workspaceId: 'phase1-sample',
        baseSnapshotSha256: snapshot.snapshotSha256,
        baseDocuments: Object.fromEntries(
          snapshot.documents.map((document) => [document.uri, document.sha256]),
        ),
        requestedBy: { kind: 'user', id: 'test-engineer' },
        command: {
          kind: 'rename-element',
          targetId: snapshot.elements[0]!.id,
          newName: 'RenamedPackage',
        },
      },
    })

    expect(proposal).toMatchObject({
      result: {
        state: 'proposed',
        commandId: 'CMD-SERVICE-001',
        approval: { required: true, approved: false },
        validation: { state: 'validated' },
        semanticDiff: {
          changes: expect.arrayContaining([
            expect.objectContaining({ kind: 'element-renamed' }),
          ]),
        },
      },
    })
    if ('result' in proposal) {
      expect(proposal.result).not.toHaveProperty('overlayDocuments')
      expect(proposal.result).not.toHaveProperty('validatedAfterSnapshot')
    }
    expect(await readFile(sourcePath, 'utf8')).toBe(sourceBefore)
    if (!('result' in proposal)) throw new Error('Command proposal failed')
    const proposalResult = proposal.result as {
      proposalId: string
      edits: { changes: Record<string, unknown> }
    }
    const changedUri = Object.keys(proposalResult.edits.changes)[0]!
    const changedPath = fileURLToPath(changedUri)
    const changedBefore = await readFile(changedPath, 'utf8')
    const applied = await service.handle({
      jsonrpc: '2.0',
      id: 64,
      method: WORKBENCH_METHODS.commandApply,
      params: {
        workspaceId: 'phase1-sample',
        proposalId: proposalResult.proposalId,
        approvalId: 'APPROVAL-001',
        approvedBy: { kind: 'user', id: 'test-engineer' },
      },
    })
    expect(applied).toMatchObject({
      result: {
        state: 'applied',
        proposalId: proposalResult.proposalId,
        approval: {
          approvalId: 'APPROVAL-001',
          approvedBy: { kind: 'user', id: 'test-engineer' },
        },
        transaction: { state: 'FINALIZED' },
      },
    })
    if (!('result' in applied)) throw new Error('Command apply failed')
    const transactionId = (applied.result as {
      transaction: { transactionId: string }
    }).transaction.transactionId
    const journal = JSON.parse(await readFile(resolve(
      temporaryRoot,
      '.sysml-workbench/transactions',
      transactionId,
      'journal.json',
    ), 'utf8'))
    expect(journal.metadata.commandAudit).toMatchObject({
      schemaVersion: 1,
      recordType: 'command-application',
      proposal: { proposalId: proposalResult.proposalId },
      approval: { approvalId: 'APPROVAL-001' },
    })
    expect(journal.metadata.commandAudit.proposal).not.toHaveProperty(
      'overlayDocuments',
    )
    expect(await readFile(changedPath, 'utf8')).not.toBe(changedBefore)
    const undo = await service.handle({
      jsonrpc: '2.0',
      id: 66,
      method: WORKBENCH_METHODS.commandProposeUndo,
      params: {
        workspaceId: 'phase1-sample',
        commandId: 'CMD-UNDO-001',
        appliedProposalId: proposalResult.proposalId,
        requestedBy: { kind: 'user', id: 'test-engineer' },
      },
    })
    expect(undo).toMatchObject({
      result: {
        validation: { state: 'validated' },
        envelope: { command: { kind: 'undo-command' } },
      },
    })
    if (!('result' in undo)) throw new Error('Undo proposal failed')
    const undoProposalId = (undo.result as { proposalId: string }).proposalId
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 67,
      method: WORKBENCH_METHODS.commandApply,
      params: {
        workspaceId: 'phase1-sample',
        proposalId: undoProposalId,
        approvalId: 'APPROVAL-UNDO-001',
        approvedBy: { kind: 'user', id: 'test-engineer' },
      },
    })).resolves.toMatchObject({ result: { state: 'applied' } })
    expect(await readFile(changedPath, 'utf8')).toBe(changedBefore)

    const redo = await service.handle({
      jsonrpc: '2.0',
      id: 68,
      method: WORKBENCH_METHODS.commandProposeRedo,
      params: {
        workspaceId: 'phase1-sample',
        commandId: 'CMD-REDO-001',
        appliedProposalId: undoProposalId,
        requestedBy: { kind: 'user', id: 'test-engineer' },
      },
    })
    expect(redo).toMatchObject({
      result: {
        validation: { state: 'validated' },
        envelope: { command: { kind: 'redo-command' } },
      },
    })
    if (!('result' in redo)) throw new Error('Redo proposal failed')
    await expect(service.handle({
      jsonrpc: '2.0',
      id: 69,
      method: WORKBENCH_METHODS.commandApply,
      params: {
        workspaceId: 'phase1-sample',
        proposalId: (redo.result as { proposalId: string }).proposalId,
        approvalId: 'APPROVAL-REDO-001',
        approvedBy: { kind: 'user', id: 'test-engineer' },
      },
    })).resolves.toMatchObject({ result: { state: 'applied' } })
    expect(await readFile(changedPath, 'utf8')).not.toBe(changedBefore)
    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 65,
        method: WORKBENCH_METHODS.commandApply,
        params: {
          workspaceId: 'phase1-sample',
          proposalId: proposalResult.proposalId,
          approvalId: 'APPROVAL-002',
          approvedBy: { kind: 'ai', id: 'provider' },
        },
      }),
    ).resolves.toMatchObject({
      error: { message: expect.stringContaining('human user') },
    })
    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 63,
        method: WORKBENCH_METHODS.commandPropose,
        params: {
          schemaVersion: 1,
          commandId: 'CMD-SERVICE-001',
          workspaceId: 'phase1-sample',
          baseSnapshotSha256: snapshot.snapshotSha256,
          baseDocuments: Object.fromEntries(
            snapshot.documents.map((document) => [document.uri, document.sha256]),
          ),
          requestedBy: { kind: 'user', id: 'test-engineer' },
          command: {
            kind: 'rename-element',
            targetId: snapshot.elements[0]!.id,
            newName: 'DifferentName',
          },
        },
      }),
    ).resolves.toMatchObject({
      error: { message: expect.stringContaining('commandId conflict') },
    })
  })

  it('rejects an identity registry path that traverses a workspace symlink', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'sysml-workbench-identity-link-'),
    )
    const outsideRoot = await mkdtemp(
      join(tmpdir(), 'sysml-workbench-identity-outside-'),
    )
    temporaryDirectories.push(temporaryRoot, outsideRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    await symlink(outsideRoot, resolve(temporaryRoot, 'identities'))
    const service = createService(
      createFakeLspAdapter({}, 'qualified'),
      [temporaryRoot],
    )
    await initialize(service)
    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 30,
        method: WORKBENCH_METHODS.workspaceOpen,
        params: {
          workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml'),
        },
      }),
    ).resolves.toMatchObject({
      error: {
        code: -32010,
        message: expect.stringContaining('Symbolic links are not accepted'),
      },
    })
    await expect(
      access(resolve(outsideRoot, 'model-identities.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recovers a deleted identity registry from backup and rejects merge markers', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-identity-recovery-'))
    temporaryDirectories.push(temporaryRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    const firstService = createService(
      createFakeLspAdapter({}, 'qualified'),
      [temporaryRoot],
    )
    await initialize(firstService)
    const opened = await firstService.handle({
      jsonrpc: '2.0',
      id: 35,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: { workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml') },
    })
    if (!('result' in opened)) throw new Error('Workspace open failed')
    const status = opened.result as { documents: Array<{ uri: string }> }
    const firstSnapshot = await firstService.handle({
      jsonrpc: '2.0',
      id: 36,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    if (!('result' in firstSnapshot)) throw new Error('Snapshot failed')
    const firstIds = (firstSnapshot.result as { elements: Array<{ id: string }> })
      .elements.map((element) => element.id).sort()
    const documentUri = status.documents[0]!.uri
    const text = await readFile(fileURLToPath(documentUri), 'utf8')
    await firstService.handle({
      jsonrpc: '2.0',
      id: 37,
      method: WORKBENCH_METHODS.languageDocumentChange,
      params: {
        workspaceId: 'phase1-sample',
        documentUri,
        version: 2,
        text: `xxxx${text.slice(4)}`,
      },
    })
    await firstService.handle({
      jsonrpc: '2.0',
      id: 38,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    const identityPath = resolve(temporaryRoot, 'identities/model-identities.json')
    await access(`${identityPath}.bak`)
    await rm(identityPath)
    await firstService.dispose()

    const recoveredService = createService(
      createFakeLspAdapter({}, 'qualified'),
      [temporaryRoot],
    )
    await initialize(recoveredService)
    await recoveredService.handle({
      jsonrpc: '2.0',
      id: 39,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: { workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml') },
    })
    const recoveredSnapshot = await recoveredService.handle({
      jsonrpc: '2.0',
      id: 40,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    if (!('result' in recoveredSnapshot)) throw new Error('Recovery failed')
    expect((recoveredSnapshot.result as { elements: Array<{ id: string }> })
      .elements.map((element) => element.id).sort()).toEqual(firstIds)
    await recoveredService.dispose()

    await writeFile(identityPath, '<<<<<<< ours\n{}\n=======\n{}\n>>>>>>> theirs\n')
    const conflictService = createService(
      createFakeLspAdapter({}, 'qualified'),
      [temporaryRoot],
    )
    await initialize(conflictService)
    await expect(conflictService.handle({
      jsonrpc: '2.0',
      id: 41,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: { workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml') },
    })).resolves.toMatchObject({
      error: { code: -32010 },
    })
  })

  it('rejects a semantic snapshot that races a document revision', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'sysml-workbench-semantic-race-'),
    )
    temporaryDirectories.push(temporaryRoot)
    await cp(sampleRoot, temporaryRoot, { recursive: true })
    const service = createService(
      createFakeLspAdapter(
        { FAKE_LSP_SYMBOL_DELAY_MS: '75' },
        'qualified',
      ),
      [temporaryRoot],
    )
    await initialize(service)
    const opened = await service.handle({
      jsonrpc: '2.0',
      id: 40,
      method: WORKBENCH_METHODS.workspaceOpen,
      params: {
        workspaceFile: resolve(temporaryRoot, 'sysml-workspace.yaml'),
      },
    })
    if (!('result' in opened)) throw new Error('Workspace open failed')
    const openedStatus = opened.result as {
      documents: Array<{ uri: string }>
    }
    const changedDocumentUri = openedStatus.documents.find((document) =>
      document.uri.endsWith('/model/vehicle.sysml'),
    )?.uri
    if (!changedDocumentUri) throw new Error('Vehicle document was not indexed')
    const pendingSnapshot = service.handle({
      jsonrpc: '2.0',
      id: 41,
      method: WORKBENCH_METHODS.semanticSnapshot,
      params: { workspaceId: 'phase1-sample' },
    })
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
    const changedText = await readFile(
      fileURLToPath(changedDocumentUri),
      'utf8',
    )
    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 42,
        method: WORKBENCH_METHODS.languageDocumentChange,
        params: {
          workspaceId: 'phase1-sample',
          documentUri: changedDocumentUri,
          version: 2,
          text: `${changedText}\n`,
        },
      }),
    ).resolves.toMatchObject({
      result: { indexState: 'ready' },
    })
    await expect(pendingSnapshot).resolves.toMatchObject({
      error: {
        code: -32010,
        message: expect.stringContaining(
          'changed while the semantic snapshot was being built',
        ),
      },
    })
    await expect(
      service.handle({
        jsonrpc: '2.0',
        id: 43,
        method: WORKBENCH_METHODS.semanticSnapshot,
        params: { workspaceId: 'phase1-sample' },
      }),
    ).resolves.toMatchObject({
      result: { freshness: 'current' },
    })
  })
})

function createService(
  adapter: LanguageAdapter = new PreservationControlAdapter(),
  allowedRoots = [sampleRoot],
): WorkbenchService {
  const service = new WorkbenchService({
    adapter,
    allowedRoots,
    transport: { kind: 'stdio', secure: true },
  })
  services.push(service)
  return service
}

function createFakeLspAdapter(
  environment: Record<string, string> = {},
  qualificationStatus: 'qualified' | 'unqualified' = 'unqualified',
): LspProcessAdapter {
  return new LspProcessAdapter({
    metadata: {
      adapterId: 'test/fake-lsp',
      adapterVersion: '0.1.0',
      engineName: 'fake-lsp',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus,
    },
    command: process.execPath,
    arguments: [fakeServer],
    environment,
    diagnosticSettleMs: 50,
    semanticEvidenceMethod: 'sysml/semanticEvidence',
  })
}

function openSample(service: WorkbenchService) {
  return service.handle({
    jsonrpc: '2.0',
    id: 2,
    method: WORKBENCH_METHODS.workspaceOpen,
    params: {
      workspaceFile: resolve(sampleRoot, 'sysml-workspace.yaml'),
    },
  })
}

async function waitForLanguageFailure(service: WorkbenchService): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    const response = await service.handle({
      jsonrpc: '2.0',
      id: 99,
      method: WORKBENCH_METHODS.health,
    })
    if (
      'result' in response &&
      typeof response.result === 'object' &&
      response.result !== null &&
      'languageEngine' in response.result &&
      typeof response.result.languageEngine === 'object' &&
      response.result.languageEngine !== null &&
      'state' in response.result.languageEngine &&
      response.result.languageEngine.state === 'failed'
    ) {
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  throw new Error('Fake language engine did not fail within the test deadline')
}

function initialize(service: WorkbenchService) {
  return service.handle({
    jsonrpc: '2.0',
    id: 1,
    method: WORKBENCH_METHODS.initialize,
    params: {
      protocolVersion: WORKBENCH_PROTOCOL_VERSION,
      client: { name: 'test', version: '1' },
    },
  })
}

async function git(root: string, argumentsList: string[]): Promise<void> {
  await executeFile('git', ['-C', root, ...argumentsList], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
}
