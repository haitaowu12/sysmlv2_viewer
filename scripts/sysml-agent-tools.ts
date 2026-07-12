#!/usr/bin/env node
import { readFileSync, realpathSync, statSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import {
  runCompletenessReviewer,
  runInterfaceReviewer,
  runReleaseReviewer,
  runRequirementParentReviewer,
  runSemanticCompatibilityReviewer,
  runTraceabilityReviewer,
  compareCommits,
  getElement,
  getInterfaces,
  getRelationships,
  getRequirements,
  listCommits,
  modelSummaryAtCommit,
  runQualityChecks,
  sysmlCheck,
  sysmlDoctor,
  sysmlExplainDiagnostic,
  sysmlModelSummary,
  sysmlRenderView,
  sysmlTraceCoverage,
  sysmlProposePatch,
  type AgentToolFile,
} from '../src/agent-tools';
import { buildSemanticModelFromSource } from '../src/bridge/sysml-to-semantic';

type ToolName = 'doctor' | 'check' | 'explain-diagnostic' | 'model-summary' | 'review' | 'render-view' | 'semantic-compare' | 'semantic-snapshot' | 'trace-coverage'
  | 'repo-list-commits' | 'repo-model-summary' | 'repo-get-element' | 'repo-get-relationships'
  | 'repo-get-requirements' | 'repo-get-interfaces' | 'repo-quality-checks' | 'compare-commits'
  | 'propose-patch';
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

function commaValues(value?: string): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function emit(value: unknown, exitCode = 0): never {
  const output = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  let offset = 0;
  while (offset < output.length) {
    try {
      offset += writeSync(process.stdout.fd, output, offset, output.length - offset);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EAGAIN') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
  }
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

    if (tool === 'propose-patch') {
      const approvedRoot = takeOption(rawArgs, '--root');
      const repository = takeOption(approvedRoot.args, '--repo');
      const sourceCommit = takeOption(repository.args, '--source-commit');
      const modelPackage = takeOption(sourceCommit.args, '--model-package-id');
      const diagnostic = takeOption(modelPackage.args, '--diagnostic-code');
      const affected = takeOption(diagnostic.args, '--affected-element-id');
      const evidence = takeOption(affected.args, '--evidence-id');
      const rationale = takeOption(evidence.args, '--rationale');
      const postcondition = takeOption(rationale.args, '--postcondition');
      const assumption = takeOption(postcondition.args, '--assumption');
      if (!repository.value || !sourceCommit.value || !modelPackage.value) {
        fail('propose-patch requires --repo, --source-commit, and --model-package-id');
      }
      if (!rationale.value) fail('propose-patch requires --rationale');
      const files = readFiles(assumption.args, approvedRoot.value ?? process.cwd());
      if (files.length !== 2) fail('propose-patch requires source and candidate SysML files');
      emit(sysmlProposePatch({
        context,
        repositoryPath: repository.value,
        sourceCommit: sourceCommit.value,
        source: files[0],
        candidate: files[1],
        modelPackageId: modelPackage.value,
        diagnosticCodes: commaValues(diagnostic.value),
        affectedElementIds: commaValues(affected.value),
        sourceEvidenceIds: commaValues(evidence.value),
        assumptionsAdded: commaValues(assumption.value),
        rationale: rationale.value,
        expectedPostconditions: commaValues(postcondition.value),
      }));
    }

    if (tool?.startsWith('repo-') || tool === 'compare-commits') {
      const repository = takeOption(rawArgs, '--repo');
      const commit = takeOption(repository.args, '--commit');
      const before = takeOption(commit.args, '--before');
      const after = takeOption(before.args, '--after');
      const elementId = takeOption(after.args, '--element-id');
      const qualifiedPath = takeOption(elementId.args, '--qualified-path');
      const name = takeOption(qualifiedPath.args, '--name');
      const maxCount = parseLimit(name.args, '--max-count');
      const maxElements = parseLimit(maxCount.args, '--max-elements');
      const maxDiagnostics = parseLimit(maxElements.args, '--max-diagnostics');
      if (maxDiagnostics.args.length > 0) fail(`Unexpected repository arguments: ${maxDiagnostics.args.join(' ')}`);
      if (!repository.value) fail(`${tool} requires --repo`);

      if (tool === 'compare-commits') {
        if (!before.value || !after.value) fail('compare-commits requires --before and --after exact commits');
        emit(compareCommits({
          repositoryPath: repository.value,
          beforeCommit: before.value,
          afterCommit: after.value,
          context,
        }));
      }
      if (!commit.value) fail(`${tool} requires --commit`);
      const pin = { repositoryPath: repository.value, commit: commit.value };
      if (tool === 'repo-list-commits') emit(listCommits({ ...pin, maxCount: maxCount.limit }));
      if (tool === 'repo-model-summary') emit(modelSummaryAtCommit({ ...pin, context, maxElements: maxElements.limit }));
      if (tool === 'repo-get-element') emit(getElement({
        ...pin,
        elementId: elementId.value,
        qualifiedPath: qualifiedPath.value,
        name: name.value,
      }));
      if (tool === 'repo-get-relationships') {
        if (!elementId.value) fail('repo-get-relationships requires --element-id');
        emit(getRelationships({ ...pin, elementId: elementId.value }));
      }
      if (tool === 'repo-get-requirements') emit(getRequirements(pin));
      if (tool === 'repo-get-interfaces') emit(getInterfaces(pin));
      if (tool === 'repo-quality-checks') emit(runQualityChecks({
        ...pin,
        context,
        maxDiagnostics: maxDiagnostics.limit,
      }));
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

    fail(`Unknown tool '${rawTool ?? ''}'. Expected a documented local or commit-pinned repository query command.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  }
}

main();
