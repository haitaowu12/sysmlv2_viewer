import { useState } from 'react'
import type {
  AppliedCommandReceipt,
  ApplyCommandApproval,
  CommandEnvelope,
  CommandProposal,
} from '../../packages/command-engine/src/index.js'

export interface CommandReviewGateway {
  proposeCommand(envelope: CommandEnvelope): Promise<CommandProposal>
  applyCommand(approval: ApplyCommandApproval): Promise<AppliedCommandReceipt>
}

export interface CommandReviewPanelProps {
  gateway: CommandReviewGateway
  envelope: CommandEnvelope
  approvalUserId: string
  onApplied?: (receipt: AppliedCommandReceipt) => void
}

export function CommandReviewPanel({
  gateway,
  envelope,
  approvalUserId,
  onApplied,
}: CommandReviewPanelProps) {
  const [proposal, setProposal] = useState<CommandProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<AppliedCommandReceipt | null>(null)

  const propose = async () => {
    setBusy(true)
    setError('')
    try {
      setProposal(await gateway.proposeCommand(envelope))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Command proposal failed')
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    if (!proposal) return
    setBusy(true)
    setError('')
    try {
      const applied = await gateway.applyCommand({
        workspaceId: envelope.workspaceId,
        proposalId: proposal.proposalId,
        approvalId: `approval:${crypto.randomUUID()}`,
        approvedBy: { kind: 'user', id: approvalUserId },
      })
      setReceipt(applied)
      onApplied?.(applied)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Command approval failed')
    } finally {
      setBusy(false)
    }
  }

  const canApprove = Boolean(
    proposal?.validation.state === 'validated' &&
    proposal.conflicts.length === 0 &&
    !receipt,
  )

  return (
    <section aria-label="Command review" className="command-review-panel">
      <header>
        <h2>Source patch review</h2>
        <p>{envelope.command.kind}</p>
      </header>
      {!proposal && (
        <button type="button" onClick={() => void propose()} disabled={busy}>
          Generate validated patch
        </button>
      )}
      {proposal && (
        <>
          <dl>
            <dt>Validation</dt>
            <dd>{proposal.validation.state}</dd>
            <dt>Edit profile</dt>
            <dd>{proposal.editProfile.id}@{proposal.editProfile.version}</dd>
            <dt>Affected elements</dt>
            <dd>{proposal.affectedElementIds.join(', ') || 'none'}</dd>
          </dl>
          <details open>
            <summary>Proposed source edits</summary>
            <pre>{JSON.stringify(proposal.edits, null, 2)}</pre>
          </details>
          <details>
            <summary>Semantic diff</summary>
            <pre>{JSON.stringify(proposal.semanticDiff, null, 2)}</pre>
          </details>
          <details>
            <summary>Diagnostics after</summary>
            <pre>{JSON.stringify(proposal.diagnosticsAfter, null, 2)}</pre>
          </details>
          {proposal.conflicts.length > 0 && (
            <ul aria-label="Command conflicts">
              {proposal.conflicts.map((conflict) => (
                <li key={`${conflict.code}:${conflict.message}`}>
                  {conflict.code}: {conflict.message}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void approve()}
            disabled={!canApprove || busy}
          >
            Approve and apply
          </button>
        </>
      )}
      {receipt && <p role="status">Applied transaction {receipt.transaction.transactionId}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
