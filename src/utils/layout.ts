/**
 * Layout utility using Dagre for auto-layout of diagram nodes
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import { routeEdges } from './edgeRouting';

export interface LayoutOptions {
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    nodeSpacing?: number;
    rankSpacing?: number;
    /** When true, compute orthogonal edge paths with obstacle avoidance. */
    edgeRouting?: boolean;
}

export interface LayoutPreset {
    direction: 'TB' | 'LR' | 'BT' | 'RL';
    nodesep: number;
    ranksep: number;
}

const LAYOUT_PRESETS: Record<string, LayoutPreset> = {
    general: { direction: 'TB', nodesep: 80, ranksep: 100 },
    interconnection: { direction: 'LR', nodesep: 80, ranksep: 120 },
    stateTransition: { direction: 'TB', nodesep: 80, ranksep: 100 },
    actionFlow: { direction: 'LR', nodesep: 60, ranksep: 120 },
    requirements: { direction: 'TB', nodesep: 100, ranksep: 150 },
    viewpoints: { direction: 'TB', nodesep: 100, ranksep: 150 },
};

export function getLayoutPreset(viewType: string): LayoutPreset {
    return LAYOUT_PRESETS[viewType] ?? { direction: 'TB', nodesep: 80, ranksep: 100 };
}

export function autoLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
    const { direction = 'TB', nodeSpacing = 60, rankSpacing = 80, edgeRouting = false } = options;

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

    if (edgeRouting) {
        const routedEdges = routeEdges(edges, layoutedNodes, true);
        return { nodes: layoutedNodes, edges: routedEdges };
    }

    return { nodes: layoutedNodes, edges };
}
