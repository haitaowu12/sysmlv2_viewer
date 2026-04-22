/**
 * Modal dialog for confirming and customizing relationships between nodes.
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/store';

export interface RelationshipModalProps {
  isOpen: boolean;
  sourceKind: string;
  targetKind: string;
  onConfirm: (details?: string) => void;
  onCancel: () => void;
}

export default function RelationshipModal({ isOpen, sourceKind, targetKind, onConfirm, onCancel }: RelationshipModalProps) {
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDetails('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const inferRelationshipType = (): string => {
    if (sourceKind === 'PartDef' && targetKind === 'PartDef') return 'part';
    if ((sourceKind === 'StateUsage' || sourceKind === 'StateDef') && (targetKind === 'StateUsage' || targetKind === 'StateDef')) return 'transition';
    if ((sourceKind === 'RequirementDef' || sourceKind === 'RequirementUsage') && (targetKind === 'PartDef' || targetKind === 'PartUsage')) return 'satisfy';
    if ((sourceKind === 'ActionDef' || sourceKind === 'ActionUsage') && (targetKind === 'ActionDef' || targetKind === 'ActionUsage')) return 'flow';
    if ((sourceKind === 'PortDef' || sourceKind === 'PortUsage') && (targetKind === 'PortDef' || targetKind === 'PortUsage')) return 'connect';
    if ((sourceKind === 'PartDef' || sourceKind === 'PartUsage') && (targetKind === 'PortDef' || targetKind === 'PortUsage')) return 'port';
    return 'dependency';
  };

  const relType = inferRelationshipType();

  const showDetailsInput = relType === 'transition';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-elevated, #1a1830)',
          border: '1px solid var(--border-primary, #1e1b4b)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.2))',
          width: '400px',
          maxWidth: '90vw',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary, #e2e8f0)',
          }}
        >
          Create Relationship
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary, #94a3b8)',
              marginBottom: '8px',
            }}
          >
            Inferred relationship type:
          </div>
          <div
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'var(--accent-bg, rgba(99, 102, 241, 0.15))',
              color: 'var(--text-accent, #818cf8)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            «{relType}»
          </div>
        </div>

        {showDetailsInput && (
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                color: 'var(--text-secondary, #94a3b8)',
                marginBottom: '6px',
              }}
            >
              Trigger name
            </label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g., StartSignal"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--border-primary, #1e1b4b)',
                background: 'var(--bg-tertiary, #161424)',
                color: 'var(--text-primary, #e2e8f0)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '24px',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--border-primary, #1e1b4b)',
              background: 'transparent',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(details)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              border: 'none',
              background: 'var(--accent, #6366f1)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Connected wrapper that reads modal state from the store.
 */
export function RelationshipModalContainer() {
  const relationshipModal = useAppStore((s) => s.relationshipModal);
  const closeRelationshipModal = useAppStore((s) => s.closeRelationshipModal);
  const createRelationship = useAppStore((s) => s.createRelationship);

  if (!relationshipModal) return null;

  const handleConfirm = (details?: string) => {
    createRelationship(
      relationshipModal.sourceNodeId,
      relationshipModal.targetNodeId,
      relationshipModal.inferredType,
      details
    );
    closeRelationshipModal();
  };

  const handleCancel = () => {
    closeRelationshipModal();
  };

  return (
    <RelationshipModal
      isOpen={relationshipModal.isOpen}
      sourceKind=""
      targetKind=""
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
