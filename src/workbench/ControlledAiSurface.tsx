import { useEffect, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  CircleSlash2,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type {
  AiOperationRecord,
  AiOrchestratorStatus,
} from '../../packages/ai-orchestrator/src/index.js'
import type { SemanticElement } from '../../packages/semantic-model/src/index.js'
import type { WorkbenchGateway } from './gateway.js'

export interface ControlledAiSurfaceProps {
  gateway: WorkbenchGateway
  workspaceId: string
  userId: string
  selected?: SemanticElement
  onSelectId(identity: string): void
  onApplied(): Promise<void>
}

export function ControlledAiSurface({
  gateway,
  workspaceId,
  userId,
  selected,
  onSelectId,
  onApplied,
}: ControlledAiSurfaceProps) {
  const [status, setStatus] = useState<AiOrchestratorStatus | null>(null)
  const [audit, setAudit] = useState<AiOperationRecord[]>([])
  const [operation, setOperation] = useState<AiOperationRecord | null>(null)
  const [request, setRequest] = useState(
    selected ? `find ${selected.name}` : 'find requirement',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refreshAudit = async () => {
    setAudit(await gateway.listAiAudit(workspaceId))
  }

  useEffect(() => {
    let active = true
    void Promise.all([
      gateway.aiStatus(),
      gateway.listAiAudit(workspaceId),
    ]).then(([nextStatus, nextAudit]) => {
      if (!active) return
      setStatus(nextStatus)
      setAudit(nextAudit)
    }).catch((cause: unknown) => {
      if (active) setError(message(cause))
    })
    return () => { active = false }
  }, [gateway, workspaceId])

  const submit = async () => {
    if (!request.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await gateway.requestAi(workspaceId, {
        schemaVersion: 1,
        operationId: `AI-${crypto.randomUUID()}`,
        workspaceId,
        userRequest: request.trim(),
        requestedBy: userId,
        providerId: status?.defaultProviderId,
        at: new Date().toISOString(),
      })
      setOperation(result)
      await refreshAudit()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    if (!operation) return
    setBusy(true)
    setError('')
    try {
      const applied = await gateway.applyAi(workspaceId, {
        schemaVersion: 1,
        operationId: operation.operationId,
        workspaceId,
        approvalId: `APPROVE-${crypto.randomUUID()}`,
        approvedBy: { kind: 'user', id: userId },
        at: new Date().toISOString(),
      })
      setOperation(applied)
      await Promise.all([refreshAudit(), onApplied()])
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  const networkEnabled = status?.networkProvidersEnabled === true
  return (
    <div className="controlled-ai-surface">
      <header className="ai-hero">
        <div>
          <p className="eyebrow">CONTROLLED ASSISTANT</p>
          <h2><Bot size={22} /> Grounded model operations</h2>
          <p>
            The assistant sees bounded semantic tools, not the repository.
            Model changes remain proposals until you approve the validated patch.
          </p>
        </div>
        <div className={`network-indicator ${networkEnabled ? 'enabled' : 'offline'}`}>
          {networkEnabled ? <Network size={16} /> : <CircleSlash2 size={16} />}
          Network {networkEnabled ? 'enabled' : 'disabled'}
        </div>
      </header>

      <section className="ai-provider-strip" aria-label="AI provider policy">
        {(status?.providers ?? []).map((provider) => (
          <div key={provider.id}>
            <span className={`status-dot ${provider.enabled ? 'ready' : 'failed'}`} />
            <strong>{provider.displayName}</strong>
            <small>{provider.model} · {provider.networkAccess ? 'external' : 'local'}</small>
          </div>
        ))}
        <span><ShieldCheck size={16} /> {status?.tools.length ?? 0} narrow tools</span>
      </section>

      <section className="ai-request-card">
        <label htmlFor="controlled-ai-request">Request</label>
        <textarea
          id="controlled-ai-request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Find an element, or: rename wb:… to NewName"
        />
        <div>
          {selected && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setRequest(`rename ${selected.id} to ${selected.name}Updated`)
              }
            >
              Draft rename for selection
            </button>
          )}
          <button type="button" disabled={busy || !request.trim()} onClick={() => void submit()}>
            <Sparkles size={15} /> {busy ? 'Validating…' : 'Run grounded request'}
          </button>
        </div>
      </section>

      {error && <p role="alert" className="error-banner">{error}</p>}
      {operation && (
        <section className={`ai-operation ${operation.state}`}>
          <header>
            <div>
              <p className="eyebrow">{operation.operationId}</p>
              <h3>{operation.state === 'rejected' ? 'Rejected by policy' : operation.state === 'applied' ? 'Applied after approval' : 'Proposal ready for review'}</h3>
            </div>
            <span className={`operation-state ${operation.state}`}>
              {operation.state === 'applied' ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
              {operation.state}
            </span>
          </header>
          <p className="ai-answer">{operation.answer || 'No provider answer was accepted.'}</p>

          <div className="ai-evidence-grid">
            <section>
              <h4>Cited model identities</h4>
              {operation.citations.length === 0 && <p>None.</p>}
              {operation.citations.map((citation) => (
                <button type="button" key={citation.id} onClick={() => onSelectId(citation.id)}>
                  <strong>{citation.qualifiedName}</strong>
                  <span>{citation.kind}</span>
                </button>
              ))}
            </section>
            <section>
              <h4>Assumptions</h4>
              {operation.assumptions.length === 0 && <p>None declared.</p>}
              <ul>{operation.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
            </section>
          </div>

          {operation.validation.reasons.length > 0 && (
            <div className="ai-validation-reasons">
              <h4>Validation blockers</h4>
              <ul>{operation.validation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
          )}

          {operation.proposals.map((proposal) => (
            <section className="ai-patch-review" key={proposal.proposalId}>
              <div className="ai-patch-summary">
                <span>{proposal.envelope.command.kind}</span>
                <span>{Object.values(proposal.edits.changes).reduce((total, edits) => total + edits.length, 0)} source edits</span>
                <span>{proposal.affectedElementIds.length} affected identities</span>
                <span>{proposal.semanticDiff?.changes.length ?? 0} semantic changes</span>
              </div>
              <h4>Proposed source patch</h4>
              {Object.entries(proposal.edits.changes).map(([uri, edits]) => (
                <div className="ai-edit-file" key={uri}>
                  <strong>{new URL(uri).pathname.split('/').at(-1)}</strong>
                  {edits.map((edit, index) => (
                    <pre key={`${uri}:${index}`}>{edit.newText}</pre>
                  ))}
                </div>
              ))}
              <details>
                <summary>Deterministic validation and semantic diff</summary>
                <pre>{JSON.stringify({
                  validation: proposal.validation,
                  diagnosticsBefore: proposal.diagnosticsBefore,
                  diagnosticsAfter: proposal.diagnosticsAfter,
                  semanticDiff: proposal.semanticDiff,
                }, null, 2)}</pre>
              </details>
            </section>
          ))}

          {operation.state === 'proposed' &&
            operation.approval.required &&
            operation.validation.accepted && (
              <div className="ai-approval-bar">
                <span><ShieldCheck size={16} /> Canonical source is unchanged.</span>
                <button type="button" disabled={busy} onClick={() => void approve()}>
                  Approve and apply validated patch
                </button>
              </div>
            )}
          <footer>
            Audit: <code>{operation.audit.path}</code> · {operation.toolCalls.length} tool calls
          </footer>
        </section>
      )}

      <section className="ai-audit-list">
        <h3>Audit history <span>{audit.length}</span></h3>
        {audit.length === 0 && <p>No controlled-assistant operations recorded.</p>}
        {[...audit].reverse().slice(0, 20).map((item) => (
          <button type="button" key={item.operationId} onClick={() => setOperation(item)}>
            <span className={`operation-state ${item.state}`}>{item.state}</span>
            <strong>{item.request.userRequest}</strong>
            <small>{item.provider.displayName} · {item.request.at}</small>
          </button>
        ))}
      </section>
    </div>
  )
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Controlled AI operation failed'
}
