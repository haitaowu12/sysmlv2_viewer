#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import {
  runCompletenessReviewer,
  runInterfaceReviewer,
  runReleaseReviewer,
  runRequirementParentReviewer,
  runSemanticCompatibilityReviewer,
  runTraceabilityReviewer,
  sysmlCheck,
  sysmlDoctor,
  sysmlExplainDiagnostic,
  sysmlModelSummary,
  sysmlRenderView,
  sysmlTraceCoverage,
  type AgentToolFile,
} from '../src/agent-tools';
import { buildSemanticModelFromSource } from '../src/bridge/sysml-to-semantic';

type ToolName = 'doctor' | 'check' | 'explain-diagnostic' | 'model-summary' | 'review' | 'render-view' | 'semantic-compare' | 'semantic-snapshot' | 'trace-coverage';
type ReviewerName = 'completeness' | 'traceability' | 'requirement-parent' | 'interface' | 'semantic-compatibility' | 'release';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const context = {
  engineVersion: 'bridge-v1',
  packageVersion: packageJson.version,
};

const MAX_FILES = 100;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function readFiles(paths: string[], approvedRoot: string): AgentToolFile[] {
  if (paths.length > MAX_FILES) throw new Error(`file count exceeds ${MAX_FILES}`);
  let root: string;
  try {
    root = realpathSync(resolve(approvedRoot));
  } catch {
    throw new Error('approved root could not be resolved');
  }
  let totalBytes = 0;
  return paths.map((path) => {
    let absolutePath: string;
    try {
      absolutePath = realpathSync(resolve(path));
    } catch {
      throw new Error('file could not be read');
    }
    if (absolutePath !== root && !absolutePath.startsWith(root + sep)) {
      throw new Error('file is outside approved root');
    }
    if (extname(absolutePath).toLowerCase() !== '.sysml') {
      throw new Error('only .sysml files are accepted');
    }
    const size = statSync(absolutePath).size;
    if (size > MAX_FILE_BYTES) throw new Error(`file exceeds ${MAX_FILE_BYTES} bytes`);
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`files exceed ${MAX_TOTAL_BYTES} bytes total`);
    return {
      path: absolutePath,
      content: readFileSync(absolutePath, 'utf8'),
    };
  });
}

function takeOption(args: string[], flag: string): { args: string[]; value?: string } {
  const index = args.indexOf(flag);
  if (index < 0) return { args };
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return {
    args: args.filter((_, itemIndex) => itemIndex !== index && itemIndex !== index + 1),
    value,
  };
}

function parseLimit(args: string[], flag: string): { args: string[]; limit?: number } {
  const index = args.indexOf(flag);
  if (index < 0) return { args };
  const raw = args[index + 1];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(`${flag} requires a non-negative integer`);
  }
  return {
    args: args.filter((_, itemIndex) => itemIndex !== index && itemIndex !== index + 1),
    limit: Number(raw),
  };
}

function emit(value: unknown, exitCode = 0): never {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(exitCode);
}

function fail(message: string): never {
  emit({
    schemaVersion: '1.0',
    tool: 'sysml_agent_tools',
    error: message,
    mutationPerformed: false,
  }, 2);
}

