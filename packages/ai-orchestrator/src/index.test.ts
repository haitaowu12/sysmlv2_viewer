// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  AppliedCommandReceipt,
  CommandProposal,
} from '../../command-engine/src/index.js'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import {
  AiAuditRepository,
  AiOrchestrator,
  LocalDeterministicAiProvider,
  type AiProvider,
  type AiProviderProposal,
  type AiWorkspaceToolHost,
} from './index.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('AiOrchestrator', () => {
  it('rejects hallucinated model identities and persists the rejection', async () => {
    const fixture = await createFixture()
    const provider = staticProvider({
      message: 'This element exists.',
      citedElementIds: ['wb:fixture:hallucinated'],
      assumptions: [],
      commands: [],
    })
    const orchestrator = createOrchestrator(provider)

    const result = await orchestrator.request(
      request(),
      fixture.host,
      fixture.audit,
    )

    expect(result.state).toBe('rejected')
    expect(result.validation.reasons).toEqual([
      'Provider cited unknown model identities: wb:fixture:hallucinated',
    ])
    await expect(fixture.audit.read('AI-001')).resolves.toMatchObject({
      state: 'rejected',
      citations: [],
    })
  })

  it('keeps validated commands proposal-only until a separate user approval', async () => {
    const fixture = await createFixture()
    const provider = staticProvider({
      message: 'Rename the controller.',
      citedElementIds: ['wb:fixture:controller'],
      assumptions: ['The cited controller is the intended target.'],
      commands: [
        {
          kind: 'rename-element',
          targetId: 'wb:fixture:controller',
          newName: 'PrimaryController',
        },
      ],
    })
    const orchestrator = createOrchestrator(provider)
    const proposed = await orchestrator.request(
      request(),
      fixture.host,
      fixture.audit,
    )

    expect(proposed).toMatchObject({
      state: 'proposed',
      validation: { accepted: true },
      approval: { required: true, approved: false },
      affectedElementIds: ['wb:fixture:controller'],
      receipts: [],
    })
    expect(fixture.applied).toHaveLength(0)
    await expect(
      orchestrator.apply(
        {
          schemaVersion: 1,
          operationId: 'AI-001',
          workspaceId: 'fixture',
          approvalId: 'APPROVE-AI-001',
          approvedBy: { kind: 'ai', id: 'provider' },
          at: '2026-07-25T22:10:00.000Z',
        } as never,
        fixture.host,
        fixture.audit,
      ),
    ).rejects.toThrow('approval by a user')
    expect(fixture.applied).toHaveLength(0)

    const applied = await orchestrator.apply(
      {
        schemaVersion: 1,
        operationId: 'AI-001',
        workspaceId: 'fixture',
        approvalId: 'APPROVE-AI-001',
        approvedBy: { kind: 'user', id: 'engineer' },
        at: '2026-07-25T22:10:00.000Z',
      },
      fixture.host,
      fixture.audit,
    )
    expect(applied).toMatchObject({
      state: 'applied',
      approval: {
        approved: true,
        approvedBy: 'engineer',
      },
    })
    expect(fixture.applied).toHaveLength(1)
  })

  it('blocks provider attempts to call the apply tool', async () => {
    const fixture = await createFixture()
    const provider: AiProvider = {
      id: 'unsafe-provider',
      displayName: 'Unsafe provider',
      model: 'test',
      networkAccess: false,
      async propose(_context, tools) {
        await tools.call('apply_approved_commands', {})
        return {
          message: 'Applied.',
          citedElementIds: [],
          assumptions: [],
          commands: [],
        }
      },
    }
    const orchestrator = createOrchestrator(provider)

    const result = await orchestrator.request(
      request(),
      fixture.host,
      fixture.audit,
    )
    expect(result.state).toBe('rejected')
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({
        name: 'apply_approved_commands',
        outcome: 'rejected',
      }),
    )
    expect(fixture.applied).toHaveLength(0)
  })

  it('disables network providers even when registered', async () => {
    const fixture = await createFixture()
    const provider = {
      ...staticProvider({
        message: 'Network response.',
        citedElementIds: [],
        assumptions: [],
        commands: [],
      }),
      networkAccess: true,
    }
    const orchestrator = createOrchestrator(provider)

    expect(orchestrator.status().providers[0]).toMatchObject({
      enabled: false,
      networkAccess: true,
    })
    await expect(
      orchestrator.request(request(), fixture.host, fixture.audit),
    ).resolves.toMatchObject({
      state: 'rejected',
      validation: {
        reasons: ['External AI provider is disabled by policy: mock-provider'],
      },
    })
  })

  it('provides an offline grounded search and rename fallback', async () => {
    const fixture = await createFixture()
    const provider = new LocalDeterministicAiProvider()
    const orchestrator = new AiOrchestrator({
      providers: [provider],
      defaultProviderId: provider.id,
    })
    const search = await orchestrator.request(
      {
        ...request(),
        userRequest: 'find Controller',
      },
      fixture.host,
      fixture.audit,
    )
    expect(search.citations.map((element) => element.id)).toEqual([
      'wb:fixture:controller',
    ])

    const rename = await orchestrator.request(
      {
        ...request(),
        operationId: 'AI-002',
        userRequest: 'rename wb:fixture:controller to PrimaryController',
      },
      fixture.host,
      fixture.audit,
    )
    expect(rename).toMatchObject({
      state: 'proposed',
      commands: [
        {
          kind: 'rename-element',
          targetId: 'wb:fixture:controller',
          newName: 'PrimaryController',
        },
      ],
    })
  })

  it('detects tampering in durable audit records', async () => {
    const fixture = await createFixture()
    const provider = staticProvider({
      message: 'Grounded answer.',
      citedElementIds: ['wb:fixture:controller'],
      assumptions: [],
      commands: [],
    })
    await createOrchestrator(provider).request(
      request(),
      fixture.host,
      fixture.audit,
    )
    const auditPath = join(
      fixture.root,
      '.sysml-workbench/audit/ai/AI-001.json',
    )
    const raw = await readFile(auditPath, 'utf8')
    await writeFile(auditPath, raw.replace('Grounded answer.', 'Tampered answer.'))

    await expect(fixture.audit.read('AI-001')).rejects.toThrow(
      'audit record hash mismatch',
    )
  })
})

