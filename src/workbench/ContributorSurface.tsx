import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CommandEnvelope,
  ContributorFieldCommand,
  WorkbenchCommand,
} from '../../packages/command-engine/src/index.js'
import { roundTripsNumericLiteral, quantityField, referenceField, interfaceAgreementField, type QuantityField, type ReferenceField, type InterfaceAgreementField } from '../../packages/command-engine/src/contributor-profile.js'
import { directDocumentation } from '../../packages/command-engine/src/documentation.js'
import type { SemanticElement, SemanticRelationship } from '../../packages/semantic-model/src/index.js'
import { CommandReviewPanel } from '../components/CommandReviewPanel.js'
import type { LoadedWorkspace, WorkbenchGateway } from './gateway.js'

type ContributorScope = 'requirements' | 'interfaces' | 'properties' | 'references'
type EditKind = 'documentation' | 'property' | 'attribute' | 'reference' | 'agreement'
type PropertyValueKind = 'string' | 'number' | 'boolean'

const CONTRIBUTOR_PAGE_SIZE = 50

interface StagedChange {
  id: string
  targetId: string
  targetLabel: string
  kind: EditKind
  documentation?: string
  propertyQualifiedName?: string
  propertyValue?: string
  propertyValueKind?: PropertyValueKind
  beforeValue: string
  afterValue: string
  attributeType?: string
  command?: ContributorFieldCommand
}

interface AttributeDescriptor {
  name: string
  type: string
  value: string
  valueKind: PropertyValueKind
}

type SourceReadState =
  | { status: 'idle' }
  | { status: 'loading'; targetId: string }
  | { status: 'ready'; targetId: string; documentSha256: string; documentation: string; attribute: AttributeDescriptor | null; quantity: QuantityField | null; reference: ReferenceField | null; agreement: InterfaceAgreementField | null }
  | { status: 'error'; targetId: string; message: string }

/**
 * A small task surface for contributors who need to maintain a requirement or
 * interface without learning the model's package layout. The surface only
 * creates the existing command-engine envelopes; it never owns a second model
 * or writes source directly.
 */
