/**
 * Interconnection View - Internal Block Diagram equivalent
 * Shows internal structure of a selected part with ports and connections
 */

import { useMemo, useCallback, useState } from 'react';
import { type Node, type Edge, MarkerType, type Connection } from '@xyflow/react';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, ConnectionUsage } from '../parser/types';
import { SysMLDiagramNode, PortNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { buildRelationshipEdges } from '../utils/relationshipEdges';
import { findRelatedNodeIds } from '../utils/focusUtils';
import DiagramView from '../components/DiagramView';
import ContextMenu, { MenuItem } from '../components/ContextMenu';
import { Focus } from 'lucide-react';

const nodeTypes = {
    sysmlNode: SysMLDiagramNode,
    portNode: PortNode
};

export default function InterconnectionView() {
    const model = useAppStore(s => s.model);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const focusedNodeId = useAppStore(s => s.focusedNodeId);
    const selectNode = useAppStore(s => s.selectNode);
    const setFocusedNode = useAppStore(s => s.setFocusedNode);
    const createRelationship = useAppStore(s => s.createRelationship);

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
            const containerId = getNodeId(part);

            if (visibleNodeIds && !visibleNodeIds.has(containerId)) return;

            const internalParts = part.children.filter(c => c.kind === 'PartUsage');
            const connections = part.children.filter(c =>
                c.kind === 'ConnectionUsage' || c.kind === 'ConnectionDef'
            ) as ConnectionUsage[];

            if (internalParts.length === 0) return;

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
                connectable: true,
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
                    connectable: true,
                });

                edges.push({
                    id: `${containerId}-contains->${childId}`,
                    source: containerId,
                    target: childId,
                    type: 'smoothstep',
                    style: { stroke: '#6b7280', strokeDasharray: '3,3' },
                });
            }

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

        const nodeIds = new Set(nodes.map(n => n.id));
        const relEdges = buildRelationshipEdges(model, nodeIds);
        edges.push(...relEdges);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'LR', nodeSpacing: 80, rankSpacing: 120, edgeRouting: true });
            return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
        }

        return { initialNodes: nodes, initialEdges: edges };
    }, [model, selectedNodeId, focusedNodeId]);

    const handleNodeClick = useCallback((nodeId: string) => {
        selectNode(nodeId);
    }, [selectNode]);

    const handleNodeContextMenu = useCallback((event: React.MouseEvent, nodeId: string) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
    }, []);

    const handleConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return;
        createRelationship(String(connection.source), String(connection.target));
    }, [createRelationship]);

    return (
        <>
            <DiagramView
                nodes={initialNodes}
                edges={initialEdges}
                nodeTypes={nodeTypes}
                focusedNodeId={focusedNodeId}
                onNodeClick={handleNodeClick}
                onNodeContextMenu={handleNodeContextMenu}
                onConnect={handleConnect}
                emptyTitle="No interconnections to display"
                emptyDescription="The Interconnection view shows internal structure with ports and connections."
                minimapNodeColor={() => '#10b981'}
            />
            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
                    <MenuItem
                        onClick={() => {
                            setFocusedNode(contextMenu.nodeId);
                            closeContextMenu();
                        }}
                        icon={Focus}
                    >
                        Focus This Item
                    </MenuItem>
                </ContextMenu>
            )}
        </>
    );
}