function request() {
  return {
    schemaVersion: 1 as const,
    operationId: 'AI-001',
    workspaceId: 'fixture',
    userRequest: 'Review the controller.',
    requestedBy: 'engineer',
    at: '2026-07-25T22:00:00.000Z',
  }
}

function createOrchestrator(provider: AiProvider): AiOrchestrator {
  return new AiOrchestrator({
    providers: [provider],
    defaultProviderId: provider.id,
  })
}

function staticProvider(proposal: AiProviderProposal): AiProvider {
  return {
    id: 'mock-provider',
    displayName: 'Mock provider',
    model: 'mock-1',
    networkAccess: false,
    async propose() {
      return structuredClone(proposal)
    },
  }
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sysml-workbench-ai-'))
  temporaryDirectories.push(root)
  const snapshot = semanticSnapshot()
  const applied: unknown[] = []
  const proposal = commandProposal()
  const host: AiWorkspaceToolHost = {
    async snapshot() {
      return snapshot
    },
    async executeTool(name, input) {
      switch (name) {
        case 'search_elements':
          return snapshot.elements.filter((element) =>
            element.name.toLowerCase().includes(
              String((input as { nameContains?: string }).nameContains ?? '')
                .toLowerCase(),
            ),
          )
        case 'get_element':
          return snapshot.elements.find(
            (element) =>
              element.id === (input as { elementId: string }).elementId,
          ) ?? null
        case 'validate_commands':
          return { proposals: [proposal] }
        case 'apply_approved_commands':
          applied.push(input)
          return { receipts: [receipt()] }
        default:
          return []
      }
    },
  }
  return {
    root,
    host,
    applied,
    audit: new AiAuditRepository(root, 'fixture'),
  }
}

function semanticSnapshot(): SemanticSnapshot {
  return {
    schemaVersion: 1,
    snapshotSha256: 'a'.repeat(64),
    workspace: {
      id: 'fixture',
      rootUri: 'file:///fixture',
      configurationName: 'default',
    },
    authority: {
      adapterId: 'test',
      adapterVersion: '1.0.0',
      engineName: 'test',
      engineVersion: '1.0.0',
      referenceRelease: 'test',
      qualificationStatus: 'qualified',
    },
    freshness: 'current',
    documents: [],
    elements: [
      {
        id: 'wb:fixture:controller',
        kind: 'PartDefinition',
        rawKind: 'PartDefinition',
        name: 'Controller',
        qualifiedName: 'System::Controller',
        source: {
          uri: 'file:///fixture/model.sysml',
          workspacePath: 'model.sysml',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 20 },
          },
          documentSha256: 'b'.repeat(64),
        },
        fingerprint: 'c'.repeat(64),
        provenance: {
          authority: 'qualified-language-engine',
          extraction: 'pilot-emf-semantic-evidence',
          classification: 'engine-metaclass',
          engineId: 'controller',
        },
      },
    ],
    relationships: [],
  }
}

function commandProposal(): CommandProposal {
  return {
    schemaVersion: 1,
    proposalId: 'proposal:ai-001',
    commandId: 'AI-001:1',
    state: 'proposed',
    envelope: {
      schemaVersion: 1,
      commandId: 'AI-001:1',
      workspaceId: 'fixture',
      baseSnapshotSha256: 'a'.repeat(64),
      baseDocuments: {},
      requestedBy: { kind: 'ai', id: 'engineer' },
      command: {
        kind: 'rename-element',
        targetId: 'wb:fixture:controller',
        newName: 'PrimaryController',
      },
    },
    edits: { changes: {} },
    affectedElementIds: ['wb:fixture:controller'],
    diagnosticsBefore: [],
    diagnosticsAfter: [],
    semanticDiff: null,
    conflicts: [],
    approval: { required: true, approved: false },
    undo: { changes: {} },
    authority: semanticSnapshot().authority,
    editProfile: { id: 'language-service-rename', version: '1.0.0' },
    validation: { state: 'validated' },
  }
}

function receipt(): AppliedCommandReceipt {
  return {
    schemaVersion: 1,
    state: 'applied',
    proposalId: 'proposal:ai-001',
    commandId: 'AI-001:1',
    approval: {
      approvalId: 'APPROVE-AI-001',
      approvedBy: { kind: 'user', id: 'engineer' },
    },
    transaction: {
      schemaVersion: 1,
      transactionId: 'transaction:ai-001',
      state: 'COMMITTED',
      files: [],
      completedPaths: [],
    },
    appliedSnapshotSha256: 'd'.repeat(64),
    appliedAt: '2026-07-25T22:10:00.000Z',
    undo: {
      baseSnapshotSha256: 'd'.repeat(64),
      baseDocuments: {},
      edits: { changes: {} },
    },
  }
}
