import { parseSysML } from '../parser/parser';
import type { SysMLModel, SysMLNode } from '../parser/types';
import type {
  ApplySyncPatchResult,
  SemanticEdge,
  SemanticModel,
  SemanticNode,
  SyncPatch,
} from './semantic-types';
import { buildSemanticModelFromSource, indexSysmlSemanticNodes } from './sysml-to-semantic';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteName(name: string): string {
  return /\s/.test(name) ? `'${name}'` : name;
}

function getLineIndentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const line = source.slice(lineStart, offset);
  const match = line.match(/^\s*/);
  return match?.[0] ?? '';
}

function cleanupDeletedRange(source: string, start: number, end: number): string {
  let deleteStart = start;
  let deleteEnd = end;

  while (deleteStart > 0 && source[deleteStart - 1] !== '\n' && /\s/.test(source[deleteStart - 1])) {
    deleteStart -= 1;
  }

  while (deleteEnd < source.length && source[deleteEnd] === ' ') {
    deleteEnd += 1;
  }

  if (source[deleteEnd] === '\n') {
    deleteEnd += 1;
  }

  return source.slice(0, deleteStart) + source.slice(deleteEnd);
}

function replaceFirst(pattern: RegExp, text: string, replacement: string): string | null {
  if (!pattern.test(text)) return null;
  return text.replace(pattern, replacement);
}

