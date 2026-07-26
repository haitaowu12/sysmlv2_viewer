import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SemanticSnapshot } from '../../packages/semantic-model/src/index.js'
import { NativeCommandEditor } from '../components/NativeCommandEditor.js'

describe('NativeCommandEditor', () => {
  it('builds a typed interconnection command without writing source', async () => {
    const proposeCommand = vi.fn().mockRejectedValue(new Error('stop after boundary'))
    const gateway = { proposeCommand, applyCommand: vi.fn() }
    render(
      <NativeCommandEditor
        gateway={gateway}
        snapshot={snapshot()}
        userId="engineer"
      />,
    )
    fireEvent.change(screen.getByLabelText('Operation'), {
      target: { value: 'connect' },
    })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'commandLink' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review model command' }))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Generate validated patch',
    }))
    expect(proposeCommand).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace',
      command: {
        kind: 'create-relationship',
        ownerId: 'owner',
        relationshipKind: 'connection',
        name: 'commandLink',
        sourceId: 'owner',
        targetId: 'right',
      },
    }))
    expect(gateway.applyCommand).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('stop after boundary')
  })
})

function snapshot(): SemanticSnapshot {
  return {
    schemaVersion: 1,
    snapshotSha256: 'before',
    workspace: {
      id: 'workspace',
      rootUri: 'file:///workspace',
      configurationName: 'default',
    },
    authority: {
      adapterId: 'qualified',
      adapterVersion: '1',
      engineName: 'qualified',
      engineVersion: '1',
      referenceRelease: '2026-05',
      qualificationStatus: 'qualified',
    },
    freshness: 'current',
    documents: [{
      uri: 'file:///workspace/model.sysml',
      languageId: 'sysml',
      sha256: 'document',
      byteLength: 1,
    }],
    elements: [
      modelElement('owner', 'System'),
      modelElement('right', 'System::right'),
    ],
    relationships: [],
  }
}

function modelElement(id: string, qualifiedName: string) {
  return {
    id,
    kind: 'Package' as const,
    rawKind: 'Package',
    name: qualifiedName.split('::').at(-1)!,
    qualifiedName,
    source: {
      uri: 'file:///workspace/model.sysml',
      workspacePath: 'model.sysml',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      documentSha256: 'document',
    },
    fingerprint: `fingerprint-${id}`,
    provenance: {
      authority: 'qualified-language-engine' as const,
      extraction: 'pilot-emf-semantic-evidence' as const,
      classification: 'engine-metaclass' as const,
      engineId: `engine-${id}`,
    },
  }
}
