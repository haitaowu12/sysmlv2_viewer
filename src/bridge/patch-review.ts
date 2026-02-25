import type { SemanticEdge, SemanticNode, SyncPatch } from './semantic-types';

export interface PatchDescription {
  title: string;
  details: string;
}

function asNode(value: unknown): SemanticNode | null {
  if (!value || typeof value !== 'object') return null;
  const node = value as Partial<SemanticNode>;
  if (!node.kind || !node.name) return null;
  return node as SemanticNode;
}

function asEdge(value: unknown): SemanticEdge | null {
  if (!value || typeof value !== 'object') return null;
  const edge = value as Partial<SemanticEdge>;
  if (!edge.kind || !edge.sourceId || !edge.targetId) return null;
  return edge as SemanticEdge;
}

function kindLabel(kind: string): string {
  return kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function edgeLabel(edge: SemanticEdge): string {
  return `${kindLabel(edge.kind)}: ${edge.sourceId} -> ${edge.targetId}`;
}

export function describeSyncPatch(patch: SyncPatch): PatchDescription {
  const payload = patch.payload as Record<string, unknown>;
  const reason = typeof payload.reason === 'string' ? payload.reason : '';

  if (patch.op === 'add_node') {
    const node = asNode(payload.node) ?? asNode(payload);
    if (node) {
      return {
        title: `Add ${kindLabel(node.kind)} "${node.name}"`,
        details: reason || 'A new element was added in the diagram and will be inserted into SysML.',
      };
    }
  }

  if (patch.op === 'remove_node') {
    const node = asNode(payload.node);
    if (node) {
      return {
        title: `Remove ${kindLabel(node.kind)} "${node.name}"`,
        details: reason || 'This element was deleted from the diagram and will be removed from SysML.',
      };
    }
  }

  if (patch.op === 'rename_node') {
    const from = typeof payload.from === 'string' ? payload.from : 'old name';
    const to = typeof payload.to === 'string' ? payload.to : 'new name';
    return {
      title: `Rename "${from}" to "${to}"`,
      details: reason || 'The name change will be reflected in SysML source text.',
    };
  }

  if (patch.op === 'move_resize') {
    return {
      title: 'Move/Resize Layout',
      details: reason || 'This changes visual layout only and does not alter SysML semantics.',
    };
  }

  if (patch.op === 'relabel') {
    const from = typeof payload.from === 'string' ? payload.from : '';
    const to = typeof payload.to === 'string' ? payload.to : '';
    return {
      title: `Relabel "${from}" to "${to}"`,
      details: reason || 'The relation label changed in the diagram.',
    };
  }

  if (patch.op === 'reconnect') {
    const action = typeof payload.action === 'string' ? payload.action : 'change';
    const edge = asEdge(payload.edge);
    const before = asEdge(payload.before);
    if (action === 'add' && edge) {
      return {
        title: `Add relation ${edge.kind}`,
        details: `${edgeLabel(edge)}${reason ? `. ${reason}` : ''}`,
      };
    }
    if (action === 'remove' && edge) {
      return {
        title: `Remove relation ${edge.kind}`,
        details: `${edgeLabel(edge)}${reason ? `. ${reason}` : ''}`,
      };
    }
    if (before && edge) {
      return {
        title: `Reconnect relation ${edge.kind}`,
        details: `From ${before.sourceId} -> ${before.targetId} to ${edge.sourceId} -> ${edge.targetId}${reason ? `. ${reason}` : ''}`,
      };
    }
  }

  return {
    title: `${kindLabel(patch.op)} (${patch.targetId})`,
    details: reason || 'This diagram change needs confirmation before applying to SysML.',
  };
}
