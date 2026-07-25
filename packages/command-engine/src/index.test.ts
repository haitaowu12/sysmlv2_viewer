import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import {
  applySourceEdits,
  COMMAND_KINDS,
  completeCommandValidation,
  planCommand,
  SourceEditConflictError,
  type CommandEnvelope,
  type CommandWorkspaceDocument,
} from './index.js'

const uri = 'file:///workspace/model/system.sysml'
const source = 'package Vehicle {\n  part def Engine;\n}\n'
const document: CommandWorkspaceDocument = {
  uri,
  workspacePath: 'model/system.sysml',
  text: source,
  sha256: digest(source),
  version: 1,
}

const snapshot: SemanticSnapshot = {
  schemaVersion: 1,
  snapshotSha256: 'snapshot-before',
  workspace: {
    id: 'vehicle',
    rootUri: 'file:///workspace',
    configurationName: 'default',
  },
  authority: {
    adapterId: 'qualified-hybrid',
    adapterVersion: '0.2.0',
    engineName: 'qualified',
    engineVersion: 'test',
    referenceRelease: '2026-05',
    qualificationStatus: 'qualified',
  },
  freshness: 'current',
  documents: [
    {
      uri,
      languageId: 'sysml',
      sha256: document.sha256,
      byteLength: Buffer.byteLength(source),
    },
  ],
  elements: [
    {
      id: 'element-engine',
      kind: 'PartDefinition',
      rawKind: 'PartDefinition',
      name: 'Engine',
      qualifiedName: 'Vehicle::Engine',
      source: {
        uri,
        workspacePath: 'model/system.sysml',
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 18 },
        },
        documentSha256: document.sha256,
      },
      fingerprint: 'fingerprint-engine',
      provenance: {
        authority: 'qualified-language-engine',
        extraction: 'pilot-emf-semantic-evidence',
        classification: 'engine-metaclass',
        engineId: 'engine-native-id',
      },
    },
  ],
  relationships: [],
}

describe('command registry', () => {
  it('declares every Gate P3 command category', () => {
    expect(COMMAND_KINDS).toEqual([
      'create-element',
      'create-relationship',
      'delete-element',
      'rename-element',
      'move-element',
      'change-type',
      'change-multiplicity',
      'set-property',
      'update-documentation',
      'apply-pattern',
    ])
  })
})

describe('source edit transaction', () => {
  it('applies edits deterministically and returns exact inverse edits', () => {
    const result = applySourceEdits([document], {
      changes: {
        [uri]: [
          {
            range: {
              start: { line: 1, character: 11 },
              end: { line: 1, character: 17 },
            },
            newText: 'Motor',
          },
        ],
      },
    })

    expect(result.documents[0]!.text).toBe(
      'package Vehicle {\n  part def Motor;\n}\n',
    )
    expect(result.inverse.changes[uri]).toEqual([
      {
        range: {
          start: { line: 1, character: 11 },
          end: { line: 1, character: 16 },
        },
        newText: 'Engine',
      },
    ])
    expect(
      applySourceEdits(result.documents, result.inverse).documents[0]!.text,
    ).toBe(source)
  })

  it('fails closed on overlap, unknown documents, and stale base hashes', () => {
    expect(() =>
      applySourceEdits([document], {
        changes: {
          [uri]: [
            {
              range: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 10 },
              },
              newText: 'x',
            },
            {
              range: {
                start: { line: 1, character: 9 },
                end: { line: 1, character: 12 },
              },
              newText: 'y',
            },
          ],
        },
      }),
    ).toThrow(SourceEditConflictError)

    expect(() =>
      applySourceEdits([document], {
        changes: {
          'file:///outside.sysml': [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              newText: 'unsafe',
            },
          ],
        },
      }),
    ).toThrow('outside the authorized workspace')

    expect(() =>
      applySourceEdits(
        [{ ...document, sha256: 'stale' }],
        { changes: {} },
      ),
    ).toThrow('document hash does not match content')
  })
})

