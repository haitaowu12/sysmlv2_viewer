import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import axe from 'axe-core'
import type { SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import type { WorkbenchGateway } from '../workbench/gateway.js'
import type { AiOperationRecord } from '../../packages/ai-orchestrator/src/index.js'
import { WorkbenchShell } from '../workbench/WorkbenchShell.js'

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange(value: string): void }) => (
    <textarea aria-label="SysML source editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const uri = 'file:///workspace/model/system.sysml'
const source = 'package System {\n  part def Controller;\n}\n'
const snapshot: SemanticSnapshot = {
  schemaVersion: 1,
  snapshotSha256: 'snapshot-1',
  workspace: { id: 'pilot', rootUri: 'file:///workspace', configurationName: 'pilot' },
  authority: {
    adapterId: 'qualified',
    adapterVersion: '1.0.0',
    engineName: 'pilot',
    engineVersion: '1',
    referenceRelease: '2026-05',
    qualificationStatus: 'qualified',
  },
  freshness: 'current',
  documents: [{ uri, languageId: 'sysml', sha256: 'doc-1', byteLength: source.length }],
  elements: [
    element('package', 'Package', 'System', 'System'),
    { ...element('controller', 'PartDefinition', 'Controller', 'System::Controller'), ownerId: 'package' },
    { ...element('port', 'PortUsage', 'commandPort', 'System::commandPort'), ownerId: 'package' },
  ],
  relationships: [
    {
      id: 'contains-controller',
      kind: 'containment',
      sourceId: 'package',
      targetId: 'controller',
      provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-explicit-reference', engineMetaclass: 'Membership', features: ['memberElement'] },
    },
  ],
}

afterEach(cleanup)

describe('service-backed workbench shell', () => {
  it('exposes the engineering activity model and cross-navigates projections', async () => {
    const gateway = createGateway()
    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)

    expect(screen.getByRole('main', { name: 'SysML Engineering Workbench' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Interfaces' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /Controller/ })).toBeInTheDocument()
    expect(screen.getByText('UNRESOLVED_REFERENCE')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Interfaces' }))
    await waitFor(() => expect(gateway.modelQuery).toHaveBeenLastCalledWith(
      'pilot',
      expect.objectContaining({ mode: 'interfaces' }),
    ))

    fireEvent.click(screen.getByRole('treeitem', { name: /commandPort/ }))
    expect(screen.getAllByText('PortUsage').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /model\/system.sysml:1/ }))
    expect(screen.getByRole('tab', { name: /source/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps source text as a draft until a patch review is explicitly generated', async () => {
    const gateway = createGateway()
    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)
    fireEvent.click(screen.getByRole('tab', { name: /source/i }))
    const editor = await screen.findByRole('textbox', { name: 'SysML source editor' })
    fireEvent.change(editor, { target: { value: source.replace('Controller', 'Controller2') } })

    expect(gateway.proposeCommand).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Review source patch' }))
    expect(gateway.proposeCommand).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))

    await waitFor(() => expect(gateway.proposeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({ kind: 'replace-document', documentUri: uri }),
      }),
    ))
    expect(gateway.applyCommand).not.toHaveBeenCalled()
  })

  it('persists a saved projection through the workspace service', async () => {
    const gateway = createGateway()
    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save current view' }))
    await waitFor(() => expect(gateway.saveView).toHaveBeenCalledWith(
      'pilot',
      expect.objectContaining({ id: 'view-containment', query: { mode: 'containment', depth: 5, maxResults: 2000 } }),
    ))
  })

  it('runs assurance activities through the local workbench service', async () => {
    const gateway = createGateway()
    vi.mocked(gateway.generateReport).mockResolvedValue({
      schemaVersion: 1,
      reportEngineVersion: '1.0.0',
      reportKind: 'workspace-health',
      title: 'Workspace Health',
      provenance: {
        workspace: { id: 'pilot', name: 'Pilot workspace' },
        commitSha: 'a'.repeat(40),
        baseline: null,
        languageRelease: '2026-05',
        workbenchVersion: '0.6.0',
        rulePackVersion: '1.0.0',
        viewConfiguration: 'reports',
        generatedAt: '2026-07-25T12:00:00.000Z',
        unresolvedDiagnostics: 1,
        exclusions: [],
      },
      artifacts: [
        { format: 'html', path: 'generated/reports/health/health.html', sha256: 'b'.repeat(64) },
        { format: 'pdf', path: 'generated/reports/health/health.pdf', sha256: 'c'.repeat(64) },
      ],
    })
    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)

    fireEvent.click(screen.getByRole('button', { name: 'Interfaces' }))
    expect(await screen.findByRole('heading', { name: 'Interface assurance' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Interface register/ })).toBeInTheDocument()
    expect(gateway.evaluateAssurance).toHaveBeenCalledWith('pilot')
    expect(gateway.gitStatus).toHaveBeenCalledWith('pilot')

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(await screen.findByRole('heading', { name: 'Reports and evidence' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Report type'), { target: { value: 'workspace-health' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate evidence package' }))
    await waitFor(() => expect(gateway.generateReport).toHaveBeenCalledWith(
      'pilot',
      expect.objectContaining({ kind: 'workspace-health' }),
    ))
    expect(await screen.findByRole('heading', { name: 'Workspace Health' })).toBeInTheDocument()
    expect(screen.getByText(/generated\/reports\/health\/health\.pdf/)).toBeInTheDocument()
  })

  it('keeps interface assurance available when Git is unavailable', async () => {
    const gateway = createGateway()
    vi.mocked(gateway.gitStatus).mockRejectedValue(
      new Error('fatal: not a git repository'),
    )
    vi.mocked(gateway.listBaselines).mockRejectedValue(
      new Error('Git baselines require a repository'),
    )

    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)

    fireEvent.click(screen.getByRole('button', { name: 'Interfaces' }))

    expect(await screen.findByRole('heading', { name: 'Interface assurance' })).toBeInTheDocument()
    expect(screen.getByText('Git unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Interface register/ })).toBeInTheDocument()
    expect(screen.getByText(/Interface and verification assurance remain available/)).toBeInTheDocument()
  })

  it('reviews a grounded AI patch before a separate approval applies it', async () => {
    const gateway = createGateway()
    vi.mocked(gateway.requestAi).mockResolvedValue(aiOperation('proposed'))
    vi.mocked(gateway.applyAi).mockResolvedValue(aiOperation('applied'))
    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)

    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }))
    expect(await screen.findByRole('heading', { name: 'Grounded model operations' })).toBeInTheDocument()
    expect(screen.getByText('Network disabled')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Request'), {
      target: { value: 'rename controller to PrimaryController' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run grounded request' }))

    await waitFor(() => expect(gateway.requestAi).toHaveBeenCalledWith(
      'pilot',
      expect.objectContaining({
        workspaceId: 'pilot',
        userRequest: 'rename controller to PrimaryController',
      }),
    ))
    expect(await screen.findByRole('heading', { name: 'Proposal ready for review' })).toBeInTheDocument()
    expect(screen.getByText('Canonical source is unchanged.')).toBeInTheDocument()
    expect(gateway.applyAi).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Approve and apply validated patch' }))
    await waitFor(() => expect(gateway.applyAi).toHaveBeenCalledWith(
      'pilot',
      expect.objectContaining({
        operationId: 'AI-UI-001',
        approvedBy: { kind: 'user', id: 'engineer' },
      }),
    ))
    expect(await screen.findByRole('heading', { name: 'Applied after approval' })).toBeInTheDocument()
  })

  it('has no serious or critical automated accessibility violations in primary surfaces', async () => {
    const gateway = createGateway()
    render(<WorkbenchShell gateway={gateway} initialWorkspace={loadedWorkspace()} userId="engineer" />)
    await waitFor(() => expect(gateway.modelQuery).toHaveBeenCalled())
    let results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(
      results.violations.filter((item) =>
        item.impact === 'serious' || item.impact === 'critical',
      ),
    ).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Assistant' }))
    await screen.findByRole('heading', { name: 'Grounded model operations' })
    results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(
      results.violations.filter((item) =>
        item.impact === 'serious' || item.impact === 'critical',
      ),
    ).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    const dialog = screen.getByRole('dialog', { name: 'Go to activity' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Explorer' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

function element(id: string, kind: SemanticSnapshot['elements'][number]['kind'], name: string, qualifiedName: string): SemanticSnapshot['elements'][number] {
  return {
    id,
    kind,
    rawKind: kind,
    name,
    qualifiedName,
    source: { uri, workspacePath: 'model/system.sysml', range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } }, documentSha256: 'doc-1' },
    fingerprint: `fingerprint-${id}`,
    provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-semantic-evidence', classification: 'engine-metaclass', engineId: `engine-${id}` },
  }
}

function loadedWorkspace() {
  return {
    status: {
      workspaceId: 'pilot',
      rootUri: 'file:///workspace',
      configurationName: 'Pilot workspace',
      indexState: 'ready' as const,
      semanticAuthority: 'qualified-engine' as const,
      documentCount: 1,
      snapshotSha256: 'snapshot-1',
      documents: snapshot.documents,
      diagnostics: { errors: 1, warnings: 0, information: 0, hints: 0 },
      languageCapabilities: { workspaceLifecycle: true, diagnostics: true, documentSymbols: true, workspaceSymbols: true, definitions: true, references: true, completion: true, hover: true, semanticTokens: true, rename: true, formatting: true, semanticEvidence: true, semanticSnapshot: true },
      capabilitiesFinal: true,
    },
    snapshot,
    diagnostics: [{ uri, severity: 'error' as const, code: 'UNRESOLVED_REFERENCE', message: 'Unknown endpoint', range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } } }],
    views: [],
  }
}

