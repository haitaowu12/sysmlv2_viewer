import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { sysmlCheck } from './kernel';
import { sysmlCompareModels } from './advanced';
import type { AgentToolContext, AgentToolFile } from './types';

const EXACT_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export interface PatchProposalRequest {
  context: AgentToolContext;
  repositoryPath: string;
  sourceCommit: string;
  source: AgentToolFile;
  candidate: AgentToolFile;
  modelPackageId: string;
  diagnosticCodes: string[];
  affectedElementIds: string[];
  sourceEvidenceIds: string[];
  assumptionsAdded?: string[];
  rationale: string;
  expectedPostconditions: string[];
}

export interface PatchProposalResult {
  schema_id: 'TW-SYSMLV2-PATCH-PROPOSAL';
  schema_version: '1.0';
  proposal_id: string;
  model_package_id: string;
  patch_format: 'unified_diff';
  patch_scope: 'localized_change';
  diagnostic_codes: string[];
  affected_element_ids: string[];
  source_evidence_ids: string[];
  assumptions_added: string[];
  rationale: string;
  expected_postconditions: string[];
  source_precondition: {
    source_path: string;
    source_sha256: string;
    source_commit: string;
  };
  requires_human_acceptance: true;
  auto_apply: false;
  full_file_rewrite: false;
  patch: string;
  validation: {
    sourceMatchesCommit: true;
    patchApplicable: true;
    changedLines: number;
    changedFraction: number;
    candidateCheck: ReturnType<typeof sysmlCheck>;
    semanticDelta: ReturnType<typeof sysmlCompareModels>;
  };
  mutationPerformed: false;
  claimBoundary: string;
}

function nonEmpty(values: string[], label: string): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) throw new Error(`${label} requires at least one value`);
  return normalized;
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function repositoryRelativePath(repositoryPath: string, sourcePath: string): string {
  const root = realpathSync(repositoryPath);
  const source = realpathSync(sourcePath);
  const path = relative(root, source).split(sep).join('/');
  if (!path || path === '..' || path.startsWith('../')) {
    throw new Error('source file must remain inside the repository');
  }
  return path;
}

