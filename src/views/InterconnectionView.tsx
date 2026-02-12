/**
 * Interconnection View - Internal Block Diagram equivalent
 * Shows internal structure of a selected part with ports and connections
 */

import { useMemo, useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    type Node,
    type Edge,
    useNodesState,
    useEdgesState,
    useReactFlow,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, PartUsage, PortUsage, ConnectionUsage, FlowUsage } from '../parser/types';
import { SysMLDiagramNode, PortNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { findRelatedNodeIds } from '../utils/focusUtils';
import ContextMenu, { MenuItem } from '../components/ContextMenu';

const nodeTypes = {
    sysmlNode: SysMLDiagramNode,
    portNode: PortNode
};

// Helper to center view on focused node
function FocusZoom({ focusedNodeId }: { focusedNodeId: string | null }) {
    const { fitView } = useReactFlow();

    useEffect(() => {
        if (focusedNodeId) {
            fitView({ nodes: [{ id: focusedNodeId }], duration: 800, padding: 0.5 });
        }
    }, [focusedNodeId, fitView]);

    return null;
}

export default function InterconnectionView() {
    const model = useAppStore(s => s.model);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const focusedNodeId = useAppStore(s => s.focusedNodeId);
    const selectNode = useAppStore(s => s.selectNode);
    const setFocusedNode = useAppStore(s => s.setFocusedNode);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const { initialNodes, initialEdges } = useMemo(() => {
        if (!model) return { initialNodes: [], initialEdges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        const visibleNodeIds = focusedNodeId ? findRelatedNodeIds(model.children, focusedNodeId) : null;

        function findPartUsages(items: SysMLNode[]) {
            for (const item of items) {
                if ((item.kind === 'PartUsage' || item.kind === 'PartDef') && item.children.length > 0) {
                    processPartInternal(item);
                }
                if (item.kind === 'Package') {
                    findPartUsages(item.children);
                }
            }
        }

        function processPartInternal(part: SysMLNode) {
            // Container node
            const containerId = getNodeId(part);

            // Focus Filter: If container is not relevant, skip
            if (visibleNodeIds && !visibleNodeIds.has(containerId)) return;

            // Internal parts
            const internalParts = part.children.filter(c => c.kind === 'PartUsage');
            const connections = part.children.filter(c =>
                c.kind === 'ConnectionUsage' || c.kind === 'ConnectionDef'
            ) as ConnectionUsage[];

            if (internalParts.length === 0) return;

            // Add container
            nodes.push({
                id: containerId,
                type: 'sysmlNode',
                position: { x: 0, y: 0 },
                data: {
                    label: part.name,
                    kind: part.kind,
                    icon: '',
                    stereotype: `«${part.kind === 'PartDef' ? 'part def' : 'part'}»`,
                    compartments: [],
                    isSelected: containerId === selectedNodeId,
                },
            });

            for (const child of internalParts) {
                const childId = getNodeId(child);

                const childParts = child.children.filter(c => c.kind === 'PartUsage');
                const childPorts = child.children.filter(c => c.kind === 'PortUsage');

                const compartments: { label: string; items: string[] }[] = [];
                if (childParts.length > 0) {
                    compartments.push({
                        label: 'parts',
                        items: childParts.map(p => `${p.name}${(p as any).typeName ? ': ' + (p as any).typeName : ''}${(p as any).multiplicity ? '[' + (p as any).multiplicity + ']' : ''}`),
                    });
                }
                if (childPorts.length > 0) {
                    compartments.push({
                        label: 'ports',
                        items: childPorts.map(p => p.name),
                    });
                }

                nodes.push({
                    id: childId,
                    type: 'sysmlNode',
                    position: { x: 0, y: 0 },
                    data: {
                        label: `${child.name}${(child as any).typeName ? ': ' + (child as any).typeName : ''}`,
                        kind: 'PartUsage',
                        icon: '',
                        compartments,
                        isSelected: childId === selectedNodeId,
                    },
                });

                edges.push({
                    id: `${containerId}-contains->${childId}`,
                    source: containerId,
                    target: childId,
                    type: 'smoothstep',
                    style: { stroke: '#6b7280', strokeDasharray: '3,3' },
                });
            }

            // Connection edges
            for (const conn of connections) {
                if (conn.source && conn.target) {
                    const sourceParts = conn.source.split('.');
                    const targetParts = conn.target.split('.');

                    const sourceNode = internalParts.find(p => p.name === sourceParts[0]);
                    const targetNode = internalParts.find(p => p.name === targetParts[0]);

                    if (sourceNode && targetNode) {
                        edges.push({
                            id: `conn_${conn.name}`,
                            source: getNodeId(sourceNode),
                            target: getNodeId(targetNode),
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { stroke: '#10b981', strokeWidth: 2 },
                            label: conn.typeName || '',
                            labelStyle: { fontSize: 10, fill: '#6ee7b7' },
                            animated: true,
                        });
                    }
                }
            }
        }

        findPartUsages(model.children);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'LR', nodeSpacing: 80, rankSpacing: 120 });
            return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
        }

        return { initialNodes: nodes, initialEdges: edges };
    }, [model, selectedNodeId, focusedNodeId]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        selectNode(node.id);
    }, [selectNode]);

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
        });
    }, []);

    return (
        <div className="diagram-container">
            <ReactFlow
                nodes={nodes}
                edges={edgesState}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={20} size={1} color="var(--grid-color)" />
                <Controls />
                <MiniMap nodeColor={() => '#10b981'} />
                <FocusZoom focusedNodeId={focusedNodeId} />
            </ReactFlow>

            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
                    <MenuItem
                        onClick={() => {
                            setFocusedNode(contextMenu.nodeId);
                            closeContextMenu();
                        }}
                        icon="🔍"
                    >
                        Focus This Item
                    </MenuItem>
                </ContextMenu>
            )}
        </div>
    );
}
