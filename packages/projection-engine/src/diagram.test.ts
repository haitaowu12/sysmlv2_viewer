// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SemanticElement, SemanticRelationship, SemanticSnapshot } from '../../semantic-model/src/index.js'
import { projectDiagram } from './diagram.js'

function fixture(): SemanticSnapshot {
  const element = (id: string, ownerId?: string, kind = 'PartUsage') => ({ id, ownerId, kind, name: id, qualifiedName: id }) as SemanticElement
  const edge = (id: string, sourceId: string, targetId: string, kind = 'flow') => ({ id, kind, sourceId, targetId }) as SemanticRelationship
  return {
    snapshotSha256: 'original',
    elements: [element('system'), element('sender', 'system'), element('receiver', 'system'), element('out', 'sender', 'PortUsage'), element('in', 'receiver', 'PortUsage'), element('external')],
    relationships: [edge('flow1', 'out', 'in'), edge('flow2', 'out', 'in'), edge('incoming', 'external', 'in'), edge('internal', 'sender', 'out'), edge('owns', 'sender', 'out', 'containment')],
  } as SemanticSnapshot
}

describe('model reduction without invented semantics', () => {
  it('keeps direction, provenance and multiplicity of collapsed relationships', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const view = projectDiagram(source, { viewpoint: 'interconnection', depth: 1, rootId: 'system' })
    expect(view.edges).toEqual([expect.objectContaining({ sourceId: 'sender', targetId: 'receiver', kind: 'flow', aggregated: true, relationshipIds: ['flow1', 'flow2'] })])
    expect(view.nodes.find((node) => node.element.id === 'sender')?.hiddenIds).toEqual(['out'])
    expect(view.internalRelationshipIds).toEqual(['internal'])
    expect(view.boundaryRelationshipIds).toEqual(['incoming'])
    expect(JSON.stringify(source)).toBe(before)
  })
  it('expands to the original endpoint identities', () => {
    const view = projectDiagram(fixture(), { viewpoint: 'interconnection', rootId: 'system', depth: 2 })
    expect(view.edges).toContainEqual(expect.objectContaining({ sourceId: 'out', targetId: 'in', aggregated: false, relationshipIds: ['flow1', 'flow2'] }))
  })
  it('records external relationships without dragging unrelated systems into the scope', () => {
    const view = projectDiagram(fixture(), { viewpoint: 'interconnection', rootId: 'receiver', depth: 1 })
    expect(view.nodes.map((node) => node.element.id)).toEqual(['in', 'receiver'])
    expect(view.boundaryRelationshipIds).toEqual(['flow1', 'flow2', 'incoming'])
  })
  it('does not invent containment for collapsed descendants', () => {
    const view = projectDiagram(fixture(), { viewpoint: 'structure', rootId: 'system', depth: 1 })
    expect(view.edges).toEqual([])
    expect(view.internalRelationshipIds).toEqual(['owns'])
  })
  it('is deterministic when source collection order changes', () => {
    const snapshot = fixture()
    const scope = { viewpoint: 'interconnection' as const, depth: 1 }
    expect(projectDiagram({ ...snapshot, elements: [...snapshot.elements].reverse(), relationships: [...snapshot.relationships].reverse() }, scope)).toEqual(projectDiagram(snapshot, scope))
  })
  it('does not truncate at the previous hidden 120-element limit', () => {
    const snapshot = fixture()
    snapshot.elements = Array.from({ length: 220 }, (_, i) => ({ ...snapshot.elements[0]!, id: `element-${i}`, qualifiedName: `element-${i}` }))
    snapshot.relationships = []
    expect(projectDiagram(snapshot, { viewpoint: 'structure', depth: 0 }).nodes).toHaveLength(220)
  })
  it('rejects absent roots and invalid depths explicitly', () => {
    expect(() => projectDiagram(fixture(), { viewpoint: 'structure', rootId: 'missing', depth: 2 })).toThrow('root is absent')
    expect(() => projectDiagram(fixture(), { viewpoint: 'structure', depth: -1 })).toThrow('depth')
  })
})
