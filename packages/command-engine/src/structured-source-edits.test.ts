// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  NormalizedElementKind,
  SemanticElement,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import {
  applySourceEdits,
  planCommand,
  type CommandEnvelope,
  type CommandWorkspaceDocument,
} from './index.js'
import {
  planBatchStructuredSourceEdits,
  planStructuredSourceEdits,
  StructuredSourceEditError,
} from './structured-source-edits.js'
import { directDocumentation } from './documentation.js'

const uri = 'file:///workspace/model/system.sysml'
const source = `package System {
    part def Engine {
        doc /* old */
    }
    part vehicle : Vehicle [1..1];
    port left;
    port right;
    // opaque vendor extension must remain byte-exact
    vendor extension ???;
    attribute responseLimitMs : ScalarValues::Real = 120;
}

package Destination {
}
`
const document: CommandWorkspaceDocument = {
  uri,
  workspacePath: 'model/system.sysml',
  text: source,
  sha256: digest(source),
  version: 1,
}
const elements = [
  element('system', 'Package', 'System', 'package System {', source.indexOf('\n\npackage Destination')),
  element('engine', 'PartDefinition', 'Engine', 'part def Engine {', source.indexOf('    }\n    part vehicle') + 5, 'system'),
  element('vehicle', 'PartUsage', 'vehicle', 'part vehicle : Vehicle [1..1];', undefined, 'system'),
  element('left', 'PortUsage', 'left', 'port left;', undefined, 'system'),
  element('right', 'PortUsage', 'right', 'port right;', undefined, 'system'),
  element('response-limit', 'AttributeUsage', 'responseLimitMs', 'attribute responseLimitMs : ScalarValues::Real = 120;', undefined, 'system'),
  element('destination', 'Package', 'Destination', 'package Destination {', source.length - 1),
]
const snapshot: SemanticSnapshot = {
  schemaVersion: 1,
  snapshotSha256: 'snapshot',
  workspace: {
    id: 'workspace',
    rootUri: 'file:///workspace',
    configurationName: 'default',
  },
  authority: {
    adapterId: 'test',
    adapterVersion: '1',
    engineName: 'test',
    engineVersion: '1',
    referenceRelease: 'test',
    qualificationStatus: 'qualified',
  },
  freshness: 'current',
  documents: [{ uri, languageId: 'sysml', sha256: document.sha256, byteLength: source.length }],
  elements,
  relationships: [],
}

