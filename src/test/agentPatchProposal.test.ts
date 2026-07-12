/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sysmlProposePatch } from '../agent-tools/patch-proposal';

const directories: string[] = [];
const context = { engineVersion: 'test-engine', packageVersion: 'test-package' };

function git(repository: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
}

function repositoryFixture() {
  const repository = mkdtempSync(join(tmpdir(), 'sysml-patch-proposal-'));
  directories.push(repository);
  git(repository, 'init', '-q');
  git(repository, 'config', 'user.email', 'test@example.invalid');
  git(repository, 'config', 'user.name', 'Patch Proposal Test');
  const sourcePath = join(repository, 'model.sysml');
  const definitions = Array.from({ length: 20 }, (_, index) => `  part def Part${index};`).join('\n');
  const source = `package P {\n${definitions}\n}\n`;
  writeFileSync(sourcePath, source, 'utf8');
  git(repository, 'add', 'model.sysml');
  git(repository, 'commit', '-qm', 'baseline');
  const commit = git(repository, 'rev-parse', 'HEAD');
  const candidatePath = join(repository, 'candidate.sysml');
  const candidate = source.replace('  part def Part10;', '  part def Part10;\n  part def Added;');
  writeFileSync(candidatePath, candidate, 'utf8');
  return { repository, sourcePath, source, candidatePath, candidate, commit };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('diagnostic-driven SysML patch proposals', () => {
  it('produces a deterministic local unified diff without applying it', () => {
    const fixture = repositoryFixture();
    const request = {
      context,
      repositoryPath: fixture.repository,
      sourceCommit: fixture.commit,
      source: { path: fixture.sourcePath, content: fixture.source },
      candidate: { path: fixture.candidatePath, content: fixture.candidate },
      modelPackageId: 'TEST-MODEL',
      diagnosticCodes: ['SYSML-TEST-001'],
      affectedElementIds: ['EL-PART-ADDED'],
      sourceEvidenceIds: ['EVID-TEST-001'],
      assumptionsAdded: [],
      rationale: 'Add the source-backed missing part definition.',
      expectedPostconditions: ['candidate parses without errors'],
    };

    const first = sysmlProposePatch(request);
    const second = sysmlProposePatch(request);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schema_id: 'TW-SYSMLV2-PATCH-PROPOSAL',
      patch_format: 'unified_diff',
      patch_scope: 'localized_change',
      requires_human_acceptance: true,
      auto_apply: false,
      full_file_rewrite: false,
      source_precondition: {
        source_path: 'model.sysml',
        source_commit: fixture.commit,
      },
      validation: {
        sourceMatchesCommit: true,
        patchApplicable: true,
        candidateCheck: { valid: true },
      },
      mutationPerformed: false,
    });
    expect(first.patch).toContain('diff --git a/model.sysml b/model.sysml');
    expect(first.patch).toContain('+  part def Added;');
    expect(first.validation.semanticDelta.added.some((item) => item.qualifiedPath.includes('Added'))).toBe(true);
    expect(git(fixture.repository, 'status', '--porcelain')).toContain('?? candidate.sysml');
  });

  it('rejects stale source content and non-local changes', () => {
    const fixture = repositoryFixture();
    const base = {
      context,
      repositoryPath: fixture.repository,
      sourceCommit: fixture.commit,
      source: { path: fixture.sourcePath, content: fixture.source },
      candidate: { path: fixture.candidatePath, content: fixture.candidate },
      modelPackageId: 'TEST-MODEL',
      diagnosticCodes: ['SYSML-TEST-001'],
      affectedElementIds: ['EL-PART-ADDED'],
      sourceEvidenceIds: ['EVID-TEST-001'],
      rationale: 'Repair a diagnosed omission.',
      expectedPostconditions: ['candidate parses without errors'],
    };
    expect(() => sysmlProposePatch({
      ...base,
      source: { ...base.source, content: `${fixture.source}// drift\n` },
    })).toThrow('source content does not match the exact committed precondition');

    const rewritten = 'package Replacement { part def Only; }\n';
    writeFileSync(fixture.candidatePath, rewritten, 'utf8');
    expect(() => sysmlProposePatch({
      ...base,
      candidate: { path: fixture.candidatePath, content: rewritten },
    })).toThrow('25 percent source-file locality limit');
  });
});
