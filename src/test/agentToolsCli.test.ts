/// <reference types="node" />

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const runner = process.execPath;
const script = resolve(root, '.agent-tools/sysml-agent-tools.mjs');
const temporaryDirectories: string[] = [];

function fixture(name: string, content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'sysml-agent-tools-'));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

function run(...args: string[]) {
  return spawnSync(runner, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function git(repositoryPath: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', repositoryPath, ...args], { encoding: 'utf8' });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout.trim();
}

function repositoryFixture(): { path: string; before: string; after: string } {
  const path = mkdtempSync(join(tmpdir(), 'sysml-agent-tools-repo-'));
  temporaryDirectories.push(path);
  git(path, 'init', '-q');
  git(path, 'config', 'user.email', 'test@example.invalid');
  git(path, 'config', 'user.name', 'CLI Test');
  writeFileSync(join(path, 'model.sysml'), `package P {
  // Qualification fixture line 1
  // Qualification fixture line 2
  // Qualification fixture line 3
  // Qualification fixture line 4
  requirement def Safe;
}
`, 'utf8');
  git(path, 'add', 'model.sysml');
  git(path, 'commit', '-qm', 'before');
  const before = git(path, 'rev-parse', 'HEAD');
  writeFileSync(join(path, 'model.sysml'), `package P {
  // Qualification fixture line 1
  // Qualification fixture line 2
  // Qualification fixture line 3
  // Qualification fixture line 4
  requirement def Safe;
  requirement safe : Safe;
}
`, 'utf8');
  git(path, 'add', 'model.sysml');
  git(path, 'commit', '-qm', 'after');
  return { path, before, after: git(path, 'rev-parse', 'HEAD') };
}

beforeAll(() => {
  const result = spawnSync('npm', ['run', 'build:agent-tools', '--silent'], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SysML agent tools CLI', () => {
  it('checks a valid model through the executable JSON contract', () => {
    const path = fixture('valid.sysml', 'part def Vehicle;');
    const result = run('check', '--root', dirname(path), path);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toMatchObject({
      schemaVersion: '1.0',
      tool: 'sysml_check',
      valid: true,
      engine: { name: 'sysml-viewer', version: 'bridge-v1' },
    });
    expect(payload.filesExamined[0].path).toBe(realpathSync(path));
  });

  it('returns structured diagnostics and nonzero status for an invalid model', () => {
    const path = fixture('invalid.sysml', 'part def {');
    const result = run('check', '--root', dirname(path), path);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.valid).toBe(false);
    expect(payload.diagnostics[0]).toMatchObject({
      code: 'parser:syntax-error',
      file: realpathSync(path),
      sourceLocation: expect.any(Object),
    });
  });

  it('summarizes a model with independent element truncation metadata', () => {
    const path = fixture('summary.sysml', 'package P { part def Vehicle; part def Engine; }');
    const result = run('model-summary', '--root', dirname(path), '--max-elements', '1', path);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.tool).toBe('sysml_model_summary');
    expect(payload.counts.nodes).toBe(3);
    expect(payload.elements).toHaveLength(1);
    expect(payload.elementTruncation).toMatchObject({ truncated: true, total: 3, returned: 1 });
    expect(payload.truncation).toMatchObject({ truncated: false, total: 0 });
  });

  it('runs deterministic reviewers and advanced read-only tools through JSON contracts', () => {
    const path = fixture('model.sysml', `
      part def System;
      part def Operator;
      use case def Operate {
        subject system : System;
        actor operator : Operator;
        objective { doc /* Operate the system. */ }
      }
      requirement safe { subject system : System; }
      verification def SafeReview {
        subject system : System;
        objective reviewObjective { verify safe; }
      }
    `);
    const review = run('review', '--reviewer', 'completeness', '--root', dirname(path), path);
    expect(review.status).toBe(0);
    expect(JSON.parse(review.stdout)).toMatchObject({
      tool: 'sysml_review',
      reviewer: 'completeness',
      counts: { error: 0 },
    });

    const trace = run('trace-coverage', '--root', dirname(path), path);
    expect(trace.status).toBe(0);
    expect(JSON.parse(trace.stdout).tool).toBe('sysml_trace_coverage');

    const view = run('render-view', '--root', dirname(path), path);
    expect(view.status).toBe(0);
    expect(JSON.parse(view.stdout)).toMatchObject({ tool: 'sysml_render_view', format: 'mermaid' });
  });

  it('snapshots and compares semantic graphs deterministically', () => {
    const baseline = fixture('baseline.sysml', 'package P { part def Vehicle; }');
    const equivalent = fixture('equivalent.sysml', 'package P { part def Vehicle; }');
    const changed = fixture('changed.sysml', 'package P { part def Vehicle; part def Engine; }');

    const snapshot = run('semantic-snapshot', '--root', tmpdir(), baseline);
    expect(snapshot.status).toBe(0);
    expect(JSON.parse(snapshot.stdout)).toMatchObject({
      tool: 'sysml_semantic_snapshot',
      counts: { nodes: 2 },
      semanticSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const same = run('semantic-compare', '--root', tmpdir(), baseline, equivalent);
    expect(same.status).toBe(0);
    expect(JSON.parse(same.stdout)).toMatchObject({ equivalent: true });

    const different = run('semantic-compare', '--root', tmpdir(), baseline, changed);
    expect(different.status).toBe(1);
    expect(JSON.parse(different.stdout)).toMatchObject({
      equivalent: false,
      differences: { addedNodes: expect.arrayContaining([expect.objectContaining({ name: 'Engine' })]) },
    });
  });

  it('flushes large JSON snapshots before exiting', () => {
    const definitions = Array.from({ length: 500 }, (_, index) => `part def Part${index};`).join('\n');
    const path = fixture('large.sysml', `package Large { ${definitions} }`);
    const result = run('semantic-snapshot', '--root', dirname(path), path);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.counts.nodes).toBe(501);
    expect(payload.nodes).toHaveLength(501);
  });

  it('exposes exact commit-pinned repository queries and comparisons', () => {
    const repo = repositoryFixture();
    writeFileSync(join(repo.path, 'model.sysml'), 'not committed', 'utf8');

    const requirements = run(
      'repo-get-requirements', '--repo', repo.path, '--commit', repo.after,
    );
    expect(requirements.status).toBe(0);
    expect(JSON.parse(requirements.stdout)).toMatchObject({
      repository: { commit: repo.after, dirtyWorkingTreeIgnored: true },
      elements: expect.arrayContaining([expect.objectContaining({ name: 'safe' })]),
    });

    const comparison = run(
      'compare-commits', '--repo', repo.path, '--before', repo.before, '--after', repo.after,
    );
    expect(comparison.status).toBe(0);
    expect(JSON.parse(comparison.stdout)).toMatchObject({
      before: { commit: repo.before },
      after: { commit: repo.after },
      comparison: { added: expect.arrayContaining([expect.objectContaining({ qualifiedPath: expect.stringContaining('safe') })]) },
    });

    const unpinned = run('repo-get-requirements', '--repo', repo.path, '--commit', 'HEAD');
    expect(unpinned.status).toBe(2);
    expect(JSON.parse(unpinned.stdout).error).toBe('Commit must be an exact full hexadecimal object ID.');
  });

  it('emits a human-gated diagnostic patch proposal without applying it', () => {
    const repo = repositoryFixture();
    const sourcePath = join(repo.path, 'model.sysml');
    const source = git(repo.path, 'show', `${repo.after}:model.sysml`);
    const candidatePath = join(repo.path, 'candidate.sysml');
    writeFileSync(
      candidatePath,
      `${source.replace('  requirement safe : Safe;', '  requirement safe : Safe;\n  requirement reviewed : Safe;')}\n`,
      'utf8',
    );
    const result = run(
      'propose-patch',
      '--root', repo.path,
      '--repo', repo.path,
      '--source-commit', repo.after,
      '--model-package-id', 'TEST-MODEL',
      '--diagnostic-code', 'SYSML-TRACE-001',
      '--affected-element-id', 'EL-REQ-REVIEWED',
      '--evidence-id', 'EVID-001',
      '--rationale', 'Add the source-backed reviewed requirement usage.',
      '--postcondition', 'candidate parses without errors',
      sourcePath,
      candidatePath,
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema_id: 'TW-SYSMLV2-PATCH-PROPOSAL',
      requires_human_acceptance: true,
      auto_apply: false,
      full_file_rewrite: false,
      validation: { sourceMatchesCommit: true, patchApplicable: true },
      mutationPerformed: false,
    });
    expect(git(repo.path, 'status', '--porcelain')).toContain('?? candidate.sysml');
  });

  it('rejects files outside the approved root and non-SysML extensions', () => {
    const path = fixture('model.sysml', 'part def Vehicle;');
    const outside = run('check', '--root', root, path);
    expect(outside.status).toBe(2);
    expect(JSON.parse(outside.stdout).error).toBe('file is outside approved root');

    const textPath = fixture('model.txt', 'part def Vehicle;');
    const wrongType = run('check', '--root', dirname(textPath), textPath);
    expect(wrongType.status).toBe(2);
    expect(JSON.parse(wrongType.stdout).error).toBe('only .sysml files are accepted');
  });
});
