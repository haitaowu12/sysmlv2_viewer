/**
 * Custom ReactFlow node for SysML elements
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface SysMLNodeData {
    label: string;
    kind: string;
    icon: string;
    stereotype?: string;
    compartments?: { label: string; items: string[] }[];
    isSelected?: boolean;
    doc?: string;
    [key: string]: unknown;
}

export const SysMLDiagramNode = memo(function SysMLDiagramNode({ data }: NodeProps) {
    const d = data as unknown as SysMLNodeData;
    const kindColors: Record<string, string> = {
        Package: '#6366f1',
        PartDef: '#3b82f6',
        PartUsage: '#60a5fa',
        PortDef: '#f59e0b',
        PortUsage: '#fbbf24',
        ConnectionDef: '#10b981',
        ActionDef: '#8b5cf6',
        ActionUsage: '#a78bfa',
        StateDef: '#ec4899',
        StateUsage: '#f472b6',
        RequirementDef: '#ef4444',
        RequirementUsage: '#f87171',
        ConstraintDef: '#14b8a6',
        AttributeDef: '#64748b',
        ItemDef: '#06b6d4',
        EnumDef: '#84cc16',
    };

    const bgColor = kindColors[d.kind] || '#6b7280';

    return (
        <div className={`sysml-node ${d.isSelected ? 'selected' : ''}`}
            style={{ borderColor: bgColor }}>
            <Handle type="target" position={Position.Top} className="node-handle" />

            <div className="node-header" style={{ backgroundColor: bgColor }}>
                <span className="node-stereotype">
                    {d.stereotype || `«${d.kind.replace(/Def$|Usage$/, '')}»`}
                </span>
                <span className="node-label">{d.label}</span>
            </div>

            {d.compartments && d.compartments.length > 0 && (
                <div className="node-body">
                    {d.compartments.map((comp, i) => (
                        <div key={i} className="node-compartment">
                            {comp.label && <div className="compartment-label">{comp.label}</div>}
                            {comp.items.map((item, j) => (
                                <div key={j} className="compartment-item">{item}</div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {d.doc && (
                <div className="node-doc">
                    <span className="doc-icon">📖</span>
                    <span className="doc-text">{d.doc}</span>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="node-handle" />
        </div>
    );
});

// State node - rounded corners
export const StateNode = memo(function StateNode({ data }: NodeProps) {
    const d = data as unknown as SysMLNodeData;

    return (
        <div className={`sysml-node state-node ${d.isSelected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} className="node-handle" />
            <div className="state-header">
                <span className="node-label">{d.label}</span>
            </div>
            {d.compartments && d.compartments.length > 0 && (
                <div className="node-body">
                    {d.compartments.map((comp, i) => (
                        <div key={i} className="node-compartment">
                            {comp.items.map((item, j) => (
                                <div key={j} className="compartment-item">{item}</div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className="node-handle" />
        </div>
    );
});

// Initial/Final pseudo-state
export const PseudoStateNode = memo(function PseudoStateNode({ data }: NodeProps) {
    const d = data as unknown as SysMLNodeData;
    const isFinal = d.kind === 'final';

    return (
        <div className={`pseudo-state-node ${isFinal ? 'final' : 'initial'}`}>
            <Handle type="target" position={Position.Top} className="node-handle" />
            {isFinal && <div className="inner-circle" />}
            <Handle type="source" position={Position.Bottom} className="node-handle" />
        </div>
    );
});

// Action node - rounded rectangle
export const ActionNode = memo(function ActionNode({ data }: NodeProps) {
    const d = data as unknown as SysMLNodeData;

    return (
        <div className={`sysml-node action-node ${d.isSelected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} className="node-handle" />
            <Handle type="target" position={Position.Left} id="left" className="node-handle" />
            <div className="action-header">
                <span className="node-stereotype">«action»</span>
                <span className="node-label">{d.label}</span>
            </div>
            {d.compartments && d.compartments.length > 0 && (
                <div className="node-body">
                    {d.compartments.map((comp, i) => (
                        <div key={i} className="node-compartment">
                            {comp.items.map((item, j) => (
                                <div key={j} className="compartment-item">{item}</div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className="node-handle" />
            <Handle type="source" position={Position.Right} id="right" className="node-handle" />
        </div>
    );
});

// Requirement node
export const RequirementNode = memo(function RequirementNode({ data }: NodeProps) {
    const d = data as unknown as SysMLNodeData;

    return (
        <div className={`sysml-node requirement-node ${d.isSelected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} className="node-handle" />
            <div className="requirement-header">
                <span className="node-stereotype">
                    {d.stereotype || '«requirement»'}
                </span>
                <span className="node-label">{d.label}</span>
            </div>
            {d.doc && (
                <div className="requirement-body">
                    <div className="requirement-text">{d.doc}</div>
                </div>
            )}
            {d.compartments && d.compartments.length > 0 && (
                <div className="node-body">
                    {d.compartments.map((comp, i) => (
                        <div key={i} className="node-compartment">
                            {comp.items.map((item, j) => (
                                <div key={j} className="compartment-item">{item}</div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className="node-handle" />
        </div>
    );
});
// Port node - small square
export const PortNode = memo(function PortNode({ data }: NodeProps) {
    const d = data as unknown as SysMLNodeData;
    return (
        <div className={`port-node ${d.isSelected ? 'selected' : ''}`}>
            <Handle type="target" position={Position.Top} className="node-handle" />
            <div className="port-label">{d.label}</div>
            <Handle type="source" position={Position.Bottom} className="node-handle" />
        </div>
    );
});
