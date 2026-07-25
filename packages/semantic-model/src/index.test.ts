// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { WorkbenchDocumentSymbol } from '../../workbench-protocol/src/index.js'
import type { WorkspaceDocument } from '../../language-adapter/src/index.js'
import type { EngineSemanticEvidence } from '../../language-adapter/src/index.js'
import {
  buildSemanticSnapshot,
  IdentityRegistry,
  type IdentityLocator,
  type SnapshotInput,
} from './index.js'

const root = resolve('/workspace')

describe('normalized semantic snapshot', () => {
  it('normalizes explicit engine relationship evidence without source inference', () => {
    const document = workspaceDocument(
      'package Sample { part def Vehicle; part vehicle : Vehicle; }',
    )
    const evidence: EngineSemanticEvidence = {
      schemaVersion: 1,
      uri: document.uri,
      elements: [
        engineElement('package', 'Package', 'Sample'),
        engineElement('definition', 'PartDefinition', 'Sample::Vehicle'),
        engineElement('usage', 'PartUsage', 'Sample::vehicle'),
        engineElement('membership', 'OwningMembership'),
        engineElement('typing', 'FeatureTyping'),
      ],
      relationships: [
        engineRelationship('membership', 'package', 'source'),
        engineRelationship('membership', 'usage', 'target'),
        engineRelationship('typing', 'usage', 'typedFeature'),
        engineRelationship('typing', 'definition', 'type'),
      ],
    }
    const result = buildSemanticSnapshot({
      ...snapshotInput(document, IdentityRegistry.empty('sample')),
      evidence: new Map([[document.uri, evidence]]),
    })
    expect(result.elements.map((element) => element.rawKind).sort()).toEqual([
      'Package',
      'PartDefinition',
      'PartUsage',
    ].sort())
    expect(result.relationships.map((relationship) => relationship.kind).sort()).toEqual([
      'containment',
      'typing',
    ].sort())
    expect(result.elements.every((element) =>
      element.provenance.extraction === 'pilot-emf-semantic-evidence',
    )).toBe(true)
  })

  it('keeps identities stable through formatting and line movement', () => {
    const registry = IdentityRegistry.empty('sample')
    const first = snapshot(
      'package Sample {\n    part def Vehicle;\n}\n',
      symbol(0, 0, 2, 1, [
        symbol(1, 4, 1, 21, [], 'Sample.Vehicle'),
      ]),
      registry,
    )
    const second = snapshot(
      '\n\npackage Sample {\n\n        part   def   Vehicle;\n}\n',
      symbol(2, 0, 5, 1, [
        symbol(4, 8, 4, 29, [], 'Sample.Vehicle'),
      ]),
      registry,
    )

    expect(first.elements.map((element) => element.id)).toEqual(
      second.elements.map((element) => element.id),
    )
    expect(first.snapshotSha256).not.toBe(second.snapshotSha256)
    expect(second.elements.find((element) => element.name === 'Vehicle')).toMatchObject({
      kind: 'PartDefinition',
      qualifiedName: 'Sample::Vehicle',
      provenance: { classification: 'engine-metaclass' },
    })
  })

  it('preserves unrecognized engine symbols as opaque', () => {
    const result = snapshot(
      'package Sample {\n    experimental thing Mystery;\n}\n',
      symbol(0, 0, 2, 1, [
        symbol(1, 4, 1, 31, [], 'Sample.Mystery'),
      ]),
      IdentityRegistry.empty('sample'),
    )
    expect(result.elements.find((element) => element.name === 'Mystery')).toMatchObject({
      kind: 'OpaqueElement',
      provenance: { classification: 'opaque' },
    })
  })

  it('produces portable identities and hashes across workspace clones', () => {
    const text = 'package Sample {\n    part def Vehicle;\n}\n'
    const symbols = symbol(0, 0, 2, 1, [
      symbol(1, 4, 1, 21, [], 'Sample.Vehicle'),
    ])
    const first = snapshot(
      text,
      symbols,
      IdentityRegistry.empty('sample'),
      resolve('/clone-a'),
    )
    const second = snapshot(
      text,
      symbols,
      IdentityRegistry.empty('sample'),
      resolve('/clone-b'),
    )
    expect(first.elements.map((element) => element.id)).toEqual(
      second.elements.map((element) => element.id),
    )
    expect(first.snapshotSha256).toBe(second.snapshotSha256)
  })

  it('fails closed on invalid engine ranges and ambiguous semantic locators', () => {
    expect(() =>
      snapshot(
        'package Sample {}\n',
        symbol(0, 0, 99, 0, []),
        IdentityRegistry.empty('sample'),
      ),
    ).toThrow('invalid semantic range')

    const duplicateDocument = workspaceDocument(
      'package Sample { part vehicle; part vehicle; }',
    )
    const duplicateEvidence: EngineSemanticEvidence = {
      schemaVersion: 1,
      uri: duplicateDocument.uri,
      elements: [
        engineElement('first', 'PartUsage', 'Sample::vehicle'),
        engineElement('second', 'PartUsage', 'Sample::vehicle'),
      ],
      relationships: [],
    }
    expect(() => buildSemanticSnapshot({
      ...snapshotInput(duplicateDocument, IdentityRegistry.empty('sample')),
      evidence: new Map([[duplicateDocument.uri, duplicateEvidence]]),
    })).toThrow('Ambiguous semantic locator')
  })
})

