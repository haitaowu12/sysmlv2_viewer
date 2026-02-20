/**
 * Property Panel - Shows details of the selected element
 */

import { useState, useCallback } from 'react';
import { useAppStore, getNodeId } from '../store/store';
import TypeSelector from './TypeSelector';
import type { SysMLNode, DocNode } from '../parser/types';

function getPropertiesForNode(node: SysMLNode): { label: string; value: string }[] {
    const props: { label: string; value: string }[] = [
        { label: 'Name', value: node.name },
        { label: 'Kind', value: node.kind },
    ];

    if (node.shortName) {
        props.push({ label: 'Short Name', value: node.shortName });
    }

    if (node.visibility) {
        props.push({ label: 'Visibility', value: node.visibility });
    }

    if ('typeName' in node && (node as any).typeName) {
        props.push({ label: 'Type', value: (node as any).typeName });
    }

    if ('superTypes' in node && (node as any).superTypes?.length) {
        props.push({ label: 'Specializes', value: (node as any).superTypes.join(', ') });
    }

    if ('multiplicity' in node && (node as any).multiplicity) {
        props.push({ label: 'Multiplicity', value: `[${(node as any).multiplicity}]` });
    }

    if ('isRedefine' in node && (node as any).isRedefine) {
        props.push({ label: 'Redefines', value: 'yes' });
    }

    if ('direction' in node && (node as any).direction) {
        props.push({ label: 'Direction', value: (node as any).direction });
    }

    if ('expression' in node && (node as any).expression) {
        props.push({ label: 'Expression', value: (node as any).expression });
    }

    if ('source' in node && (node as any).source) {
        props.push({ label: 'Source', value: (node as any).source });
    }

    if ('target' in node && (node as any).target) {
        props.push({ label: 'Target', value: (node as any).target });
    }

    if ('trigger' in node && (node as any).trigger) {
        props.push({ label: 'Trigger', value: (node as any).trigger });
    }

    if ('defaultValue' in node && (node as any).defaultValue) {
        props.push({ label: 'Default Value', value: (node as any).defaultValue });
    }

    if ('viewpoint' in node && (node as any).viewpoint) {
        props.push({ label: 'Viewpoint', value: (node as any).viewpoint });
    }

    if ('concerns' in node && (node as any).concerns?.length) {
        props.push({ label: 'Concerns', value: (node as any).concerns.join(', ') });
    }

    const doc = node.children.find(c => c.kind === 'Doc') as DocNode | undefined;
    if (doc) {
        props.push({ label: 'Documentation', value: doc.text });
    }

    if (node.location) {
        props.push({ label: 'Location', value: `Line ${node.location.start.line}:${node.location.start.column}` });
    }

    props.push({ label: 'Children', value: String(node.children.length) });

    return props;
}

function isValidAttributeName(name: string): boolean {
    if (!name || name.trim().length === 0) return false;
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim());
}