function renameNodeSnippet(kind: SemanticNode['kind'], snippet: string, oldName: string, newName: string): string | null {
  const nextName = quoteName(newName);

  const byKindPatterns: Array<{ kinds: SemanticNode['kind'][]; regex: RegExp }> = [
    { kinds: ['Package'], regex: /(\bpackage\s+)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['PartDef'], regex: /(\bpart\s+def\s+(?:<[^>]+>\s*)?)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['PartUsage'], regex: /(\bpart\s+(?:redefines\s+)?)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['PortDef'], regex: /(\bport\s+def\s+(?:<[^>]+>\s*)?)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['PortUsage'], regex: /(\bport\s+(?:inout\s+|in\s+|out\s+)?(?:~\s*)?)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['RequirementDef'], regex: /(\brequirement\s+def\s+(?:<[^>]+>\s*)?)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['RequirementUsage'], regex: /(\b(?:satisfy|requirement)\s+)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['VerificationDef'], regex: /(\bverification\s+def\s+(?:<[^>]+>\s*)?)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['VerificationUsage'], regex: /(\b(?:verify|verification)\s+)(?:'[^']+'|[A-Za-z_][\w]*)/ },
    { kinds: ['ConnectionUsage'], regex: /(\bconnection\s+)(?:'[^']+'|[A-Za-z_][\w]*)/ },
  ];

  for (const pattern of byKindPatterns) {
    if (!pattern.kinds.includes(kind)) continue;
    const replaced = replaceFirst(pattern.regex, snippet, `$1${nextName}`);
    if (replaced) return replaced;
  }

  const fallbackRegex = new RegExp(`\\b${escapeRegex(oldName)}\\b`);
  const fallback = replaceFirst(fallbackRegex, snippet, newName);
  if (fallback) return fallback;

  const quotedFallback = new RegExp(`'${escapeRegex(oldName)}'`);
  return replaceFirst(quotedFallback, snippet, quoteName(newName));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNode(value: unknown): SemanticNode | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SemanticNode>;

  if (!candidate.id || !candidate.kind || !candidate.name || !candidate.sysmlPath) {
    return null;
  }

  return {
    id: candidate.id,
    kind: candidate.kind,
    name: candidate.name,
    sysmlPath: candidate.sysmlPath,
    parentId: candidate.parentId,
    typeName: candidate.typeName,
    sourceRef: candidate.sourceRef,
    targetRef: candidate.targetRef,
  };
}

function asEdge(value: unknown): SemanticEdge | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SemanticEdge>;
  if (!candidate.id || !candidate.kind || !candidate.sourceId || !candidate.targetId) {
    return null;
  }

  return {
    id: candidate.id,
    kind: candidate.kind,
    sourceId: candidate.sourceId,
    targetId: candidate.targetId,
    label: candidate.label,
  };
}

interface SemanticLookup {
  byId: Map<string, SysMLNode>;
  parentById: Map<string, SysMLNode | undefined>;
}

function buildLookup(model: SysMLModel): SemanticLookup {
  const entries = indexSysmlSemanticNodes(model);
  const byId = new Map<string, SysMLNode>();
  const parentById = new Map<string, SysMLNode | undefined>();

  for (const entry of entries) {
    byId.set(entry.id, entry.node);
  }

  for (const entry of entries) {
    parentById.set(entry.id, entry.parentId ? byId.get(entry.parentId) : undefined);
  }

  return { byId, parentById };
}

function renderNodeStatement(node: SemanticNode): string {
  switch (node.kind) {
    case 'Package':
      return `package ${quoteName(node.name)} {\n}`;
    case 'PartDef':
      return `part def ${quoteName(node.name)};`;
    case 'PartUsage':
      return `part ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'PortDef':
      return `port def ${quoteName(node.name)};`;
    case 'PortUsage':
      return `port ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'ConnectionUsage': {
      const source = node.sourceRef ?? 'source';
      const target = node.targetRef ?? 'target';
      return `connect ${source} to ${target};`;
    }
    case 'RequirementDef':
      return `requirement def ${quoteName(node.name)};`;
    case 'RequirementUsage':
      return node.typeName
        ? `requirement ${quoteName(node.name)} : ${node.typeName};`
        : `satisfy ${quoteName(node.name)};`;
    case 'VerificationDef':
      return `verification def ${quoteName(node.name)};`;
    case 'VerificationUsage':
      return node.typeName
        ? `verification ${quoteName(node.name)} : ${node.typeName};`
        : `verify ${quoteName(node.name)};`;
    default:
      return `// Unsupported node ${node.kind} ${node.name}`;
  }
}

function insertIntoParentOrAppend(
  source: string,
  statement: string,
  parentNode?: SysMLNode,
): string {
  if (parentNode?.location) {
    const insertPos = Math.max(parentNode.location.start.offset, parentNode.location.end.offset - 1);
    const parentIndent = getLineIndentAt(source, parentNode.location.start.offset);
    const insertion = `\n${parentIndent}\t${statement}`;
    return source.slice(0, insertPos) + insertion + source.slice(insertPos);
  }

  return source.trimEnd() + `\n\n${statement}\n`;
}

function removeTextPattern(source: string, pattern: RegExp): string | null {
  if (!pattern.test(source)) return null;
  return source.replace(pattern, '');
}

function applyReconnectPatch(source: string, patch: SyncPatch, semanticModel: SemanticModel): { source: string; applied: boolean; reason?: string } {
  const payload = patch.payload as Record<string, unknown>;
  const action = asString(payload.action) ?? 'change';
  const edge = asEdge(payload.edge);
  const before = asEdge(payload.before);

  if (!edge && action !== 'change') {
    return { source, applied: false, reason: 'Reconnect patch missing edge payload.' };
  }

  const nodeById = new Map(semanticModel.nodes.map((node) => [node.id, node]));

  const sourceNameFrom = (id: string): string => nodeById.get(id)?.name ?? id;

  if (action === 'add' && edge) {
    if (edge.kind === 'satisfy' || edge.kind === 'verify') {
      const targetName = sourceNameFrom(edge.targetId);
      const statement = `${edge.kind === 'satisfy' ? 'satisfy' : 'verify'} ${quoteName(targetName)};`;
      return { source: source.trimEnd() + `\n\n${statement}\n`, applied: true };
    }

    if (edge.kind === 'connection') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const statement = `connect ${quoteName(sourceName)} to ${quoteName(targetName)};`;
      return { source: source.trimEnd() + `\n\n${statement}\n`, applied: true };
    }

    return { source, applied: false, reason: `Unsupported reconnect add kind: ${edge.kind}` };
  }

  if (action === 'remove' && edge) {
    if (edge.kind === 'satisfy' || edge.kind === 'verify') {
      const targetName = sourceNameFrom(edge.targetId);
      const regex = new RegExp(`^.*\\b${edge.kind}\\s+['\\"]?${escapeRegex(targetName)}['\\"]?.*\\n?`, 'm');
      const removed = removeTextPattern(source, regex);
      if (removed === null) {
        return { source, applied: false, reason: `Could not remove ${edge.kind} relation for ${targetName}.` };
      }
      return { source: removed, applied: true };
    }

    if (edge.kind === 'connection') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const regex = new RegExp(`^.*\\bconnect\\s+['\\"]?${escapeRegex(sourceName)}['\\"]?\\s+to\\s+['\\"]?${escapeRegex(targetName)}['\\"]?.*\\n?`, 'm');
      const removed = removeTextPattern(source, regex);
      if (removed === null) {
        return { source, applied: false, reason: `Could not remove connection ${sourceName} -> ${targetName}.` };
      }
      return { source: removed, applied: true };
    }

    return { source, applied: false, reason: `Unsupported reconnect remove kind: ${edge.kind}` };
  }

  if (action === 'change' && edge && before) {
    const removed = applyReconnectPatch(source, {
      ...patch,
      payload: { action: 'remove', edge: before },
    }, semanticModel);

    if (!removed.applied) return removed;

    return applyReconnectPatch(removed.source, {
      ...patch,
      payload: { action: 'add', edge },
    }, semanticModel);
  }

  return { source, applied: false, reason: 'Unsupported reconnect patch action.' };
}

