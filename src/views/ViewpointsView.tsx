/**
 * Viewpoints View
 * Shows viewpoints, views, and their relationships
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
import type { SysMLNode, DocNode } from '../parser/types';
import { SysMLDiagramNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { findRelatedNodeIds } from '../utils/focusUtils';
import ContextMenu, { MenuItem } from '../components/ContextMenu';

function FocusZoom({ focusedNodeId }: { focusedNodeId: string | null }) {
    const { fitView } = useReactFlow();

    useEffect(() => {
        if (focusedNodeId) {
            fitView({ nodes: [{ id: focusedNodeId }], duration: 800, padding: 0.5 });
        }
    }, [focusedNodeId, fitView]);

    return null;
}

function ViewpointNode({ data }: { data: any }) {
    return (
        <div className={`sysml-node viewpoint-node ${data.isSelected ? 'selected' : ''}`}
            style={{ borderColor: '#8b5cf6' }}>
            <div className="node-header" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                <span className="node-stereotype">«viewpoint»</span>
                <span className="node-label">{data.label}</span>
            </div>
            {data.concerns && data.concerns.length > 0 && (
                <div className="node-body">
                    <div className="compartment-label">concerns</div>
                    {data.concerns.map((c: string, i: number) => (
                        <div key={i} className="compartment-item">{c}</div>
                    ))}
                </div>
            )}
            {data.doc && (
                <div className="node-doc">
                    <span className="doc-text">{data.doc}</span>
                </div>
            )}
        </div>
    );
}

function ViewNode({ data }: { data: any }) {
    return (
        <div className={`sysml-node view-node ${data.isSelected ? 'selected' : ''}`}
            style={{ borderColor: '#06b6d4' }}>
            <div className="node-header" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>
                <span className="node-stereotype">«view»</span>
                <span className="node-label">{data.label}</span>
            </div>
            {data.viewpoint && (
                <div className="node-body">
                    <div className="compartment-label">viewpoint</div>
                    <div className="compartment-item">{data.viewpoint}</div>
                </div>
            )}
            {data.doc && (
                <div className="node-doc">
                    <span className="doc-text">{data.doc}</span>
                </div>
            )}
        </div>
    );
}

const customNodeTypes = {
    sysmlNode: SysMLDiagramNode,
    viewpointNode: ViewpointNode,
    viewNode: ViewNode,
};

export default function ViewpointsView() {
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
        const processed = new Set<string>();
        const viewpointMap = new Map<string, string>();

        const visibleNodeIds = focusedNodeId ? findRelatedNodeIds(model.children, focusedNodeId) : null;

        function findViewpoints(items: SysMLNode[]) {
            for (const item of items) {
                const itemId = getNodeId(item);

                if (visibleNodeIds && !visibleNodeIds.has(itemId)) {
                    if (item.kind === 'Package') {
                        findViewpoints(item.children);
                    }
                    continue;
                }

                if (item.kind === 'ViewpointDef' || item.kind === 'ViewpointUsage') {
                    const doc = item.children.find(c => c.kind === 'Doc') as DocNode | undefined;
                    const concerns = (item as any).concerns || [];

                    nodes.push({
                        id: itemId,
                        type: 'viewpointNode',
                        position: { x: 0, y: 0 },
                        data: {
                            label: item.name,
                            kind: item.kind,
                            concerns,
                            doc: doc?.text,
                            isSelected: itemId === selectedNodeId,
                        },
                    });

                    viewpointMap.set(item.name, itemId);
                    processed.add(itemId);
                }

                if (item.kind === 'ViewDef' || item.kind === 'ViewUsage') {
                    const doc = item.children.find(c => c.kind === 'Doc') as DocNode | undefined;
                    const viewpoint = (item as any).viewpoint;

                    nodes.push({
                        id: itemId,
                        type: 'viewNode',
                        position: { x: 0, y: 0 },
                        data: {
                            label: item.name,
                            kind: item.kind,
                            viewpoint,
                            doc: doc?.text,
                            isSelected: itemId === selectedNodeId,
                        },
                    });

                    if (viewpoint && viewpointMap.has(viewpoint)) {
                        edges.push({
                            id: `${itemId}--conforms-->${viewpointMap.get(viewpoint)}`,
                            source: itemId,
                            target: viewpointMap.get(viewpoint)!,
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { stroke: '#8b5cf6', strokeDasharray: '5,5' },
                            label: '«conforms»',
                            labelStyle: { fontSize: 10, fill: '#c4b5fd' },
                            labelBgStyle: { fill: '#1e1b4b', fillOpacity: 0.8 },
                            labelBgPadding: [4, 2],
                            labelBgBorderRadius: 3,
                        });
                    }

                    processed.add(itemId);
                }

                if (item.kind === 'Package') {
                    findViewpoints(item.children);
                }
            }
        }

        findViewpoints(model.children);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'TB', nodeSpacing: 100, rankSpacing: 150 });
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
                nodeTypes={customNodeTypes}
                fitView
                minZoom={0.1}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={20} size={1} color="var(--grid-color)" />
                <Controls />
                <MiniMap nodeColor={(n) => n.type === 'viewpointNode' ? '#8b5cf6' : '#06b6d4'} />
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