function createGateway(): WorkbenchGateway & Record<string, ReturnType<typeof vi.fn>> {
  const diagnostics = loadedWorkspace().diagnostics
  const gateway = {
    readDocument: vi.fn(async () => ({ uri, languageId: 'sysml' as const, sha256: 'doc-1', byteLength: source.length, version: 1, text: source })),
    diagnostics: vi.fn(async () => diagnostics),
    semanticSnapshot: vi.fn(async () => snapshot),
    modelQuery: vi.fn(async () => ({ schemaVersion: 1 as const, snapshotSha256: snapshot.snapshotSha256, resolvedRoots: ['package'], elements: snapshot.elements, relationships: snapshot.relationships, truncated: false, warnings: [] })),
    listViews: vi.fn(async () => []),
    saveView: vi.fn(async (_workspaceId: string, view: Parameters<WorkbenchGateway['saveView']>[1]) => view),
    completion: vi.fn(async () => []),
    hover: vi.fn(async () => null),
    definition: vi.fn(async () => []),
    references: vi.fn(async () => []),
    formatting: vi.fn(async () => []),
    evaluateAssurance: vi.fn(async () => ({
      schemaVersion: 1 as const,
      rulePack: { id: 'sysml-workbench/engineering-assurance', version: '1.0.0' },
      snapshotSha256: snapshot.snapshotSha256,
      resultSha256: 'assurance-1',
      findings: [],
      requirementCoverage: [],
      interfaceRegister: [],
      summary: { critical: 0, major: 0, minor: 0, advisory: 0, requirements: 0, interfaces: 0 },
      limitations: [],
    })),
    gitStatus: vi.fn(async () => ({ repositoryRoot: '/workspace', branch: 'main', head: 'a'.repeat(40), dirty: false, changedFiles: [] })),
    listBaselines: vi.fn(async () => []),
    createBaseline: vi.fn(async () => { throw new Error('qualification stub') }),
    compareBaseline: vi.fn(async () => { throw new Error('qualification stub') }),
    listReviews: vi.fn(async () => []),
    createReview: vi.fn(async () => { throw new Error('qualification stub') }),
    addReviewFinding: vi.fn(async () => { throw new Error('qualification stub') }),
    dispositionReviewFinding: vi.fn(async () => { throw new Error('qualification stub') }),
    closeReview: vi.fn(async () => { throw new Error('qualification stub') }),
    reviewStaleness: vi.fn(async () => ({ reviewId: 'RVW-001', stale: [] })),
    generateReport: vi.fn(async () => { throw new Error('qualification stub') }),
    aiStatus: vi.fn(async () => ({
      schemaVersion: 1 as const,
      defaultProviderId: 'local-deterministic',
      networkProvidersEnabled: false,
      providers: [{
        id: 'local-deterministic',
        displayName: 'Local deterministic assistant',
        model: 'bounded-rules-1.0.0',
        networkAccess: false,
        enabled: true,
      }],
      tools: [],
    })),
    requestAi: vi.fn(async () => { throw new Error('qualification stub') }),
    listAiAudit: vi.fn(async () => []),
    applyAi: vi.fn(async () => { throw new Error('must not apply') }),
    proposeCommand: vi.fn(async () => { throw new Error('qualification stub') }),
    applyCommand: vi.fn(async () => { throw new Error('must not apply') }),
  }
  return gateway as WorkbenchGateway & Record<string, ReturnType<typeof vi.fn>>
}

