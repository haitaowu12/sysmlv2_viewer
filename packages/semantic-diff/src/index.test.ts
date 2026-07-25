// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SemanticElement, SemanticSnapshot } from '../../semantic-model/src/index.js'
import { compareSemanticSnapshots } from './index.js'

describe('identity-aware semantic diff', () => {
  it('classifies controlled rename and file move without delete/create', () => {
    const before = snapshot(element('Vehicle', 'model/vehicle.sysml'))
    const after = snapshot(element('Platform', 'model/platform.sysml'), 'after')
    const diff = compareSemanticSnapshots(before, after)
    expect(diff.changes.map((change) => change.kind)).toEqual([
      'element-renamed',
      'element-moved',
    ])
    expect(diff.changes.some((change) =>
      change.kind === 'element-created' || change.kind === 'element-deleted',
    )).toBe(false)
  })
})

function snapshot(value: SemanticElement, hash = 'before'): SemanticSnapshot {
  return {
    schemaVersion: 1,
    snapshotSha256: hash,
    workspace: { id: 'sample', rootUri: 'file:///workspace', configurationName: 'default' },
    authority: {
      adapterId: 'qualified',
      adapterVersion: '1',
      engineName: 'engine',
      engineVersion: '1',
      referenceRelease: '2026-05',
      qualificationStatus: 'qualified',
    },
    freshness: 'current',
    documents: [],
    elements: [value],
    relationships: [],
  }
}

function element(name: string, workspacePath: string): SemanticElement {
  return {
    id: 'wb:sample:durable',
    kind: 'PartDefinition',
    rawKind: 'PartDefinition',
    name,
    qualifiedName: `Sample::${name}`,
    source: {
      uri: `file:///workspace/${workspacePath}`,
      workspacePath,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      documentSha256: name,
    },
    fingerprint: 'same-structural-fingerprint',
    provenance: {
      authority: 'qualified-language-engine',
      extraction: 'pilot-emf-semantic-evidence',
      classification: 'engine-metaclass',
      engineId: `engine-${name}`,
    },
  }
}