interface RenderContext {
  childrenByParent: Map<string, SemanticNode[]>;
  satisfyBySource: Map<string, string[]>;
  verifyBySource: Map<string, string[]>;
  connectionTargetsByNode: Map<string, { source?: string; target?: string }>;
}

function nodeRank(kind: SemanticNode['kind']): number {
  const order: Record<SemanticNode['kind'], number> = {
    Package: 0,
    PartDef: 1,
    PartUsage: 2,
    PortDef: 3,
    PortUsage: 4,
    ConnectionUsage: 5,
    RequirementDef: 6,
    RequirementUsage: 7,
    VerificationDef: 8,
    VerificationUsage: 9,
    Unknown: 99,
  };
  return order[kind] ?? 99;
}

function sortNodes(nodes: SemanticNode[]): SemanticNode[] {
  return [...nodes].sort((a, b) => {
    const rankDiff = nodeRank(a.kind) - nodeRank(b.kind);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}

function renderNode(node: SemanticNode, level: number, ctx: RenderContext): string {
  const i = '\t'.repeat(level);
  const children = sortNodes(ctx.childrenByParent.get(node.id) ?? []);

  const relationLines: string[] = [];
  for (const target of ctx.satisfyBySource.get(node.id) ?? []) {
    relationLines.push(`${'\t'.repeat(level + 1)}satisfy ${quoteName(target)};`);
  }
  for (const target of ctx.verifyBySource.get(node.id) ?? []) {
    relationLines.push(`${'\t'.repeat(level + 1)}verify ${quoteName(target)};`);
  }

  const renderedChildren = children.map((child) => renderNode(child, level + 1, ctx));
  const bodyLines = [...renderedChildren, ...relationLines].filter(Boolean);

  switch (node.kind) {
    case 'Package': {
      const header = `${i}package ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'PartDef': {
      const header = `${i}part def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'PartUsage': {
      const header = `${i}part ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'PortDef':
      return `${i}port def ${quoteName(node.name)};`;

    case 'PortUsage':
      return `${i}port ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;

    case 'ConnectionUsage': {
      const endpoints = ctx.connectionTargetsByNode.get(node.id) ?? {};
      const sourceRef = node.sourceRef ?? endpoints.source ?? 'source';
      const targetRef = node.targetRef ?? endpoints.target ?? 'target';
      return `${i}connect ${quoteName(sourceRef)} to ${quoteName(targetRef)};`;
    }

    case 'RequirementDef': {
      const header = `${i}requirement def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'RequirementUsage': {
      if (node.typeName) {
        return `${i}requirement ${quoteName(node.name)} : ${node.typeName};`;
      }
      return `${i}satisfy ${quoteName(node.name)};`;
    }

    case 'VerificationDef': {
      const header = `${i}verification def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'VerificationUsage': {
      if (node.typeName) {
        return `${i}verification ${quoteName(node.name)} : ${node.typeName};`;
      }
      return `${i}verify ${quoteName(node.name)};`;
    }

    default:
      return `${i}// Unsupported ${node.kind} ${node.name}`;
  }
}

export function semanticModelToSysmlSource(model: SemanticModel): string {
  const childrenByParent = new Map<string, SemanticNode[]>();
  const satisfyBySource = new Map<string, string[]>();
  const verifyBySource = new Map<string, string[]>();
  const connectionTargetsByNode = new Map<string, { source?: string; target?: string }>();
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));

  for (const node of model.nodes) {
    const parentKey = node.parentId ?? '__root__';
    const bucket = childrenByParent.get(parentKey) ?? [];
    bucket.push(node);
    childrenByParent.set(parentKey, bucket);
  }

  for (const edge of model.edges) {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;

    const targetName = nodeById.get(edge.targetId)?.name ?? edge.targetId;

    if (edge.kind === 'satisfy') {
      const bucket = satisfyBySource.get(edge.sourceId) ?? [];
      bucket.push(targetName);
      satisfyBySource.set(edge.sourceId, bucket);
    }

    if (edge.kind === 'verify') {
      const bucket = verifyBySource.get(edge.sourceId) ?? [];
      bucket.push(targetName);
      verifyBySource.set(edge.sourceId, bucket);
    }

    if (edge.kind === 'connection') {
      const targetNode = nodeById.get(edge.targetId);
      if (!targetNode) continue;

      const bucket = connectionTargetsByNode.get(edge.sourceId) ?? {};
      if (edge.label === 'source') {
        bucket.source = targetNode.name;
      } else if (edge.label === 'target') {
        bucket.target = targetNode.name;
      }
      connectionTargetsByNode.set(edge.sourceId, bucket);
    }
  }

  const ctx: RenderContext = {
    childrenByParent,
    satisfyBySource,
    verifyBySource,
    connectionTargetsByNode,
  };

  const roots = sortNodes(childrenByParent.get('__root__') ?? []);
  if (roots.length === 0) {
    return "package ImportedModel {\n\tpart def System;\n}";
  }

  const renderedRoots = roots.map((node) => renderNode(node, 0, ctx));
  const hasTopLevelPackage = roots.some((node) => node.kind === 'Package');

  if (hasTopLevelPackage) {
    return renderedRoots.join('\n\n');
  }

  const wrapped = renderedRoots.map((line) => `\t${line.replace(/\n/g, '\n\t')}`);
  return `package ImportedModel {\n${wrapped.join('\n\n')}\n}`;
}

export function applySyncPatches(sourceCode: string, patches: SyncPatch[]): ApplySyncPatchResult {
  let working = sourceCode;
  const appliedPatches: SyncPatch[] = [];
  const reviewPatches: SyncPatch[] = [];
  const diagnostics: string[] = [];

  for (const patch of patches) {
    if (patch.safety === 'review_required') {
      reviewPatches.push(patch);
      continue;
    }

    const parsed = parseSysML(working);
    const lookup = buildLookup(parsed);
    const semanticModel = buildSemanticModelFromSource(working);

    if (patch.op === 'move_resize') {
      appliedPatches.push(patch);
      continue;
    }

    if (patch.op === 'add_node') {
      const payload = patch.payload as Record<string, unknown>;
      const node = asNode(payload.node) ?? asNode(payload);
      if (!node) {
        reviewPatches.push({ ...patch, safety: 'review_required' });
        diagnostics.push(`Patch ${patch.id}: add_node missing node payload.`);
        continue;
      }

      const parentId = asString(payload.parentId) ?? node.parentId;
      const parentNode = parentId ? lookup.byId.get(parentId) : undefined;
      const statement = renderNodeStatement(node);
      working = insertIntoParentOrAppend(working, statement, parentNode);
      appliedPatches.push(patch);
      continue;
    }

    if (patch.op === 'remove_node') {
      const target = lookup.byId.get(patch.targetId);
      if (!target?.location) {
        reviewPatches.push({ ...patch, safety: 'review_required' });
        diagnostics.push(`Patch ${patch.id}: remove_node target not found.`);
        continue;
      }

      working = cleanupDeletedRange(working, target.location.start.offset, target.location.end.offset);
      appliedPatches.push(patch);
      continue;
    }

    if (patch.op === 'rename_node') {
      const target = lookup.byId.get(patch.targetId);
      const semanticTarget = semanticModel.nodes.find((node) => node.id === patch.targetId);

      if (!target?.location || !semanticTarget) {
        reviewPatches.push({ ...patch, safety: 'review_required' });
        diagnostics.push(`Patch ${patch.id}: rename target not found.`);
        continue;
      }

      const payload = patch.payload as Record<string, unknown>;
      const toName = asString(payload.to) ?? asString(payload.name) ?? semanticTarget.name;

      const snippet = working.slice(target.location.start.offset, target.location.end.offset);
      const renamedSnippet = renameNodeSnippet(
        semanticTarget.kind,
        snippet,
        semanticTarget.name,
        toName,
      );

      if (!renamedSnippet) {
        reviewPatches.push({ ...patch, safety: 'review_required' });
        diagnostics.push(`Patch ${patch.id}: failed to rename ${semanticTarget.name} to ${toName}.`);
        continue;
      }

      working =
        working.slice(0, target.location.start.offset) +
        renamedSnippet +
        working.slice(target.location.end.offset);

      appliedPatches.push(patch);
      continue;
    }

    if (patch.op === 'relabel') {
      const payload = patch.payload as Record<string, unknown>;
      const toName = asString(payload.to);
      const edge = asEdge(payload.edge);

      if (edge && edge.kind === 'connection') {
        appliedPatches.push(patch);
        diagnostics.push(`Patch ${patch.id}: connection relabel preserved in Draw.io only.`);
        continue;
      }

      if (!toName) {
        reviewPatches.push({ ...patch, safety: 'review_required' });
        diagnostics.push(`Patch ${patch.id}: relabel missing 'to'.`);
        continue;
      }

      const syntheticPatch: SyncPatch = {
        ...patch,
        op: 'rename_node',
        payload: {
          from: asString(payload.from) ?? '',
          to: toName,
        },
      };

      const recursive = applySyncPatches(working, [syntheticPatch]);
      working = recursive.sourceCode;
      appliedPatches.push(...recursive.appliedPatches);
      reviewPatches.push(...recursive.reviewPatches);
      diagnostics.push(...recursive.diagnostics);
      continue;
    }

    if (patch.op === 'reconnect') {
      const result = applyReconnectPatch(working, patch, semanticModel);
      if (!result.applied) {
        reviewPatches.push({ ...patch, safety: 'review_required' });
        diagnostics.push(`Patch ${patch.id}: ${result.reason ?? 'reconnect failed.'}`);
        continue;
      }

      working = result.source;
      appliedPatches.push(patch);
      continue;
    }

    reviewPatches.push({ ...patch, safety: 'review_required' });
    diagnostics.push(`Patch ${patch.id}: unsupported patch op ${patch.op}.`);
  }

  return {
    sourceCode: working,
    appliedPatches,
    reviewPatches,
    diagnostics,
  };
}
