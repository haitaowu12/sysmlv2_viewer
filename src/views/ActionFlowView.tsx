/**
 * Action Flow View - Activity Diagram equivalent
 * Shows actions, their decomposition, and flows between them
 */

import { useMemo, useCallback, useState } from 'react';
import { type Node, type Edge, MarkerType, type Connection } from '@xyflow/react';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, FlowUsage, BindingUsage } from '../parser/types';
import { ActionNode, PseudoStateNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { buildRelationshipEdges } from '../utils/relationshipEdges';
import { findRelatedNodeIds } from '../utils/focusUtils';
import DiagramView from '../components/DiagramView';
import ContextMenu, { MenuItem } from '../components/ContextMenu';
import { Focus } from 'lucide-react';

const nodeTypes = { actionNode: ActionNode, pseudoState: PseudoStateNode };

export default function ActionFlowView() {
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

        function findActionDefs(items: SysMLNode[]) {
            for (const item of items) {
                if (item.kind === 'ActionDef') {
                    processActionDef(item);
                }
                if (item.kind === 'Package' || item.kind === 'PartDef') {
                    findActionDefs(item.children);
                }
            }
        }

        function processActionDef(actionDef: SysMLNode) {
            const actionId = getNodeId(actionDef);

            if (visibleNodeIds && !visibleNodeIds.has(actionId)) return;

            const params = actionDef.children.filter(c =>
                c.kind === 'AttributeUsage' && (c as any).direction
            );

            const inParams = params.filter(p => (p as any).direction === 'in');
            const outParams = params.filter(p => (p as any).direction === 'out');

            const compartments: { label: string; items: string[] }[] = [];
            if (inParams.length > 0) {
                compartments.push({
                    label: 'in',
                    items: inParams.map(p => `${p.name}${(p as any).typeName ? ': ' + (p as any).typeName : ''}`),
                });
            }
            if (outParams.length > 0) {
                compartments.push({
                    label: 'out',
                    items: outParams.map(p => `${p.name}${(p as any).typeName ? ': ' + (p as any).typeName : ''}`),
                });
            }

            nodes.push({
                id: actionId,
                type: 'actionNode',
                position: { x: 0, y: 0 },
                data: {
                    label: actionDef.name,
                    kind: 'ActionDef',
                    icon: '⚡',
                    compartments,
                    isSelected: actionId === selectedNodeId,
                },
                connectable: true,
            });

            const subActions = actionDef.children.filter(c => c.kind === 'ActionUsage');
            for (const sub of subActions) {
                const subId = getNodeId(sub);

                const subParams = sub.children.filter(c =>
                    c.kind === 'AttributeUsage' && (c as any).direction
                );
                const subCompartments: { label: string; items: string[] }[] = [];

                const subIn = subParams.filter(p => (p as any).direction === 'in');
                const subOut = subParams.filter(p => (p as any).direction === 'out');

                if (subIn.length > 0) {
                    subCompartments.push({ label: 'in', items: subIn.map(p => p.name) });
                }
                if (subOut.length > 0) {
                    subCompartments.push({ label: 'out', items: subOut.map(p => p.name) });
                }

                nodes.push({
                    id: subId,
                    type: 'actionNode',
                    position: { x: 0, y: 0 },
                    data: {
                        label: `${sub.name}${(sub as any).typeName ? ': ' + (sub as any).typeName : ''}`,
                        kind: 'ActionUsage',
                        icon: '⚡',
                        compartments: subCompartments,
                        isSelected: subId === selectedNodeId,
                    },
                    connectable: true,
                });

                edges.push({
                    id: `${actionId}->${subId}`,
                    source: actionId,
                    target: subId,
                    type: 'smoothstep',
                    style: { stroke: '#6b7280', strokeDasharray: '4,4' },
                });
            }

            const flows = actionDef.children.filter(c => c.kind === 'FlowUsage') as FlowUsage[];
            for (const flow of flows) {
                const sourceParts = flow.source.split('.');
                const targetParts = flow.target.split('.');

                const sourceAction = subActions.find(a => a.name === sourceParts[0]);
                const targetAction = subActions.find(a => a.name === targetParts[0]);

                if (sourceAction && targetAction) {
                    edges.push({
                        id: `flow_${flow.source}_${flow.target}`,
                        source: getNodeId(sourceAction),
                        target: getNodeId(targetAction),
                        type: 'smoothstep',
                        markerEnd: { type: MarkerType.ArrowClosed },
                        style: { stroke: '#8b5cf6', strokeWidth: 2 },
                        label: sourceParts[1] ? `${sourceParts[1]} → ${targetParts[1] || ''}` : '',
                        labelStyle: { fontSize: 10, fill: '#e2e8f0' },
                        labelBgStyle: { fill: '#1e1b4b', fillOpacity: 0.8 },
                        labelBgPadding: [4, 2] as [number, number],
                        labelBgBorderRadius: 3,
                        animated: true,
                    });
                }
            }

            const bindings = actionDef.children.filter(c => c.kind === 'BindingUsage') as BindingUsage[];
            for (const bind of bindings) {
                const sourceParts = bind.source.split('.');

                const sourceAction = subActions.find(a => sourceParts[0] === a.name);
                if (sourceAction) {
                    edges.push({
                        id: `bind_${bind.source}_${bind.target}`,
                        source: actionId,
                        target: getNodeId(sourceAction),
                        type: 'smoothstep',
                        style: { stroke: '#4ade80', strokeDasharray: '2,2' },
                        label: '«bind»',
                        labelStyle: { fontSize: 9, fill: '#86efac' },
                    });
                }
            }
        }

        findActionDefs(model.children);

        const nodeIds = new Set(nodes.map(n => n.id));
        const relEdges = buildRelationshipEdges(model, nodeIds);
        edges.push(...relEdges);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'LR', nodeSpacing: 60, rankSpacing: 120, edgeRouting: true });
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
                emptyTitle="No actions to display"
                emptyDescription="The Action Flow view shows actions, their decomposition, and flows between them."
                minimapNodeColor={() => '#8b5cf6'}
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
