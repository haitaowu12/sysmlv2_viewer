/**
 * Viewpoints View
 * Shows viewpoints, views, and their relationships
 */

import { useMemo, useCallback, useState } from 'react';
import { type Node, type Edge, MarkerType, type Connection } from '@xyflow/react';
import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode, DocNode } from '../parser/types';
import { SysMLDiagramNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { buildRelationshipEdges } from '../utils/relationshipEdges';
import { findRelatedNodeIds } from '../utils/focusUtils';
import DiagramView from '../components/DiagramView';
import ContextMenu, { MenuItem } from '../components/ContextMenu';
import { Focus } from 'lucide-react';

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

const nodeTypes = {
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
    const createRelationship = useAppStore(s => s.createRelationship);

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
                        connectable: true,
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
                        connectable: true,
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

        const nodeIds = new Set(nodes.map(n => n.id));
        const relEdges = buildRelationshipEdges(model, nodeIds);
        edges.push(...relEdges);

        if (nodes.length > 0) {
            const layouted = autoLayout(nodes, edges, { direction: 'TB', nodeSpacing: 100, rankSpacing: 150, edgeRouting: true });
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
                emptyTitle="No viewpoints to display"
                emptyDescription="The Viewpoints view shows viewpoints, views, and their relationships."
                minimapNodeColor={(n) => n.type === 'viewpointNode' ? '#8b5cf6' : '#06b6d4'}
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
