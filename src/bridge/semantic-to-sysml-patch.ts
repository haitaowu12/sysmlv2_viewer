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
    case 'ConnectionDef':
      return `connection def ${quoteName(node.name)};`;
    case 'ConnectionUsage': {
      const source = node.sourceRef ?? 'source';
      const target = node.targetRef ?? 'target';
      return `connect ${source} to ${target};`;
    }
    case 'InterfaceDef':
      return `interface def ${quoteName(node.name)};`;
    case 'InterfaceUsage':
      return `interface ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'ActionDef':
      return `action def ${quoteName(node.name)};`;
    case 'ActionUsage':
      return `action ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'StateDef':
      return `state def ${quoteName(node.name)};`;
    case 'StateUsage':
      return `state ${quoteName(node.name)};`;
    case 'TransitionUsage': {
      const source = node.sourceRef ?? 'source';
      const target = node.targetRef ?? 'target';
      return `transition ${quoteName(node.name)}\n\tfirst ${source}\n\tthen ${target};`;
    }
    case 'FlowUsage': {
      const source = node.sourceRef ?? 'source';
      const target = node.targetRef ?? 'target';
      return `flow from ${source} to ${target};`;
    }
    case 'BindingUsage': {
      const source = node.sourceRef ?? 'source';
      const target = node.targetRef ?? 'target';
      return `bind ${source} = ${target};`;
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
    case 'ConstraintDef':
      return `constraint def ${quoteName(node.name)};`;
    case 'ConstraintUsage':
      return `constraint ${quoteName(node.name)};`;
    case 'AttributeUsage':
      return `attribute ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'ItemDef':
      return `item def ${quoteName(node.name)};`;
    case 'ItemUsage':
      return `item ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'EnumDef':
      return `enum def ${quoteName(node.name)};`;
    case 'EnumUsage':
      return `enum ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'UseCaseDef':
      return `use case def ${quoteName(node.name)};`;
    case 'UseCaseUsage':
      return `use case ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'ViewDef':
      return `view def ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'ViewUsage':
      return `view ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'ViewpointDef':
      return `viewpoint def ${quoteName(node.name)};`;
    case 'ViewpointUsage':
      return `viewpoint ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'AnalysisDef':
      return `analysis def ${quoteName(node.name)};`;
    case 'AnalysisUsage':
      return `analysis ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;
    case 'MetadataDef':
      return `metadata def ${quoteName(node.name)};`;
    case 'AllocationDef':
      return `allocation def ${quoteName(node.name)};`;
    case 'AllocationUsage': {
      const source = node.sourceRef ?? 'source';
      const target = node.targetRef ?? 'target';
      return `allocate ${source} to ${target};`;
    }
    case 'DependencyUsage': {
      const source = node.sourceRef ?? node.name;
      const target = node.targetRef ?? 'target';
      return `dependency from ${source} to ${target};`;
    }
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

    if (edge.kind === 'flow') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const statement = `flow from ${quoteName(sourceName)} to ${quoteName(targetName)};`;
      return { source: source.trimEnd() + `\n\n${statement}\n`, applied: true };
    }

    if (edge.kind === 'binding') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const statement = `bind ${quoteName(sourceName)} = ${quoteName(targetName)};`;
      return { source: source.trimEnd() + `\n\n${statement}\n`, applied: true };
    }

    if (edge.kind === 'transition') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const transitionName = edge.label && edge.label.trim() ? edge.label.trim() : `t_${sourceName}_to_${targetName}`;
      const statement = `transition ${quoteName(transitionName)}\n\tfirst ${quoteName(sourceName)}\n\tthen ${quoteName(targetName)};`;
      return { source: source.trimEnd() + `\n\n${statement}\n`, applied: true };
    }

    if (edge.kind === 'allocation') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const statement = `allocate ${quoteName(sourceName)} to ${quoteName(targetName)};`;
      return { source: source.trimEnd() + `\n\n${statement}\n`, applied: true };
    }

    if (edge.kind === 'dependency') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const statement = `dependency from ${quoteName(sourceName)} to ${quoteName(targetName)};`;
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

    if (edge.kind === 'flow') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const regex = new RegExp(`^.*\\bflow\\s+from\\s+['\\"]?${escapeRegex(sourceName)}['\\"]?\\s+to\\s+['\\"]?${escapeRegex(targetName)}['\\"]?.*\\n?`, 'm');
      const removed = removeTextPattern(source, regex);
      if (removed === null) {
        return { source, applied: false, reason: `Could not remove flow ${sourceName} -> ${targetName}.` };
      }
      return { source: removed, applied: true };
    }

    if (edge.kind === 'binding') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const regex = new RegExp(`^.*\\bbind\\s+['\\"]?${escapeRegex(sourceName)}['\\"]?\\s*=\\s*['\\"]?${escapeRegex(targetName)}['\\"]?.*\\n?`, 'm');
      const removed = removeTextPattern(source, regex);
      if (removed === null) {
        return { source, applied: false, reason: `Could not remove binding ${sourceName} = ${targetName}.` };
      }
      return { source: removed, applied: true };
    }

    if (edge.kind === 'allocation') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const regex = new RegExp(`^.*\\ballocate\\s+['\\"]?${escapeRegex(sourceName)}['\\"]?\\s+to\\s+['\\"]?${escapeRegex(targetName)}['\\"]?.*\\n?`, 'm');
      const removed = removeTextPattern(source, regex);
      if (removed === null) {
        return { source, applied: false, reason: `Could not remove allocation ${sourceName} -> ${targetName}.` };
      }
      return { source: removed, applied: true };
    }

    if (edge.kind === 'dependency') {
      const sourceName = sourceNameFrom(edge.sourceId);
      const targetName = sourceNameFrom(edge.targetId);
      const regex = new RegExp(`^.*\\bdependency\\b.*${escapeRegex(sourceName)}.*${escapeRegex(targetName)}.*\\n?`, 'm');
      const removed = removeTextPattern(source, regex);
      if (removed === null) {
        return { source, applied: false, reason: `Could not remove dependency ${sourceName} -> ${targetName}.` };
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
  flowBySource: Map<string, string[]>;
  bindingBySource: Map<string, string[]>;
  allocationBySource: Map<string, string[]>;
  dependencyBySource: Map<string, string[]>;
  transitionBySource: Map<string, Array<{ target: string; label?: string }>>;
  connectionTargetsByNode: Map<string, { source?: string; target?: string }>;
}

function nodeRank(kind: SemanticNode['kind']): number {
  const order: Record<SemanticNode['kind'], number> = {
    Package: 0,
    PartDef: 1,
    PartUsage: 2,
    PortDef: 3,
    PortUsage: 4,
    ConnectionDef: 5,
    ConnectionUsage: 6,
    InterfaceDef: 7,
    InterfaceUsage: 8,
    ActionDef: 9,
    ActionUsage: 10,
    StateDef: 11,
    StateUsage: 12,
    TransitionUsage: 13,
    FlowUsage: 14,
    BindingUsage: 15,
    RequirementDef: 16,
    RequirementUsage: 17,
    ConstraintDef: 18,
    ConstraintUsage: 19,
    AttributeUsage: 20,
    ItemDef: 21,
    ItemUsage: 22,
    EnumDef: 23,
    EnumUsage: 24,
    UseCaseDef: 25,
    UseCaseUsage: 26,
    ViewDef: 27,
    ViewUsage: 28,
    ViewpointDef: 29,
    ViewpointUsage: 30,
    VerificationDef: 31,
    VerificationUsage: 32,
    AnalysisDef: 33,
    AnalysisUsage: 34,
    MetadataDef: 35,
    AllocationDef: 36,
    AllocationUsage: 37,
    DependencyUsage: 38,
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
  for (const target of ctx.flowBySource.get(node.id) ?? []) {
    relationLines.push(`${'\t'.repeat(level + 1)}flow from ${quoteName(node.name)} to ${quoteName(target)};`);
  }
  for (const target of ctx.bindingBySource.get(node.id) ?? []) {
    relationLines.push(`${'\t'.repeat(level + 1)}bind ${quoteName(node.name)} = ${quoteName(target)};`);
  }
  for (const target of ctx.allocationBySource.get(node.id) ?? []) {
    relationLines.push(`${'\t'.repeat(level + 1)}allocate ${quoteName(node.name)} to ${quoteName(target)};`);
  }
  for (const target of ctx.dependencyBySource.get(node.id) ?? []) {
    relationLines.push(`${'\t'.repeat(level + 1)}dependency from ${quoteName(node.name)} to ${quoteName(target)};`);
  }
  for (const transition of ctx.transitionBySource.get(node.id) ?? []) {
    const name = transition.label && transition.label !== 'transition' ? transition.label : `t_${node.name}_to_${transition.target}`;
    relationLines.push(`${'\t'.repeat(level + 1)}transition ${quoteName(name)} first ${quoteName(node.name)} then ${quoteName(transition.target)};`);
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

    case 'ConnectionDef':
      return `${i}connection def ${quoteName(node.name)};`;

    case 'ConnectionUsage': {
      const endpoints = ctx.connectionTargetsByNode.get(node.id) ?? {};
      const sourceRef = node.sourceRef ?? endpoints.source ?? 'source';
      const targetRef = node.targetRef ?? endpoints.target ?? 'target';
      return `${i}connect ${quoteName(sourceRef)} to ${quoteName(targetRef)};`;
    }

    case 'InterfaceDef':
      return `${i}interface def ${quoteName(node.name)};`;

    case 'InterfaceUsage':
      return `${i}interface ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;

    case 'ActionDef': {
      const header = `${i}action def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'ActionUsage': {
      const header = `${i}action ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'StateDef': {
      const header = `${i}state def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'StateUsage': {
      const header = `${i}state ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'TransitionUsage': {
      const sourceRef = node.sourceRef ?? 'source';
      const targetRef = node.targetRef ?? 'target';
      return `${i}transition ${quoteName(node.name)}\n${i}\tfirst ${quoteName(sourceRef)}\n${i}\tthen ${quoteName(targetRef)};`;
    }

    case 'FlowUsage': {
      const sourceRef = node.sourceRef ?? 'source';
      const targetRef = node.targetRef ?? 'target';
      return `${i}flow from ${quoteName(sourceRef)} to ${quoteName(targetRef)};`;
    }

    case 'BindingUsage': {
      const sourceRef = node.sourceRef ?? 'source';
      const targetRef = node.targetRef ?? 'target';
      return `${i}bind ${quoteName(sourceRef)} = ${quoteName(targetRef)};`;
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

    case 'ConstraintDef':
      return `${i}constraint def ${quoteName(node.name)};`;

    case 'ConstraintUsage':
      return `${i}constraint ${quoteName(node.name)};`;

    case 'AttributeUsage':
      return `${i}attribute ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;

    case 'ItemDef':
      return `${i}item def ${quoteName(node.name)};`;

    case 'ItemUsage':
      return `${i}item ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;

    case 'EnumDef':
      return `${i}enum def ${quoteName(node.name)};`;

    case 'EnumUsage':
      return `${i}enum ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;

    case 'UseCaseDef': {
      const header = `${i}use case def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'UseCaseUsage': {
      const header = `${i}use case ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'ViewDef': {
      const header = `${i}view def ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'ViewUsage': {
      const header = `${i}view ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'ViewpointDef': {
      const header = `${i}viewpoint def ${quoteName(node.name)}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
    }

    case 'ViewpointUsage': {
      const header = `${i}viewpoint ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''}`;
      if (bodyLines.length === 0) return `${header};`;
      return `${header} {\n${bodyLines.join('\n')}\n${i}}`;
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

    case 'AnalysisDef':
      return `${i}analysis def ${quoteName(node.name)};`;

    case 'AnalysisUsage':
      return `${i}analysis ${quoteName(node.name)}${node.typeName ? ` : ${node.typeName}` : ''};`;

    case 'MetadataDef':
      return `${i}metadata def ${quoteName(node.name)};`;

    case 'AllocationDef':
      return `${i}allocation def ${quoteName(node.name)};`;

    case 'AllocationUsage': {
      const sourceRef = node.sourceRef ?? 'source';
      const targetRef = node.targetRef ?? 'target';
      return `${i}allocate ${quoteName(sourceRef)} to ${quoteName(targetRef)};`;
    }

    case 'DependencyUsage': {
      const sourceRef = node.sourceRef ?? node.name;
      const targetRef = node.targetRef ?? 'target';
      return `${i}dependency from ${quoteName(sourceRef)} to ${quoteName(targetRef)};`;
    }

    default:
      return `${i}// Unsupported ${node.kind} ${node.name}`;
  }
}

export function semanticModelToSysmlSource(model: SemanticModel): string {
  const childrenByParent = new Map<string, SemanticNode[]>();
  const satisfyBySource = new Map<string, string[]>();
  const verifyBySource = new Map<string, string[]>();
  const flowBySource = new Map<string, string[]>();
  const bindingBySource = new Map<string, string[]>();
  const allocationBySource = new Map<string, string[]>();
  const dependencyBySource = new Map<string, string[]>();
  const transitionBySource = new Map<string, Array<{ target: string; label?: string }>>();
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

    if (edge.kind === 'flow') {
      const bucket = flowBySource.get(edge.sourceId) ?? [];
      bucket.push(targetName);
      flowBySource.set(edge.sourceId, bucket);
    }

    if (edge.kind === 'binding') {
      const bucket = bindingBySource.get(edge.sourceId) ?? [];
      bucket.push(targetName);
      bindingBySource.set(edge.sourceId, bucket);
    }

    if (edge.kind === 'allocation') {
      const bucket = allocationBySource.get(edge.sourceId) ?? [];
      bucket.push(targetName);
      allocationBySource.set(edge.sourceId, bucket);
    }

    if (edge.kind === 'dependency') {
      const bucket = dependencyBySource.get(edge.sourceId) ?? [];
      bucket.push(targetName);
      dependencyBySource.set(edge.sourceId, bucket);
    }

    if (edge.kind === 'transition') {
      const bucket = transitionBySource.get(edge.sourceId) ?? [];
      bucket.push({ target: targetName, label: edge.label });
      transitionBySource.set(edge.sourceId, bucket);
    }
  }

  const ctx: RenderContext = {
    childrenByParent,
    satisfyBySource,
    verifyBySource,
    flowBySource,
    bindingBySource,
    allocationBySource,
    dependencyBySource,
    transitionBySource,
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
