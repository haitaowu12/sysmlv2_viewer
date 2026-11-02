import type { SemanticSnapshot, SemanticRelationship } from '../../semantic-model/src/index.js'
export function lifecycleFixture(): SemanticSnapshot {
  const ids = ['requirement', 'design', 'test', 'drawing', 'unlinked']
  return {
    schemaVersion: 1, snapshotSha256: 'before', freshness: 'current',
    workspace: { id: 'pump', rootUri: 'file:///pump', configurationName: 'design-A' },
    authority: { adapterId: 'pilot', adapterVersion: '1', engineName: 'pilot', engineVersion: '1', referenceRelease: 'formal-2.0', qualificationStatus: 'qualified' },
    documents: [],
    elements: ids.map(id => ({ id, kind: 'PartDefinition', rawKind: 'PartDefinition', name: id, qualifiedName: `Pump::${id}`, fingerprint: id,
      source: { uri: 'file:///pump/model.sysml', workspacePath: 'model.sysml', documentSha256: 'doc', range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } } },
      provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-semantic-evidence', classification: 'engine-metaclass', engineId: id } })),
    relationships: [edge('design', 'requirement', 'satisfaction'), edge('test', 'requirement', 'verification'), edge('drawing', 'design', 'dependency')],
  }
}
export function edge(sourceId: string, targetId: string, kind: SemanticRelationship['kind']): SemanticRelationship {
  return { id: `${sourceId}-${targetId}`, sourceId, targetId, kind, provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-explicit-reference', engineMetaclass: kind, features: [] } }
}
