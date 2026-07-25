// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type {
  AdapterWorkspace,
  LanguageAdapter,
  LanguageDiagnostic,
} from './index.js'
import { HybridLanguageAdapter } from './hybrid-language-adapter.js'

const workspace: AdapterWorkspace = {
  workspaceId: 'hybrid-test',
  rootUri: 'file:///workspace',
  configurationName: 'default',
  documents: [
    {
      uri: 'file:///workspace/model.sysml',
      absolutePath: '/workspace/model.sysml',
      languageId: 'sysml',
      version: 1,
      text: 'package Test {}',
      sha256: 'source',
    },
  ],
}

describe('HybridLanguageAdapter', () => {
  it('keeps semantic diagnostics authoritative and routes authoring proposals explicitly', async () => {
    const semanticDiagnostics: LanguageDiagnostic[] = [
      {
        uri: workspace.documents[0]!.uri,
        severity: 'warning',
        code: 'SEMANTIC',
        message: 'authoritative',
      },
    ]
    const semantic = adapter('semantic', semanticDiagnostics)
    const authoring = adapter('authoring', [
      {
        uri: workspace.documents[0]!.uri,
        severity: 'error',
        code: 'IGNORED-AUTHORING-DIAGNOSTIC',
        message: 'must not become authoritative',
      },
    ])
    const hybrid = new HybridLanguageAdapter(semantic, authoring, {
      adapterId: 'test/hybrid',
      adapterVersion: '1',
      engineName: 'test',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'qualified',
    })

    await expect(hybrid.openWorkspace(workspace)).resolves.toEqual(
      semanticDiagnostics,
    )
    await expect(
      hybrid.completion(workspace.documents[0]!.uri, {
        line: 0,
        character: 0,
      }),
    ).resolves.toEqual([{ label: 'authoring-completion' }])
    await expect(
      hybrid.definition(workspace.documents[0]!.uri, {
        line: 0,
        character: 0,
      }),
    ).resolves.toEqual([
      {
        uri: 'file:///workspace/semantic.sysml',
        range: range(),
      },
    ])
    expect(authoring.completion).toHaveBeenCalledOnce()
    expect(semantic.completion).not.toHaveBeenCalled()
    expect(semantic.definition).toHaveBeenCalledOnce()
    expect(authoring.definition).not.toHaveBeenCalled()
  })

  it('fails the hybrid open instead of silently dropping an engine', async () => {
    const semantic = adapter('semantic', [])
    const authoring = adapter('authoring', [])
    vi.mocked(authoring.openWorkspace).mockRejectedValueOnce(
      new Error('authoring failed'),
    )
    const hybrid = new HybridLanguageAdapter(semantic, authoring, {
      adapterId: 'test/hybrid',
      adapterVersion: '1',
      engineName: 'test',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'qualified',
    })

    await expect(hybrid.openWorkspace(workspace)).rejects.toThrow(
      'authoring failed',
    )
    expect(semantic.closeWorkspace).toHaveBeenCalledWith('hybrid-test')
    expect(authoring.closeWorkspace).toHaveBeenCalledWith('hybrid-test')
  })
})

function adapter(
  role: string,
  diagnostics: LanguageDiagnostic[],
): LanguageAdapter {
  return {
    metadata: {
      adapterId: role,
      adapterVersion: '1',
      engineName: role,
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'unqualified',
    },
    capabilities: {
      workspaceLifecycle: true,
      diagnostics: true,
      documentSymbols: true,
      workspaceSymbols: true,
      definitions: true,
      references: true,
      completion: true,
      hover: true,
      semanticTokens: true,
      rename: true,
      formatting: true,
      semanticSnapshot: false,
    },
    capabilitiesFinal: () => true,
    initialize: vi.fn(async () => undefined),
    openWorkspace: vi.fn(async () => diagnostics),
    closeWorkspace: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    documentSymbols: vi.fn(async () => []),
    definition: vi.fn(async () => [
      { uri: `file:///workspace/${role}.sysml`, range: range() },
    ]),
    references: vi.fn(async () => []),
    hover: vi.fn(async () => null),
    completion: vi.fn(async () => [{ label: `${role}-completion` }]),
    semanticTokens: vi.fn(async () => ({
      legend: { tokenTypes: [], tokenModifiers: [] },
      data: [],
    })),
    rename: vi.fn(async () => ({ changes: {} })),
    formatting: vi.fn(async () => []),
    changeDocument: vi.fn(async () => diagnostics),
    restartWorkspace: vi.fn(async () => diagnostics),
    health: () => ({ state: 'ready' }),
  }
}

function range() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  }
}
