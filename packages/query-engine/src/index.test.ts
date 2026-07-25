// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
  SemanticElement,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import { executeModelQuery } from './index.js'

describe('bounded model query', () => {
  it('traverses containment by stable identity and filters deterministically', () => {
    const result = executeModelQuery(snapshot(), {
      schemaVersion: 1,
      roots: ['System::Vehicle'],
      relationships: ['containment'],
      depth: 2,
      filters: { includeKinds: ['PartDefinition', 'PortUsage'] },
      maxResults: 10,
    })
    expect(result.resolvedRoots).toEqual(['vehicle'])
    expect(result.elements.map((element) => element.id)).toEqual([
      'command-port',
      'vehicle',
    ])
    expect(result.relationships).toEqual([
      expect.objectContaining({
        sourceId: 'vehicle',
        targetId: 'command-port',
      }),
    ])
    expect(result.snapshotSha256).toBe('snapshot')
    expect(result.truncated).toBe(false)
  })

  it('fails ambiguous roots and enforces result bounds', () => {
    const value = snapshot()
    value.elements.push({
      ...element('duplicate', 'PartUsage', 'Vehicle'),
      qualifiedName: 'System::Vehicle',
    })
    expect(() =>
      executeModelQuery(value, {
        schemaVersion: 1,
        roots: ['System::Vehicle'],
      }),
    ).toThrow('ambiguous')
    expect(() =>
      executeModelQuery(snapshot(), {
        schemaVersion: 1,
        maxResults: 10_001,
      }),
    ).toThrow('maxResults')
  })

  it('deduplicates roots and rejects unbounded or unknown runtime input', () => {
    const result = executeModelQuery(snapshot(), {
      schemaVersion: 1,
      roots: ['vehicle', 'vehicle'],
      depth: 0,
    })
    expect(result.resolvedRoots).toEqual(['vehicle'])
    expect(() =>
      executeModelQuery(snapshot(), {
        schemaVersion: 1,
        filters: {
          includeKinds: ['InventedKind'],
        },
      } as never),
    ).toThrow('unsupported element kind')
    expect(() =>
      executeModelQuery(snapshot(), {
        schemaVersion: 1,
        roots: Array.from({ length: 101 }, (_, index) => `root-${index}`),
      }),
    ).toThrow('at most 100')
  })

  it('supports bounded type, requirement, verification, interface, dependency, and neighbourhood modes', () => {
    const value = snapshot()
    value.relationships.push(
      typedRelationship('vehicle-type', 'command-port', 'vehicle', 'typing'),
      typedRelationship('requirement', 'vehicle', 'system', 'satisfaction'),
      typedRelationship('verification', 'command-port', 'system', 'verification'),
      typedRelationship('interface', 'command-port', 'vehicle', 'interface'),
      typedRelationship('dependency', 'system', 'command-port', 'dependency'),
    )
    const neighbourhood = executeModelQuery(value, {
      schemaVersion: 1,
      roots: ['vehicle'],
      mode: 'neighbourhood',
      direction: 'both',
      depth: 1,
    })
    expect(neighbourhood.elements.map((element) => element.id)).toEqual([
      'command-port',
      'system',
      'vehicle',
    ])
    for (const mode of [
      'type-hierarchy',
      'dependency',
      'requirements',
      'verification',
      'interfaces',
    ] as const) {
      expect(() => executeModelQuery(value, {
        schemaVersion: 1,
        roots: ['vehicle'],
        mode,
        depth: 1,
      })).not.toThrow()
    }
  })
})

function snapshot(): SemanticSnapshot {
  const root = element('system', 'Package', 'System')
  const vehicle = {
    ...element('vehicle', 'PartDefinition', 'Vehicle'),
    qualifiedName: 'System::Vehicle',
    ownerId: 'system',
  }
  const port = {
    ...element('command-port', 'PortUsage', 'commandPort'),
    qualifiedName: 'System::Vehicle::commandPort',
    ownerId: 'vehicle',
  }
  return {
    schemaVersion: 1,
    snapshotSha256: 'snapshot',
    workspace: {
      id: 'sample',
      rootUri: 'file:///workspace',
      configurationName: 'default',
    },
    authority: {
      adapterId: 'qualified',
      adapterVersion: '1',
      engineName: 'engine',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'qualified',
    },
    freshness: 'current',
    documents: [],
    elements: [root, vehicle, port],
    relationships: [
      relationship('system-vehicle', 'system', 'vehicle'),
      relationship('vehicle-port', 'vehicle', 'command-port'),
    ],
  }
}

function element(
  id: string,
  kind: SemanticElement['kind'],
  name: string,
): SemanticElement {
  return {
    id,
    kind,
    rawKind: 'property',
    name,
    qualifiedName: name,
    source: {
      uri: 'file:///workspace/model.sysml',
      workspacePath: 'model.sysml',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      documentSha256: 'document',
    },
    fingerprint: id,
    provenance: {
      authority: 'qualified-language-engine',
      extraction: 'pilot-emf-semantic-evidence',
      classification: 'engine-metaclass',
      engineId: id,
    },
  }
}

function relationship(id: string, sourceId: string, targetId: string) {
  return {
    id,
    kind: 'containment' as const,
    sourceId,
    targetId,
    provenance: {
      authority: 'qualified-language-engine' as const,
      extraction: 'pilot-emf-explicit-reference' as const,
      engineMetaclass: 'OwningMembership',
      features: ['source', 'memberElement'],
    },
  }
}

function typedRelationship(
  id: string,
  sourceId: string,
  targetId: string,
  kind: import('../../semantic-model/src/index.js').SemanticRelationshipKind,
) {
  return {
    ...relationship(id, sourceId, targetId),
    kind,
  }
}
