import type { LayoutRect, SemanticEdge, SemanticModel, SemanticNode, SyncDiffResult, SyncPatch, SyncPatchSafety } from './semantic-types';
import { sysmlPathHash } from './semantic-types';

const AUTO_NODE_KINDS = new Set([
  'Package',
  'PartDef',
  'PartUsage',
  'PortDef',
  'PortUsage',
  'ConnectionUsage',
  'RequirementDef',
  'RequirementUsage',
  'VerificationDef',
  'VerificationUsage',
]);

function patchId(scope: string, targetId: string, payload: unknown): string {
  return sysmlPathHash(`${scope}:${targetId}:${JSON.stringify(payload)}`);
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function layoutChanged(prev: LayoutRect | undefined, next: LayoutRect | undefined): boolean {
  if (!prev && !next) return false;
  if (!prev || !next) return true;
  return prev.x !== next.x || prev.y !== next.y || prev.width !== next.width || prev.height !== next.height;
}

function edgeKey(edge: SemanticEdge): string {
  return `${edge.kind}:${edge.sourceId}->${edge.targetId}:${edge.label ?? ''}`;
}

function safetyForNode(node: SemanticNode): SyncPatchSafety {
  return AUTO_NODE_KINDS.has(node.kind) ? 'safe' : 'review_required';
}

export function diffSemanticModels(previous: SemanticModel, next: SemanticModel): SyncDiffResult {
  const patches: SyncPatch[] = [];

  const previousNodes = toMap(previous.nodes);
  const nextNodes = toMap(next.nodes);

  for (const node of next.nodes) {
    const before = previousNodes.get(node.id);

    if (!before) {
      patches.push({
        id: patchId('add_node', node.id, node),
        op: 'add_node',
        safety: safetyForNode(node),
        targetId: node.id,
        payload: {
          node,
          parentId: node.parentId,
        },
      });
      continue;
    }

    if (before.name !== node.name) {
      patches.push({
        id: patchId('rename_node', node.id, { from: before.name, to: node.name }),
        op: 'rename_node',
        safety: safetyForNode(node),
        targetId: node.id,
        payload: {
          from: before.name,
          to: node.name,
        },
      });
    }

    if (layoutChanged(previous.layout[node.id], next.layout[node.id])) {
      patches.push({
        id: patchId('move_resize', node.id, next.layout[node.id]),
        op: 'move_resize',
        safety: 'safe',
        targetId: node.id,
        payload: {
          previous: previous.layout[node.id] ?? null,
          next: next.layout[node.id] ?? null,
        },
      });
    }

    if (before.parentId !== node.parentId) {
      patches.push({
        id: patchId('reconnect', node.id, { from: before.parentId, to: node.parentId }),
        op: 'reconnect',
        safety: 'review_required',
        targetId: node.id,
        payload: {
          previousParentId: before.parentId ?? null,
          nextParentId: node.parentId ?? null,
          reason: 'Node re-parenting may change containment semantics.',
        },
      });
    }
  }

  for (const node of previous.nodes) {
    if (nextNodes.has(node.id)) continue;

    patches.push({
      id: patchId('remove_node', node.id, node),
      op: 'remove_node',
      safety: safetyForNode(node),
      targetId: node.id,
      payload: {
        node,
      },
    });
  }

  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]));
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));
  const previousEdgeKeyMap = new Map(previous.edges.map((edge) => [edgeKey(edge), edge]));
  const nextEdgeKeyMap = new Map(next.edges.map((edge) => [edgeKey(edge), edge]));

  const previousOutgoingCount = new Map<string, number>();
  for (const edge of previous.edges) {
    const key = `${edge.kind}:${edge.sourceId}`;
    previousOutgoingCount.set(key, (previousOutgoingCount.get(key) ?? 0) + 1);
  }

  for (const edge of next.edges) {
    const before = previousEdges.get(edge.id);

    if (!before) {
      if (!previousEdgeKeyMap.has(edgeKey(edge))) {
        patches.push({
          id: patchId('reconnect', edge.id, { action: 'add', edge }),
          op: 'reconnect',
          safety: 'safe',
          targetId: edge.id,
          payload: {
            action: 'add',
            edge,
          },
        });
      }
      continue;
    }

    if (before.sourceId !== edge.sourceId || before.targetId !== edge.targetId) {
      patches.push({
        id: patchId('reconnect', edge.id, { action: 'change', before, edge }),
        op: 'reconnect',
        safety: 'review_required',
        targetId: edge.id,
        payload: {
          action: 'change',
          before,
          edge,
        },
      });
    }

    if ((before.label ?? '') !== (edge.label ?? '')) {
      patches.push({
        id: patchId('relabel', edge.id, { from: before.label, to: edge.label }),
        op: 'relabel',
        safety: edge.kind === 'connection' ? 'safe' : 'review_required',
        targetId: edge.id,
        payload: {
          from: before.label ?? '',
          to: edge.label ?? '',
          edge,
        },
      });
    }
  }

  for (const edge of previous.edges) {
    if (nextEdges.has(edge.id) || nextEdgeKeyMap.has(edgeKey(edge))) continue;

    const outgoingKey = `${edge.kind}:${edge.sourceId}`;
    const siblingCount = previousOutgoingCount.get(outgoingKey) ?? 1;
    const ambiguousDeletion = siblingCount > 1;

    patches.push({
      id: patchId('reconnect', edge.id, { action: 'remove', edge }),
      op: 'reconnect',
      safety: ambiguousDeletion ? 'review_required' : 'safe',
      targetId: edge.id,
      payload: {
        action: 'remove',
        edge,
        reason: ambiguousDeletion
          ? 'Multiple outgoing relations exist for this source/kind.'
          : 'Single relation removal.',
      },
    });
  }

  return { patches };
}