function aiOperation(state: 'proposed' | 'applied'): AiOperationRecord {
  const proposal = {
    schemaVersion: 1 as const,
    proposalId: 'proposal:ui-ai',
    commandId: 'AI-UI-001:1',
    state: 'proposed' as const,
    envelope: {
      schemaVersion: 1 as const,
      commandId: 'AI-UI-001:1',
      workspaceId: 'pilot',
      baseSnapshotSha256: 'snapshot-1',
      baseDocuments: { [uri]: 'doc-1' },
      requestedBy: { kind: 'ai' as const, id: 'engineer' },
      command: {
        kind: 'rename-element' as const,
        targetId: 'controller',
        newName: 'PrimaryController',
      },
    },
    edits: {
      changes: {
        [uri]: [{
          range: {
            start: { line: 1, character: 11 },
            end: { line: 1, character: 21 },
          },
          newText: 'PrimaryController',
        }],
      },
    },
    affectedElementIds: ['controller'],
    diagnosticsBefore: [],
    diagnosticsAfter: [],
    semanticDiff: null,
    conflicts: [],
    approval: { required: true as const, approved: false as const },
    undo: { changes: {} },
    authority: snapshot.authority,
    editProfile: {
      id: 'language-service-rename' as const,
      version: '1.0.0' as const,
    },
    validation: { state: 'validated' as const },
  }
  return {
    schemaVersion: 1,
    orchestratorVersion: '1.0.0',
    operationId: 'AI-UI-001',
    state,
    request: {
      userRequest: 'rename controller to PrimaryController',
      requestedBy: 'engineer',
      at: '2026-07-25T22:30:00.000Z',
    },
    context: {
      workspaceId: 'pilot',
      snapshotSha256: 'snapshot-1',
      baselineId: null,
    },
    provider: {
      id: 'local-deterministic',
      displayName: 'Local deterministic assistant',
      model: 'bounded-rules-1.0.0',
      networkAccess: false,
    },
    answer: 'Proposed renaming System::Controller to PrimaryController.',
    citations: [snapshot.elements[1]!],
    assumptions: ['The cited controller is the intended target.'],
    commands: [proposal.envelope.command],
    proposals: [proposal],
    affectedElementIds: ['controller'],
    validation: {
      accepted: true,
      reasons: [],
      diagnosticsBefore: [],
      diagnosticsAfter: [],
    },
    toolCalls: [{
      sequence: 1,
      name: 'get_element',
      inputSha256: 'a'.repeat(64),
      resultSha256: 'b'.repeat(64),
      outcome: 'success',
    }],
    approval: state === 'applied'
      ? {
          required: true,
          approved: true,
          approvalId: 'APPROVE-UI-001',
          approvedBy: 'engineer',
          approvedAt: '2026-07-25T22:31:00.000Z',
        }
      : { required: true, approved: false },
    receipts: [],
    audit: {
      path: '.sysml-workbench/audit/ai/AI-UI-001.json',
      recordSha256: 'c'.repeat(64),
    },
  }
}
