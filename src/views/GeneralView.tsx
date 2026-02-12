/**
 * General View - Block Definition Diagram equivalent
 * Shows part definitions, their properties, and relationships (specialization, composition)
 */

import { useMemo, useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    useReactFlow,
    type Node,
    type Edge,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, PartDef, PartUsage, PortDef, ItemDef } from '../parser/types';
import { SysMLDiagramNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { findRelatedNodeIds } from '../utils/focusUtils';
import ContextMenu, { MenuItem } from '../components/ContextMenu';

const nodeTypes = { sysmlNode: SysMLDiagramNode };

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

export default function GeneralView() {
    const model = useAppStore(s => s.model);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const focusedNodeId = useAppStore(s => s.focusedNodeId);
    const hiddenAttributes = useAppStore(s => s.hiddenAttributes);
    const selectNode = useAppStore(s => s.selectNode);
    const setFocusedNode = useAppStore(s => s.setFocusedNode);
    const toggleAttributeVisibility = useAppStore(s => s.toggleAttributeVisibility);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

    // Close context menu on click outside is handled by ContextMenu component now
    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const { initialNodes, initialEdges } = useMemo(() => {
        if (!model) return { initialNodes: [], initialEdges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const processed = new Set<string>();

        // Find node helper
        const findNode = (id: string, list: SysMLNode[]): SysMLNode | null => {
            for (const n of list) {
                if (getNodeId(n) === id) return n;
                const found = findNode(id, n.children);
                if (found) return found;
            }
            return null;
        };

        const visibleNodeIds = focusedNodeId ? findRelatedNodeIds(model.children, focusedNodeId) : null;

        function processNode(node: SysMLNode, parentId?: string) {
            const nodeId = getNodeId(node);

            // Focus Filter
            if (visibleNodeIds && !visibleNodeIds.has(nodeId)) {
                // If this node is NOT visible, check if we should still process children?
                // findRelatedNodeIds includes descendants. So no need to check further if not in set.
                // However, we must ensure 'parentId' is valid.
                // If parent is NOT in set, but child IS (e.g. focusing on child?), relatedIds includes descendants.
                // If focusing on child, parent is included. 
                // So if node is not in set, skip it entirely.
                return;
            }

            if (processed.has(nodeId)) return;
            processed.add(nodeId);

            const isDefNode = node.kind.endsWith('Def') || node.kind === 'Package';

            if (isDefNode || node.kind === 'PartUsage' || node.kind === 'ItemUsage') {
                const compartments: { label: string; items: string[] }[] = [];

                // Properties compartment - ONLY if not hidden
                if (!hiddenAttributes[nodeId]) {
                    const props = node.children.filter(c =>
                        c.kind === 'AttributeUsage' || c.kind === 'PartUsage' || c.kind === 'PortUsage'
                    );
                    if (props.length > 0) {
                        compartments.push({
                            label: 'properties',
                            items: props.map(p => {
                                const typed = (p as PartUsage).typeName ? ` : ${(p as PartUsage).typeName}` : '';
                                const mult = (p as PartUsage).multiplicity ? `[${(p as PartUsage).multiplicity}]` : '';
                                return `${p.name}${typed}${mult}`;
                            }),
                        });
                    }
                }

                // Ports compartment
                const ports = node.children.filter(c => c.kind === 'PortDef' || c.kind === 'PortUsage');
                if (ports.length > 0) {
                    compartments.push({
                        label: 'ports',
                        items: ports.map(p => p.name),
                    });
                }

                nodes.push({
                    id: nodeId,
                    type: 'sysmlNode',
                    position: { x: 0, y: 0 },
                    data: {
                        label: node.name,
                        kind: node.kind,
                        icon: '',
                        compartments,
                        isSelected: nodeId === selectedNodeId,
                    },
                });

                if (parentId) {
                    edges.push({
                        id: `${parentId}->${nodeId}`,
                        source: parentId,
                        target: nodeId,
                        type: 'smoothstep',
                        markerStart: { type: MarkerType.ArrowClosed },
                        style: { stroke: '#6b7280' },
                        label: '',
                    });
                }

                // Specialization edges
                if ('superTypes' in node) {
                    const superTypes = (node as PartDef | PortDef | ItemDef).superTypes;
                    for (const sup of superTypes) {
                        const supId = `PartDef_${sup}`;
                        edges.push({
                            id: `${nodeId}--specializes-->${supId}`,
                            source: nodeId,
                            target: supId,
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.Arrow },
                            style: { stroke: '#a78bfa', strokeDasharray: '5,5' },
                            label: '«specializes»',
                            labelStyle: { fontSize: 10 },
                        });
                    }
                }

                for (const child of node.children) {
                    if (child.kind.endsWith('Def') || child.kind === 'Package') {
                        processNode(child, nodeId);
                    }
                }
            }
        }

        // If focused, we still iterate from root but filter inside processNode
        // Or better: Iterate visibleNodeIds if available?
        // But we need structure (parent-child edges).
        // Safest: Iterate model tree and filter.

        for (const child of model.children) {
            processNode(child);
            if (child.kind === 'Package') {
                for (const grand of child.children) {
                    processNode(grand, getNodeId(child));
                }
            }
        }

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'TB', nodeSpacing: 80, rankSpacing: 100 });
            return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
        }

        return { initialNodes: nodes, initialEdges: edges };
    }, [model, selectedNodeId, focusedNodeId, hiddenAttributes]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        selectNode(String(node.id));
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
                <MiniMap
                    nodeStrokeWidth={3}
                    nodeColor={(n) => {
                        const d = n.data as any;
                        return d?.kind === 'Package' ? '#6366f1' : '#3b82f6';
                    }}
                />
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
                    <MenuItem
                        onClick={() => {
                            toggleAttributeVisibility(contextMenu.nodeId);
                            closeContextMenu();
                        }}
                        icon={hiddenAttributes[contextMenu.nodeId] ? '👁️' : '🚫'}
                    >
                        {hiddenAttributes[contextMenu.nodeId] ? 'Show Attributes' : 'Hide Attributes'}
                    </MenuItem>
                </ContextMenu>
            )}
        </div>
    );
}
