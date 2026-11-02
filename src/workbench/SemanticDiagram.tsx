import { useEffect, useMemo, useRef, useState } from 'react'
import dagre from '@dagrejs/dagre'
import { projectDiagram, type DiagramViewpoint } from '../../packages/projection-engine/src/diagram.js'
import type { SemanticElement, SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import type { ModelQueryMode } from '../../packages/query-engine/src/index.js'

const titles: Record<DiagramViewpoint, string> = {
  structure: 'Model structure', interconnection: 'Interconnection', requirements: 'Requirements traceability', verification: 'Verification context',
}
const kindLabel = (kind: string) => kind.replace('Definition', ' def').replace('Usage', '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()

export function SemanticDiagram({ snapshot, selectedId, onSelect, mode, rootId, depth, onRootChange, onDepthChange, onModeChange }: {
  snapshot: SemanticSnapshot
  selectedId: string
  onSelect(element: SemanticElement): void
  mode: ModelQueryMode
  rootId: string
  depth: number
  onRootChange(id: string): void
  onDepthChange(depth: number): void
  onModeChange(mode: ModelQueryMode): void
}) {
  const defaultView: DiagramViewpoint = mode === 'interfaces' ? 'interconnection' : mode === 'requirements' ? 'requirements' : mode === 'verification' ? 'verification' : 'structure'
  const viewpoint = defaultView
  const setRootId = onRootChange
  const setDepth = onDepthChange
  const [zoom, setZoom] = useState(0)
  const canvas = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 900, height: 500 })
  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => { if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }) })
    observer.observe(canvas.current)
    return () => observer.disconnect()
  }, [])
  const [showRelationships, setShowRelationships] = useState(false)
  const effectiveRoot = snapshot.elements.some((element) => element.id === rootId) ? rootId : ''
  const projection = useMemo(() => projectDiagram(snapshot, { viewpoint, rootId: effectiveRoot || undefined, depth }), [snapshot, viewpoint, effectiveRoot, depth])
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  const layout = useMemo(() => {
    const graph = new dagre.graphlib.Graph({ multigraph: true })
    graph.setGraph({ rankdir: viewpoint === 'structure' ? 'TB' : 'LR', nodesep: 36, ranksep: 96, marginx: 44, marginy: 44 })
    graph.setDefaultEdgeLabel(() => ({}))
    if (projection.nodes.length > 200) return graph
    for (const node of projection.nodes) graph.setNode(node.element.id, { width: 230, height: 104 })
    for (const edge of projection.edges) graph.setEdge(edge.sourceId, edge.targetId, { width: 96, height: 22 }, edge.id)
    dagre.layout(graph)
    return graph
  }, [projection, viewpoint])
  const width = Math.max(layout.graph().width ?? 400, 400)
  const height = Math.max(layout.graph().height ?? 250, 250)
  const scale = zoom || Math.max(0.1, Math.min(1, (viewport.width - 24) / width, (viewport.height - 24) / height))
  const parent = effectiveRoot ? byId.get(effectiveRoot)?.ownerId : undefined
  const selected = byId.get(selectedId)
  const name = (id: string) => byId.get(id)?.qualifiedName ?? id
  // Above the bounded render limit nothing is silently omitted or relabeled as
  // a complete diagram. The source and semantic explorer remain available.
  const overLimit = projection.nodes.length > 200
  return (
    <section className="model-diagram" aria-label="Semantic diagram">
      <div className="model-diagram-tools">
        <label>Viewpoint<select aria-label="Diagram viewpoint" value={viewpoint} onChange={(event) => onModeChange(({ structure: 'containment', interconnection: 'interfaces', requirements: 'requirements', verification: 'verification' } as const)[event.target.value as DiagramViewpoint])}>
          {Object.entries(titles).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select></label>
        <label>Levels<select aria-label="Decomposition depth" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
          {[0, 1, 2, 3, 4, 5, 8, 12, 20].map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <button type="button" disabled={!selected} onClick={() => setRootId(selectedId)}>Focus selection</button>
        <button type="button" disabled={!effectiveRoot} onClick={() => setRootId(parent ?? '')}>Up</button>
        <button type="button" onClick={() => { setRootId(''); setZoom(0) }}>Whole model</button>
        <label>Zoom<select aria-label="Diagram zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
          <option value={0}>Fit</option>
          {[0.5, 0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value * 100}%</option>)}
        </select></label>
      </div>
      <header className="model-diagram-title">
        <div><span>VIEW · {snapshot.workspace.configurationName}</span><h2>{titles[viewpoint]}</h2><p>{effectiveRoot ? name(effectiveRoot) : 'Whole model'} · {projection.nodes.length} elements · {projection.edges.length} displayed relationships</p></div>
        <div className="notation-status">Analytical projection<br /><small>SysML v2 elements · explicit relationship labels</small></div>
      </header>
      <div className="model-diagram-disclosure">
        <span>{projection.excludedIds.length} elements outside this view · {projection.boundaryRelationshipIds.length} boundary relationships · {projection.internalRelationshipIds.length} internal relationships hidden</span>
        <button type="button" aria-expanded={showRelationships} onClick={() => setShowRelationships(!showRelationships)}>Relationships & exclusions</button>
      </div>
      {snapshot.freshness !== 'current' && <p role="alert">Stale model snapshot. Refresh semantic validation before relying on this view.</p>}
      {overLimit ? <p role="status">This scope contains {projection.nodes.length} elements, above the interactive limit of 200. Focus an element or reduce Levels. No partial diagram is shown.</p> : (
        <div ref={canvas} className="model-diagram-canvas" tabIndex={0} aria-label="Scrollable model diagram">
          <svg width={width * scale} height={height * scale} aria-label={titles[viewpoint]}>
            <defs><marker id="semantic-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="#344756" strokeWidth="1.2" /></marker></defs>
            <g transform={`scale(${scale})`}>
              {projection.edges.map((edge) => {
                const value = layout.edge({ v: edge.sourceId, w: edge.targetId, name: edge.id })
                const points = value.points.map((point: { x: number; y: number }) => `${point.x},${point.y}`).join(' ')
                // Direction is explicitly a relationship direction. Undirected
                // connections never get a misleading flow/navigation arrow.
                const directional = edge.kind !== 'connection' && edge.kind !== 'interface'
                const label = `${edge.aggregated ? 'summary: ' : ''}${edge.kind}${edge.relationshipIds.length > 1 ? ` ×${edge.relationshipIds.length}` : ''}`
                return <g key={edge.id} className="model-edge" data-relationship-ids={edge.relationshipIds.join(' ')}>
                  <title>{`${name(edge.sourceId)} — ${label} — ${name(edge.targetId)}\n${edge.relationshipIds.join('\n')}`}</title>
                  <polyline points={points} fill="none" stroke="#344756" strokeWidth="1.2" strokeDasharray={edge.aggregated ? '7 5' : undefined} markerEnd={directional ? 'url(#semantic-arrow)' : undefined} />
                  <text x={value.x} y={value.y} textAnchor="middle" className="edge-label">{label}</text>
                </g>
              })}
              {projection.nodes.map((node) => {
                const position = layout.node(node.element.id)
                const label = node.typeNames.length ? `${node.element.name} : ${node.typeNames.join(', ')}` : node.element.name
                return <g key={node.element.id} transform={`translate(${position.x - 115},${position.y - 52})`} className={`model-element ${selectedId === node.element.id ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={`Select ${node.element.qualifiedName}`} aria-pressed={selectedId === node.element.id} onClick={() => onSelect(node.element)} onDoubleClick={() => setRootId(node.element.id)} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.element) }
                }}>
                  <title>{`${node.element.qualifiedName}\n${node.element.kind}\n${node.element.source.workspacePath}:${node.element.source.range.start.line + 1}\n${label}`}</title>
                  <rect width="230" height="104" />
                  <text x="115" y="23" textAnchor="middle" className="element-kind">«{kindLabel(node.element.kind)}»</text>
                  <foreignObject x="10" y="31" width="210" height="46"><div className="element-label">{label}</div></foreignObject>
                  <line x1="0" x2="230" y1="78" y2="78" />
                  <text x="12" y="95" className="element-detail">{node.hiddenIds.length ? `+ ${node.hiddenIds.length} collapsed elements` : node.element.kind === 'OpaqueElement' ? 'Unsupported notation · inspect source' : 'Select to inspect · double-click to focus'}</text>
                </g>
              })}
            </g>
          </svg>
          {projection.nodes.length === 0 && <p className="diagram-empty">No elements match this viewpoint and depth. Increase Levels or return to the whole model.</p>}
        </div>
      )}
      {showRelationships && <div className="diagram-evidence">
        <h3>Relationship evidence</h3><p>Dashed summary edges aggregate the listed model relationships; they do not create new model connections. Arrows show the labeled relationship direction. Connection and interface links are undirected.</p>
        <table><thead><tr><th>Relationship</th><th>From</th><th>To</th><th>Model identity</th></tr></thead><tbody>
          {snapshot.relationships.filter((edge) => projection.edges.some((item) => item.relationshipIds.includes(edge.id)) || projection.boundaryRelationshipIds.includes(edge.id) || projection.internalRelationshipIds.includes(edge.id)).map((edge) => <tr key={edge.id}><td>{edge.kind}{projection.boundaryRelationshipIds.includes(edge.id) ? ' · boundary' : projection.internalRelationshipIds.includes(edge.id) ? ' · internal' : ''}</td><td><button onClick={() => byId.has(edge.sourceId) && onSelect(byId.get(edge.sourceId)!)}>{name(edge.sourceId)}</button></td><td><button onClick={() => byId.has(edge.targetId) && onSelect(byId.get(edge.targetId)!)}>{name(edge.targetId)}</button></td><td>{edge.id}</td></tr>)}
        </tbody></table>
        <details><summary>Excluded elements ({projection.excludedIds.length})</summary>{projection.excludedIds.map((id) => <button key={id} onClick={() => onSelect(byId.get(id)!)}>{name(id)}</button>)}</details>
      </div>}
      <footer className="model-diagram-footer">Snapshot {snapshot.snapshotSha256.slice(0, 12)} · profile analytical-relationships/1 · canonical source unchanged by view controls</footer>
    </section>
  )
}