describe('structured source edit profile', () => {
  it('creates elements and relationships inside an engine-owned body', () => {
    const created = apply(planStructuredSourceEdits({
      kind: 'create-element',
      ownerId: 'system',
      elementKind: 'PortUsage',
      name: 'commandPort',
      typeQualifiedName: 'Library::CommandPort',
    }, snapshot, [document]))
    expect(created).toContain('port commandPort : Library::CommandPort;')
    expect(created).toContain('part def Engine')
    expect(created).toContain(
      '// opaque vendor extension must remain byte-exact\n    vendor extension ???;',
    )

    const relationship = apply(planStructuredSourceEdits({
      kind: 'create-relationship',
      ownerId: 'system',
      relationshipKind: 'connection',
      name: 'link',
      sourceId: 'left',
      targetId: 'right',
    }, snapshot, [document]))
    expect(relationship).toContain(
      'connection link connect System::left to System::right;',
    )
  })

  it('changes type and multiplicity and updates source-backed properties', () => {
    const typeChanged = apply(planStructuredSourceEdits({
      kind: 'change-type',
      targetId: 'vehicle',
      typeQualifiedName: 'Architecture::Truck',
    }, snapshot, [document]))
    expect(typeChanged).toContain('part vehicle : Architecture::Truck [1..1];')

    const multiplicity = apply(planStructuredSourceEdits({
      kind: 'change-multiplicity',
      targetId: 'vehicle',
      lower: 0,
      upper: '*',
    }, snapshot, [document]))
    expect(multiplicity).toContain('part vehicle : Vehicle [0..*];')

    const documentation = apply(planStructuredSourceEdits({
      kind: 'update-documentation',
      targetId: 'engine',
      documentation: 'Reviewed engine definition.',
    }, snapshot, [document]))
    expect(documentation).toContain('doc /* Reviewed engine definition. */')

    const property = apply(planStructuredSourceEdits({
      kind: 'set-property',
      targetId: 'engine',
      propertyQualifiedName: 'Safety::classification',
      value: 'critical',
    }, snapshot, [document]))
    expect(property).toContain(
      'attribute :>> Safety::classification = "critical";',
    )
  })

  it('updates the target body and never a nested child documentation comment', () => {
    const updated = apply(planStructuredSourceEdits({
      kind: 'update-documentation',
      targetId: 'system',
      documentation: 'System overview.',
    }, snapshot, [document]))
    expect(updated).toContain('doc /* old */')
    expect(updated).toContain('doc /* System overview. */')
    expect(updated.indexOf('doc /* System overview. */')).toBeGreaterThan(
      updated.indexOf('vendor extension ???;'),
    )
  })

  it('inserts parent documentation before the actual outer brace when child closure shares its line', () => {
    const fixture = parentDocumentationFixture(
      'requirement parent {\n  requirement child {\n    doc /* child */\n  } }\n',
    )
    const changed = applySourceEdits(
      [fixture.document],
      planStructuredSourceEdits({
        kind: 'update-documentation',
        targetId: 'parent',
        documentation: 'parent',
      }, fixture.snapshot, [fixture.document]).edits,
    ).documents[0]!.text
    expect(directDocumentation(changed)?.body).toContain(' parent ')
    expect(changed).toContain('requirement child {\n    doc /* child */\n  }')
  })

  it('inserts parent documentation safely for a fully inline child declaration', () => {
    const fixture = parentDocumentationFixture(
      'requirement parent { requirement child { doc /* child */ } }\n',
    )
    const changed = applySourceEdits(
      [fixture.document],
      planStructuredSourceEdits({
        kind: 'update-documentation',
        targetId: 'parent',
        documentation: 'parent',
      }, fixture.snapshot, [fixture.document]).edits,
    ).documents[0]!.text
    expect(directDocumentation(changed)?.body).toContain(' parent ')
    expect(changed).toContain('requirement child { doc /* child */ }')
  })

  it('updates a simple typed attribute literal without rewriting the declaration', () => {
    const changed = apply(planStructuredSourceEdits({
      kind: 'set-attribute-value',
      targetId: 'response-limit',
      value: 80,
    }, snapshot, [document]))
    expect(changed).toContain(
      'attribute responseLimitMs : ScalarValues::Real = 80;',
    )
    expect(changed).toContain('// opaque vendor extension must remain byte-exact')
  })

  it('replaces the literal range even when its value appears in the name or type', () => {
    const valueNameSource = source.replace(
      'attribute responseLimitMs : ScalarValues::Real = 120;',
      'attribute response120Ms : Scalar120::Real = 120;',
    )
    const valueNameStart = valueNameSource.indexOf(
      'attribute response120Ms : Scalar120::Real = 120;',
    )
    const valueNameEnd = valueNameStart +
      'attribute response120Ms : Scalar120::Real = 120;'.length
    const valueNameDocument: CommandWorkspaceDocument = {
      ...document,
      text: valueNameSource,
      sha256: digest(valueNameSource),
    }
    const valueNameSnapshot: SemanticSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((item) => item.id === 'response-limit'
        ? {
            ...item,
            name: 'response120Ms',
            qualifiedName: 'System::response120Ms',
            source: {
              ...item.source,
              range: range(valueNameSource, valueNameStart, valueNameEnd),
            },
          }
        : item),
    }
    const changed = applySourceEdits([valueNameDocument], planStructuredSourceEdits({
      kind: 'set-attribute-value',
      targetId: 'response-limit',
      value: 80,
    }, valueNameSnapshot, [valueNameDocument]).edits).documents[0]!.text
    expect(changed).toContain(
      'attribute response120Ms : Scalar120::Real = 80;',
    )
    expect(changed).not.toContain('response80Ms')
  })

  it('rejects attribute expressions and no-op batch edits', () => {
    const expressionSource = source.replace(
      '= 120;',
      '= 60 + 60;',
    )
    const expressionStart = expressionSource.indexOf(
      'attribute responseLimitMs : ScalarValues::Real = 60 + 60;',
    )
    const expressionEnd = expressionStart +
      'attribute responseLimitMs : ScalarValues::Real = 60 + 60;'.length
    const expressionSnapshot: SemanticSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((item) => item.id === 'response-limit'
        ? {
            ...item,
            source: {
              ...item.source,
              range: range(expressionSource, expressionStart, expressionEnd),
            },
          }
        : item),
    }
    const expressionDocument: CommandWorkspaceDocument = {
      ...document,
      text: expressionSource,
      sha256: digest(expressionSource),
    }
    expect(() => planStructuredSourceEdits({
      kind: 'set-attribute-value',
      targetId: 'response-limit',
      value: 80,
    }, expressionSnapshot, [expressionDocument])).toThrow('simple typed literal')

    expect(() => planBatchStructuredSourceEdits([
      { kind: 'update-documentation', targetId: 'engine', documentation: 'old' },
    ], snapshot, [document])).toThrow('no-op')
  })

  it('composes one contributor batch and returns one inverse transaction', () => {
    const plan = planBatchStructuredSourceEdits([
      { kind: 'set-attribute-value', targetId: 'response-limit', value: 80 },
      {
        kind: 'update-documentation',
        targetId: 'engine',
        documentation: 'Reviewed in the contributor pilot.',
      },
    ], snapshot, [document])
    expect(plan.affectedElementIds).toEqual(['response-limit', 'engine'])
    const applied = applySourceEdits([document], plan.edits)
    expect(applied.documents[0]!.text).toContain('= 80;')
    expect(applied.documents[0]!.text).toContain(
      'doc /* Reviewed in the contributor pilot. */',
    )
    expect(
      applySourceEdits(applied.documents, applied.inverse).documents[0]!.text,
    ).toBe(source)
  })

  it('routes the batch through one proposal and one inverse', async () => {
    const envelope: CommandEnvelope = {
      schemaVersion: 1,
      commandId: 'BATCH-001',
      workspaceId: 'workspace',
      baseSnapshotSha256: snapshot.snapshotSha256,
      baseDocuments: { [uri]: document.sha256 },
      requestedBy: { kind: 'user', id: 'engineer' },
      command: {
        kind: 'batch-edit',
        commands: [
          { kind: 'set-attribute-value', targetId: 'response-limit', value: 80 },
          {
            kind: 'update-documentation',
            targetId: 'engine',
            documentation: 'Reviewed in the contributor pilot.',
          },
        ],
      },
    }
    const proposal = await planCommand({
      envelope,
      snapshot,
      documents: [document],
      renameProvider: async () => ({ changes: {} }),
    })
    expect(proposal.editProfile).toEqual({
      id: 'structured-source-edits',
      version: '1.0.0',
    })
    expect(proposal.affectedElementIds).toEqual(['response-limit', 'engine'])
    expect(proposal.overlayDocuments).toHaveLength(1)
    expect(proposal.overlayDocuments[0]!.text).toContain('= 80;')
    expect(proposal.undo.changes[uri]).toHaveLength(2)
  })

  it('rejects empty, nested, and overlapping contributor batches', async () => {
    expect(() => planBatchStructuredSourceEdits([], snapshot, [document])).toThrow(
      'between 1 and 50',
    )
    expect(() => planBatchStructuredSourceEdits([
      {
        kind: 'update-documentation',
        targetId: 'engine',
        documentation: 'first',
      },
      {
        kind: 'update-documentation',
        targetId: 'engine',
        documentation: 'second',
      },
    ], snapshot, [document])).toThrow('overlap')

    const envelope = {
      schemaVersion: 1 as const,
      commandId: 'BATCH-NESTED',
      workspaceId: 'workspace',
      baseSnapshotSha256: snapshot.snapshotSha256,
      baseDocuments: { [uri]: document.sha256 },
      requestedBy: { kind: 'user' as const, id: 'engineer' },
      command: {
        kind: 'batch-edit' as const,
        commands: [{
          kind: 'batch-edit',
          commands: [],
        }],
      },
    }
    await expect(planCommand({
      envelope: envelope as never,
      snapshot,
      documents: [document],
      renameProvider: async () => ({ changes: {} }),
    })).rejects.toThrow('only supports')

    for (const kind of ['set-attribute-value', 'set-property'] as const) {
      for (const value of [null, undefined, { bad: true }]) {
        await expect(planCommand({
          envelope: {
            ...envelope,
            command: kind === 'set-property'
              ? {
                  kind,
                  targetId: 'engine',
                  propertyQualifiedName: 'Safety::classification',
                  value,
                }
              : {
                  kind,
                  targetId: 'response-limit',
                  value,
                },
          } as never,
          snapshot,
          documents: [document],
          renameProvider: async () => ({ changes: {} }),
        })).rejects.toThrow('finite number, string, or boolean')
      }
    }
  })

  it('deletes and moves only full declarations', () => {
    const deleted = apply(planStructuredSourceEdits({
      kind: 'delete-element',
      targetId: 'left',
    }, snapshot, [document]))
    expect(deleted).not.toContain('port left;')
    expect(deleted).toContain('port right;')

    const moved = apply(planStructuredSourceEdits({
      kind: 'move-element',
      targetId: 'right',
      newOwnerId: 'destination',
    }, snapshot, [document]))
    expect(moved.match(/port right;/gu)).toHaveLength(1)
    expect(moved.indexOf('port right;')).toBeGreaterThan(
      moved.indexOf('package Destination'),
    )
  })

  it('fails closed for truncated authority ranges and unknown patterns', () => {
    const truncated: SemanticSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((candidate) =>
        candidate.id === 'system'
          ? {
              ...candidate,
              source: {
                ...candidate.source,
                range: range(source, source.indexOf('System'), source.indexOf('System') + 6),
              },
            }
          : candidate,
      ),
    }
    expect(() => planStructuredSourceEdits({
      kind: 'create-element',
      ownerId: 'system',
      elementKind: 'PartUsage',
      name: 'unsafe',
    }, truncated, [document])).toThrow(StructuredSourceEditError)
    expect(() => planStructuredSourceEdits({
      kind: 'apply-pattern',
      patternId: 'unknown',
      patternVersion: '1',
      ownerId: 'system',
      parameters: {},
    }, snapshot, [document])).toThrow('Unknown modeling pattern')
  })
})