describe('command planning', () => {
  it('wraps a language-service rename in a proposal-only transaction', async () => {
    const envelope: CommandEnvelope = {
      schemaVersion: 1,
      commandId: 'CMD-001',
      workspaceId: 'vehicle',
      baseSnapshotSha256: snapshot.snapshotSha256,
      baseDocuments: { [uri]: document.sha256 },
      requestedBy: { kind: 'user', id: 'engineer' },
      command: {
        kind: 'rename-element',
        targetId: 'element-engine',
        newName: 'Motor',
      },
    }

    const proposal = await planCommand({
      envelope,
      snapshot,
      documents: [document],
      renameProvider: async (target, newName) => {
        expect(target.id).toBe('element-engine')
        expect(newName).toBe('Motor')
        return {
          changes: {
            [uri]: [
              {
                range: {
                  start: { line: 1, character: 11 },
                  end: { line: 1, character: 17 },
                },
                newText: 'Motor',
              },
            ],
          },
        }
      },
    })

    expect(proposal.state).toBe('proposed')
    expect(proposal.approval.required).toBe(true)
    expect(proposal.approval.approved).toBe(false)
    expect(proposal.affectedElementIds).toEqual(['element-engine'])
    expect(proposal.overlayDocuments[0]!.text).toContain('part def Motor;')
    expect(proposal.undo.changes[uri]![0]!.newText).toBe('Engine')
    expect(proposal.conflicts).toEqual([])
  })

  it('attaches authoritative diagnostics and identity-aware semantic diff', async () => {
    const envelope: CommandEnvelope = {
      schemaVersion: 1,
      commandId: 'CMD-VALIDATE-001',
      workspaceId: 'vehicle',
      baseSnapshotSha256: snapshot.snapshotSha256,
      baseDocuments: { [uri]: document.sha256 },
      requestedBy: { kind: 'user', id: 'engineer' },
      command: {
        kind: 'rename-element',
        targetId: 'element-engine',
        newName: 'Motor',
      },
    }
    const planned = await planCommand({
      envelope,
      snapshot,
      documents: [document],
      renameProvider: async () => ({
        changes: {
          [uri]: [
            {
              range: {
                start: { line: 1, character: 11 },
                end: { line: 1, character: 17 },
              },
              newText: 'Motor',
            },
          ],
        },
      }),
    })
    const after: SemanticSnapshot = {
      ...structuredClone(snapshot),
      snapshotSha256: 'snapshot-after',
      elements: [
        {
          ...structuredClone(snapshot.elements[0]!),
          name: 'Motor',
          qualifiedName: 'Vehicle::Motor',
          fingerprint: 'fingerprint-motor',
        },
      ],
    }
    const validated = completeCommandValidation(planned, {
      beforeSnapshot: snapshot,
      afterSnapshot: after,
      diagnosticsBefore: [],
      diagnosticsAfter: [],
    })

    expect(validated.validation).toEqual({ state: 'validated' })
    expect(validated.semanticDiff?.changes.map((change) => change.kind)).toEqual([
      'element-renamed',
      'element-content-changed',
    ])

    const rejected = completeCommandValidation(planned, {
      beforeSnapshot: snapshot,
      afterSnapshot: after,
      diagnosticsBefore: [],
      diagnosticsAfter: [
        {
          uri,
          severity: 'error',
          code: 'TEST-ERROR',
          message: 'invalid overlay',
        },
      ],
    })
    expect(rejected.validation).toEqual({ state: 'rejected' })
    expect(rejected.conflicts).toContainEqual({
      code: 'AUTHORITATIVE_DIAGNOSTIC_ERROR',
      message: 'TEST-ERROR: invalid overlay',
    })
  })

  it('rejects stale snapshots, stale documents, opaque targets, and unsupported commands', async () => {
    const base: CommandEnvelope = {
      schemaVersion: 1,
      commandId: 'CMD-002',
      workspaceId: 'vehicle',
      baseSnapshotSha256: 'stale',
      baseDocuments: { [uri]: document.sha256 },
      requestedBy: { kind: 'user', id: 'engineer' },
      command: {
        kind: 'rename-element',
        targetId: 'element-engine',
        newName: 'Motor',
      },
    }
    await expect(
      planCommand({
        envelope: base,
        snapshot,
        documents: [document],
        renameProvider: async () => ({ changes: {} }),
      }),
    ).rejects.toThrow('base snapshot is stale')

    await expect(
      planCommand({
        envelope: {
          ...base,
          baseSnapshotSha256: snapshot.snapshotSha256,
          baseDocuments: { [uri]: 'stale' },
        },
        snapshot,
        documents: [document],
        renameProvider: async () => ({ changes: {} }),
      }),
    ).rejects.toThrow('base document is stale')

    await expect(
      planCommand({
        envelope: {
          ...base,
          baseSnapshotSha256: snapshot.snapshotSha256,
          command: {
            kind: 'delete-element',
            targetId: 'element-engine',
          },
        },
        snapshot,
        documents: [document],
        renameProvider: async () => ({ changes: {} }),
      }),
    ).rejects.toThrow('not implemented by the active command profile')
  })
})

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