describe('identity registry', () => {
  it('tombstones deletes and gives same-locator recreation a new identity', () => {
    const registry = IdentityRegistry.empty('sample')
    const locator: IdentityLocator = {
      workspacePath: 'model/vehicle.sysml',
      qualifiedName: 'Sample::vehicle',
      kind: 'PartUsage',
    }
    registry.beginSnapshot()
    const first = registry.resolve(locator, 'same-fingerprint')
    registry.completeSnapshot()
    registry.beginSnapshot()
    registry.completeSnapshot()
    expect(registry.anchorState(first.id)).toBe('stale')
    registry.beginSnapshot()
    const recreated = registry.resolve(locator, 'same-fingerprint')
    registry.completeSnapshot()
    expect(recreated.id).not.toBe(first.id)
    expect(registry.anchorState(recreated.id)).toBe('resolved')
  })

  it('reconciles one structural match and fails visibly on ambiguity', () => {
    const registry = IdentityRegistry.empty('sample')
    registry.beginSnapshot()
    const original = registry.resolve({
      workspacePath: 'model/vehicle.sysml',
      qualifiedName: 'Sample::Vehicle',
      kind: 'PartDefinition',
    }, 'vehicle-fingerprint')
    registry.completeSnapshot()
    registry.beginSnapshot()
    const moved = registry.resolve({
      workspacePath: 'model/platform.sysml',
      qualifiedName: 'Sample::Vehicle',
      kind: 'PartDefinition',
    }, 'vehicle-fingerprint')
    registry.completeSnapshot()
    expect(moved.id).toBe(original.id)
    expect(registry.serialize().receipts).toEqual([
      expect.objectContaining({ kind: 'automatic-reconciliation' }),
    ])

    const ambiguous = IdentityRegistry.empty('sample')
    ambiguous.resolve({
      workspacePath: 'a.sysml',
      qualifiedName: 'A::Vehicle',
      kind: 'PartDefinition',
    }, 'shared')
    ambiguous.resolve({
      workspacePath: 'b.sysml',
      qualifiedName: 'B::Vehicle',
      kind: 'PartDefinition',
    }, 'shared')
    ambiguous.beginSnapshot()
    expect(() => ambiguous.resolve({
      workspacePath: 'c.sysml',
      qualifiedName: 'C::Vehicle',
      kind: 'PartDefinition',
    }, 'shared')).toThrow('ambiguous')
  })

  it('records explicit command rename/move as aliases of one durable id', () => {
    const registry = IdentityRegistry.empty('sample')
    const firstLocator: IdentityLocator = {
      workspacePath: 'model/vehicle.sysml',
      qualifiedName: 'Sample::Vehicle',
      kind: 'PartDefinition',
    }
    const first = registry.resolve(firstLocator, 'before')
    const migrated = registry.migrate(
      first.id,
      {
        workspacePath: 'model/platform.sysml',
        qualifiedName: 'Sample::Platform',
        kind: 'PartDefinition',
      },
      'after',
      'CMD-RENAME-MOVE-001',
    )
    expect(migrated.id).toBe(first.id)
    expect(migrated.aliases).toEqual([
      {
        priorLocator: firstLocator,
        commandId: 'CMD-RENAME-MOVE-001',
      },
    ])
  })

  it('rejects duplicate persisted identities and locators', () => {
    const locator: IdentityLocator = {
      workspacePath: 'model/vehicle.sysml',
      qualifiedName: 'Sample::Vehicle',
      kind: 'PartDefinition',
    }
    expect(
      () =>
        new IdentityRegistry({
          schemaVersion: 1,
          workspaceId: 'sample',
          records: [
            { id: 'wb:sample:one', locator, fingerprint: 'one', aliases: [] },
            { id: 'wb:sample:two', locator, fingerprint: 'two', aliases: [] },
          ],
        }),
    ).toThrow('Duplicate identity registry entry')
  })
})

