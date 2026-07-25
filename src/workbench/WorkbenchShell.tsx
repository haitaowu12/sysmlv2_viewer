import { useEffect, useState, type ComponentType } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor, Position as MonacoPosition } from 'monaco-editor'
import {
  Activity,
  BetweenHorizontalStart,
  Bot,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  FileCode2,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  Network,
  PanelBottom,
  Save,
  Search,
  Settings,
  ShieldCheck,
  TableProperties,
} from 'lucide-react'
import type { LanguageDiagnostic } from '../../packages/language-adapter/src/index.js'
import type { ModelQueryMode, ModelQueryResult } from '../../packages/query-engine/src/index.js'
import type { SemanticElement, SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import type { CommandEnvelope } from '../../packages/command-engine/src/index.js'
import type { SavedWorkbenchView, WorkspaceDocumentContent } from '../../packages/workbench-protocol/src/index.js'
import { CommandReviewPanel } from '../components/CommandReviewPanel.js'
import { NativeCommandEditor } from '../components/NativeCommandEditor.js'
import type { LoadedWorkspace, WorkbenchGateway } from './gateway.js'
import { AssuranceSurface, type AssuranceActivity } from './AssuranceSurface.js'
import { ControlledAiSurface } from './ControlledAiSurface.js'

type ActivityId = 'explorer' | 'model' | 'diagrams' | 'traceability' | 'interfaces' | 'verification' | 'reviews' | 'changes' | 'reports' | 'assistant' | 'settings'
type SurfaceId = 'source' | 'diagram' | 'matrix'
type BottomPanelId = 'problems' | 'output' | 'query' | 'changes'

const ACTIVITIES: Array<{ id: ActivityId; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: 'explorer', label: 'Explorer', icon: Boxes },
  { id: 'model', label: 'Model', icon: LayoutDashboard },
  { id: 'diagrams', label: 'Diagrams', icon: Network },
  { id: 'traceability', label: 'Traceability', icon: BetweenHorizontalStart },
  { id: 'interfaces', label: 'Interfaces', icon: ShieldCheck },
  { id: 'verification', label: 'Verification', icon: ClipboardCheck },
  { id: 'reviews', label: 'Reviews', icon: ListChecks },
  { id: 'changes', label: 'Changes', icon: GitCompareArrows },
  { id: 'reports', label: 'Reports', icon: FileCode2 },
  { id: 'assistant', label: 'Assistant', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const EXPLORER_MODES: Array<{ id: ModelQueryMode; label: string }> = [
  { id: 'containment', label: 'Containment' },
  { id: 'type-hierarchy', label: 'Types' },
  { id: 'dependency', label: 'Dependencies' },
  { id: 'neighbourhood', label: 'Neighbourhood' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'verification', label: 'Verification' },
  { id: 'interfaces', label: 'Interfaces' },
]

export interface WorkbenchShellProps {
  gateway: WorkbenchGateway
  initialWorkspace: LoadedWorkspace
  userId: string
}

export function WorkbenchShell({ gateway, initialWorkspace, userId }: WorkbenchShellProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [activity, setActivity] = useState<ActivityId>('explorer')
  const [surface, setSurface] = useState<SurfaceId>('diagram')
  const [bottomPanel, setBottomPanel] = useState<BottomPanelId>('problems')
  const [bottomOpen, setBottomOpen] = useState(true)
  const [mode, setMode] = useState<ModelQueryMode>('containment')
  const [queryResult, setQueryResult] = useState<ModelQueryResult | null>(null)
  const [queryError, setQueryError] = useState('')
  const [selectedId, setSelectedId] = useState(initialWorkspace.snapshot.elements[0]?.id ?? '')
  const [selectedUri, setSelectedUri] = useState(initialWorkspace.status.documents[0]?.uri ?? '')
  const [document, setDocument] = useState<WorkspaceDocumentContent | null>(null)
  const [search, setSearch] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [savingView, setSavingView] = useState(false)

  const workspaceId = workspace.status.workspaceId
  const selected = workspace.snapshot.elements.find((element) => element.id === selectedId)
  const visibleElements = queryResult?.elements ?? workspace.snapshot.elements
  const filteredElements = visibleElements.filter((element) =>
    `${element.name} ${element.qualifiedName} ${element.kind}`.toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  )

  useEffect(() => {
    let active = true
    void gateway.modelQuery(workspaceId, {
      schemaVersion: 1,
      mode,
      depth: 5,
      maxResults: 2_000,
    }).then((result) => {
      if (!active) return
      setQueryResult(result)
      setQueryError('')
    }).catch((cause: unknown) => {
      if (!active) return
      setQueryError(cause instanceof Error ? cause.message : 'Model query failed')
    })
    return () => { active = false }
  }, [gateway, mode, workspaceId, workspace.snapshot.snapshotSha256])

  useEffect(() => {
    if (!selectedUri) return
    let active = true
    void gateway.readDocument(workspaceId, selectedUri).then((nextDocument) => {
      if (active) setDocument(nextDocument)
    }).catch(() => {
      if (active) setDocument(null)
    })
    return () => { active = false }
  }, [gateway, selectedUri, workspaceId, workspace.snapshot.snapshotSha256])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const selectElement = (element: SemanticElement) => {
    setSelectedId(element.id)
    setSelectedUri(element.source.uri)
  }

  const refreshWorkspace = async () => {
    const [snapshot, diagnostics, views] = await Promise.all([
      gateway.semanticSnapshot(workspaceId),
      gateway.diagnostics(workspaceId),
      gateway.listViews(workspaceId),
    ])
    setWorkspace((current) => ({
      status: {
        ...current.status,
        snapshotSha256: snapshot.snapshotSha256,
        documents: snapshot.documents,
        diagnostics: summarizeDiagnostics(diagnostics),
      },
      snapshot,
      diagnostics,
      views,
    }))
  }

  const saveCurrentView = async () => {
    setSavingView(true)
    try {
      const view = await gateway.saveView(workspaceId, {
        schemaVersion: 1,
        id: `view-${mode}`,
        name: `${EXPLORER_MODES.find((item) => item.id === mode)?.label ?? mode} review`,
        query: { mode, depth: 5, maxResults: 2_000 },
        notation: surface === 'matrix' ? 'table' : surface === 'diagram' ? notationForMode(mode) : 'model-structure',
        layout: { positions: defaultPositions(filteredElements) },
        updatedAt: new Date().toISOString(),
      })
      setWorkspace((current) => ({
        ...current,
        views: [...current.views.filter((item) => item.id !== view.id), view],
      }))
    } finally {
      setSavingView(false)
    }
  }

  const selectActivity = (next: ActivityId) => {
    setActivity(next)
    if (next === 'interfaces') setMode('interfaces')
    if (next === 'traceability') setMode('requirements')
    if (next === 'verification') setMode('verification')
    if (next === 'model') setMode('containment')
  }

  return (
    <main className="workbench-shell" aria-label="SysML Engineering Workbench">
      <header className="workbench-titlebar">
        <div>
          <span className="product-mark">SW</span>
          <strong>SysML Engineering Workbench</strong>
          <span className="workspace-name">{workspace.status.configurationName}</span>
        </div>
        <div className="titlebar-status">
          <span className={`status-dot ${workspace.status.indexState}`} />
          {workspace.status.indexState} · {workspace.status.semanticAuthority}
          <button type="button" onClick={() => setPaletteOpen(true)}>⌘K</button>
        </div>
      </header>

      <div className="workbench-body">
        <nav className="activity-rail" aria-label="Workbench activities">
          {ACTIVITIES.map((item) => {
            const Icon = item.icon
            return (
              <button
                type="button"
                key={item.id}
                className={activity === item.id ? 'active' : ''}
                aria-label={item.label}
                aria-pressed={activity === item.id}
                onClick={() => selectActivity(item.id)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <aside className="workbench-explorer" aria-label={`${activity} navigation`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{activity}</p>
              <h2>{activityLabel(activity)}</h2>
            </div>
            <button type="button" title="Save view" aria-label="Save current view" onClick={() => void saveCurrentView()} disabled={savingView}>
              <Save size={16} />
            </button>
          </div>
          <div className="search-field">
            <Search size={15} />
            <input aria-label="Filter model elements" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter model" />
          </div>
          <label className="mode-selector">
            Explorer mode
            <select value={mode} onChange={(event) => setMode(event.target.value as ModelQueryMode)}>
              {EXPLORER_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {queryError && <p role="alert" className="error-banner">{queryError}</p>}
          <div role="tree" aria-label={`${mode} model explorer`} className="element-tree">
            {filteredElements.map((element) => (
              <button
                type="button"
                role="treeitem"
                aria-selected={selectedId === element.id}
                key={element.id}
                className={selectedId === element.id ? 'selected' : ''}
                style={{ paddingInlineStart: `${10 + hierarchyDepth(element, workspace.snapshot) * 12}px` }}
                onClick={() => selectElement(element)}
              >
                <ChevronRight size={12} />
                <span className="kind-glyph">{kindGlyph(element.kind)}</span>
                <span>{element.name}</span>
              </button>
            ))}
          </div>
          <section className="saved-views" aria-label="Saved views">
            <h3>Saved views <span>{workspace.views.length}</span></h3>
            {workspace.views.map((view) => (
              <button type="button" key={view.id} onClick={() => applySavedView(view, setMode, setSurface)}>
                {view.name}
              </button>
            ))}
          </section>
        </aside>

        <section className="workbench-centre">
          <div className="surface-tabs" role="tablist" aria-label="Workbench surfaces">
            {(['source', 'diagram', 'matrix'] as SurfaceId[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={surface === item} onClick={() => setSurface(item)}>
                {item === 'source' ? <FileCode2 size={15} /> : item === 'diagram' ? <Network size={15} /> : <TableProperties size={15} />}
                {item}
              </button>
            ))}
            <span className="surface-context">{EXPLORER_MODES.find((item) => item.id === mode)?.label}</span>
          </div>
          <div className="surface-content">
            {activity === 'assistant' && (
              <ControlledAiSurface
                gateway={gateway}
                workspaceId={workspaceId}
                userId={userId}
                selected={selected}
                onSelectId={(identity) => {
                  const element = workspace.snapshot.elements.find((candidate) => candidate.id === identity)
                  if (element) selectElement(element)
                }}
                onApplied={refreshWorkspace}
              />
            )}
            {isAssuranceActivity(activity) && (
              <AssuranceSurface
                activity={activity}
                gateway={gateway}
                workspaceId={workspaceId}
                userId={userId}
                selected={selected}
                onSelectId={(identity) => {
                  const element = workspace.snapshot.elements.find((candidate) => candidate.id === identity)
                  if (element) selectElement(element)
                }}
              />
            )}
            {activity !== 'assistant' && !isAssuranceActivity(activity) && surface === 'source' && document && (
              <SourceSurface gateway={gateway} workspace={workspace} document={document} userId={userId} onApplied={refreshWorkspace} />
            )}
            {activity !== 'assistant' && !isAssuranceActivity(activity) && surface === 'source' && !document && <EmptySurface title="No source document" detail="Select a source-backed model element." />}
            {activity !== 'assistant' && !isAssuranceActivity(activity) && surface === 'diagram' && (
              <DiagramSurface snapshot={workspace.snapshot} result={queryResult} selectedId={selectedId} onSelect={selectElement} />
            )}
            {activity !== 'assistant' && !isAssuranceActivity(activity) && surface === 'matrix' && (
              <MatrixSurface snapshot={workspace.snapshot} result={queryResult} onSelect={selectElement} />
            )}
          </div>
          <BottomPanel
            open={bottomOpen}
            active={bottomPanel}
            diagnostics={workspace.diagnostics}
            result={queryResult}
            onOpenChange={setBottomOpen}
            onActiveChange={setBottomPanel}
            onDiagnostic={(diagnostic) => setSelectedUri(diagnostic.uri)}
          />
        </section>

        <aside className="workbench-inspector" aria-label="Model inspector">
          <div className="panel-heading">
            <div><p className="eyebrow">INSPECTOR</p><h2>{selected?.name ?? 'No selection'}</h2></div>
          </div>
          {selected ? (
            <>
              <dl className="property-grid">
                <dt>Identity</dt><dd title={selected.id}>{shortId(selected.id)}</dd>
                <dt>Qualified name</dt><dd>{selected.qualifiedName}</dd>
                <dt>Kind</dt><dd><span className="kind-pill">{selected.kind}</span></dd>
                <dt>Owner</dt><dd>{ownerName(selected, workspace.snapshot)}</dd>
                <dt>Source</dt><dd><button type="button" onClick={() => { setSelectedUri(selected.source.uri); setSurface('source') }}>{selected.source.workspacePath}:{selected.source.range.start.line + 1}</button></dd>
                <dt>Diagnostics</dt><dd>{workspace.diagnostics.filter((item) => item.uri === selected.source.uri).length}</dd>
                <dt>Relationships</dt><dd>{relationshipsFor(selected.id, workspace.snapshot).length}</dd>
              </dl>
              <section className="relationship-list">
                <h3>Relationships</h3>
                {relationshipsFor(selected.id, workspace.snapshot).slice(0, 12).map((relationship) => (
                  <button type="button" key={relationship.id} onClick={() => {
                    const otherId = relationship.sourceId === selected.id ? relationship.targetId : relationship.sourceId
                    const other = workspace.snapshot.elements.find((element) => element.id === otherId)
                    if (other) selectElement(other)
                  }}>
                    <span>{relationship.kind}</span>
                    {elementName(relationship.sourceId === selected.id ? relationship.targetId : relationship.sourceId, workspace.snapshot)}
                  </button>
                ))}
              </section>
              <NativeCommandEditor gateway={gateway} snapshot={workspace.snapshot} userId={userId} onApplied={() => void refreshWorkspace()} />
            </>
          ) : <EmptySurface title="Nothing selected" detail="Choose an element in a semantic projection." />}
        </aside>
      </div>

      {paletteOpen && (
        <div className="command-palette-backdrop" role="presentation" onMouseDown={() => setPaletteOpen(false)}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Go to activity</h2>
            {ACTIVITIES.map((item) => (
              <button type="button" key={item.id} onClick={() => { selectActivity(item.id); setPaletteOpen(false) }}>{item.label}</button>
            ))}
          </section>
        </div>
      )}
    </main>
  )
}

function SourceSurface({ gateway, workspace, document, userId, onApplied }: {
  gateway: WorkbenchGateway
  workspace: LoadedWorkspace
  document: WorkspaceDocumentContent
  userId: string
  onApplied(): Promise<void>
}) {
  const [draft, setDraft] = useState(document.text)
  const [envelope, setEnvelope] = useState<CommandEnvelope | null>(null)
  useEffect(() => { setDraft(document.text); setEnvelope(null) }, [document.sha256, document.text])
  useEffect(() => {
    activeLanguageContext = {
      gateway,
      workspaceId: workspace.status.workspaceId,
      documentUri: document.uri,
    }
    return () => {
      if (activeLanguageContext?.documentUri === document.uri) activeLanguageContext = null
    }
  }, [document.uri, gateway, workspace.status.workspaceId])
  const review = () => setEnvelope({
    schemaVersion: 1,
    commandId: `source:${crypto.randomUUID()}`,
    workspaceId: workspace.status.workspaceId,
    baseSnapshotSha256: workspace.snapshot.snapshotSha256,
    baseDocuments: Object.fromEntries(workspace.snapshot.documents.map((item) => [item.uri, item.sha256])),
    requestedBy: { kind: 'user', id: userId },
    command: { kind: 'replace-document', documentUri: document.uri, text: draft },
  })
  return (
    <div className="source-surface">
      <div className="source-toolbar">
        <span>{new URL(document.uri).pathname.split('/').at(-1)}</span>
        <span>{draft === document.text ? 'Saved' : 'Draft — not authoritative'}</span>
        <button type="button" disabled={draft === document.text} onClick={review}>Review source patch</button>
      </div>
      <Editor
        height="100%"
        language="sysml"
        theme="vs-dark"
        value={draft}
        beforeMount={registerWorkbenchLanguage}
        onChange={(value) => setDraft(value ?? '')}
        options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, accessibilitySupport: 'on' }}
      />
      {envelope && (
        <div className="source-review-drawer">
          <CommandReviewPanel
            key={envelope.commandId}
            gateway={gateway}
            envelope={envelope}
            approvalUserId={userId}
            onApplied={() => void onApplied()}
          />
        </div>
      )}
    </div>
  )
}

function DiagramSurface({ snapshot, result, selectedId, onSelect }: {
  snapshot: SemanticSnapshot
  result: ModelQueryResult | null
  selectedId: string
  onSelect(element: SemanticElement): void
}) {
  const elements = (result?.elements ?? snapshot.elements).slice(0, 120)
  const relationships = result?.relationships ?? snapshot.relationships
  return (
    <div className="semantic-diagram" aria-label="Semantic diagram">
      <div className="diagram-grid" />
      {elements.map((element, index) => (
        <button
          type="button"
          key={element.id}
          className={`diagram-node ${selectedId === element.id ? 'selected' : ''}`}
          style={{ left: `${28 + (index % 4) * 220}px`, top: `${28 + Math.floor(index / 4) * 112}px` }}
          onClick={() => onSelect(element)}
        >
          <span>{element.kind}</span>
          <strong>{element.name}</strong>
          <small>{relationships.filter((item) => item.sourceId === element.id || item.targetId === element.id).length} relationships</small>
        </button>
      ))}
      {elements.length === 0 && <EmptySurface title="Empty projection" detail="Adjust the roots or filters for this view." />}
    </div>
  )
}

function MatrixSurface({ snapshot, result, onSelect }: {
  snapshot: SemanticSnapshot
  result: ModelQueryResult | null
  onSelect(element: SemanticElement): void
}) {
  const elements = result?.elements ?? snapshot.elements
  const relationships = result?.relationships ?? snapshot.relationships
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  return (
    <div className="matrix-surface">
      <div className="matrix-toolbar"><strong>{elements.length} elements</strong><span>{relationships.length} relationships</span><button type="button" onClick={() => exportMatrixCsv(elements, relationships, snapshot)}>Export CSV</button></div>
      <table>
        <thead><tr><th>Element</th><th>Kind</th><th>Owner</th><th>Outbound</th><th>Inbound</th><th>Source</th></tr></thead>
        <tbody>{elements.map((element) => (
          <tr key={element.id}>
            <td><button type="button" onClick={() => onSelect(element)}>{element.qualifiedName}</button></td>
            <td>{element.kind}</td>
            <td>{element.ownerId ? byId.get(element.ownerId)?.name ?? 'Unresolved' : 'Workspace'}</td>
            <td>{relationships.filter((item) => item.sourceId === element.id).length}</td>
            <td>{relationships.filter((item) => item.targetId === element.id).length}</td>
            <td>{element.source.workspacePath}:{element.source.range.start.line + 1}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function BottomPanel({ open, active, diagnostics, result, onOpenChange, onActiveChange, onDiagnostic }: {
  open: boolean
  active: BottomPanelId
  diagnostics: LanguageDiagnostic[]
  result: ModelQueryResult | null
  onOpenChange(value: boolean): void
  onActiveChange(value: BottomPanelId): void
  onDiagnostic(value: LanguageDiagnostic): void
}) {
  return (
    <section className={`bottom-panel ${open ? 'open' : ''}`} aria-label="Workbench bottom panel">
      <div className="bottom-tabs">
        {(['problems', 'output', 'query', 'changes'] as BottomPanelId[]).map((item) => <button type="button" key={item} className={active === item ? 'active' : ''} onClick={() => { onActiveChange(item); onOpenChange(true) }}>{item}{item === 'problems' ? ` ${diagnostics.length}` : ''}</button>)}
        <button type="button" aria-label="Toggle bottom panel" onClick={() => onOpenChange(!open)}><PanelBottom size={15} /></button>
      </div>
      {open && <div className="bottom-content">
        {active === 'problems' && (diagnostics.length ? diagnostics.map((item, index) => <button type="button" key={`${item.uri}:${item.code}:${index}`} onClick={() => onDiagnostic(item)}><span className={`severity ${item.severity}`}>{item.severity}</span><strong>{item.code}</strong><span>{item.message}</span><small>{new URL(item.uri).pathname.split('/').at(-1)}:{(item.range?.start.line ?? 0) + 1}</small></button>) : <p>No language diagnostics.</p>)}
        {active === 'query' && <pre>{JSON.stringify({ elements: result?.elements.length ?? 0, relationships: result?.relationships.length ?? 0, truncated: result?.truncated ?? false, warnings: result?.warnings ?? [] }, null, 2)}</pre>}
        {active === 'output' && <p>Language authority and projection operations are local.</p>}
        {active === 'changes' && <p>Command transactions appear here after an approved source patch.</p>}
      </div>}
    </section>
  )
}

function EmptySurface({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-surface"><Activity size={26} /><h3>{title}</h3><p>{detail}</p></div>
}

let workbenchLanguageRegistered = false
let activeLanguageContext: {
  gateway: WorkbenchGateway
  workspaceId: string
  documentUri: string
} | null = null

function registerWorkbenchLanguage(monaco: Monaco) {
  if (workbenchLanguageRegistered) return
  workbenchLanguageRegistered = true
  monaco.languages.register({ id: 'sysml' })
  monaco.languages.setMonarchTokensProvider('sysml', {
    keywords: ['package', 'part', 'port', 'connection', 'interface', 'flow', 'requirement', 'satisfy', 'verify', 'verification', 'action', 'state', 'transition', 'def', 'in', 'out', 'inout', 'import', 'alias', 'doc'],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"[^"\\]*(?:\\.[^"\\]*)*"/, 'string'],
        [/[0-9]+(?:\.[0-9]+)?/, 'number'],
        [/[A-Za-z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],
      comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']],
    },
  })
  monaco.languages.setLanguageConfiguration('sysml', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: '"', close: '"' }],
  })
  monaco.languages.registerCompletionItemProvider('sysml', {
    triggerCharacters: [':', ' '],
    provideCompletionItems: async (model: MonacoEditor.ITextModel, position: MonacoPosition) => {
      const context = activeLanguageContext
      if (!context) return { suggestions: [] }
      const items = await context.gateway.completion(
        context.workspaceId,
        context.documentUri,
        { line: position.lineNumber - 1, character: position.column - 1 },
      )
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      return {
        suggestions: items.map((item) => ({
          label: item.label,
          detail: item.detail,
          documentation: item.documentation,
          insertText: item.insertText ?? item.label,
          kind: monaco.languages.CompletionItemKind.Reference,
          range,
        })),
      }
    },
  })
  monaco.languages.registerHoverProvider('sysml', {
    provideHover: async (_model: MonacoEditor.ITextModel, position: MonacoPosition) => {
      const context = activeLanguageContext
      if (!context) return null
      const hover = await context.gateway.hover(context.workspaceId, context.documentUri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      })
      if (!hover) return null
      return {
        contents: [{ value: hover.format === 'markdown' ? hover.value : `\`${hover.value}\`` }],
        range: hover.range ? toMonacoRange(monaco, hover.range) : undefined,
      }
    },
  })
  monaco.languages.registerDefinitionProvider('sysml', {
    provideDefinition: async (_model: MonacoEditor.ITextModel, position: MonacoPosition) => {
      const context = activeLanguageContext
      if (!context) return []
      const locations = await context.gateway.definition(context.workspaceId, context.documentUri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      })
      return locations.map((location) => ({ uri: monaco.Uri.parse(location.uri), range: toMonacoRange(monaco, location.range) }))
    },
  })
  monaco.languages.registerReferenceProvider('sysml', {
    provideReferences: async (_model: MonacoEditor.ITextModel, position: MonacoPosition) => {
      const context = activeLanguageContext
      if (!context) return []
      const locations = await context.gateway.references(context.workspaceId, context.documentUri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      })
      return locations.map((location) => ({ uri: monaco.Uri.parse(location.uri), range: toMonacoRange(monaco, location.range) }))
    },
  })
  monaco.languages.registerDocumentFormattingEditProvider('sysml', {
    provideDocumentFormattingEdits: async () => {
      const context = activeLanguageContext
      if (!context) return []
      const edits = await context.gateway.formatting(context.workspaceId, context.documentUri)
      return edits.map((edit) => ({ range: toMonacoRange(monaco, edit.range), text: edit.newText }))
    },
  })
}

function toMonacoRange(monaco: Monaco, range: { start: { line: number; character: number }; end: { line: number; character: number } }) {
  return new monaco.Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1)
}

function summarizeDiagnostics(diagnostics: LanguageDiagnostic[]) {
  return {
    errors: diagnostics.filter((item) => item.severity === 'error').length,
    warnings: diagnostics.filter((item) => item.severity === 'warning').length,
    information: diagnostics.filter((item) => item.severity === 'information').length,
    hints: diagnostics.filter((item) => item.severity === 'hint').length,
  }
}

function hierarchyDepth(element: SemanticElement, snapshot: SemanticSnapshot): number {
  const byId = new Map(snapshot.elements.map((item) => [item.id, item]))
  let current = element
  let depth = 0
  const seen = new Set<string>()
  while (current.ownerId && depth < 8 && !seen.has(current.ownerId)) {
    seen.add(current.ownerId)
    const owner = byId.get(current.ownerId)
    if (!owner) break
    current = owner
    depth += 1
  }
  return depth
}

function kindGlyph(kind: string): string {
  if (kind.includes('Requirement')) return 'R'
  if (kind.includes('Port') || kind.includes('Interface')) return 'I'
  if (kind.includes('Verification')) return 'V'
  if (kind.includes('Package')) return 'P'
  return kind.includes('Definition') ? 'D' : 'U'
}

function activityLabel(activity: ActivityId): string {
  return ACTIVITIES.find((item) => item.id === activity)?.label ?? activity
}

function isAssuranceActivity(activity: ActivityId): activity is AssuranceActivity {
  return activity === 'interfaces' ||
    activity === 'verification' ||
    activity === 'reviews' ||
    activity === 'changes' ||
    activity === 'reports'
}

function shortId(id: string): string { return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id }
function ownerName(element: SemanticElement, snapshot: SemanticSnapshot): string { return element.ownerId ? snapshot.elements.find((item) => item.id === element.ownerId)?.qualifiedName ?? 'Unresolved owner' : 'Workspace root' }
function relationshipsFor(id: string, snapshot: SemanticSnapshot) { return snapshot.relationships.filter((item) => item.sourceId === id || item.targetId === id) }
function elementName(id: string, snapshot: SemanticSnapshot): string { return snapshot.elements.find((item) => item.id === id)?.name ?? 'Unresolved element' }

function notationForMode(mode: ModelQueryMode): SavedWorkbenchView['notation'] {
  if (mode === 'interfaces') return 'interconnection'
  if (mode === 'requirements') return 'traceability'
  if (mode === 'verification') return 'verification-context'
  return 'model-structure'
}

function defaultPositions(elements: SemanticElement[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(elements.slice(0, 500).map((element, index) => [element.id, { x: (index % 4) * 220, y: Math.floor(index / 4) * 112 }]))
}

function applySavedView(view: SavedWorkbenchView, setMode: (mode: ModelQueryMode) => void, setSurface: (surface: SurfaceId) => void) {
  if (view.query.mode) setMode(view.query.mode)
  setSurface(view.notation === 'table' ? 'matrix' : 'diagram')
}

function exportMatrixCsv(elements: SemanticElement[], relationships: SemanticSnapshot['relationships'], snapshot: SemanticSnapshot) {
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rows = [['qualifiedName', 'kind', 'owner', 'outbound', 'inbound', 'source'], ...elements.map((element) => [element.qualifiedName, element.kind, element.ownerId ? byId.get(element.ownerId)?.qualifiedName ?? '' : '', relationships.filter((item) => item.sourceId === element.id).length, relationships.filter((item) => item.targetId === element.id).length, element.source.workspacePath])]
  const blob = new Blob([rows.map((row) => row.map(quote).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = 'sysml-workbench-matrix.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
