/**
 * Property Panel - Shows details of the selected element
 */

import { useState } from 'react';
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

    // Doc
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

export default function PropertyPanel() {
    const selectedNode = useAppStore(s => s.selectedNode);
    const updateNodeAttribute = useAppStore(s => s.updateNodeAttribute);
    const addNodeAttribute = useAppStore(s => s.addNodeAttribute);
    const deleteNodeAttribute = useAppStore(s => s.deleteNodeAttribute);

    const [newAttr, setNewAttr] = useState({ name: '', type: '', def: '' });

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

    const handleAdd = () => {
        if (!newAttr.name) return;
        addNodeAttribute(getNodeId(selectedNode), newAttr);
        setNewAttr({ name: '', type: '', def: '' });
    };

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

                {/* Attribute Editor Section */}
                {(selectedNode.kind.endsWith('Def') || selectedNode.kind === 'Package') && (
                    <div className="prop-section">
                        <div className="prop-section-header">Attributes (Editable)</div>
                        {attributeChildren.map((attr, i) => {
                            // const typedAttr = attr as PartUsage; // AttributeUsage has same structure as PartUsage in our parser types? Types say ItemUsage. Check 'typeName'.
                            // In types.ts: AttributeUsage extends ItemUsage extends PartUsage (implicit structure in TS if interfaces match).
                            // Actually types.ts defines AttributeUsage as interface extending ItemUsage. ItemUsage has typeName? No, ItemUsage definition in parser/types.ts:
                            // export interface ItemUsage extends SysMLNode { ... }
                            // But my store updates assumed typeName.
                            // Let's assume the parser populates it.

                            const typeName = (attr as any).typeName || '';
                            const defValue = (attr as any).defaultValue || '';

                            return (
                                <div key={attr.location?.start.offset || i} className="attr-edit-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '4px', marginBottom: '8px' }}>
                                    <div className="input-group">
                                        <label style={{ fontSize: '10px', color: '#888' }}>Name</label>
                                        <input
                                            defaultValue={attr.name}
                                            onBlur={(e) => updateNodeAttribute(getNodeId(selectedNode), attr.name, { name: e.target.value })}
                                            className="prop-input"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label style={{ fontSize: '10px', color: '#888' }}>Type</label>
                                        <TypeSelector
                                            value={typeName}
                                            onChange={(val) => updateNodeAttribute(getNodeId(selectedNode), attr.name, { type: val })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label style={{ fontSize: '10px', color: '#888' }}>Default</label>
                                        <input
                                            defaultValue={defValue}
                                            onBlur={(e) => updateNodeAttribute(getNodeId(selectedNode), attr.name, { def: e.target.value })}
                                            className="prop-input"
                                        />
                                    </div>
                                    <button
                                        onClick={() => deleteNodeAttribute(getNodeId(selectedNode), attr.name)}
                                        style={{ marginTop: '14px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                        title="Delete Attribute"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            );
                        })}

                        {/* Add New Attribute */}
                        <div className="attr-add-row" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '8px', marginTop: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Add Attribute</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                <input
                                    placeholder="Name"
                                    value={newAttr.name}
                                    onChange={e => setNewAttr({ ...newAttr, name: e.target.value })}
                                    className="prop-input"
                                />
                                <TypeSelector
                                    placeholder="Type"
                                    value={newAttr.type}
                                    onChange={val => setNewAttr({ ...newAttr, type: val })}
                                />
                                <input
                                    placeholder="Default"
                                    value={newAttr.def}
                                    onChange={e => setNewAttr({ ...newAttr, def: e.target.value })}
                                    className="prop-input"
                                />
                            </div>
                            <button
                                onClick={handleAdd}
                                style={{ width: '100%', marginTop: '4px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
                            >
                                Add
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
