import { useMemo, useState } from 'react'
import type { CommandEnvelope } from '../../packages/command-engine/src/index.js'
import type { SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import {
  CommandReviewPanel,
  type CommandReviewGateway,
} from './CommandReviewPanel.js'

export interface NativeCommandEditorProps {
  gateway: CommandReviewGateway
  snapshot: SemanticSnapshot
  userId: string
  onApplied?: () => void
}

export function NativeCommandEditor({
  gateway,
  snapshot,
  userId,
  onApplied,
}: NativeCommandEditorProps) {
  const [operation, setOperation] = useState<'create-port' | 'connect'>('create-port')
  const [ownerId, setOwnerId] = useState(snapshot.elements[0]?.id ?? '')
  const [sourceId, setSourceId] = useState(snapshot.elements[0]?.id ?? '')
  const [targetId, setTargetId] = useState(snapshot.elements[1]?.id ?? '')
  const [name, setName] = useState('newPort')
  const [envelope, setEnvelope] = useState<CommandEnvelope | null>(null)
  const elements = useMemo(
    () => [...snapshot.elements].sort((left, right) =>
      left.qualifiedName.localeCompare(right.qualifiedName)),
    [snapshot.elements],
  )

  const buildCommand = () => {
    const base = {
      schemaVersion: 1 as const,
      commandId: `command:${crypto.randomUUID()}`,
      workspaceId: snapshot.workspace.id,
      baseSnapshotSha256: snapshot.snapshotSha256,
      baseDocuments: Object.fromEntries(
        snapshot.documents.map((document) => [document.uri, document.sha256]),
      ),
      requestedBy: { kind: 'user' as const, id: userId },
    }
    setEnvelope({
      ...base,
      command: operation === 'create-port'
        ? {
            kind: 'create-element',
            ownerId,
            elementKind: 'PortUsage',
            name,
          }
        : {
            kind: 'create-relationship',
            ownerId,
            relationshipKind: 'connection',
            name,
            sourceId,
            targetId,
          },
    })
  }

  return (
    <section aria-label="Native model editor">
      <h2>Native model edit</h2>
      <label>
        Operation
        <select
          value={operation}
          onChange={(event) => setOperation(event.target.value as typeof operation)}
        >
          <option value="create-port">Create port</option>
          <option value="connect">Connect elements</option>
        </select>
      </label>
      <label>
        Owner
        <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          {elements.map((element) => (
            <option key={element.id} value={element.id}>{element.qualifiedName}</option>
          ))}
        </select>
      </label>
      {operation === 'connect' && (
        <>
          <label>
            Source
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              {elements.map((element) => (
                <option key={element.id} value={element.id}>{element.qualifiedName}</option>
              ))}
            </select>
          </label>
          <label>
            Target
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {elements.map((element) => (
                <option key={element.id} value={element.id}>{element.qualifiedName}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="button" onClick={buildCommand} disabled={!ownerId || !name}>
        Review source patch
      </button>
      {envelope && (
        <CommandReviewPanel
          key={envelope.commandId}
          gateway={gateway}
          envelope={envelope}
          approvalUserId={userId}
          onApplied={onApplied}
        />
      )}
    </section>
  )
}
