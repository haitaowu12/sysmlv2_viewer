import { type Edge, MarkerType } from '@xyflow/react';
import type { SysMLNode, SysMLModel, ConnectionUsage, FlowUsage, DependencyUsage, TransitionUsage } from '../parser/types';
import { getNodeId } from '../store/store';

const EDGE_STYLES: Record<string, { stroke: string; label: string; animated?: boolean; dashed?: boolean }> = {
    connection: { stroke: '#10b981', label: '«connect»', animated: true },
    flow: { stroke: '#3b82f6', label: '«flow»' },
    dependency: { stroke: '#f59e0b', label: '«dependency»', dashed: true },
    satisfy: { stroke: '#8b5cf6', label: '«satisfy»', dashed: true },
    verify: { stroke: '#06b6d4', label: '«verify»', dashed: true },
    transition: { stroke: '#f97316', label: '' },
    binding: { stroke: '#6366f1', label: '«bind»' },
    allocation: { stroke: '#ec4899', label: '«allocate»', dashed: true },
};

function buildNodeIdMap(nodes: SysMLNode[], output: Map<string, SysMLNode> = new Map()): Map<string, SysMLNode> {
    for (const node of nodes) {
        output.set(getNodeId(node), node);
        if (node.children.length > 0) {
            buildNodeIdMap(node.children, output);
        }
    }
    return output;
}

function findNodeIdByName(nodeMap: Map<string, SysMLNode>, name: string): string | null {
    for (const [id, node] of nodeMap) {
        if (node.name === name) return id;
    }
    return null;
}

export function buildRelationshipEdges(model: SysMLModel, existingNodeIds: Set<string>): Edge[] {
    const edges: Edge[] = [];
    const nodeMap = buildNodeIdMap(model.children);

    function traverseForRelationships(nodes: SysMLNode[]) {
        for (const node of nodes) {
            if (node.kind === 'ConnectionUsage') {
                const conn = node as ConnectionUsage;
                if (conn.source && conn.target) {
                    const sourceId = findNodeIdByName(nodeMap, conn.source.split('.')[0]);
                    const targetId = findNodeIdByName(nodeMap, conn.target.split('.')[0]);
                    if (sourceId && targetId && existingNodeIds.has(sourceId) && existingNodeIds.has(targetId)) {
                        const style = EDGE_STYLES.connection;
                        edges.push({
                            id: `rel-conn-${node.name}-${sourceId}-${targetId}`,
                            source: sourceId,
                            target: targetId,
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { stroke: style.stroke, strokeWidth: 2 },
                            label: conn.typeName || style.label,
                            labelStyle: { fontSize: 10, fill: style.stroke },
                            animated: style.animated,
                        });
                    }
                }
            }

            if (node.kind === 'FlowUsage') {
                const flow = node as FlowUsage;
                if (flow.source && flow.target) {
                    const sourceId = findNodeIdByName(nodeMap, flow.source.split('.')[0]);
                    const targetId = findNodeIdByName(nodeMap, flow.target.split('.')[0]);
                    if (sourceId && targetId && existingNodeIds.has(sourceId) && existingNodeIds.has(targetId)) {
                        const style = EDGE_STYLES.flow;
                        edges.push({
                            id: `rel-flow-${sourceId}-${targetId}`,
                            source: sourceId,
                            target: targetId,
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.Arrow },
                            style: { stroke: style.stroke, strokeWidth: 2 },
                            label: style.label,
                            labelStyle: { fontSize: 10, fill: style.stroke },
                        });
                    }
                }
            }

            if (node.kind === 'DependencyUsage') {
                const dep = node as DependencyUsage;
                if (dep.source && dep.targets && dep.targets.length > 0) {
                    const sourceId = findNodeIdByName(nodeMap, dep.source.split('.')[0]);
                    if (sourceId && existingNodeIds.has(sourceId)) {
                        for (const tgt of dep.targets) {
                            const targetId = findNodeIdByName(nodeMap, tgt.split('.')[0]);
                            if (targetId && existingNodeIds.has(targetId)) {
                                const style = EDGE_STYLES.dependency;
                                edges.push({
                                    id: `rel-dep-${sourceId}-${targetId}`,
                                    source: sourceId,
                                    target: targetId,
                                    type: 'smoothstep',
                                    markerEnd: { type: MarkerType.Arrow },
                                    style: { stroke: style.stroke, strokeDasharray: style.dashed ? '5,5' : undefined, strokeWidth: 1.5 },
                                    label: dep.name || style.label,
                                    labelStyle: { fontSize: 10, fill: style.stroke },
                                });
                            }
                        }
                    }
                }
            }

            if (node.kind === 'TransitionUsage') {
                const trans = node as TransitionUsage;
                if (trans.source && trans.target) {
                    const sourceId = findNodeIdByName(nodeMap, trans.source.split('.')[0]);
                    const targetId = findNodeIdByName(nodeMap, trans.target.split('.')[0]);
                    if (sourceId && targetId && existingNodeIds.has(sourceId) && existingNodeIds.has(targetId)) {
                        const style = EDGE_STYLES.transition;
                        edges.push({
                            id: `rel-trans-${sourceId}-${targetId}`,
                            source: sourceId,
                            target: targetId,
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            style: { stroke: style.stroke, strokeWidth: 2 },
                            label: trans.trigger || trans.name || '',
                            labelStyle: { fontSize: 10, fill: style.stroke },
                        });
                    }
                }
            }

            if (node.kind === 'RequirementUsage' && node.name === 'satisfy') {
                const req = node as any;
                if (req.typeName) {
                    const targetId = findNodeIdByName(nodeMap, req.typeName);
                    if (targetId) {
                        const style = EDGE_STYLES.satisfy;
                        edges.push({
                            id: `rel-satisfy-${targetId}`,
                            source: edges.length > 0 ? edges[edges.length - 1].source : targetId,
                            target: targetId,
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.Arrow },
                            style: { stroke: style.stroke, strokeDasharray: '5,5', strokeWidth: 1.5 },
                            label: style.label,
                            labelStyle: { fontSize: 10, fill: style.stroke },
                        });
                    }
                }
            }

            if (node.children.length > 0) {
                traverseForRelationships(node.children);
            }
        }
    }

    traverseForRelationships(model.children);
    return edges;
}
