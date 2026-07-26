// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { LspProcessAdapter } from './lsp-process-adapter.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const adapters: LspProcessAdapter[] = []

afterEach(async () => {
  await Promise.all(adapters.splice(0).map((adapter) => adapter.dispose()))
})

describe('LspProcessAdapter', () => {
  it('negotiates capabilities and normalizes diagnostics over stdio', async () => {
    const adapter = new LspProcessAdapter({
      metadata: {
        adapterId: 'test/fake-lsp',
        adapterVersion: '0.1.0',
        engineName: 'fake-lsp',
        engineVersion: '1',
        referenceRelease: 'test',
        qualificationStatus: 'unqualified',
      },
      command: process.execPath,
      arguments: [
        resolve(currentDirectory, '../test-fixtures/fake-lsp.mjs'),
      ],
      diagnosticSettleMs: 500,
      requestTimeoutMs: 2_000,
      semanticEvidenceMethod: 'sysml/semanticEvidence',
    })
    adapters.push(adapter)
    const filePath = resolve(currentDirectory, 'fixture.sysml')
    const documentUri = pathToFileURL(filePath).href
    const diagnostics = await adapter.openWorkspace({
      workspaceId: 'fake',
      rootUri: pathToFileURL(currentDirectory).href,
      configurationName: 'test',
      documents: [
        {
          uri: documentUri,
          absolutePath: filePath,
          languageId: 'sysml',
          version: 1,
          text: 'package Fake {}',
          sha256: 'test',
        },
      ],
    })

    expect(adapter.capabilities).toMatchObject({
      workspaceLifecycle: true,
      diagnostics: true,
      definitions: true,
      references: true,
      completion: true,
      hover: true,
      semanticTokens: true,
      rename: true,
      formatting: true,
      semanticEvidence: true,
      semanticSnapshot: false,
    })
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'FAKE-001',
        message: 'deterministic fake diagnostic',
      }),
    ])
    expect(adapter.evidence()).toMatchObject({
      command: process.execPath,
      captureTruncated: false,
    })
    expect(adapter.evidence().stdoutSha256).toMatch(/^[0-9a-f]{64}$/)
    await expect(adapter.documentSymbols(documentUri)).resolves.toEqual([
      expect.objectContaining({
        name: 'Fake',
        kind: 'package',
      }),
    ])
    await expect(
      adapter.definition(documentUri, { line: 0, character: 1 }),
    ).resolves.toEqual([
      expect.objectContaining({ uri: documentUri }),
    ])
    await expect(
      adapter.references(documentUri, { line: 0, character: 1 }),
    ).resolves.toHaveLength(1)
    await expect(
      adapter.hover(documentUri, { line: 0, character: 1 }),
    ).resolves.toMatchObject({
      format: 'markdown',
      value: '**Fake** package',
    })
    await expect(
      adapter.completion(documentUri, { line: 0, character: 1 }),
    ).resolves.toEqual([
      expect.objectContaining({ label: 'package', kind: 'constant' }),
    ])
    await expect(adapter.semanticTokens(documentUri)).resolves.toEqual({
      legend: {
        tokenTypes: ['namespace'],
        tokenModifiers: ['declaration'],
      },
      data: [0, 0, 4, 0, 1],
    })
    await expect(
      adapter.rename(
        documentUri,
        { line: 0, character: 1 },
        'Renamed',
      ),
    ).resolves.toEqual({
      changes: {
        [documentUri]: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 4 },
            },
            newText: 'Renamed',
          },
        ],
      },
    })
    await expect(adapter.formatting(documentUri)).resolves.toEqual([
      expect.objectContaining({ newText: 'package Fake {}\\n' }),
    ])
    await expect(adapter.semanticEvidence(documentUri)).resolves.toEqual({
      schemaVersion: 1,
      uri: documentUri,
      elements: [
        expect.objectContaining({
          engineId: `fake-package:${documentUri}`,
          metaclass: 'Package',
          qualifiedName: 'Fake',
        }),
      ],
      relationships: [],
    })
    await expect(
      adapter.changeDocument(documentUri, 2, 'package Fake {}'),
    ).resolves.toEqual([])
    await expect(
      adapter.changeDocument(documentUri, 2, 'package Fake {}'),
    ).rejects.toThrow('Document version must increase')
  })

  it('cancels a request that exceeds its bounded timeout', async () => {
    const adapter = new LspProcessAdapter({
      metadata: {
        adapterId: 'test/fake-lsp-timeout',
        adapterVersion: '0.1.0',
        engineName: 'fake-lsp',
        engineVersion: '1',
        referenceRelease: 'test',
        qualificationStatus: 'unqualified',
      },
      command: process.execPath,
      arguments: [
        resolve(currentDirectory, '../test-fixtures/fake-lsp.mjs'),
      ],
      environment: { FAKE_LSP_HOVER_DELAY_MS: '500' },
      diagnosticSettleMs: 100,
      requestTimeoutMs: 200,
    })
    adapters.push(adapter)
    const filePath = resolve(currentDirectory, 'timeout.sysml')
    const documentUri = pathToFileURL(filePath).href
    await adapter.openWorkspace({
      workspaceId: 'fake-timeout',
      rootUri: pathToFileURL(currentDirectory).href,
      configurationName: 'test',
      documents: [
        {
          uri: documentUri,
          absolutePath: filePath,
          languageId: 'sysml',
          version: 1,
          text: 'package Fake {}',
          sha256: 'test',
        },
      ],
    })
    await expect(
      adapter.hover(documentUri, { line: 0, character: 1 }),
    ).rejects.toThrow('Language engine request timed out')
  })

  it('handles an engine crash without an unhandled stdin error during disposal', async () => {
    const adapter = new LspProcessAdapter({
      metadata: {
        adapterId: 'test/fake-lsp-crash',
        adapterVersion: '0.1.0',
        engineName: 'fake-lsp',
        engineVersion: '1',
        referenceRelease: 'test',
        qualificationStatus: 'unqualified',
      },
      command: process.execPath,
      arguments: [
        resolve(currentDirectory, '../test-fixtures/fake-lsp.mjs'),
      ],
      environment: {
        FAKE_LSP_CRASH_AFTER_OPEN: '1',
        FAKE_LSP_CRASH_DELAY_MS: '25',
      },
      diagnosticSettleMs: 10,
      requestTimeoutMs: 500,
    })
    adapters.push(adapter)
    const filePath = resolve(currentDirectory, 'crash.sysml')
    const documentUri = pathToFileURL(filePath).href
    await adapter.openWorkspace({
      workspaceId: 'fake-crash',
      rootUri: pathToFileURL(currentDirectory).href,
      configurationName: 'test',
      documents: [
        {
          uri: documentUri,
          absolutePath: filePath,
          languageId: 'sysml',
          version: 1,
          text: 'package Fake {}',
          sha256: 'test',
        },
      ],
    })

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 75))

    expect(adapter.health()).toMatchObject({
      state: 'failed',
    })
    await expect(adapter.dispose()).resolves.toBeUndefined()
  })
})
