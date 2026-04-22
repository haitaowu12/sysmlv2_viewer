/**
 * General View - Block Definition Diagram equivalent
 * Shows part definitions, their properties, and relationships (specialization, composition)
 */

import { useMemo, useCallback, useState } from 'react';
import { type Node, type Edge, MarkerType, type Connection } from '@xyflow/react';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, PartDef, PartUsage, PortDef, ItemDef } from '../parser/types';
import { SysMLDiagramNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { buildRelationshipEdges } from '../utils/relationshipEdges';
import { findRelatedNodeIds } from '../utils/focusUtils';
import DiagramView from '../components/DiagramView';
import ContextMenu, { MenuItem } from '../components/ContextMenu';
import { Focus, Eye, EyeOff } from 'lucide-react';

const nodeTypes = { sysmlNode: SysMLDiagramNode };

export default function GeneralView() {
    const model = useAppStore(s => s.model);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const focusedNodeId = useAppStore(s => s.focusedNodeId);
    const hiddenAttributes = useAppStore(s => s.hiddenAttributes);
    const selectNode = useAppStore(s => s.selectNode);
    const setFocusedNode = useAppStore(s => s.setFocusedNode);
    const toggleAttributeVisibility = useAppStore(s => s.toggleAttributeVisibility);
    const createRelationship = useAppStore(s => s.createRelationship);
    const openRelationshipModal = useAppStore(s => s.openRelationshipModal);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const { initialNodes, initialEdges } = useMemo(() => {
        if (!model) return { initialNodes: [], initialEdges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const processed = new Set<string>();

        const visibleNodeIds = focusedNodeId ? findRelatedNodeIds(model.children, focusedNodeId) : null;

        function processNode(node: SysMLNode, parentId?: string) {
            const nodeId = getNodeId(node);

            if (visibleNodeIds && !visibleNodeIds.has(nodeId)) return;
            if (processed.has(nodeId)) return;
            processed.add(nodeId);

            const isDefNode = node.kind.endsWith('Def') || node.kind === 'Package';

            if (isDefNode || node.kind === 'PartUsage' || node.kind === 'ItemUsage') {
                const compartments: { label: string; items: string[] }[] = [];

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
                    connectable: true,
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

        for (const child of model.children) {
            processNode(child);
            if (child.kind === 'Package') {
                for (const grand of child.children) {
                    processNode(grand, getNodeId(child));
                }
            }
        }

        const nodeIds = new Set(nodes.map(n => n.id));
        const relEdges = buildRelationshipEdges(model, nodeIds);
        edges.push(...relEdges);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'TB', nodeSpacing: 80, rankSpacing: 100, edgeRouting: true });
            return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
        }

        return { initialNodes: nodes, initialEdges: edges };
    }, [model, selectedNodeId, focusedNodeId, hiddenAttributes]);

    const handleNodeClick = useCallback((nodeId: string) => {
        selectNode(nodeId);
    }, [selectNode]);

    const handleNodeContextMenu = useCallback((event: React.MouseEvent, nodeId: string) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
    }, []);

    const handleConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return;
        const sourceId = String(connection.source);
        const targetId = String(connection.target);

        const sourceNode = model?.children.flatMap(n => [n, ...n.children]).find(n => getNodeId(n) === sourceId);
        const targetNode = model?.children.flatMap(n => [n, ...n.children]).find(n => getNodeId(n) === targetId);

        const sourceKind = sourceNode?.kind || '';
        const targetKind = targetNode?.kind || '';

        if ((sourceKind === 'StateUsage' || sourceKind === 'StateDef') && (targetKind === 'StateUsage' || targetKind === 'StateDef')) {
            openRelationshipModal(sourceId, targetId, 'transition');
        } else {
            createRelationship(sourceId, targetId);
        }
    }, [model, createRelationship, openRelationshipModal]);

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
                emptyTitle="No elements to display"
                emptyDescription="The General view shows part definitions, their properties, and relationships."
                minimapNodeColor={(n) => {
                    const d = n.data as any;
                    return d?.kind === 'Package' ? '#6366f1' : '#3b82f6';
                }}
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
                    <MenuItem
                        onClick={() => {
                            toggleAttributeVisibility(contextMenu.nodeId);
                            closeContextMenu();
                        }}
                        icon={hiddenAttributes[contextMenu.nodeId] ? Eye : EyeOff}
                    >
                        {hiddenAttributes[contextMenu.nodeId] ? 'Show Attributes' : 'Hide Attributes'}
                    </MenuItem>
                </ContextMenu>
            )}
        </>
    );
}
