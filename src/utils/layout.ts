/**
 * Layout utility using Dagre for auto-layout of diagram nodes
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

export interface LayoutOptions {
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    nodeSpacing?: number;
    rankSpacing?: number;
}

export function autoLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
    const { direction = 'TB', nodeSpacing = 60, rankSpacing = 80 } = options;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: direction,
        nodesep: nodeSpacing,
        ranksep: rankSpacing,
        marginx: 30,
        marginy: 30,
    });

    nodes.forEach((node) => {
        const width = node.measured?.width ?? (node.style?.width as number) ?? 220;
        const height = node.measured?.height ?? (node.style?.height as number) ?? 80;
        g.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
        g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const layoutedNodes = nodes.map((node) => {
        const dagreNode = g.node(node.id);
        if (!dagreNode) return node;

        const width = dagreNode.width;
        const height = dagreNode.height;

        return {
            ...node,
            position: {
                x: dagreNode.x - width / 2,
                y: dagreNode.y - height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}
