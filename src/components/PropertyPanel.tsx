/**
 * Property Panel - Shows details of the selected element
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore, getNodeId } from '../store/store';
import TypeSelector from './TypeSelector';
import { Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
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

function isValidMultiplicity(value: string): boolean {
    if (!value) return true;
    const trimmed = value.trim();
    if (trimmed === '') return true;
    return /^\[(\d+|\*)(\.\.(\d+|\*))?\]$/.test(trimmed);
}

function normalizeMultiplicity(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
    return `[${trimmed}]`;
}

function isValidName(value: string): boolean {
    if (!value || value.trim().length === 0) return false;
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value.trim());
}

const DIRECTION_OPTIONS = ['in', 'out', 'inout'] as const;
const VISIBILITY_OPTIONS = ['public', 'private', 'protected'] as const;

interface EditableValues {
    name: string;
    multiplicity: string;
    direction: string;
    visibility: string;
    redefines: string;
    subsets: string;
    defaultValue: string;
    documentation: string;
}

function getInitialEditableValues(node: SysMLNode): EditableValues {
    const nodeAny = node as any;
    const docNode = node.children.find(c => c.kind === 'Doc') as DocNode | undefined;
    return {
        name: node.name || '',
        multiplicity: nodeAny.multiplicity ? `[${nodeAny.multiplicity}]` : '',
        direction: nodeAny.direction || '',
        visibility: nodeAny.visibility || 'public',
        redefines: nodeAny.isRedefine ? 'yes' : '',
        subsets: nodeAny.subsets || '',
        defaultValue: nodeAny.defaultValue || '',
        documentation: docNode?.text || '',
    };
}

export default function PropertyPanel() {
    const selectedNode = useAppStore(s => s.selectedNode);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const updateNodeAttribute = useAppStore(s => s.updateNodeAttribute);
    const addNodeAttribute = useAppStore(s => s.addNodeAttribute);
    const deleteNodeAttribute = useAppStore(s => s.deleteNodeAttribute);
    const updateNodeProperty = useAppStore(s => s.updateNodeProperty);
    const updateNodeDoc = useAppStore(s => s.updateNodeDoc);

    const [newAttr, setNewAttr] = useState({ name: '', type: '', def: '' });
    const [validationError, setValidationError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
    const [editableValues, setEditableValues] = useState<EditableValues | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
    const lastSelectedNodeIdRef = useRef<string | null>(null);
    const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync editable values when selectedNode changes
    useEffect(() => {
        if (!selectedNode) {
            setEditableValues(null);
            lastSelectedNodeIdRef.current = null;
            setMismatchWarning(null);
            setFieldErrors({});
            return;
        }

        const currentNodeId = getNodeId(selectedNode);

        // Show visual indicator during update
        setIsUpdating(true);

        // Clear any pending timeout
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }

        // Debounce rapid consecutive selections
        updateTimeoutRef.current = setTimeout(() => {
            setEditableValues(getInitialEditableValues(selectedNode));
            lastSelectedNodeIdRef.current = currentNodeId;
            setMismatchWarning(null);
            setFieldErrors({});
            setIsUpdating(false);
        }, 50);

        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [selectedNode, selectedNodeId]);

    const clearFieldError = useCallback((field: string) => {
        setFieldErrors(prev => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    }, []);

    const setFieldError = useCallback((field: string, error: string | null) => {
        setFieldErrors(prev => ({ ...prev, [field]: error }));
    }, []);

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

    const validateNodeIdBeforeSave = useCallback((action: () => void) => {
        if (!selectedNode) return;
        const currentNodeId = getNodeId(selectedNode);
        if (lastSelectedNodeIdRef.current && lastSelectedNodeIdRef.current !== currentNodeId) {
            setMismatchWarning('Selection changed since fields were loaded. Refreshing properties...');
            setEditableValues(getInitialEditableValues(selectedNode));
            lastSelectedNodeIdRef.current = currentNodeId;
            setTimeout(() => setMismatchWarning(null), 2000);
            return;
        }
        action();
    }, [selectedNode]);

    const handlePropertyBlur = useCallback((property: keyof EditableValues, value: string) => {
        if (!selectedNode || !editableValues) return;
        const nodeId = getNodeId(selectedNode);

        validateNodeIdBeforeSave(() => {
            if (property === 'name') {
                if (!isValidName(value)) {
                    setFieldError('name', 'Invalid name. Must start with letter or underscore, use alphanumeric characters.');
                    return;
                }
            }

            if (property === 'multiplicity') {
                if (!isValidMultiplicity(value)) {
                    setFieldError('multiplicity', 'Invalid multiplicity. Use patterns like [1], [0..1], [1..*], [m..n].');
                    return;
                }
                value = normalizeMultiplicity(value);
            }

            clearFieldError(property);
            updateNodeProperty(nodeId, property, value.trim());
        });
    }, [selectedNode, editableValues, updateNodeProperty, setFieldError, clearFieldError, validateNodeIdBeforeSave]);

    const handleDocBlur = useCallback((value: string) => {
        if (!selectedNode || !editableValues) return;
        validateNodeIdBeforeSave(() => {
            updateNodeDoc(getNodeId(selectedNode), value.trim());
        });
    }, [selectedNode, editableValues, updateNodeDoc, validateNodeIdBeforeSave]);

    const handleRefreshProperties = useCallback(() => {
        if (!selectedNode) return;
        setIsUpdating(true);
        setTimeout(() => {
            setEditableValues(getInitialEditableValues(selectedNode));
            lastSelectedNodeIdRef.current = getNodeId(selectedNode);
            setMismatchWarning(null);
            setFieldErrors({});
            setIsUpdating(false);
        }, 150);
    }, [selectedNode]);

    const handleEditableChange = useCallback((field: keyof EditableValues, value: string) => {
        setEditableValues(prev => prev ? { ...prev, [field]: value } : prev);
        clearFieldError(field);
    }, [clearFieldError]);

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

    const nodeAny = selectedNode as any;
    const hasMultiplicity = 'multiplicity' in nodeAny;
    const hasDirection = 'direction' in nodeAny;
    const hasVisibility = 'visibility' in nodeAny;
    const hasDefaultValue = 'defaultValue' in nodeAny;
    const hasDoc = true;

    const canShowDirection = hasDirection || selectedNode.kind === 'PortUsage' || selectedNode.kind === 'ActionUsage' || selectedNode.kind === 'ActionDef';

    // Defensive: if editableValues is null (during transition), show loading
    if (!editableValues) {
        return (
            <div className="property-panel">
                <div className="panel-header">
                    <span className="panel-title">Properties</span>
                    <span className="panel-kind">{selectedNode.kind}</span>
                </div>
                <div className="panel-empty">
                    <p>Loading properties...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="property-panel">
            <div className="panel-header">
                <span className="panel-title">Properties</span>
                <span className="panel-kind">{selectedNode.kind}</span>
                <button
                    onClick={handleRefreshProperties}
                    disabled={isUpdating}
                    title="Refresh Properties"
                    style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        cursor: isUpdating ? 'not-allowed' : 'pointer',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        opacity: isUpdating ? 0.5 : 1,
                        transition: 'all var(--transition)',
                    }}
                >
                    <RefreshCw size={14} style={{ animation: isUpdating ? 'spin 1s linear infinite' : 'none' }} />
                </button>
            </div>

            {mismatchWarning && (
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(234, 179, 8, 0.15)',
                    borderLeft: '3px solid #eab308',
                    fontSize: '11px',
                    color: '#eab308',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <AlertTriangle size={14} />
                    {mismatchWarning}
                </div>
            )}

            {isUpdating && !mismatchWarning && (
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    fontSize: '11px',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Updating properties...
                </div>
            )}

            <div className="panel-content">
                {properties.map((prop, i) => (
                    <div key={i} className="prop-row">
                        <span className="prop-label">{prop.label}</span>
                        <span className="prop-value">{prop.value}</span>
                    </div>
                ))}

                <div className="prop-section">
                    <div className="prop-section-header">Editable Properties</div>

                    <div className="input-group">
                        <label>Name</label>
                        <input
                            value={editableValues.name}
                            onChange={(e) => handleEditableChange('name', e.target.value)}
                            onBlur={(e) => handlePropertyBlur('name', e.target.value)}
                            className="prop-input"
                        />
                        {fieldErrors['name'] && (
                            <div className="field-error">{fieldErrors['name']}</div>
                        )}
                    </div>

                    {hasMultiplicity && (
                        <div className="input-group">
                            <label>Multiplicity</label>
                            <input
                                value={editableValues.multiplicity}
                                placeholder="[1], [0..1], [1..*]"
                                onChange={(e) => handleEditableChange('multiplicity', e.target.value)}
                                onBlur={(e) => handlePropertyBlur('multiplicity', e.target.value)}
                                className="prop-input"
                            />
                            {fieldErrors['multiplicity'] && (
                                <div className="field-error">{fieldErrors['multiplicity']}</div>
                            )}
                        </div>
                    )}

                    {canShowDirection && (
                        <div className="input-group">
                            <label>Direction</label>
                            <select
                                value={editableValues.direction}
                                onChange={(e) => {
                                    handleEditableChange('direction', e.target.value);
                                    handlePropertyBlur('direction', e.target.value);
                                }}
                                className="prop-input"
                            >
                                <option value="">—</option>
                                {DIRECTION_OPTIONS.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {hasVisibility && (
                        <div className="input-group">
                            <label>Visibility</label>
                            <select
                                value={editableValues.visibility}
                                onChange={(e) => {
                                    handleEditableChange('visibility', e.target.value);
                                    handlePropertyBlur('visibility', e.target.value);
                                }}
                                className="prop-input"
                            >
                                {VISIBILITY_OPTIONS.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {'isRedefine' in nodeAny && (
                        <div className="input-group">
                            <label>Redefines</label>
                            <input
                                value={editableValues.redefines}
                                placeholder="yes or leave empty"
                                onChange={(e) => handleEditableChange('redefines', e.target.value)}
                                onBlur={(e) => handlePropertyBlur('redefines', e.target.value)}
                                className="prop-input"
                            />
                        </div>
                    )}

                    {'subsets' in nodeAny && (
                        <div className="input-group">
                            <label>Subsets</label>
                            <input
                                value={editableValues.subsets}
                                placeholder="subsetted feature"
                                onChange={(e) => handleEditableChange('subsets', e.target.value)}
                                onBlur={(e) => handlePropertyBlur('subsets', e.target.value)}
                                className="prop-input"
                            />
                        </div>
                    )}

                    {hasDefaultValue && (
                        <div className="input-group">
                            <label>Default Value</label>
                            <input
                                value={editableValues.defaultValue}
                                placeholder="value"
                                onChange={(e) => handleEditableChange('defaultValue', e.target.value)}
                                onBlur={(e) => handlePropertyBlur('defaultValue', e.target.value)}
                                className="prop-input"
                            />
                        </div>
                    )}

                    {hasDoc && (
                        <div className="input-group">
                            <label>Documentation</label>
                            <textarea
                                value={editableValues.documentation}
                                placeholder="Enter documentation..."
                                onChange={(e) => handleEditableChange('documentation', e.target.value)}
                                onBlur={(e) => handleDocBlur(e.target.value)}
                                className="prop-input"
                                rows={4}
                                style={{ resize: 'vertical', minHeight: '60px' }}
                            />
                        </div>
                    )}
                </div>

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
                                                    validateNodeIdBeforeSave(() => {
                                                        updateNodeAttribute(getNodeId(selectedNode), attr.name, { name: newName });
                                                    });
                                                }
                                            }}
                                            className="prop-input"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Type</label>
                                        <TypeSelector
                                            value={typeName}
                                            onChange={(val) => validateNodeIdBeforeSave(() => {
                                                updateNodeAttribute(getNodeId(selectedNode), attr.name, { type: val });
                                            })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Default</label>
                                        <input
                                            defaultValue={defValue}
                                            onBlur={(e) => validateNodeIdBeforeSave(() => {
                                                updateNodeAttribute(getNodeId(selectedNode), attr.name, { def: e.target.value.trim() });
                                            })}
                                            className="prop-input"
                                        />
                                    </div>
                                    <button
                                        onClick={() => validateNodeIdBeforeSave(() => {
                                            deleteNodeAttribute(getNodeId(selectedNode), attr.name);
                                        })}
                                        style={{
                                            marginTop: '14px',
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#ef4444',
                                            fontSize: '14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '4px'
                                        }}
                                        title="Delete Attribute"
                                    >
                                        <Trash2 size={16} />
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
                                type="button"
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
                                    transition: 'all var(--transition)',
                                    position: 'relative',
                                    zIndex: 1,
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