function snapshot(
  text: string,
  rootSymbol: WorkbenchDocumentSymbol,
  identities: IdentityRegistry,
  workspaceRoot = root,
) {
  const document = workspaceDocument(text, workspaceRoot)
  const evidence = evidenceFromSymbol(rootSymbol, document)
  return buildSemanticSnapshot({
    ...snapshotInput(document, identities, workspaceRoot),
    evidence: new Map([[document.uri, evidence]]),
  })
}

function snapshotInput(
  document: WorkspaceDocument,
  identities: IdentityRegistry,
  workspaceRoot = root,
): Omit<SnapshotInput, 'evidence'> {
  return {
    status: {
      workspaceId: 'sample',
      rootUri: pathToFileURL(workspaceRoot).href,
      configurationName: 'default',
      indexState: 'ready',
      semanticAuthority: 'qualified-engine',
      documentCount: 1,
      snapshotSha256: 'inventory',
      documents: [
        {
          uri: document.uri,
          languageId: 'sysml',
          sha256: document.sha256,
          byteLength: Buffer.byteLength(document.text),
        },
      ],
      diagnostics: { errors: 0, warnings: 0, information: 0, hints: 0 },
      languageCapabilities: {
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
        semanticEvidence: true,
        semanticSnapshot: true,
      },
      capabilitiesFinal: true,
    },
    authority: {
      adapterId: 'qualified-test',
      adapterVersion: '1',
      engineName: 'test',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'qualified',
    },
    documents: [document],
    identities,
  }
}

function workspaceDocument(
  text: string,
  workspaceRoot = root,
): WorkspaceDocument {
  const uri = pathToFileURL(resolve(workspaceRoot, 'model/vehicle.sysml')).href
  return {
    uri,
    absolutePath: fileURLPath(uri),
    languageId: 'sysml',
    version: 1,
    text,
    sha256: `sha-${text.length}`,
  }
}

function evidenceFromSymbol(
  rootSymbol: WorkbenchDocumentSymbol,
  document: WorkspaceDocument,
): EngineSemanticEvidence {
  const elements: EngineSemanticEvidence['elements'] = []
  const relationships: EngineSemanticEvidence['relationships'] = []
  let sequence = 0
  const visit = (
    value: WorkbenchDocumentSymbol,
    ownerId?: string,
  ): string => {
    const engineId = `element-${sequence++}`
    const declaration = sourceForTestRange(document.text, value.range)
    const metaclass = testMetaclass(declaration)
    elements.push({
      engineId,
      metaclass,
      name: value.name.split('.').at(-1),
      qualifiedName: value.name,
      ownerEngineId: ownerId ? `membership-${engineId}` : undefined,
      range: value.range,
    })
    if (ownerId) {
      const membershipId = `membership-${engineId}`
      elements.push({
        engineId: membershipId,
        metaclass: 'OwningMembership',
        range: value.range,
      })
      relationships.push(
        engineRelationship(membershipId, ownerId, 'source'),
        engineRelationship(membershipId, engineId, 'memberElement'),
      )
    }
    for (const child of value.children) visit(child, engineId)
    return engineId
  }
  visit(rootSymbol)
  return {
    schemaVersion: 1,
    uri: document.uri,
    elements,
    relationships,
  }
}

function engineElement(
  engineId: string,
  metaclass: string,
  qualifiedName?: string,
): EngineSemanticEvidence['elements'][number] {
  return {
    engineId,
    metaclass,
    name: qualifiedName?.split('::').at(-1),
    qualifiedName,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
  }
}

function engineRelationship(
  sourceEngineId: string,
  targetEngineId: string,
  feature: string,
): EngineSemanticEvidence['relationships'][number] {
  return {
    sourceEngineId,
    targetEngineId,
    feature,
    derived: false,
    resolved: true,
  }
}

function testMetaclass(declaration: string): string {
  if (/^\s*package\b/.test(declaration)) return 'Package'
  if (/^\s*part\s+def\b/.test(declaration)) return 'PartDefinition'
  return 'ExperimentalThing'
}

function sourceForTestRange(text: string, range: WorkbenchDocumentSymbol['range']): string {
  const lines = text.split(/\r?\n/)
  return lines.slice(range.start.line, range.end.line + 1).join('\n')
}

function symbol(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  children: WorkbenchDocumentSymbol[],
  name = 'Sample',
): WorkbenchDocumentSymbol {
  const range = {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  }
  return {
    name,
    kind: 'property',
    range,
    selectionRange: range,
    children,
  }
}

function fileURLPath(value: string): string {
  return new URL(value).pathname
}