function committedSource(repositoryPath: string, commit: string, sourcePath: string): string {
  if (!EXACT_COMMIT.test(commit)) throw new Error('source commit must be an exact full hexadecimal object ID');
  try {
    const containingRefs = execFileSync(
      'git', ['-C', repositoryPath, 'for-each-ref', `--contains=${commit}`, '--format=%(refname)'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (!containingRefs) throw new Error('unreachable');
    return execFileSync('git', ['-C', repositoryPath, 'show', `${commit}:${sourcePath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    throw new Error('source commit or committed source path could not be verified');
  }
}

function unifiedDiff(source: AgentToolFile, candidate: AgentToolFile, targetPath: string): string {
  const result = spawnSync(
    'git', ['diff', '--no-index', '--unified=3', '--', source.path, candidate.path],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status === 0) throw new Error('candidate does not differ from source');
  if (result.status !== 1 || !result.stdout) throw new Error('unified diff could not be generated');
  const lines = result.stdout.split('\n');
  const hunkIndex = lines.findIndex((line) => line.startsWith('@@ '));
  if (hunkIndex < 0) throw new Error('generated diff has no localized hunk');
  const metadata = lines.slice(0, hunkIndex).filter((line) => line.startsWith('index '));
  return [
    `diff --git a/${targetPath} b/${targetPath}`,
    ...metadata,
    `--- a/${targetPath}`,
    `+++ b/${targetPath}`,
    ...lines.slice(hunkIndex),
  ].join('\n');
}

function changedLineCount(patch: string): number {
  return patch.split('\n').filter((line) => (
    (line.startsWith('+') && !line.startsWith('+++'))
    || (line.startsWith('-') && !line.startsWith('---'))
  )).length;
}

export function sysmlProposePatch(request: PatchProposalRequest): PatchProposalResult {
  const diagnosticCodes = nonEmpty(request.diagnosticCodes, 'diagnostic_codes');
  const affectedElementIds = nonEmpty(request.affectedElementIds, 'affected_element_ids');
  const sourceEvidenceIds = nonEmpty(request.sourceEvidenceIds, 'source_evidence_ids');
  const expectedPostconditions = nonEmpty(request.expectedPostconditions, 'expected_postconditions');
  if (!request.modelPackageId.trim()) throw new Error('model_package_id is required');
  if (!request.rationale.trim()) throw new Error('rationale is required');

  const sourcePath = repositoryRelativePath(request.repositoryPath, request.source.path);
  const committed = committedSource(request.repositoryPath, request.sourceCommit, sourcePath);
  if (committed !== request.source.content) {
    throw new Error('source content does not match the exact committed precondition');
  }

  const patch = unifiedDiff(request.source, request.candidate, sourcePath);
  const changedLines = changedLineCount(patch);
  const sourceLines = Math.max(1, request.source.content.split('\n').length);
  const changedFraction = changedLines / sourceLines;
  if (changedLines > 200) throw new Error('patch exceeds 200 changed-line locality limit');
  if (changedFraction > 0.25) throw new Error('patch exceeds 25 percent source-file locality limit');

  const applicabilityRoot = mkdtempSync(join(tmpdir(), 'sysml-patch-applicability-'));
  const applicabilitySource = join(applicabilityRoot, sourcePath);
  mkdirSync(dirname(applicabilitySource), { recursive: true });
  writeFileSync(applicabilitySource, request.source.content, 'utf8');
  const applicability = spawnSync(
    'git', ['apply', '--check', '--whitespace=nowarn', '-'],
    { cwd: applicabilityRoot, input: patch, encoding: 'utf8' },
  );
  rmSync(applicabilityRoot, { recursive: true, force: true });
  if (applicability.status !== 0) throw new Error('patch does not apply to the committed source precondition');

  const candidateCheck = sysmlCheck({
    context: request.context,
    files: [{ path: sourcePath, content: request.candidate.content }],
  });
  const semanticDelta = sysmlCompareModels(
    [{ path: sourcePath, content: request.source.content }],
    [{ path: sourcePath, content: request.candidate.content }],
    request.context,
  );
  const sourceSha256 = hash(request.source.content);
  const proposalDigest = hash(JSON.stringify({
    sourcePath,
    sourceSha256,
    sourceCommit: request.sourceCommit.toLowerCase(),
    diagnosticCodes,
    affectedElementIds,
    sourceEvidenceIds,
    expectedPostconditions,
    patch,
  }));

  return {
    schema_id: 'TW-SYSMLV2-PATCH-PROPOSAL',
    schema_version: '1.0',
    proposal_id: `PATCH-${proposalDigest.slice(0, 16).toUpperCase()}`,
    model_package_id: request.modelPackageId.trim(),
    patch_format: 'unified_diff',
    patch_scope: 'localized_change',
    diagnostic_codes: diagnosticCodes,
    affected_element_ids: affectedElementIds,
    source_evidence_ids: sourceEvidenceIds,
    assumptions_added: [...new Set(request.assumptionsAdded ?? [])].sort(),
    rationale: request.rationale.trim(),
    expected_postconditions: expectedPostconditions,
    source_precondition: {
      source_path: sourcePath,
      source_sha256: sourceSha256,
      source_commit: request.sourceCommit.toLowerCase(),
    },
    requires_human_acceptance: true,
    auto_apply: false,
    full_file_rewrite: false,
    patch,
    validation: {
      sourceMatchesCommit: true,
      patchApplicable: true,
      changedLines,
      changedFraction,
      candidateCheck,
      semanticDelta,
    },
    mutationPerformed: false,
    claimBoundary: 'This is a localized review proposal. It does not apply or authorize the change, prove engineering validity, or advance project authority.',
  };
}
