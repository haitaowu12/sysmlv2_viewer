// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const fakeServer = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../language-adapter/test-fixtures/fake-lsp.mjs',
)
const sampleDocument = pathToFileURL(
  resolve(sampleRoot, 'model/vehicle.sysml'),
).href
const workspacesRoot = resolve(sampleRoot, '..')
const services: WorkbenchService[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
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
    const closed = await service.handle({
      jsonrpc: '2.0',
      id: 3,
      method: WORKBENCH_METHODS.workspaceClose,
      params: { workspaceId: 'phase1-sample' },
    })
    expect(closed).toMatchObject({ result: { closed: true } })
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
): LspProcessAdapter {
  return new LspProcessAdapter({
    metadata: {
      adapterId: 'test/fake-lsp',
      adapterVersion: '0.1.0',
      engineName: 'fake-lsp',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'unqualified',
    },
    command: process.execPath,
    arguments: [fakeServer],
    environment,
    diagnosticSettleMs: 50,
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
