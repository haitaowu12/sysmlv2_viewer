/**
 * State Transition View - State Machine Diagram equivalent
 * Shows states and transitions with triggers, guards, and effects
 */

import { useMemo, useCallback, useState } from 'react';
import { type Node, type Edge, MarkerType, type Connection } from '@xyflow/react';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, TransitionUsage } from '../parser/types';
import { StateNode, PseudoStateNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { buildRelationshipEdges } from '../utils/relationshipEdges';
import { findRelatedNodeIds } from '../utils/focusUtils';
import DiagramView from '../components/DiagramView';
import ContextMenu, { MenuItem } from '../components/ContextMenu';
import { Focus } from 'lucide-react';

const nodeTypes = { stateNode: StateNode, pseudoState: PseudoStateNode };

export default function StateTransitionView() {
    const model = useAppStore(s => s.model);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const focusedNodeId = useAppStore(s => s.focusedNodeId);
    const selectNode = useAppStore(s => s.selectNode);
    const setFocusedNode = useAppStore(s => s.setFocusedNode);
    const openRelationshipModal = useAppStore(s => s.openRelationshipModal);

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const { initialNodes, initialEdges } = useMemo(() => {
        if (!model) return { initialNodes: [], initialEdges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        const visibleNodeIds = focusedNodeId ? findRelatedNodeIds(model.children, focusedNodeId) : null;

        function findStateDefs(items: SysMLNode[]) {
            for (const item of items) {
                if (item.kind === 'StateDef') {
                    processStateDef(item);
                }
                if (item.kind === 'Package' || item.kind === 'PartDef') {
                    findStateDefs(item.children);
                }
            }
        }

        function processStateDef(stateDef: SysMLNode) {
            if (visibleNodeIds && !visibleNodeIds.has(getNodeId(stateDef))) return;

            const states = stateDef.children.filter(c => c.kind === 'StateUsage');
            const transitions = stateDef.children.filter(c => c.kind === 'TransitionUsage') as TransitionUsage[];

            const entryTransition = transitions.find(t => t.name === 'entry' || t.source === '__initial__');
            if (entryTransition) {
                nodes.push({
                    id: `${getNodeId(stateDef)}_initial`,
                    type: 'pseudoState',
                    position: { x: 0, y: 0 },
                    data: { label: '', kind: 'initial', icon: '' },
                    connectable: true,
                });

                if (entryTransition.target) {
                    const targetId = states.find(s => s.name === entryTransition.target);
                    if (targetId) {
                        edges.push({
                            id: `initial->${getNodeId(targetId)}`,
                            source: `${getNodeId(stateDef)}_initial`,
                            target: getNodeId(targetId),
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { stroke: '#f472b6' },
                            animated: true,
                        });
                    }
                }
            }

            for (const state of states) {
                    const sId = getNodeId(state);
                    nodes.push({
                        id: sId,
                        type: 'stateNode',
                        position: { x: 0, y: 0 },
                        data: {
                            label: state.name,
                            kind: 'StateUsage',
                            icon: '🔄',
                            isSelected: sId === selectedNodeId,
                            compartments: [],
                        },
                        connectable: true,
                    });
                }

            for (const trans of transitions) {
                if (trans.name === 'entry' || trans.source === '__initial__') continue;

                const sourceState = states.find(s => s.name === trans.source);
                const targetState = states.find(s => s.name === trans.target);

                if (sourceState && targetState) {
                    let label = '';
                    if (trans.trigger) label += trans.trigger;
                    if (trans.guard) label += ` [${trans.guard}]`;
                    if (trans.effectAction) label += ` / ${trans.effectAction}`;

                    edges.push({
                        id: `transition_${trans.name}`,
                        source: getNodeId(sourceState),
                        target: getNodeId(targetState),
                        type: 'smoothstep',
                        markerEnd: { type: MarkerType.ArrowClosed },
                        style: { stroke: '#ec4899' },
                        label: label || trans.name,
                        labelStyle: { fontSize: 11, fontWeight: 500, fill: '#e2e8f0' },
                        labelBgStyle: { fill: '#1e1b4b', fillOpacity: 0.8 },
                        labelBgPadding: [6, 4] as [number, number],
                        labelBgBorderRadius: 4,
                    });
                }
            }
        }

        findStateDefs(model.children);

        const nodeIds = new Set(nodes.map(n => n.id));
        const relEdges = buildRelationshipEdges(model, nodeIds);
        edges.push(...relEdges);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'TB', nodeSpacing: 80, rankSpacing: 100, edgeRouting: true });
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
        openRelationshipModal(String(connection.source), String(connection.target), 'transition');
    }, [openRelationshipModal]);

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
                emptyTitle="No states to display"
                emptyDescription="The State Transition view shows states and transitions with triggers, guards, and effects."
                minimapNodeColor={() => '#ec4899'}
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
