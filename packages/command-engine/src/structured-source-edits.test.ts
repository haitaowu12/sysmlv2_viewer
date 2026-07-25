// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  NormalizedElementKind,
  SemanticElement,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import { applySourceEdits, type CommandWorkspaceDocument } from './index.js'
import {
  planStructuredSourceEdits,
  StructuredSourceEditError,
} from './structured-source-edits.js'

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
