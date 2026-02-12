/**
 * State Transition View - State Machine Diagram equivalent
 * Shows states and transitions with triggers, guards, and effects
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
import type { SysMLNode, TransitionUsage } from '../parser/types';
import { StateNode, PseudoStateNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { findRelatedNodeIds } from '../utils/focusUtils';
import ContextMenu, { MenuItem } from '../components/ContextMenu';

const nodeTypes = { stateNode: StateNode, pseudoState: PseudoStateNode };

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

export default function StateTransitionView() {
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
            // Focus check for container
            if (visibleNodeIds && !visibleNodeIds.has(getNodeId(stateDef))) return;

            const states = stateDef.children.filter(c => c.kind === 'StateUsage');
            const transitions = stateDef.children.filter(c => c.kind === 'TransitionUsage') as TransitionUsage[];

            // Add initial pseudo-state if there's an entry transition
            const entryTransition = transitions.find(t => t.name === 'entry' || t.source === '__initial__');
            if (entryTransition) {
                nodes.push({
                    id: `${getNodeId(stateDef)}_initial`,
                    type: 'pseudoState',
                    position: { x: 0, y: 0 },
                    data: { label: '', kind: 'initial', icon: '' },
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

            // Add state nodes
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
                });
            }

            // Add transition edges
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

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'TB', nodeSpacing: 80, rankSpacing: 100 });
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
                <MiniMap nodeColor={() => '#ec4899'} />
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
