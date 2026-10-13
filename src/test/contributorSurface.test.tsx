import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  AppliedCommandReceipt,
  CommandEnvelope,
  CommandProposal,
} from '../../packages/command-engine/src/index.js'
import type { WorkbenchGateway, LoadedWorkspace } from '../workbench/gateway.js'
import { ContributorSurface } from '../workbench/ContributorSurface.js'

describe('ContributorSurface', () => {
  it('stages a source-backed documentation edit and waits for explicit approval', async () => {
    const gateway = createGateway()
    const onApplied = vi.fn().mockResolvedValue(undefined)
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={onApplied} />)

    expect(screen.getByRole('heading', { name: 'Requirement register' })).toBeInTheDocument()
    expect(screen.getByText('System::responseTime')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Existing requirement wording.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Engineering statement' }), {
      target: { value: 'The system shall respond within the agreed limit.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }))
    expect(gateway.proposeCommand).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))

    await waitFor(() => expect(gateway.proposeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSnapshotSha256: 'snapshot-1',
        command: expect.objectContaining({
          kind: 'update-documentation',
          targetId: 'requirement-response',
          documentation: 'The system shall respond within the agreed limit.',
        }),
      }),
    ))
    expect(gateway.applyCommand).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve and apply' }))
    await waitFor(() => expect(gateway.applyCommand).toHaveBeenCalled())
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
    expect(gateway.applyCommand).toHaveBeenCalledWith(expect.objectContaining({
      approvedBy: { kind: 'user', id: 'engineer' },
    }))
  })

  it('surfaces a stale proposal failure and never refreshes as if it applied', async () => {
    const gateway = createGateway()
    gateway.applyCommand.mockRejectedValue(new Error('Command proposal base snapshot is stale'))
    const onApplied = vi.fn().mockResolvedValue(undefined)
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={onApplied} />)

    await screen.findByDisplayValue('Existing requirement wording.')
    fireEvent.change(screen.getByRole('textbox', { name: 'Engineering statement' }), {
      target: { value: 'A changed baseline must be reviewed.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve and apply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Command proposal base snapshot is stale')
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('maps a typed property form to the existing set-property command', async () => {
    const gateway = createGateway()
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    await screen.findByDisplayValue('Existing requirement wording.')
    fireEvent.change(screen.getByRole('combobox', { name: 'Edit type' }), { target: { value: 'property' } })
    fireEvent.change(screen.getByPlaceholderText('Safety::classification'), { target: { value: 'Safety::responseLimitMs' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Value type' }), { target: { value: 'number' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Property value' }), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))

    await waitFor(() => expect(gateway.proposeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          kind: 'set-property',
          targetId: 'requirement-response',
          propertyQualifiedName: 'Safety::responseLimitMs',
          value: 120,
        }),
      }),
    ))
    expect(gateway.applyCommand).not.toHaveBeenCalled()
  })

  it('prefills and updates a supported scalar attribute through set-attribute-value', async () => {
    const gateway = createGateway()
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByRole('tab', { name: /Properties/ }))
    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
    expect(screen.getByText('ScalarValues::Real')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Attribute value' }), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))

    await waitFor(() => expect(gateway.proposeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          kind: 'set-attribute-value',
          targetId: 'attribute-response-limit',
          value: 80,
        }),
      }),
    ))
    expect(gateway.proposeCommand.mock.calls.at(-1)![0].command).not.toHaveProperty('propertyQualifiedName')
  })

  it('loads each selected element independently and never carries wording to another row', async () => {
    const gateway = createGateway()
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    const requirementText = await screen.findByDisplayValue('Existing requirement wording.')
    fireEvent.change(requirementText, { target: { value: 'Unsaved wording for the first requirement.' } })
    fireEvent.click(screen.getByRole('tab', { name: /Interfaces/ }))
    fireEvent.click(screen.getByRole('button', { name: 'controlInterfaceSystem::controlInterface' }))
    expect(await screen.findByDisplayValue('Existing interface wording.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Requirements/ }))
    fireEvent.click(screen.getByRole('button', { name: 'responseTimeSystem::responseTime' }))
    expect(await screen.findByDisplayValue('Existing requirement wording.')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Unsaved wording for the first requirement.')).not.toBeInTheDocument()
  })

  it('opens a linked item outside the current register without changing task selection', async () => {
    const gateway = createGateway()
    const onSelectId = vi.fn()
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={onSelectId} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    await screen.findByDisplayValue('Existing requirement wording.')
    onSelectId.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /interface · System::controlInterface/ }))

    expect(onSelectId).toHaveBeenCalledWith('interface-control')
    expect(screen.getByRole('heading', { name: 'responseTime' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing requirement wording.')).toBeInTheDocument()
  })

  it('clears staged intent and open proposals when the workspace hash changes', async () => {
    const gateway = createGateway()
    const initial = workspace()
    const view = render(<ContributorSurface gateway={gateway} workspace={initial} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)
    await screen.findByDisplayValue('Existing requirement wording.')
    fireEvent.change(screen.getByRole('textbox', { name: 'Engineering statement' }), { target: { value: 'A staged baseline change.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))
    await screen.findByText('validated')

    const next = workspace()
    next.snapshot = { ...next.snapshot, snapshotSha256: 'snapshot-2' }
    next.status = { ...next.status, snapshotSha256: 'snapshot-2' }
    view.rerender(<ContributorSurface gateway={gateway} workspace={next} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    expect(await screen.findByRole('status')).toHaveTextContent('Workspace changed')
    expect(screen.queryByRole('button', { name: 'Approve and apply' })).not.toBeInTheDocument()
    expect(screen.queryByText('System::responseTime · documentation')).not.toBeInTheDocument()
  })

  it('invalidates a generated batch proposal when another staged row changes', async () => {
    const gateway = createGateway()
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)
    await screen.findByDisplayValue('Existing requirement wording.')
    fireEvent.change(screen.getByRole('textbox', { name: 'Engineering statement' }), { target: { value: 'First staged edit.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))
    await screen.findByText('validated')

    fireEvent.click(screen.getByRole('tab', { name: /Interfaces/ }))
    fireEvent.click(screen.getByRole('button', { name: 'controlInterfaceSystem::controlInterface' }))
    const interfaceText = await screen.findByDisplayValue('Existing interface wording.')
    fireEvent.change(interfaceText, { target: { value: 'Second staged edit.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))

    expect(screen.queryByRole('button', { name: 'Approve and apply' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review staged changes' })).toBeEnabled()
  })

  it('keeps diagnostics visible and rejects unsafe documentation before proposal', async () => {
    const gateway = createGateway()
    const loaded = workspace()
    loaded.diagnostics = [{
      uri: 'file:///workspace/model.sysml',
      severity: 'error',
      code: 'UNRESOLVED_REFERENCE',
      message: 'Unknown endpoint',
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
    }]
    render(<ContributorSurface gateway={gateway} workspace={loaded} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    await screen.findByDisplayValue('Existing requirement wording.')
    expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    expect(screen.getAllByText('1', { selector: 'dd' }).some((node) => node.classList.contains('diagnostic-error'))).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Engineering statement' }), {
      target: { value: 'unsafe */ documentation' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }))

    expect(screen.getByRole('alert')).toHaveTextContent('block-comment terminator')
    expect(gateway.proposeCommand).not.toHaveBeenCalled()
  })

  it('blocks staging when the current source document cannot be proven', async () => {
    const gateway = createGateway()
    gateway.readDocument.mockResolvedValueOnce({
      uri: 'file:///workspace/model.sysml',
      languageId: 'sysml',
      sha256: 'different-document-hash',
      byteLength: 0,
      version: 2,
      text: '',
    })
    render(<ContributorSurface gateway={gateway} workspace={workspace()} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('source document changed')
    expect(screen.getByRole('button', { name: 'Add to review' })).toBeDisabled()
    expect(gateway.proposeCommand).not.toHaveBeenCalled()
  })

  it('uses the exact same-line source boundary and preserves braces in scalar strings', async () => {
    const source = 'package System { attribute label : String = "keeps { braces }"; attribute trailing : Real = 2; }\r\n'
    const declaration = 'attribute label : String = "keeps { braces }";'
    const start = source.indexOf(declaration)
    const loaded = workspaceWithElement(source, {
      id: 'attribute-label',
      kind: 'AttributeUsage',
      name: 'label',
      qualifiedName: 'System::label',
      startLine: 0,
      endLine: 0,
      startCharacter: start,
      endCharacter: start + declaration.length,
    })
    const gateway = createGatewayForSource(source)
    render(<ContributorSurface gateway={gateway} workspace={loaded} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByRole('tab', { name: /Properties/ }))
    expect(await screen.findByDisplayValue('keeps { braces }')).toBeInTheDocument()
    expect(screen.getByText('String')).toBeInTheDocument()
  })

  it('does not infer a supported scalar kind from a custom type suffix', async () => {
    const source = 'package System { attribute limit : CustomUnrealReal = 2; }\n'
    const declaration = 'attribute limit : CustomUnrealReal = 2;'
    const start = source.indexOf(declaration)
    const loaded = workspaceWithElement(source, {
      id: 'attribute-limit',
      kind: 'AttributeUsage',
      name: 'limit',
      qualifiedName: 'System::limit',
      startLine: 0,
      endLine: 0,
      startCharacter: start,
      endCharacter: start + declaration.length,
    })
    const gateway = createGatewayForSource(source)
    render(<ContributorSurface gateway={gateway} workspace={loaded} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByRole('tab', { name: /Properties/ }))
    expect(await screen.findByText('Unknown scalar type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to review' })).toBeDisabled()
  })

  it('rejects redefined attributes from the simple scalar profile', async () => {
    const source = 'package System { attribute redefines base : Real = 2; }\n'
    const declaration = 'attribute redefines base : Real = 2;'
    const start = source.indexOf(declaration)
    const loaded = workspaceWithElement(source, {
      id: 'attribute-redefined',
      kind: 'AttributeUsage',
      name: 'base',
      qualifiedName: 'System::base',
      startLine: 0,
      endLine: 0,
      startCharacter: start,
      endCharacter: start + declaration.length,
    })
    const gateway = createGatewayForSource(source)
    render(<ContributorSurface gateway={gateway} workspace={loaded} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    fireEvent.click(screen.getByRole('tab', { name: /Properties/ }))
    expect(await screen.findByText('Unknown scalar type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to review' })).toBeDisabled()
  })

  it('does not adopt a descendant documentation block as the selected element text', async () => {
    const source = 'requirement parent {\n  part child {\n    doc /* descendant { brace } */\n  }\n}\n'
    const loaded = workspaceWithElement(source, {
      id: 'requirement-parent',
      kind: 'RequirementUsage',
      name: 'parent',
      qualifiedName: 'System::parent',
      startLine: 0,
      endLine: 4,
      startCharacter: 0,
      endCharacter: 1,
    })
    const gateway = createGatewayForSource(source)
    render(<ContributorSurface gateway={gateway} workspace={loaded} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    const statement = await screen.findByRole('textbox', { name: 'Engineering statement' })
    expect(statement).toHaveValue('')
    expect(screen.queryByDisplayValue('descendant { brace }')).not.toBeInTheDocument()
  })

  it('fails closed when the selected source has multiple direct documentation blocks', async () => {
    const source = 'requirement parent {\n  doc /* first */\n  doc /* second */\n}\n'
    const loaded = workspaceWithElement(source, {
      id: 'requirement-parent',
      kind: 'RequirementUsage',
      name: 'parent',
      qualifiedName: 'System::parent',
      startLine: 0,
      endLine: 3,
      startCharacter: 0,
      endCharacter: 1,
    })
    const gateway = createGatewayForSource(source)
    render(<ContributorSurface gateway={gateway} workspace={loaded} userId="engineer" onSelectId={vi.fn()} onApplied={vi.fn().mockResolvedValue(undefined)} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/multiple directly owned documentation comments/i)
    expect(screen.getByRole('button', { name: 'Add to review' })).toBeDisabled()
  })
})

function createGateway() {
  const loaded = workspace()
  const uri = loaded.snapshot.documents[0]!.uri
  const source = 'package System {\n  requirement responseTime {\n    doc /* Existing requirement wording. */\n  }\n  interface controlInterface {\n    doc /* Existing interface wording. */\n  }\n  attribute responseLimitMs : ScalarValues::Real = 120;\n}\n'
  const gateway = {
    readDocument: vi.fn(async () => ({
      uri,
      languageId: 'sysml' as const,
      sha256: loaded.snapshot.documents[0]!.sha256,
      byteLength: source.length,
      version: 1,
      text: source,
    })),
    proposeCommand: vi.fn(async (envelope: CommandEnvelope) => proposal(envelope)),
    applyCommand: vi.fn(async (approval: { proposalId: string }) => receipt(approval.proposalId)),
  } as unknown as WorkbenchGateway & {
    readDocument: ReturnType<typeof vi.fn>
    proposeCommand: ReturnType<typeof vi.fn>
    applyCommand: ReturnType<typeof vi.fn>
  }
  return gateway
}

function createGatewayForSource(source: string) {
  const gateway = createGateway()
  gateway.readDocument.mockResolvedValue({
    uri: 'file:///workspace/model.sysml',
    languageId: 'sysml',
    sha256: 'document-1',
    byteLength: source.length,
    version: 1,
    text: source,
  })
  return gateway
}

function workspace(): LoadedWorkspace {
  const uri = 'file:///workspace/model.sysml'
  const source = 'package System {\n  requirement responseTime {\n    doc /* Existing requirement wording. */\n  }\n  interface controlInterface {\n    doc /* Existing interface wording. */\n  }\n  attribute responseLimitMs : ScalarValues::Real = 120;\n}\n'
  const requirement = element('requirement-response', 'RequirementUsage', 'responseTime', 'System::responseTime', uri, 1, 3, 3)
  const iface = element('interface-control', 'InterfaceUsage', 'controlInterface', 'System::controlInterface', uri, 4, 6, 3)
  const attribute = element('attribute-response-limit', 'AttributeUsage', 'responseLimitMs', 'System::responseLimitMs', uri, 7, 7, source.split('\n')[7]!.length)
  const snapshot = {
    schemaVersion: 1 as const,
    snapshotSha256: 'snapshot-1',
    workspace: { id: 'pilot', rootUri: 'file:///workspace', configurationName: 'Pilot workspace' },
    authority: {
      adapterId: 'qualified',
      adapterVersion: '1.0.0',
      engineName: 'pilot',
      engineVersion: '1',
      referenceRelease: '2026-05',
      qualificationStatus: 'qualified' as const,
    },
    freshness: 'current' as const,
    documents: [{ uri, languageId: 'sysml' as const, sha256: 'document-1', byteLength: source.length }],
    elements: [requirement, iface, attribute],
    relationships: [{
      id: 'requirement-interface',
      kind: 'interface' as const,
      sourceId: 'requirement-response',
      targetId: 'interface-control',
      provenance: {
        authority: 'qualified-language-engine' as const,
        extraction: 'pilot-emf-explicit-reference' as const,
        engineMetaclass: 'InterfaceUsage',
        features: ['target'],
      },
    }],
  }
  return {
    status: {
      workspaceId: 'pilot',
      rootUri: 'file:///workspace',
      configurationName: 'Pilot workspace',
      indexState: 'ready',
      semanticAuthority: 'qualified-engine',
      documentCount: 1,
      snapshotSha256: 'snapshot-1',
      documents: snapshot.documents,
      diagnostics: { errors: 0, warnings: 0, information: 0, hints: 0 },
      languageCapabilities: {},
      capabilitiesFinal: true,
    },
    snapshot,
    diagnostics: [],
    views: [],
  } as unknown as LoadedWorkspace
}

function workspaceWithElement(
  source: string,
  input: {
    id: string
    kind: 'RequirementUsage' | 'InterfaceUsage' | 'AttributeUsage'
    name: string
    qualifiedName: string
    startLine: number
    endLine: number
    startCharacter: number
    endCharacter: number
  },
): LoadedWorkspace {
  const loaded = workspace()
  const uri = loaded.snapshot.documents[0]!.uri
  const selected = element(
    input.id,
    input.kind,
    input.name,
    input.qualifiedName,
    uri,
    input.startLine,
    input.endLine,
    input.endCharacter,
    input.startCharacter,
  )
  const documents = [{ ...loaded.snapshot.documents[0]!, byteLength: source.length }]
  loaded.snapshot = {
    ...loaded.snapshot,
    documents,
    elements: [selected],
    relationships: [],
  }
  loaded.status = { ...loaded.status, documents }
  return loaded
}

function element(id: string, kind: 'RequirementUsage' | 'InterfaceUsage' | 'AttributeUsage', name: string, qualifiedName: string, uri: string, startLine: number, endLine: number, endCharacter: number, startCharacter = 2) {
  return {
    id,
    kind,
    rawKind: kind,
    name,
    qualifiedName,
    source: {
      uri,
      workspacePath: 'model.sysml',
      range: { start: { line: startLine, character: startCharacter }, end: { line: endLine, character: endCharacter } },
      documentSha256: 'document-1',
    },
    fingerprint: 'fingerprint-' + id,
    provenance: {
      authority: 'qualified-language-engine' as const,
      extraction: 'pilot-emf-semantic-evidence' as const,
      classification: 'engine-metaclass' as const,
      engineId: 'engine-' + id,
    },
  }
}

function proposal(envelope: CommandEnvelope): CommandProposal {
  return {
    schemaVersion: 1,
    proposalId: 'proposal:contributor',
    commandId: envelope.commandId,
    state: 'proposed',
    envelope,
    edits: { changes: {} },
    affectedElementIds: ['requirement-response'],
    diagnosticsBefore: [],
    diagnosticsAfter: [],
    semanticDiff: { beforeSnapshotSha256: 'snapshot-1', afterSnapshotSha256: 'snapshot-2', changes: [] },
    conflicts: [],
    approval: { required: true, approved: false },
    undo: { changes: {} },
    authority: {
      adapterId: 'qualified',
      adapterVersion: '1.0.0',
      engineName: 'pilot',
      engineVersion: '1',
      referenceRelease: '2026-05',
      qualificationStatus: 'qualified',
    },
    editProfile: { id: 'structured-source-edits', version: '1.0.0' },
    validation: { state: 'validated' },
  }
}

function receipt(proposalId: string): AppliedCommandReceipt {
  return {
    schemaVersion: 1,
    state: 'applied',
    proposalId,
    commandId: 'contributor:command',
    approval: { approvalId: 'approval:contributor', approvedBy: { kind: 'user', id: 'engineer' } },
    transaction: { schemaVersion: 1, transactionId: 'transaction:contributor', state: 'FINALIZED', files: [], completedPaths: [] },
    appliedSnapshotSha256: 'snapshot-2',
    appliedAt: '2026-10-12T00:00:00.000Z',
    undo: { baseSnapshotSha256: 'snapshot-2', baseDocuments: {}, edits: { changes: {} } },
  }
}