export function ContributorSurface({
  gateway,
  workspace,
  userId,
  onSelectId,
  onApplied,
}: {
  gateway: WorkbenchGateway
  workspace: LoadedWorkspace
  userId: string
  onSelectId(id: string): void
  onApplied(): Promise<void>
}) {
  const [scope, setScope] = useState<ContributorScope>('requirements')
  const [selectedId, setSelectedId] = useState('')
  const [editKind, setEditKind] = useState<EditKind>('documentation')
  const [documentation, setDocumentation] = useState('')
  const [propertyQualifiedName, setPropertyQualifiedName] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [propertyValueKind, setPropertyValueKind] = useState<PropertyValueKind>('string')
  const [attributeValue, setAttributeValue] = useState('')
  const [unit, setUnit] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [agreementSource, setAgreementSource] = useState('')
  const [agreementTarget, setAgreementTarget] = useState('')
  const [agreementStatus, setAgreementStatus] = useState<InterfaceAgreementField['status']>('draft')
  const [agreementOwner, setAgreementOwner] = useState('')
  const [agreementRationale, setAgreementRationale] = useState('')
  const [staged, setStaged] = useState<StagedChange[]>([])
  const [envelope, setEnvelope] = useState<CommandEnvelope | null>(null)
  const [error, setError] = useState('')
  const [baselineNotice, setBaselineNotice] = useState('')
  const [page, setPage] = useState(0)
  const [source, setSource] = useState<SourceReadState>({ status: 'idle' })
  const previousSnapshotHash = useRef<string | null>(null)

  const rows = useMemo(
    () => contributorElements(workspace.snapshot.elements, scope),
    [scope, workspace.snapshot.elements],
  )
  const visibleRows = rows.slice(page * CONTRIBUTOR_PAGE_SIZE, (page + 1) * CONTRIBUTOR_PAGE_SIZE)
  const contributorItems = useMemo(
    () => contributorElements(workspace.snapshot.elements, 'requirements')
      .concat(contributorElements(workspace.snapshot.elements, 'interfaces'))
      .concat(contributorElements(workspace.snapshot.elements, 'properties'))
      .concat(contributorElements(workspace.snapshot.elements, 'references')),
    [workspace.snapshot.elements],
  )
  const selected = contributorItems.find((element) => element.id === selectedId) ?? rows[0]
  const selectedDiagnostics = selected
    ? workspace.diagnostics.filter((item) => item.uri === selected.source.uri)
    : []
  const relationshipsByElement = useMemo(() => {
    const indexed = new Map<string, SemanticRelationship[]>()
    for (const relationship of workspace.snapshot.relationships) {
      indexed.set(relationship.sourceId, [...(indexed.get(relationship.sourceId) ?? []), relationship])
      indexed.set(relationship.targetId, [...(indexed.get(relationship.targetId) ?? []), relationship])
    }
    return indexed
  }, [workspace.snapshot.relationships])
  const selectedRelationships = selected ? relationshipsByElement.get(selected.id) ?? [] : []
  const canEdit = Boolean(
    selected &&
    selected.provenance.classification !== 'opaque' &&
    source.status === 'ready' && source.targetId === selected.id &&
    (scope !== 'properties' || source.attribute !== null || source.quantity !== null) &&
    (scope !== 'references' || source.reference !== null) &&
    (editKind !== 'agreement' || source.agreement !== null),
  )

  useEffect(() => {
    const next = contributorItems.find((element) => element.id === selectedId) ?? rows[0]
    if (next && next.id !== selectedId) {
      setSelectedId(next.id)
      onSelectId(next.id)
    }
    if (!next && selectedId) setSelectedId('')
  }, [contributorItems, onSelectId, rows, selectedId])

  useEffect(() => {
    const snapshotHash = workspace.snapshot.snapshotSha256
    if (previousSnapshotHash.current && previousSnapshotHash.current !== snapshotHash) {
      setStaged([])
      setEnvelope(null)
      setDocumentation('')
      setAttributeValue('')
      setBaselineNotice('Workspace changed. Staged contribution edits were cleared and must be reviewed against the new baseline.')
    }
    previousSnapshotHash.current = snapshotHash
  }, [workspace.snapshot.snapshotSha256])

  useEffect(() => {
    // A staged list is a command input. Any edit to it invalidates an already
    // generated proposal; the user must generate a new review.
    setEnvelope(null)
  }, [staged])

  useEffect(() => {
    setPage(0)
  }, [scope])

  useEffect(() => {
    if (!selected) {
      setDocumentation('')
      setAttributeValue('')
      setPropertyQualifiedName('')
      setPropertyValue('')
      setSource({ status: 'idle' })
      return
    }
    setDocumentation('')
    setAttributeValue('')
    setUnit('')
    setReferenceId('')
    setAgreementSource('')
    setAgreementTarget('')
    setAgreementStatus('draft')
    setAgreementOwner('')
    setAgreementRationale('')
    setPropertyQualifiedName('')
    setPropertyValue('')
    const documentSummary = workspace.snapshot.documents.find((item) => item.uri === selected.source.uri)
    if (!documentSummary) {
      setSource({ status: 'error', targetId: selected.id, message: 'The selected source document is not available in the current workspace.' })
      return
    }
    if (documentSummary.sha256 !== selected.source.documentSha256) {
      setSource({ status: 'error', targetId: selected.id, message: 'The selected element is stale: its source document hash does not match the workspace snapshot.' })
      return
    }
    let active = true
    setSource({ status: 'loading', targetId: selected.id })
    void gateway.readDocument(workspace.status.workspaceId, selected.source.uri).then((document) => {
      if (!active) return
      if (document.sha256 !== documentSummary.sha256 || document.sha256 !== selected.source.documentSha256) {
        throw new Error('The source document changed while it was being read. Refresh the workspace before editing.')
      }
      const elementText = sliceSourceRange(document.text, selected.source.range)
      setDocumentation(extractDocumentation(elementText))
      const attribute = parseSimpleAttribute(elementText)
      const quantity = quantityField(selected, elementText, workspace.snapshot)
      const reference = referenceField(selected, elementText, workspace.snapshot, document.text)
      const agreement = interfaceAgreementField(selected, elementText, workspace.snapshot, document.text)
      setAttributeValue(quantity ? String(quantity.value) : attribute?.value ?? '')
      setUnit(quantity?.unitId ?? '')
      setReferenceId(reference?.referencedElementId ?? '')
      setAgreementSource(agreement?.sourceId ?? '')
      setAgreementTarget(agreement?.targetEndpointId ?? '')
      setAgreementStatus(agreement?.status ?? 'draft')
      setAgreementOwner(agreement?.owner ?? '')
      setAgreementRationale(agreement?.rationale ?? '')
      setSource({
        status: 'ready',
        targetId: selected.id,
        documentSha256: document.sha256,
        documentation: extractDocumentation(elementText),
        attribute, quantity, reference, agreement,
      })
    }).catch((cause: unknown) => {
      if (!active) return
      setSource({
        status: 'error',
        targetId: selected.id,
        message: cause instanceof Error ? cause.message : 'The selected source document could not be read.',
      })
    })
    return () => { active = false }
  }, [gateway, selected, selected?.id, selected?.source.documentSha256, selected?.source.range, selected?.source.uri, workspace.snapshot, workspace.status.workspaceId])

  const select = (element: SemanticElement) => {
    setSelectedId(element.id)
    onSelectId(element.id)
    setError('')
  }

  const addChange = () => {
    if (!selected) {
      setError('Select a source-backed model item first.')
      return
    }
    if (!canEdit) {
      setError('This element is not ready for the selected editing profile. Refresh or select a supported source-backed item.')
      return
    }
    let change: StagedChange | { error: string }
    const descriptor = source.status === 'ready' ? source : null
    if (scope === 'properties' && descriptor?.quantity) {
      const parsed = parseScalarValue(attributeValue.trim(), 'number')
      change = 'error' in parsed ? parsed : !descriptor.quantity.units.some((item) => item.id === unit) ? { error: 'Select a compatible unit from this quantity profile.' } : {
        id: selected.id + ':quantity', targetId: selected.id, targetLabel: selected.qualifiedName, kind: 'attribute',
        beforeValue: String(descriptor.quantity.value) + ' [' + descriptor.quantity.unitExpression + ']',
        afterValue: attributeValue + ' [' + unit + ']',
        command: { kind: 'set-quantity-value', targetId: selected.id, value: Number(parsed.value), unitId: unit },
      }
    } else if (scope === 'references' && descriptor?.reference) {
      const candidate = descriptor.reference.candidates.find((item) => item.id === referenceId)
      change = !candidate ? { error: 'Select a compatible reference from this baseline.' } : {
        id: selected.id + ':reference', targetId: selected.id, targetLabel: selected.qualifiedName, kind: 'reference',
        beforeValue: descriptor.reference.referenceQualifiedName, afterValue: candidate.qualifiedName,
        command: { kind: 'set-reference-target', targetId: selected.id, referencedElementId: candidate.id },
      }
    } else if (editKind === 'agreement' && descriptor?.agreement) {
      const from = descriptor.agreement.sourceCandidates.find((item) => item.id === agreementSource)
      const to = descriptor.agreement.targetCandidates.find((item) => item.id === agreementTarget)
      change = !from || !to ? { error: 'Select both compatible interface endpoints.' }
        : from.id === to.id ? { error: 'Interface source and target must be different endpoints.' }
        : !agreementOwner.trim() || !agreementRationale.trim() ? { error: 'Enter an owner and rationale for this interface disposition.' }
        : {
          id: selected.id + ':agreement', targetId: selected.id, targetLabel: selected.qualifiedName, kind: 'agreement',
          beforeValue: agreementSummary(descriptor.agreement, workspace.snapshot.elements),
          afterValue: from.qualifiedName + ' → ' + to.qualifiedName + '; ' + agreementStatus + '; owner: ' + agreementOwner.trim() + '; ' + agreementRationale.trim(),
          command: { kind: 'set-interface-agreement', targetId: selected.id, sourceId: from.id, targetEndpointId: to.id, status: agreementStatus, owner: agreementOwner.trim(), rationale: agreementRationale.trim() },
        }
    } else change = readChange({
      selected,
      editKind,
      documentation,
      propertyQualifiedName,
      propertyValue,
      propertyValueKind,
      attributeValue,
      sourceAttribute: source.status === 'ready' ? source.attribute : null,
      sourceDocumentation: source.status === 'ready' ? source.documentation : '',
    })
    if ('error' in change) {
      setError(change.error)
      return
    }
    setStaged((current) => [
      ...current.filter((item) => item.id !== change.id),
      change,
    ])
    setError('')
  }

  const reviewChanges = () => {
    if (staged.length === 0) {
      setError('Add at least one change to the review.')
      return
    }
    const base = {
      schemaVersion: 1 as const,
      commandId: 'contributor:' + crypto.randomUUID(),
      workspaceId: workspace.status.workspaceId,
      baseSnapshotSha256: workspace.snapshot.snapshotSha256,
      baseDocuments: Object.fromEntries(
        workspace.snapshot.documents.map((document) => [document.uri, document.sha256]),
      ),
      requestedBy: { kind: 'user' as const, id: userId },
    }
    const commands = staged.map(toCommand)
    // The current command profile handles one structured command directly. The
    // batch profile is used when the user intentionally reviews several edits
    // together; it is still one gateway proposal and one explicit approval.
    const command: WorkbenchCommand = commands.length === 1
      ? commands[0]!
      : { kind: 'batch-edit', commands }
    setEnvelope({ ...base, command })
    setError('')
  }

  const handleApplied = async () => {
    setStaged([])
    setEnvelope(null)
    setDocumentation('')
    setPropertyValue('')
    setAttributeValue('')
    setError('')
    await onApplied()
  }

  const changeScope = (next: ContributorScope) => {
    setScope(next)
    setSelectedId('')
    setEditKind(next === 'properties' ? 'attribute' : next === 'references' ? 'reference' : 'documentation')
    setError('')
  }

  return (
    <div className="contributor-surface" aria-label="Contributor task">
      <header className="contributor-header">
        <div>
          <p className="eyebrow">TASK-SPECIFIC CONTRIBUTION</p>
          <h2>Requirements and interfaces</h2>
          <p>Maintain engineering statements, values, references and interface agreements through reviewed source changes.</p>
        </div>
        <div className="contributor-baseline" aria-label="Contributor baseline">
          <span>{workspace.snapshot.elements.length} model elements</span>
          <span title={workspace.snapshot.snapshotSha256}>base {shortHash(workspace.snapshot.snapshotSha256)}</span>
        </div>
      </header>

      {error && <p role="alert" className="error-banner">{error}</p>}
      {baselineNotice && <p role="status" className="contributor-baseline-notice">{baselineNotice}</p>}

      <div className="contributor-layout">
        <section className="contributor-register" aria-labelledby="contributor-register-title">
          <div className="contributor-tabs" role="tablist" aria-label="Contribution register">
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'requirements'}
              onClick={() => changeScope('requirements')}
            >
              Requirements ({contributorElements(workspace.snapshot.elements, 'requirements').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'interfaces'}
              onClick={() => changeScope('interfaces')}
            >
              Interfaces ({contributorElements(workspace.snapshot.elements, 'interfaces').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'properties'}
              onClick={() => changeScope('properties')}
            >
              Properties ({contributorElements(workspace.snapshot.elements, 'properties').length})
            </button>
            <button type="button" role="tab" aria-selected={scope === 'references'} onClick={() => changeScope('references')}>
              References ({contributorElements(workspace.snapshot.elements, 'references').length})
            </button>
          </div>
          <div className="contributor-register-heading">
            <div>
              <h3 id="contributor-register-title">{scope === 'requirements' ? 'Requirement register' : scope === 'interfaces' ? 'Interface register' : scope === 'references' ? 'Reference register' : 'Attribute register'}</h3>
              <p>{scope === 'references' ? 'Select a typed usage. Existing reference bindings can be edited; other usages remain read-only.' : 'Choose an item to see its source and linked model relationships.'}</p>
            </div>
            <span className="contributor-count">{rows.length} total · showing {visibleRows.length}</span>
          </div>
          {rows.length === 0 ? (
            <p className="contributor-empty">No source-backed {scope} are present in this workspace.</p>
          ) : (
            <div className="contributor-table-wrap">
              <table className="contributor-table">
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Links</th><th scope="col">Source</th></tr>
                </thead>
                <tbody>
                  {visibleRows.map((element) => {
                    const links = (relationshipsByElement.get(element.id) ?? []).length
                    return (
                      <tr key={element.id} className={selected?.id === element.id ? 'selected' : undefined}>
                        <td>
                          <button type="button" className="contributor-row-button" onClick={() => select(element)}>
                            <strong>{element.name}</strong>
                            <small>{element.qualifiedName}</small>
                          </button>
                        </td>
                        <td>{element.kind}</td>
                        <td>{links}</td>
                        <td>{element.source.workspacePath}:{element.source.range.start.line + 1}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > CONTRIBUTOR_PAGE_SIZE && (
            <div className="contributor-pagination" aria-label="Register pagination">
              <span>Showing {page * CONTRIBUTOR_PAGE_SIZE + 1}–{Math.min((page + 1) * CONTRIBUTOR_PAGE_SIZE, rows.length)} of {rows.length}</span>
              <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button>
              <button type="button" onClick={() => setPage((current) => Math.min(Math.ceil(rows.length / CONTRIBUTOR_PAGE_SIZE) - 1, current + 1))} disabled={(page + 1) * CONTRIBUTOR_PAGE_SIZE >= rows.length}>Next</button>
            </div>
          )}
        </section>

        <section className="contributor-editor" aria-label="Contribution editor">
          {selected ? (
            <>
              <div className="contributor-selected">
                <div>
                  <p className="eyebrow">SELECTED SOURCE ELEMENT</p>
                  <h3>{selected.name}</h3>
                  <p>{selected.qualifiedName} · {selected.kind}</p>
                </div>
                <button type="button" onClick={() => onSelectId(selected.id)}>Open in inspector</button>
              </div>
              <dl className="contributor-facts">
                <dt>Identity</dt><dd title={selected.id}>{shortHash(selected.id)}</dd>
                <dt>Source</dt><dd>{selected.source.workspacePath}:{selected.source.range.start.line + 1}</dd>
                <dt>Relationships</dt><dd>{selectedRelationships.length}</dd>
                <dt>Diagnostics</dt><dd className={selectedDiagnostics.some((item) => item.severity === 'error') ? 'diagnostic-error' : undefined}>{selectedDiagnostics.length}</dd>
              </dl>
              {selectedRelationships.length > 0 && (
                <div className="contributor-links" aria-label="Linked relationships">
                  <strong>Linked model items</strong>
                  {selectedRelationships.slice(0, 5).map((relationship) => {
                    const otherId = relationship.sourceId === selected.id ? relationship.targetId : relationship.sourceId
                    const other = workspace.snapshot.elements.find((element) => element.id === otherId)
                    return <button type="button" key={relationship.id} onClick={() => {
                      if (!other) return
                      if (rows.some((row) => row.id === other.id)) {
                        select(other)
                        return
                      }
                      onSelectId(other.id)
                    }}>{relationship.kind} · {other?.qualifiedName ?? 'unresolved'}</button>
                  })}
                </div>
              )}
              {!canEdit && <p className="contributor-readonly">This element is opaque, stale, loading, or outside this supported editing profile. It remains visible for review but cannot be staged here.</p>}
              {source.status === 'loading' && <p role="status" className="contributor-source-status">Reading the current source document…</p>}
              {source.status === 'error' && <p role="alert" className="contributor-source-status contributor-source-error">{source.message}</p>}
              <div className="contributor-form">
                {scope !== 'properties' && scope !== 'references' && <label>
                  Edit type
                  <select value={editKind} onChange={(event) => setEditKind(event.target.value as EditKind)} disabled={source.status !== 'ready' || selected.provenance.classification === 'opaque'}>
                    <option value="documentation">Documentation</option>
                    <option value="property">Advanced property override</option>
                    {scope === 'interfaces' && <option value="agreement">Interface agreement</option>}
                  </select>
                </label>}
                {scope === 'properties' ? (
                  <>
                    <div className="contributor-attribute-summary">
                      <strong>Typed attribute value</strong>
                      <span>{source.status === 'ready' && source.quantity ? source.quantity.quantityType : source.status === 'ready' && source.attribute ? source.attribute.type : 'Unknown attribute type'}</span>
                    </div>
                    <label>
                      Current value
                      <input aria-label="Attribute value" value={attributeValue} onChange={(event) => setAttributeValue(event.target.value)} disabled={!canEdit} />
                      <small>{source.status === 'ready' && source.quantity ? 'Enter a numeric magnitude and select a compatible unit. Changing units does not convert the magnitude.' : 'The qualified profile supports simple scalar literals only. The existing type is preserved.'}</small>
                    </label>
                    {source.status === 'ready' && source.quantity && <label>
                      Unit
                      <select aria-label="Quantity unit" value={unit} onChange={(event) => setUnit(event.target.value)} disabled={!canEdit}>
                        {source.quantity.units.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>}
                  </>
                ) : scope === 'references' ? (
                  <label>
                    Referenced model item
                    <select value={referenceId} onChange={(event) => setReferenceId(event.target.value)} disabled={!canEdit}>
                      <option value="">Select a compatible item</option>
                      {source.status === 'ready' && source.reference?.candidates.map((item) => <option key={item.id} value={item.id}>{item.qualifiedName}</option>)}
                    </select>
                    <small>Only compatible items from this workspace baseline are offered. Source and type checks run before approval.</small>
                  </label>
                ) : editKind === 'agreement' ? (
                  <>
                    <p className="contributor-disposition-note">Record the engineering disposition and its accountable owner. Selecting “agreed” does not establish stakeholder acceptance or verification evidence.</p>
                    <label>Source endpoint<select value={agreementSource} onChange={(event) => setAgreementSource(event.target.value)} disabled={!canEdit}>
                      <option value="">Select source endpoint</option>
                      {source.status === 'ready' && source.agreement?.sourceCandidates.map((item) => <option key={item.id} value={item.id}>{item.qualifiedName}</option>)}
                    </select></label>
                    <label>Target endpoint<select value={agreementTarget} onChange={(event) => setAgreementTarget(event.target.value)} disabled={!canEdit}>
                      <option value="">Select target endpoint</option>
                      {source.status === 'ready' && source.agreement?.targetCandidates.map((item) => <option key={item.id} value={item.id}>{item.qualifiedName}</option>)}
                    </select></label>
                    <label>Agreement status<select value={agreementStatus} onChange={(event) => setAgreementStatus(event.target.value as InterfaceAgreementField['status'])} disabled={!canEdit}>
                      <option value="draft">Draft</option><option value="proposed">Proposed</option><option value="agreed">Agreed</option><option value="rejected">Rejected</option>
                    </select></label>
                    <label>Agreement owner<input value={agreementOwner} onChange={(event) => setAgreementOwner(event.target.value)} disabled={!canEdit} /></label>
                    <label>Agreement rationale<textarea rows={3} value={agreementRationale} onChange={(event) => setAgreementRationale(event.target.value)} disabled={!canEdit} /></label>
                  </>
                ) : editKind === 'documentation' ? (
                  <label>
                    Engineering statement
                    <textarea
                      aria-label="Engineering statement"
                      value={documentation}
                      onChange={(event) => setDocumentation(event.target.value)}
                      placeholder="Add or revise the source-backed documentation"
                      rows={4}
                      disabled={!canEdit}
                    />
                    <small>Stored as a documentation command and checked by the language authority.</small>
                  </label>
                ) : (
                  <>
                    <label>
                      Advanced property qualified name
                      <input value={propertyQualifiedName} onChange={(event) => setPropertyQualifiedName(event.target.value)} placeholder="Safety::classification" disabled={!canEdit} />
                    </label>
                    <label>
                      Value type
                      <select value={propertyValueKind} onChange={(event) => setPropertyValueKind(event.target.value as PropertyValueKind)} disabled={!canEdit}>
                        <option value="string">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </label>
                    <label>
                      Value
                      <input aria-label="Property value" value={propertyValue} onChange={(event) => setPropertyValue(event.target.value)} placeholder={propertyValueKind === 'boolean' ? 'true or false' : propertyValueKind === 'number' ? '0' : 'Value'} disabled={!canEdit} />
                      <small>This advanced command creates or overrides a property member. Use the Properties scope to update an existing scalar attribute literal.</small>
                    </label>
                  </>
                )}
                <button type="button" onClick={addChange} disabled={!canEdit}>Add to review</button>
              </div>
            </>
          ) : (
            <div className="contributor-empty"><h3>No source-backed item selected</h3><p>Choose a source-backed item from the register.</p></div>
          )}
        </section>
      </div>

      <section className="contributor-review" aria-label="Staged contribution review">
        <header><div><h3>Staged changes</h3><p>{staged.length ? 'These changes will be proposed as one review.' : 'Add a documentation or typed property change to begin.'}</p></div><button type="button" onClick={reviewChanges} disabled={staged.length === 0}>Review staged changes</button></header>
        {staged.length > 0 && <ul>
          {staged.map((change) => <li key={change.id}><span><strong>{change.targetLabel}</strong> · {displayChange(change)}</span><button type="button" onClick={() => setStaged((current) => current.filter((item) => item.id !== change.id))}>Remove</button></li>)}
        </ul>}
        {envelope && (
          <div className="contributor-review-drawer">
            <section className="contributor-change-summary" aria-label="Engineering change summary">
              <h4>Engineering change summary</h4>
              <ul>
                {staged.map((change) => <li key={change.id}><strong>{change.targetLabel}</strong><span>Before: {change.beforeValue || '(none)'}</span><span>After: {change.afterValue}</span></li>)}
              </ul>
              <p>Review this engineering summary before opening the raw source diff.</p>
            </section>
            <CommandReviewPanel
              key={envelope.commandId}
              gateway={gateway}
              envelope={envelope}
              approvalUserId={userId}
              onApplied={() => void handleApplied()}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function contributorElements(elements: SemanticElement[], scope: ContributorScope): SemanticElement[] {
  return elements
    .filter((element) => scope === 'requirements'
      ? element.kind === 'RequirementDefinition' || element.kind === 'RequirementUsage'
      : scope === 'interfaces'
        ? element.kind === 'InterfaceDefinition' || element.kind === 'InterfaceUsage' || element.kind === 'ConnectionDefinition' || element.kind === 'ConnectionUsage'
        : scope === 'references' ? ['ReferenceUsage', 'PartUsage', 'PortUsage', 'ItemUsage'].includes(element.kind) : element.kind === 'AttributeUsage')
    .sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName))
}

function readChange(input: {
  selected: SemanticElement
  editKind: EditKind
  documentation: string
  propertyQualifiedName: string
  propertyValue: string
  propertyValueKind: PropertyValueKind
  attributeValue: string
  sourceAttribute: AttributeDescriptor | null
  sourceDocumentation: string
}): StagedChange | { error: string } {
  if (input.editKind === 'attribute') {
    if (!input.sourceAttribute) return { error: 'The selected attribute is not a supported simple scalar literal.' }
    const value = input.attributeValue.trim()
    if (!value) return { error: 'Enter an attribute value before adding the change.' }
    const parsed = parseScalarValue(value, input.sourceAttribute.valueKind)
    if ('error' in parsed) return parsed
    return {
      id: input.selected.id + ':attribute',
      targetId: input.selected.id,
      targetLabel: input.selected.qualifiedName,
      kind: 'attribute',
      propertyValue: parsed.value,
      propertyValueKind: input.sourceAttribute.valueKind,
      beforeValue: input.sourceAttribute.value,
      afterValue: value,
      attributeType: input.sourceAttribute.type,
    }
  }
  if (input.editKind === 'documentation') {
    const value = input.documentation.trim()
    if (!value) return { error: 'Enter an engineering statement before adding the change.' }
    if (value.includes('*/')) return { error: 'Documentation cannot contain a block-comment terminator.' }
    return {
      id: input.selected.id + ':documentation',
      targetId: input.selected.id,
      targetLabel: input.selected.qualifiedName,
      kind: 'documentation',
      documentation: value,
      beforeValue: input.sourceDocumentation ?? '',
      afterValue: value,
    }
  }
  const property = input.propertyQualifiedName.trim()
  if (!/^[_\p{L}][_\p{L}\p{N}]*(?:::[_\p{L}][_\p{L}\p{N}]*)*$/u.test(property)) {
    return { error: 'Enter a valid qualified property name, for example Safety::classification.' }
  }
  const raw = input.propertyValue.trim()
  if (!raw) return { error: 'Enter a property value before adding the change.' }
  if (input.propertyValueKind === 'number') {
    const numeric = parseScalarValue(raw, 'number')
    if ('error' in numeric) return numeric
  }
  if (input.propertyValueKind === 'boolean' && raw !== 'true' && raw !== 'false') return { error: 'Boolean properties require true or false.' }
  return {
    id: input.selected.id + ':property:' + property,
    targetId: input.selected.id,
    targetLabel: input.selected.qualifiedName,
    kind: 'property',
    propertyQualifiedName: property,
    propertyValue: raw,
    propertyValueKind: input.propertyValueKind,
    beforeValue: '(advanced property state is not loaded)',
    afterValue: property + ' = ' + raw,
  }
}

function toCommand(change: StagedChange): ContributorFieldCommand {
  if (change.command) return change.command
  if (change.kind === 'documentation') {
    return { kind: 'update-documentation', targetId: change.targetId, documentation: change.documentation! }
  }
  if (change.kind === 'attribute') {
    const raw = change.propertyValue!
    return {
      kind: 'set-attribute-value',
      targetId: change.targetId,
      value: change.propertyValueKind === 'number' ? Number(raw) : change.propertyValueKind === 'boolean' ? raw === 'true' : raw,
    }
  }
  const value = change.propertyValue!
  return {
    kind: 'set-property',
    targetId: change.targetId,
    propertyQualifiedName: change.propertyQualifiedName!,
    value: change.propertyValueKind === 'number' ? Number(value) : change.propertyValueKind === 'boolean' ? value === 'true' : value,
  }
}

function displayChange(change: StagedChange): string {
  if (change.kind === 'reference') return 'reference → ' + change.afterValue
  if (change.kind === 'agreement') return 'interface agreement: ' + change.afterValue
  return change.kind === 'documentation'
    ? 'documentation'
    : change.kind === 'attribute'
      ? 'attribute value = ' + (change.afterValue ?? '')
    : (change.propertyQualifiedName ?? 'property') + ' = ' + (change.propertyValue ?? '')
}

function shortHash(value: string): string {
  return value.length > 16 ? value.slice(0, 8) + '…' + value.slice(-6) : value
}

function sliceSourceRange(
  text: string,
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
): string {
  const start = sourceOffset(text, range.start)
  const end = sourceOffset(text, range.end)
  if (end < start) {
    throw new Error('The language authority returned an invalid source range.')
  }
  return text.slice(start, end)
}

function extractDocumentation(elementText: string): string {
  const directBlock = directDocumentation(elementText)
  if (!directBlock) return ''
  return directBlock.body
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/u, '').trim())
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function parseSimpleAttribute(elementText: string): AttributeDescriptor | null {
  const match = /^\s*attribute\s+(?<name>[_\p{L}][_\p{L}\p{N}]*)\s*:\s*(?<type>[_\p{L}][_\p{L}\p{N}:]*)\s*=\s*(?<literal>"(?:\\.|[^"\\])*"|true|false|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s*;\s*$/su.exec(elementText)
  if (!match?.groups) return null
  const name = match.groups.name
  const type = match.groups.type
  const literal = match.groups.literal
  const valueKind = scalarKind(type)
  if (!name || !type || !literal || !valueKind) return null
  const parsed = parseLiteral(literal, valueKind)
  if ('error' in parsed) return null
  return { name, type, value: parsed.value, valueKind }
}

function scalarKind(type: string): PropertyValueKind | null {
  const builtInKinds: Record<string, PropertyValueKind> = {
    String: 'string',
    Boolean: 'boolean',
    Integer: 'number',
    Natural: 'number',
    Real: 'number',
    Rational: 'number',
    Decimal: 'number',
    'ScalarValues::String': 'string',
    'ScalarValues::Boolean': 'boolean',
    'ScalarValues::Integer': 'number',
    'ScalarValues::Natural': 'number',
    'ScalarValues::Real': 'number',
    'ScalarValues::Rational': 'number',
    'ScalarValues::Decimal': 'number',
  }
  return builtInKinds[type] ?? null
}

function sourceOffset(text: string, position: { line: number; character: number }): number {
  const lines = text.split('\n')
  const lineText = lines[position.line]
  const lineLength = lineText?.endsWith('\r') ? lineText.length - 1 : lineText?.length ?? -1
  if (
    position.line < 0 ||
    position.line >= lines.length ||
    position.character < 0 ||
    position.character > lineLength
  ) {
    throw new Error('The language authority returned an invalid source range.')
  }
  let offset = position.character
  for (let line = 0; line < position.line; line += 1) {
    offset += lines[line]!.length + 1
  }
  return offset
}

function parseLiteral(literal: string, kind: PropertyValueKind): { value: string } | { error: string } {
  if (kind === 'string') {
    if (!literal.startsWith('"') || !literal.endsWith('"')) return { error: 'The current scalar string literal is not supported.' }
    try {
      const value = JSON.parse(literal) as unknown
      return typeof value === 'string' ? { value } : { error: 'The current scalar string literal is not supported.' }
    } catch {
      return { error: 'The current scalar string literal is not valid JSON.' }
    }
  }
  if (kind === 'boolean') {
    return literal === 'true' || literal === 'false'
      ? { value: literal }
      : { error: 'Boolean scalar values require true or false.' }
  }
  return roundTripsNumericLiteral(literal) ? { value: literal } : { error: 'The current scalar number cannot be represented without changing its value.' }
}

function parseScalarValue(value: string, kind: PropertyValueKind): { value: string } | { error: string } {
  if (kind === 'string') return { value }
  if (kind === 'boolean') {
    return value === 'true' || value === 'false'
      ? { value }
      : { error: 'Boolean attributes require true or false.' }
  }
  if (!Number.isFinite(Number(value)) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)) return { error: 'Number attributes require a finite numeric literal.' }
  return roundTripsNumericLiteral(value) ? { value } : { error: 'This number cannot be represented without changing its value. Enter a magnitude supported by the numeric editor.' }
}

function agreementSummary(value: InterfaceAgreementField, elements: SemanticElement[]): string {
  const label = (id: string) => elements.find((item) => item.id === id)?.qualifiedName ?? id
  return label(value.sourceId) + ' → ' + label(value.targetEndpointId) + '; ' + value.status + '; owner: ' + value.owner + '; ' + value.rationale
}