function parentDocumentationFixture(text: string): {
  document: CommandWorkspaceDocument
  snapshot: SemanticSnapshot
} {
  const fixtureUri = 'file:///workspace/model/parent-documentation.sysml'
  const start = text.indexOf('requirement parent')
  const end = text.lastIndexOf('}') + 1
  const fixtureDocument: CommandWorkspaceDocument = {
    uri: fixtureUri,
    workspacePath: 'model/parent-documentation.sysml',
    text,
    sha256: digest(text),
    version: 1,
  }
  const parent: SemanticElement = {
    id: 'parent',
    kind: 'RequirementUsage',
    rawKind: 'RequirementUsage',
    name: 'parent',
    qualifiedName: 'parent',
    source: {
      uri: fixtureUri,
      workspacePath: fixtureDocument.workspacePath,
      range: range(text, start, end),
      documentSha256: fixtureDocument.sha256,
    },
    fingerprint: 'parent-fingerprint',
    provenance: {
      authority: 'qualified-language-engine',
      extraction: 'pilot-emf-semantic-evidence',
      classification: 'engine-metaclass',
      engineId: 'parent-engine-id',
    },
  }
  return {
    document: fixtureDocument,
    snapshot: {
      schemaVersion: 1,
      snapshotSha256: 'parent-documentation-snapshot',
      workspace: {
        id: 'workspace',
        rootUri: 'file:///workspace',
        configurationName: 'default',
      },
      authority: {
        adapterId: 'test',
        adapterVersion: '1',
        engineName: 'test',
        engineVersion: '1',
        referenceRelease: 'test',
        qualificationStatus: 'qualified',
      },
      freshness: 'current',
      documents: [{
        uri: fixtureUri,
        languageId: 'sysml',
        sha256: fixtureDocument.sha256,
        byteLength: Buffer.byteLength(text),
      }],
      elements: [parent],
      relationships: [],
    },
  }
}

function apply(plan: ReturnType<typeof planStructuredSourceEdits>): string {
  return applySourceEdits([document], plan.edits).documents[0]!.text
}

function element(
  id: string,
  kind: NormalizedElementKind,
  name: string,
  startToken: string,
  explicitEnd?: number,
  ownerId?: string,
): SemanticElement {
  const start = source.indexOf(startToken)
  const end = explicitEnd ?? start + startToken.length
  return {
    id,
    kind,
    rawKind: kind,
    name,
    qualifiedName: ownerId ? `System::${name}` : name,
    ...(ownerId ? { ownerId } : {}),
    source: {
      uri,
      workspacePath: 'model/system.sysml',
      range: range(source, start, end),
      documentSha256: document.sha256,
    },
    fingerprint: `fingerprint-${id}`,
    provenance: {
      authority: 'qualified-language-engine',
      extraction: 'pilot-emf-semantic-evidence',
      classification: 'engine-metaclass',
      engineId: `engine-${id}`,
    },
  }
}

function range(text: string, start: number, end: number) {
  return { start: position(text, start), end: position(text, end) }
}

function position(text: string, offset: number) {
  const lines = text.slice(0, offset).split('\n')
  return { line: lines.length - 1, character: lines.at(-1)!.length }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
