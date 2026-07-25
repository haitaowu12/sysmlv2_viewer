// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
  NormalizedElementKind,
  SemanticSnapshot,
} from '../../semantic-model/src/index.js'
import { buildExplorerProjection } from './index.js'

describe('semantic explorer projection', () => {
  it('projects only the normalized snapshot and query contract', () => {
    const projection = buildExplorerProjection(snapshot(), {
      roots: ['package'],
      mode: 'containment',
      depth: 1,
    })
    expect(projection).toMatchObject({
      schemaVersion: 1,
      snapshotSha256: 'snapshot',
      mode: 'containment',
      roots: ['package'],
      nodes: [
        { id: 'package', label: 'System' },
        { id: 'vehicle', label: 'Vehicle' },
      ],
    })
  })
})

function snapshot(): SemanticSnapshot {
  const element = (id: string, name: string, ownerId?: string) => ({
    id,
    kind: (id === 'package' ? 'Package' : 'PartDefinition') as NormalizedElementKind,
    rawKind: id === 'package' ? 'Package' : 'PartDefinition',
    name,
    qualifiedName: id === 'package' ? name : `System::${name}`,
    ownerId,
    source: {
      uri: 'file:///workspace/model.sysml',
      workspacePath: 'model.sysml',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      documentSha256: 'document',
    },
    fingerprint: id,
    provenance: {
      authority: 'qualified-language-engine' as const,
      extraction: 'pilot-emf-semantic-evidence' as const,
      classification: 'engine-metaclass' as const,
      engineId: id,
    },
  })
  return {
    schemaVersion: 1,
    snapshotSha256: 'snapshot',
    workspace: { id: 'sample', rootUri: 'file:///workspace', configurationName: 'default' },
    authority: {
      adapterId: 'qualified', adapterVersion: '1', engineName: 'engine', engineVersion: '1',
      referenceRelease: '2026-05', qualificationStatus: 'qualified',
    },
    freshness: 'current',
    documents: [],
    elements: [element('package', 'System'), element('vehicle', 'Vehicle', 'package')],
    relationships: [{
      id: 'containment', kind: 'containment', sourceId: 'package', targetId: 'vehicle',
      provenance: {
        authority: 'qualified-language-engine', extraction: 'pilot-emf-explicit-reference',
        engineMetaclass: 'OwningMembership', features: ['source', 'memberElement'],
      },
    }],
  }
}
