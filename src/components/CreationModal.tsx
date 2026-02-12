/**
 * CreationModal - Popup for defining new elements on drop
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/store';
import TypeSelector from './TypeSelector';

export default function CreationModal() {
    const creationModal = useAppStore(s => s.creationModal);
    const closeCreationModal = useAppStore(s => s.closeCreationModal);
    const insertCode = useAppStore(s => s.insertCode);

    const [name, setName] = useState('');
    const [isUsage, setIsUsage] = useState(false);
    const [typeName, setTypeName] = useState('');

    // Reset state when modal opens
    useEffect(() => {
        if (creationModal && creationModal.isOpen) {
            // Extract initial name from template or kind
            // Template: "part def Part1;" -> "Part1"
            // Simple regex
            const match = creationModal.template.match(/def\s+(\w+)/);
            if (match) {
                setName(match[1]);
                setIsUsage(false);
            } else {
                // e.g. "package Package1"
                const matchPkg = creationModal.template.match(/package\s+'?(\w+)'?/);
                if (matchPkg) {
                    setName(matchPkg[1]);
                    setIsUsage(false);
                } else {
                    setName('NewElement');
                }
            }
            setTypeName('');

            // Heuristic: If dropping into a PartDef, default to Usage?
            // We don't have easy access to target node kind here without querying store.
            // But user can toggle.
        }
    }, [creationModal]);

    if (!creationModal || !creationModal.isOpen) return null;

    const handleCreate = () => {
        let finalCode = '';
        const kind = creationModal.kind.toLowerCase(); // 'part', 'action', etc.

        if (isUsage) {
            // Usage syntax: part <name> : <typeName>;
            // Action usage: action <name> : <typeName>;
            // If typeName is empty, maybe just "part <name>;"
            finalCode = `${kind} ${name}`;
            if (typeName) {
                finalCode += ` : ${typeName}`;
            }
            finalCode += ';';
        } else {
            // Definition syntax: part def <name> { } or ;
            // We use the template but replace the name
            // Template: "part def Part1;"
            // We replace "Part1" with name.
            // We need to be careful about what we replace.
            // Basic replace:
            const match = creationModal.template.match(/def\s+(\w+)/);
            if (match) {
                finalCode = creationModal.template.replace(match[1], name);
            } else {
                // Package or other
                const matchPkg = creationModal.template.match(/package\s+'?(\w+)'?/);
                if (matchPkg) {
                    finalCode = creationModal.template.replace(matchPkg[1], name);
                } else {
                    finalCode = creationModal.template; // Fallback
                }
            }
        }

        insertCode(finalCode, creationModal.targetId);
        closeCreationModal();
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div className="modal-content" style={{
                backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px',
                width: '300px', border: '1px solid var(--border-primary)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
                <h3 style={{ marginTop: 0 }}>Create {creationModal.kind}</h3>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="prop-input"
                        style={{ width: '100%' }}
                        autoFocus
                    />
                </div>

                {/* Toggle Definition vs Usage */}
                {(creationModal.kind !== 'Package') && (
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isUsage}
                                onChange={e => setIsUsage(e.target.checked)}
                            />
                            Create as Usage (Instance/Property)
                        </label>
                    </div>
                )}

                {isUsage && (
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Type</label>
                        <TypeSelector
                            value={typeName}
                            onChange={setTypeName}
                            placeholder="Select Type..."
                        />
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                    <button
                        onClick={closeCreationModal}
                        style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
