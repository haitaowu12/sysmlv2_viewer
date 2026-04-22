/**
 * useEdgeRouting hook
 *
 * Provides zoom-adaptive label settings and a helper to apply intelligent
 * edge routing to diagram edges.  Integrates cleanly with React Flow views.
 */

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  computeAdaptiveLabel,
  routeEdges,
  type AdaptiveLabel,
} from '../utils/edgeRouting';

export interface UseEdgeRoutingResult {
  /** Compute adaptive label settings for a given zoom level and text. */
  getLabel: (zoom: number, text: string) => AdaptiveLabel;
  /** Apply orthogonal routing + bundling to edges. */
  route: (edges: Edge[], nodes: Node[]) => Edge[];
}

/**
 * Hook that returns helpers for intelligent edge routing and zoom-adaptive labels.
 *
 * @example
 * const { getLabel, route } = useEdgeRouting();
 * const routedEdges = route(edges, nodes);
 */
export function useEdgeRouting(): UseEdgeRoutingResult {
  return useMemo(
    () => ({
      getLabel: computeAdaptiveLabel,
      route: (edges: Edge[], nodes: Node[]) => routeEdges(edges, nodes, true),
    }),
    []
  );
}