export default function PropertyPanel() {
    const selectedNode = useAppStore(s => s.selectedNode);
    const updateNodeAttribute = useAppStore(s => s.updateNodeAttribute);
    const addNodeAttribute = useAppStore(s => s.addNodeAttribute);
    const deleteNodeAttribute = useAppStore(s => s.deleteNodeAttribute);

    const [newAttr, setNewAttr] = useState({ name: '', type: '', def: '' });
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleAddAttribute = useCallback(() => {
        if (!selectedNode) return;

        const trimmedName = newAttr.name.trim();

        if (!trimmedName) {
            setValidationError('Attribute name is required');
            return;
        }

        if (!isValidAttributeName(trimmedName)) {
            setValidationError('Invalid attribute name. Use letters, numbers, and underscores only. Must start with a letter or underscore.');
            return;
        }

        const existingAttr = selectedNode.children.find(
            c => c.kind === 'AttributeUsage' && c.name === trimmedName
        );
        if (existingAttr) {
            setValidationError('An attribute with this name already exists');
            return;
        }

        setValidationError(null);
        addNodeAttribute(getNodeId(selectedNode), {
            name: trimmedName,
            type: newAttr.type.trim() || undefined,
            def: newAttr.def.trim() || undefined,
        });
        setNewAttr({ name: '', type: '', def: '' });
    }, [selectedNode, newAttr, addNodeAttribute]);

    const handleNameChange = useCallback((value: string) => {
        setNewAttr(prev => ({ ...prev, name: value }));
        if (validationError) {
            setValidationError(null);
        }
    }, [validationError]);

    if (!selectedNode) {
        return (
            <div className="property-panel">
                <div className="panel-header">
                    <span className="panel-title">Properties</span>
                </div>
                <div className="panel-empty">
                    <p>No element selected</p>
                    <p className="hint">Click an element in the diagram or model explorer</p>
                </div>
            </div>
        );
    }

    const properties = getPropertiesForNode(selectedNode);
    const attributeChildren = selectedNode.children.filter(c => c.kind === 'AttributeUsage');
    const canEditAttributes = selectedNode.kind.endsWith('Def') || selectedNode.kind === 'Package';

    return (
        <div className="property-panel">
            <div className="panel-header">
                <span className="panel-title">Properties</span>
                <span className="panel-kind">{selectedNode.kind}</span>
            </div>
            <div className="panel-content">
                {properties.map((prop, i) => (
                    <div key={i} className="prop-row">
                        <span className="prop-label">{prop.label}</span>
                        <span className="prop-value">{prop.value}</span>
                    </div>
                ))}

                {canEditAttributes && (
                    <div className="prop-section">
                        <div className="prop-section-header">Attributes ({attributeChildren.length})</div>
                        {attributeChildren.map((attr, i) => {
                            const typeName = (attr as any).typeName || '';
                            const defValue = (attr as any).defaultValue || '';

                            return (
                                <div key={attr.location?.start.offset || i} className="attr-edit-row">
                                    <div className="input-group">
                                        <label>Name</label>
                                        <input
                                            defaultValue={attr.name}
                                            onBlur={(e) => {
                                                const newName = e.target.value.trim();
                                                if (newName && newName !== attr.name && isValidAttributeName(newName)) {
                                                    updateNodeAttribute(getNodeId(selectedNode), attr.name, { name: newName });
                                                }
                                            }}
                                            className="prop-input"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Type</label>
                                        <TypeSelector
                                            value={typeName}
                                            onChange={(val) => updateNodeAttribute(getNodeId(selectedNode), attr.name, { type: val })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Default</label>
                                        <input
                                            defaultValue={defValue}
                                            onBlur={(e) => updateNodeAttribute(getNodeId(selectedNode), attr.name, { def: e.target.value.trim() })}
                                            className="prop-input"
                                        />
                                    </div>
                                    <button
                                        onClick={() => deleteNodeAttribute(getNodeId(selectedNode), attr.name)}
                                        style={{
                                            marginTop: '14px',
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#ef4444',
                                            fontSize: '14px'
                                        }}
                                        title="Delete Attribute"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            );
                        })}

                        <div className="attr-add-row">
                            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>Add New Attribute</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                <div className="input-group">
                                    <label>Name *</label>
                                    <input
                                        placeholder="attributeName"
                                        value={newAttr.name}
                                        onChange={e => handleNameChange(e.target.value)}
                                        className="prop-input"
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Type</label>
                                    <TypeSelector
                                        placeholder="Type..."
                                        value={newAttr.type}
                                        onChange={val => setNewAttr({ ...newAttr, type: val })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Default</label>
                                    <input
                                        placeholder="value"
                                        value={newAttr.def}
                                        onChange={e => setNewAttr({ ...newAttr, def: e.target.value })}
                                        className="prop-input"
                                    />
                                </div>
                            </div>
                            {validationError && (
                                <div style={{
                                    fontSize: '11px',
                                    color: 'var(--error)',
                                    marginTop: '4px',
                                    padding: '4px 8px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: 'var(--radius-sm)'
                                }}>
                                    {validationError}
                                </div>
                            )}
                            <button
                                onClick={handleAddAttribute}
                                disabled={!newAttr.name.trim()}
                                style={{
                                    width: '100%',
                                    marginTop: '8px',
                                    background: newAttr.name.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                                    color: newAttr.name.trim() ? 'white' : 'var(--text-muted)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '6px',
                                    cursor: newAttr.name.trim() ? 'pointer' : 'not-allowed',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    transition: 'all var(--transition)'
                                }}
                            >
                                Add Attribute
                            </button>
                        </div>
                    </div>
                )}

                {selectedNode.children.length > 0 && (
                    <div className="prop-section">
                        <div className="prop-section-header">All Children ({selectedNode.children.length})</div>
                        {selectedNode.children.slice(0, 20).map((child, i) => (
                            <div key={i} className="child-item">
                                <span className="child-kind">{child.kind}</span>
                                <span className="child-name">{child.name}</span>
                            </div>
                        ))}
                        {selectedNode.children.length > 20 && (
                            <div className="child-more">... and {selectedNode.children.length - 20} more</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
