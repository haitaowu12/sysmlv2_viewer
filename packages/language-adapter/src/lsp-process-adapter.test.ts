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
  })
})
