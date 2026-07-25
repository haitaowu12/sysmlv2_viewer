import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import type { WorkbenchGateway } from '../workbench/gateway.js'
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Review source patch' })[0]!)
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
    proposeCommand: vi.fn(async () => { throw new Error('qualification stub') }),
    applyCommand: vi.fn(async () => { throw new Error('must not apply') }),
  }
  return gateway as WorkbenchGateway & Record<string, ReturnType<typeof vi.fn>>
}
