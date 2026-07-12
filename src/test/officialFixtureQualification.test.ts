/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qualifyOfficialCorpus, qualifyOfficialFixture } from '../qualification/official-fixture-qualification';
import { OFFICIAL_CORPUS, OFFICIAL_FIXTURES } from '../qualification/official-fixtures';

const releaseDir = process.env.SYSML_V2_RELEASE_DIR;
const describeIfRelease = releaseDir ? describe : describe.skip;

describeIfRelease('official fixture qualification report', () => {
  it('binds every fixture lane to exact source and license evidence', () => {
    const report = qualifyOfficialCorpus(releaseDir as string);

    expect(report.corpus.expectedCommit).toBe(OFFICIAL_CORPUS.commit);
    expect(report.corpus.observedCommit).toBe(OFFICIAL_CORPUS.commit);
    expect(report.corpus.license.spdx).toBe('EPL-2.0');
    expect(report.corpus.license.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.summary).toMatchObject({
      status: 'pass',
      fixtures: OFFICIAL_FIXTURES.length,
      passed: OFFICIAL_FIXTURES.length,
      failed: 0,
      unintendedSkips: 0,
      unexpectedUnsupportedDiagnostics: 0,
    });
    expect(report.summary.lanes).toBeGreaterThanOrEqual(13);
    expect(report.fixtures.every((fixture) => fixture.sourceSha256.match(/^[0-9a-f]{64}$/))).toBe(true);
    expect(report.fixtures.every((fixture) => fixture.status === 'pass')).toBe(true);
    expect(report.lanes.every((lane) => lane.status === 'pass')).toBe(true);
    const checkedIn = JSON.parse(readFileSync(
      resolve(process.cwd(), 'docs/evidence/official-fixture-qualification.json'), 'utf8',
    ));
    expect(checkedIn).toEqual(report);
  });
});

describe('official fixture qualification failures', () => {
  it('reports a missing fixture without fabricating source evidence', () => {
    const result = qualifyOfficialFixture('/tmp', {
      lane: 'structure',
      path: 'missing.sysml',
      expectedKinds: ['Package'],
    });

    expect(result.status).toBe('fail');
    expect(result.sourceSha256).toBe('');
    expect(result.failedChecks).toEqual(['fixture_missing']);
  });
});