function semanticSnapshot(file: AgentToolFile) {
  const model = buildSemanticModelFromSource(file.content);
  const pathById = new Map(model.nodes.map((node) => [node.id, node.sysmlPath]));
  const nodes = model.nodes.map((node) => ({
    kind: node.kind,
    sysmlPath: node.sysmlPath,
    name: node.name,
    ...(node.typeName ? { typeName: node.typeName } : {}),
    ...(node.specializes ? { specializes: node.specializes } : {}),
    ...(node.redefines ? { redefines: node.redefines } : {}),
    ...(node.sourceRef ? { sourceRef: node.sourceRef } : {}),
    ...(node.targetRef ? { targetRef: node.targetRef } : {}),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const edges = model.edges.map((edge) => ({
    kind: edge.kind,
    source: pathById.get(edge.sourceId) ?? edge.sourceId,
    target: pathById.get(edge.targetId) ?? edge.targetId,
    ...(edge.label ? { label: edge.label } : {}),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const payload = { nodes, edges };
  const canonical = JSON.stringify(payload);
  return {
    schemaVersion: '1.0',
    tool: 'sysml_semantic_snapshot',
    engineVersion: model.version,
    file: file.path,
    sourceSha256: createHash('sha256').update(file.content).digest('hex'),
    semanticSha256: createHash('sha256').update(canonical).digest('hex'),
    counts: { nodes: nodes.length, edges: edges.length },
    ...payload,
  };
}

function multisetDifference(left: unknown[], right: unknown[]): unknown[] {
  const remaining = new Map<string, number>();
  for (const item of right) {
    const key = JSON.stringify(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const difference: unknown[] = [];
  for (const item of left) {
    const key = JSON.stringify(item);
    const count = remaining.get(key) ?? 0;
    if (count > 0) remaining.set(key, count - 1);
    else difference.push(item);
  }
  return difference;
}

function main(): never {
  const [rawTool, ...rawArgs] = process.argv.slice(2);
  const tool = rawTool as ToolName | undefined;

  try {
    if (tool === 'explain-diagnostic') {
      const code = rawArgs[0];
      if (!code) fail('explain-diagnostic requires a diagnostic code');
      emit(sysmlExplainDiagnostic({ context, code }));
    }

    const approvedRoot = takeOption(rawArgs, '--root');
    const reviewerOption = takeOption(approvedRoot.args, '--reviewer');
    const diagnosticsLimit = parseLimit(reviewerOption.args, '--max-diagnostics');
    const elementLimit = parseLimit(diagnosticsLimit.args, '--max-elements');
    const files = readFiles(elementLimit.args, approvedRoot.value ?? process.cwd());

    if (tool === 'doctor') {
      emit(sysmlDoctor({ context, files, maxDiagnostics: diagnosticsLimit.limit }));
    }
    if (tool === 'check') {
      if (files.length === 0) fail('check requires at least one SysML file');
      const result = sysmlCheck({ context, files, maxDiagnostics: diagnosticsLimit.limit });
      emit(result, result.valid ? 0 : 1);
    }
    if (tool === 'model-summary') {
      if (files.length === 0) fail('model-summary requires at least one SysML file');
      emit(sysmlModelSummary({ context, files, maxElements: elementLimit.limit }));
    }
    if (tool === 'trace-coverage') {
      if (files.length === 0) fail('trace-coverage requires at least one SysML file');
      emit(sysmlTraceCoverage(files, context));
    }
    if (tool === 'render-view') {
      if (files.length === 0) fail('render-view requires at least one SysML file');
      emit(sysmlRenderView(files, context));
    }
    if (tool === 'semantic-snapshot') {
      if (files.length !== 1) fail('semantic-snapshot requires exactly one SysML file');
      emit(semanticSnapshot(files[0]));
    }
    if (tool === 'semantic-compare') {
      if (files.length !== 2) fail('semantic-compare requires exactly two SysML files');
      const baseline = semanticSnapshot(files[0]);
      const candidate = semanticSnapshot(files[1]);
      const removedNodes = multisetDifference(baseline.nodes, candidate.nodes);
      const addedNodes = multisetDifference(candidate.nodes, baseline.nodes);
      const removedEdges = multisetDifference(baseline.edges, candidate.edges);
      const addedEdges = multisetDifference(candidate.edges, baseline.edges);
      const equivalent = removedNodes.length === 0 && addedNodes.length === 0
        && removedEdges.length === 0 && addedEdges.length === 0;
      emit({
        schemaVersion: '1.0',
        tool: 'sysml_semantic_compare',
        engineVersion: baseline.engineVersion,
        baseline: { file: baseline.file, sourceSha256: baseline.sourceSha256, semanticSha256: baseline.semanticSha256, counts: baseline.counts },
        candidate: { file: candidate.file, sourceSha256: candidate.sourceSha256, semanticSha256: candidate.semanticSha256, counts: candidate.counts },
        equivalent,
        differences: { removedNodes, addedNodes, removedEdges, addedEdges },
        mutationPerformed: false,
      }, equivalent ? 0 : 1);
    }
    if (tool === 'review') {
      if (files.length === 0) fail('review requires at least one SysML file');
      const reviewer = reviewerOption.value as ReviewerName | undefined;
      if (!reviewer) fail('review requires --reviewer');
      const runners: Record<ReviewerName, () => ReturnType<typeof runCompletenessReviewer>> = {
        completeness: () => runCompletenessReviewer(files),
        traceability: () => runTraceabilityReviewer(files),
        'requirement-parent': () => runRequirementParentReviewer(files),
        interface: () => runInterfaceReviewer(files),
        'semantic-compatibility': () => runSemanticCompatibilityReviewer(files),
        release: () => runReleaseReviewer(files, context),
      };
      const runner = runners[reviewer];
      if (!runner) fail(`Unknown reviewer '${reviewer}'.`);
      const result = runner();
      emit(result, result.counts.error > 0 ? 1 : 0);
    }

    fail(`Unknown tool '${rawTool ?? ''}'. Expected doctor, check, explain-diagnostic, model-summary, review, render-view, semantic-compare, semantic-snapshot, or trace-coverage.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  }
}

main();
