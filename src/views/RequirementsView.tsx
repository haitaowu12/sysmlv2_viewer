/**
 * Requirements View
 * Shows requirements and their relationships (satisfy, verify, derive)
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
import type { SysMLNode, RequirementDef, DocNode } from '../parser/types';
import { RequirementNode, SysMLDiagramNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import { findRelatedNodeIds } from '../utils/focusUtils';
import ContextMenu, { MenuItem } from '../components/ContextMenu';

const nodeTypes = {
    requirementNode: RequirementNode,
    sysmlNode: SysMLDiagramNode
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

export default function RequirementsView() {
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

        const reqDefs = new Map<string, string>(); // name -> nodeId
        const processed = new Set<string>();

        // 1. First pass: Collect all Requirement Definitions
        function findRequirements(items: SysMLNode[]) {
            for (const item of items) {
                if (item.kind === 'RequirementDef' || item.kind === 'RequirementUsage') {
                    const id = getNodeId(item);
                    reqDefs.set(item.name, id);
                    if (!visibleNodeIds || visibleNodeIds.has(id)) {
                        processRequirement(item);
                    }
                }
                if (item.kind === 'Package') {
                    findRequirements(item.children);
                }
            }
        }

        function processRequirement(req: SysMLNode) {
            const reqId = getNodeId(req);
            if (processed.has(reqId)) return;
            processed.add(reqId);

            const reqDef = req as RequirementDef;
            const doc = req.children.find(c => c.kind === 'Doc') as DocNode | undefined;

            const compartments: { label: string; items: string[] }[] = [];
            const attrs = req.children.filter(c => c.kind === 'AttributeUsage');
            if (attrs.length > 0) {
                compartments.push({
                    label: 'attributes',
                    items: attrs.map(a => `${a.name}${(a as any).typeName ? ': ' + (a as any).typeName : ''}`),
                });
            }

            nodes.push({
                id: reqId,
                type: 'requirementNode',
                position: { x: 0, y: 0 },
                data: {
                    label: req.shortName ? `«${req.shortName}» ${req.name}` : req.name,
                    kind: req.kind,
                    icon: '📋',
                    stereotype: `«${req.kind === 'RequirementDef' ? 'requirement def' : 'requirement'}»`,
                    doc: doc?.text || reqDef.doc,
                    compartments,
                    isSelected: reqId === selectedNodeId,
                },
            });

            // Derive relationships
            if ('superTypes' in req && reqDef.superTypes?.length) {
                for (const sup of reqDef.superTypes) {
                    const supId = reqDefs.get(sup) || `RequirementDef_${sup}`; // Fallback if not yet processed
                    edges.push({
                        id: `${reqId}--derives-->${supId}`,
                        source: reqId,
                        target: supId,
                        type: 'smoothstep',
                        markerEnd: { type: MarkerType.Arrow },
                        style: { stroke: '#ef4444', strokeDasharray: '5,5' },
                        label: '«deriveReqt»',
                        labelStyle: { fontSize: 10, fill: '#fca5a5' },
                        labelBgStyle: { fill: '#1e1b4b', fillOpacity: 0.8 },
                        labelBgPadding: [4, 2],
                        labelBgBorderRadius: 3,
                    });
                }
            }
        }

        // 2. Second pass: Find satisfying elements (Traceability)
        function findTraceability(items: SysMLNode[]) {
            for (const item of items) {
                const itemId = getNodeId(item);

                // Track satisfy relationships
                const satisfies = item.children.filter(c => c.kind === 'RequirementUsage' || c.kind === 'RequirementDef');
                for (const sat of satisfies) {
                    const targetReqName = sat.name || (sat as any).typeName;
                    if (targetReqName && reqDefs.has(targetReqName)) {
                        const targetReqId = reqDefs.get(targetReqName)!;

                        // If the requirement is visible, ensure the satisfier is also visible
                        if (!visibleNodeIds || visibleNodeIds.has(targetReqId)) {
                            // Add the satisfier node if not Requirement
                            if (item.kind !== 'RequirementDef' && item.kind !== 'RequirementUsage') {
                                if (!processed.has(itemId)) {
                                    processed.add(itemId);
                                    nodes.push({
                                        id: itemId,
                                        type: 'sysmlNode',
                                        position: { x: 0, y: 0 },
                                        data: {
                                            label: item.name,
                                            kind: item.kind,
                                            isSelected: itemId === selectedNodeId,
                                            compartments: []
                                        }
                                    });
                                }

                                edges.push({
                                    id: `${itemId}--satisfies-->${targetReqId}`,
                                    source: itemId,
                                    target: targetReqId,
                                    type: 'smoothstep',
                                    markerEnd: { type: MarkerType.ArrowClosed },
                                    style: { stroke: '#10b981' },
                                    label: '«satisfy»',
                                    labelStyle: { fontSize: 10, fill: '#6ee7b7' },
                                    labelBgStyle: { fill: '#064e3b', fillOpacity: 0.8 },
                                    labelBgPadding: [4, 2],
                                    labelBgBorderRadius: 3,
                                });
                            }
                        }
                    }
                }

                if (item.children.length > 0) {
                    findTraceability(item.children);
                }
            }
        }

        findRequirements(model.children);
        findTraceability(model.children);

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
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={20} size={1} color="var(--grid-color)" />
                <Controls />
                <MiniMap nodeColor={(n) => n.type === 'requirementNode' ? '#ef4444' : '#10b981'} />
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
