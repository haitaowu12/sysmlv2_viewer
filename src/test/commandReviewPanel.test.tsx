import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  AppliedCommandReceipt,
  CommandEnvelope,
  CommandProposal,
} from '../../packages/command-engine/src/index.js'
import { CommandReviewPanel } from '../components/CommandReviewPanel.js'

describe('CommandReviewPanel', () => {
  it('never applies before a validated proposal and explicit approval', async () => {
    const envelope = commandEnvelope()
    const proposal = commandProposal(envelope)
    const receipt = appliedReceipt(proposal)
    const gateway = {
      proposeCommand: vi.fn().mockResolvedValue(proposal),
      applyCommand: vi.fn().mockResolvedValue(receipt),
    }
    render(
      <CommandReviewPanel
        gateway={gateway}
        envelope={envelope}
        approvalUserId="engineer"
      />,
    )

    expect(gateway.applyCommand).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate validated patch' }))
    await screen.findByText('validated')
    expect(gateway.applyCommand).not.toHaveBeenCalled()
    expect(screen.getByText(/qualificationPort/u)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve and apply' }))
    await waitFor(() => expect(gateway.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: proposal.proposalId,
        approvedBy: { kind: 'user', id: 'engineer' },
      }),
    ))
    expect(await screen.findByRole('status')).toHaveTextContent(
      receipt.transaction.transactionId,
    )
  })
})

function commandEnvelope(): CommandEnvelope {
  return {
    schemaVersion: 1,
    commandId: 'CMD-UI-001',
    workspaceId: 'workspace',
    baseSnapshotSha256: 'before',
    baseDocuments: { 'file:///workspace/model.sysml': 'hash' },
    requestedBy: { kind: 'user', id: 'engineer' },
    command: {
      kind: 'create-element',
      ownerId: 'owner',
      elementKind: 'PortUsage',
      name: 'qualificationPort',
    },
  }
}

function commandProposal(envelope: CommandEnvelope): CommandProposal {
  return {
    schemaVersion: 1,
    proposalId: 'proposal:ui',
    commandId: envelope.commandId,
    state: 'proposed',
    envelope,
    edits: {
      changes: {
        'file:///workspace/model.sysml': [{
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 0 },
          },
          newText: 'port qualificationPort;\n',
        }],
      },
    },
    affectedElementIds: ['owner'],
    diagnosticsBefore: [],
    diagnosticsAfter: [],
    semanticDiff: {
      beforeSnapshotSha256: 'before',
      afterSnapshotSha256: 'after',
      changes: [],
    },
    conflicts: [],
    approval: { required: true, approved: false },
    undo: { changes: {} },
    authority: {
      adapterId: 'qualified',
      adapterVersion: '1',
      engineName: 'qualified',
      engineVersion: '1',
      referenceRelease: '2026-05',
      qualificationStatus: 'qualified',
    },
    editProfile: { id: 'structured-source-edits', version: '1.0.0' },
    validation: { state: 'validated' },
  }
}

function appliedReceipt(proposal: CommandProposal): AppliedCommandReceipt {
  return {
    schemaVersion: 1,
    state: 'applied',
    proposalId: proposal.proposalId,
    commandId: proposal.commandId,
    approval: {
      approvalId: 'approval:test',
      approvedBy: { kind: 'user', id: 'engineer' },
    },
    transaction: {
      schemaVersion: 1,
      transactionId: 'command-ui',
      state: 'FINALIZED',
      files: [],
      completedPaths: [],
    },
    appliedSnapshotSha256: 'after',
    appliedAt: '2026-07-25T00:00:00.000Z',
    undo: {
      baseSnapshotSha256: 'after',
      baseDocuments: {},
      edits: proposal.undo,
    },
  }
}
