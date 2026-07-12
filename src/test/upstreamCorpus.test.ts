/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qualifyOfficialFixture } from '../qualification/official-fixture-qualification';
import { OFFICIAL_CORPUS, OFFICIAL_FIXTURES } from '../qualification/official-fixtures';

const releaseDir = process.env.SYSML_V2_RELEASE_DIR;

// An unset corpus path is an intentional local/CI skip. A configured but missing,
// unreadable, or unpinned checkout must run and fail closed instead of silently skipping.
const describeIfRelease = releaseDir ? describe : describe.skip;

describeIfRelease('SysML v2 release corpus smoke fixtures', () => {
  it('uses the pinned SysML v2 release corpus commit', () => {
    expect(existsSync(releaseDir as string), 'SYSML_V2_RELEASE_DIR should point to an existing checkout').toBe(true);

    const actualCommit = execFileSync('git', ['-C', releaseDir as string, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(actualCommit, 'SYSML_V2_RELEASE_DIR should resolve to the documented 2026-04 corpus commit').toBe(OFFICIAL_CORPUS.commit);
  });

  for (const fixture of OFFICIAL_FIXTURES) {
    it(`parses or recovers visibly from ${fixture.lane}: ${fixture.path}`, () => {
      const result = qualifyOfficialFixture(releaseDir as string, fixture);
      expect(result.status, `${fixture.path}: ${result.failedChecks.join(', ')}`).toBe('pass');
      expect(result.observed.unexpectedUnsupportedDiagnostics).toEqual([]);
    });
  }
});
