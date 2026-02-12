/**
 * focusUtils.ts
 * Logic for determining the scope of "Focus View" including context (neighbors).
 */

import type { SysMLNode, PartUsage } from '../parser/types';
import { getNodeId } from '../store/store';

/**
 * Finds a node and its descendants in the model tree.
 */
export function findNodeAndDescendants(modelRoot: SysMLNode[], targetId: string): Set<string> {
    const result = new Set<string>();

    // DFS to find target
    function find(nodes: SysMLNode[]): SysMLNode | null {
        for (const n of nodes) {
            if (getNodeId(n) === targetId) return n;
            const found = find(n.children);
            if (found) return found;
        }
        return null;
    }

    const target = find(modelRoot);
    if (!target) return result;

    // Collect descendants
    function collect(n: SysMLNode) {
        result.add(getNodeId(n));
        n.children.forEach(collect);
    }
    collect(target);

    return result;
}

/**
 * Finds nodes related to the target node (Context).
 * Relationships:
 * - Parent (Container)
 * - Connected Neighbors (via Connections)
 * - Type Definition (if Usage)
 * - Usages (if Definition) - Optional, might be too many
 */
export function findRelatedNodeIds(model: SysMLNode[], targetId: string): Set<string> {
    const related = new Set<string>();
    const descendants = findNodeAndDescendants(model, targetId);

    // Add descendants to related (Focus View includes the sub-tree)
    descendants.forEach(id => related.add(id));

    // 1. Find the target node object first
    let foundNode: SysMLNode | null = null;
    function find(nodes: SysMLNode[]) {
        for (const n of nodes) {
            if (getNodeId(n) === targetId) { foundNode = n; break; }
            find(n.children);
        }
    }
    find(model);
    if (!foundNode) return related;
    const targetNode = foundNode; // Narrow type

    // Helper: Map of all nodes for quick lookup
    const idMap = new Map<string, SysMLNode>();
    const parentMap = new Map<string, string>(); // childId -> parentId

    function buildMaps(nodes: SysMLNode[], parentId?: string) {
        for (const n of nodes) {
            const id = getNodeId(n);
            idMap.set(id, n);
            if (parentId) parentMap.set(id, parentId);
            buildMaps(n.children, id);
        }
    }
    buildMaps(model);

    // 2. Add Parent (up to root?) - Just immediate parent for context
    const parentId = parentMap.get(targetId);
    if (parentId) related.add(parentId);

    // 3. Find Connected Nodes (traverse text of connections?)
    // Connections are usually defined in a parent container or widely distributed.
    // simpler strategy: Scan ALL ConnectionUsages in the model.
    // If a connection involves the targetId (or its ports), add the OTHER end.

    // For now, let's include:
    // - Parent
    // - Descendants
    // - Defining Type (if it is a Usage)

    // Check for Type Definition
    if ('typeName' in targetNode && (targetNode as PartUsage).typeName) {
        // Find the definition
        const typeName = (targetNode as PartUsage).typeName;
        // Search model for *Def with this name
        for (const [id, node] of idMap.entries()) {
            if (node.name === typeName && (node.kind.endsWith('Def') || node.kind === 'InterfaceDef')) {
                related.add(id);
            }
        }
    }

    return related;
}
