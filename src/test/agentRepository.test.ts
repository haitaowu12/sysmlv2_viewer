import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RepositoryAdapterError,
  compareCommits,
  getElement,
  getInterfaces,
  getRelationships,
  getRequirements,
  listCommits,
  modelSummaryAtCommit,
  runQualityChecks,
} from '../agent-tools/repository';

const repositories: string[] = [];
const context = { engineVersion: 'test-engine', packageVersion: 'test-package' };

function git(repositoryPath: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repositoryPath, ...args], { encoding: 'utf8' }).trim();
}

function repository(): { path: string; first: string; second: string } {
  const path = mkdtempSync(join(tmpdir(), 'sysml-repository-adapter-'));
  repositories.push(path);
  git(path, 'init', '-q');
  git(path, 'config', 'user.email', 'test@example.invalid');
  git(path, 'config', 'user.name', 'Repository Adapter Test');
  writeFileSync(join(path, 'model.sysml'), `package Vehicle {
  part def Controller;
  interface def CommandLink;
  requirement def SafeStop;
}
`);
  git(path, 'add', 'model.sysml');
  git(path, 'commit', '-qm', 'first');
  const first = git(path, 'rev-parse', 'HEAD');
  writeFileSync(join(path, 'model.sysml'), `package Vehicle {
  part def Controller;
  part controller : Controller;
  interface def CommandLink;
  interface command : CommandLink;
  requirement def SafeStop;
  requirement safeStop : SafeStop;
}
`);
  git(path, 'add', 'model.sysml');
  git(path, 'commit', '-qm', 'second');
  return { path, first, second: git(path, 'rev-parse', 'HEAD') };
}

afterEach(() => {
  repositories.splice(0);
});

describe('read-only SysML Git repository adapter', () => {
  it('requires an exact, reachable commit and returns safe failures', () => {
    const repo = repository();

    expect(() => listCommits({ repositoryPath: repo.path, commit: 'HEAD' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_COMMIT_PIN' }),
    );
    expect(() => listCommits({ repositoryPath: repo.path, commit: '0'.repeat(40) })).toThrowError(
      expect.objectContaining({ code: 'COMMIT_NOT_FOUND' }),
    );
    const unreachable = git(repo.path, 'commit-tree', git(repo.path, 'write-tree'), '-m', 'dangling');
    expect(() => listCommits({ repositoryPath: repo.path, commit: unreachable })).toThrowError(
      expect.objectContaining({ code: 'STALE_COMMIT' }),
    );
    expect(() => listCommits({ repositoryPath: '/definitely/not/a/repository', commit: repo.second }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_REPOSITORY' }));

    try {
      listCommits({ repositoryPath: '/secret/customer/repository', commit: repo.second });
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryAdapterError);
      expect(String(error)).not.toContain('/secret/customer/repository');
    }
  });

  it('pins history and model reads to the requested commit', () => {
    const repo = repository();
    const commits = listCommits({ repositoryPath: repo.path, commit: repo.second });
    expect(commits.repository.commit).toBe(repo.second);
    expect(commits.commits.map((entry) => entry.commit)).toEqual([repo.second, repo.first]);

    const first = modelSummaryAtCommit({
      repositoryPath: repo.path,
      commit: repo.first,
      context,
    });
    const second = modelSummaryAtCommit({
      repositoryPath: repo.path,
      commit: repo.second,
      context,
    });
    expect(first.summary.counts.nodes).toBeLessThan(second.summary.counts.nodes);
    expect(first.files).toEqual(['model.sysml']);
  });

  it('compares two exact commits without reading dirty working-tree content', () => {
    const repo = repository();
    writeFileSync(join(repo.path, 'model.sysml'), 'not committed');
    const result = compareCommits({
      repositoryPath: repo.path,
      beforeCommit: repo.first,
      afterCommit: repo.second,
      context,
    });

    expect(result.before.commit).toBe(repo.first);
    expect(result.after.commit).toBe(repo.second);
    expect(result.before.dirtyWorkingTreeIgnored).toBe(true);
    expect(result.comparison.added.some((item) => item.qualifiedPath.includes('safeStop'))).toBe(true);
  });

  it('reads committed blobs even when the working tree is dirty', () => {
    const repo = repository();
    writeFileSync(join(repo.path, 'model.sysml'), 'not valid sysml {{{');

    const quality = runQualityChecks({
      repositoryPath: repo.path,
      commit: repo.second,
      context,
    });
    expect(quality.check.valid).toBe(true);
    expect(quality.repository.dirtyWorkingTreeIgnored).toBe(true);
  });

  it('supports bounded domain-level element and relationship queries', () => {
    const repo = repository();
    const requirements = getRequirements({ repositoryPath: repo.path, commit: repo.second });
    const interfaces = getInterfaces({ repositoryPath: repo.path, commit: repo.second });
    expect(requirements.elements.map((element) => element.name)).toEqual(['SafeStop', 'safeStop']);
    expect(interfaces.elements.map((element) => element.name)).toEqual(['CommandLink', 'command']);

    const controller = getElement({
      repositoryPath: repo.path,
      commit: repo.second,
      name: 'controller',
    });
    expect(controller.matches).toHaveLength(1);
    expect(controller.matches[0]).toMatchObject({ name: 'controller', kind: 'PartUsage' });

    const relationships = getRelationships({
      repositoryPath: repo.path,
      commit: repo.second,
      elementId: controller.matches[0].id,
    });
    expect(relationships.relationships.some((edge) => edge.kind === 'typing')).toBe(true);
  });

  it('returns diagnostics from committed invalid SysML without throwing', () => {
    const repo = repository();
    writeFileSync(join(repo.path, 'bad.sysml'), 'package Broken { part def A ');
    git(repo.path, 'add', 'bad.sysml');
    git(repo.path, 'commit', '-qm', 'invalid syntax fixture');
    const commit = git(repo.path, 'rev-parse', 'HEAD');

    const result = runQualityChecks({ repositoryPath: repo.path, commit, context });
    expect(result.check.valid).toBe(false);
    expect(result.check.diagnostics[0]).toMatchObject({ file: 'bad.sysml' });
  });
});
