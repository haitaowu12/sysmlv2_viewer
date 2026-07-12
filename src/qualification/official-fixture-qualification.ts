import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { parseSysML } from '../parser/parser';
import type { SysMLNode } from '../parser/types';
import {
  OFFICIAL_CORPUS,
  OFFICIAL_FIXTURES,
  type OfficialFixtureExpectation,
} from './official-fixtures';

export interface FixtureQualificationResult {
  lane: string;
  path: string;
  sourceSha256: string;
  sourceBytes: number;
  sourceLines: number;
  status: 'pass' | 'fail';
  expected: {
    kinds: string[];
    relations: string[];
    allowedUnsupportedDiagnostics: string[];
  };
  observed: {
    topLevelElements: number;
    totalElements: number;
    unknownElements: number;
    kindCounts: Record<string, number>;
    diagnosticCounts: Record<string, number>;
    unsupportedDiagnostics: string[];
    unexpectedUnsupportedDiagnostics: string[];
  };
  failedChecks: string[];
}

export interface OfficialCorpusQualificationReport {
  schemaVersion: '1.0';
  tool: 'sysml_official_fixture_qualification';
  corpus: {
    repository: string;
    tag: string;
    expectedCommit: string;
    observedCommit: string;
    license: {
      path: string;
      spdx: string;
      sha256: string;
    };
  };
  summary: {
    status: 'pass' | 'fail';
    fixtures: number;
    passed: number;
    failed: number;
    lanes: number;
    unintendedSkips: number;
    unsupportedDiagnosticsObserved: number;
    unexpectedUnsupportedDiagnostics: number;
  };
  lanes: Array<{
    lane: string;
    fixtures: number;
    passed: number;
    failed: number;
    status: 'pass' | 'fail';
  }>;
  fixtures: FixtureQualificationResult[];
  claimBoundary: string;
}

const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

function flatten(nodes: SysMLNode[]): SysMLNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function counts(values: string[]): Record<string, number> {
  return [...new Set(values)].sort().reduce<Record<string, number>>((result, value) => {
    result[value] = values.filter((candidate) => candidate === value).length;
    return result;
  }, {});
}

export function qualifyOfficialFixture(
  corpusRoot: string,
  fixture: OfficialFixtureExpectation,
): FixtureQualificationResult {
  const absolutePath = join(corpusRoot, fixture.path);
  if (!existsSync(absolutePath)) {
    return {
      lane: fixture.lane,
      path: fixture.path,
      sourceSha256: '',
      sourceBytes: 0,
      sourceLines: 0,
      status: 'fail',
      expected: {
        kinds: fixture.expectedKinds ?? [],
        relations: fixture.expectedRelations ?? [],
        allowedUnsupportedDiagnostics: fixture.allowedUnsupported ?? [],
      },
      observed: {
        topLevelElements: 0,
        totalElements: 0,
        unknownElements: 0,
        kindCounts: {},
        diagnosticCounts: {},
        unsupportedDiagnostics: [],
        unexpectedUnsupportedDiagnostics: [],
      },
      failedChecks: ['fixture_missing'],
    };
  }

  const sourceBuffer = readFileSync(absolutePath);
  const source = sourceBuffer.toString('utf8');
  const parsed = parseSysML(source);
  const nodes = flatten(parsed.children);
  const kinds = nodes.map((node) => node.kind);
  const diagnosticCodes = parsed.errors.map((error) => error.code ?? 'unclassified');
  const unsupportedDiagnostics = [...new Set(diagnosticCodes.filter((code) => code.startsWith('unsupported:')))];
  const unexpectedUnsupportedDiagnostics = unsupportedDiagnostics.filter(
    (code) => !(fixture.allowedUnsupported ?? []).includes(code),
  );
  const unknownElements = kinds.filter((kind) => kind === 'Unknown').length;
  const unsupportedDiagnosticInstances = diagnosticCodes.filter((code) => code.startsWith('unsupported:')).length;
  const sourceLines = source.split('\n').length;
  const failedChecks: string[] = [];

  if (parsed.children.length === 0) failedChecks.push('no_top_level_elements');
  if (unsupportedDiagnosticInstances < unknownElements) failedChecks.push('unknown_element_without_unsupported_diagnostic');
  if (parsed.errors.length + unknownElements >= sourceLines) failedChecks.push('diagnostic_density_exceeds_source_lines');
  if (unexpectedUnsupportedDiagnostics.length > 0) failedChecks.push('unexpected_unsupported_diagnostic');
  for (const expectedKind of fixture.expectedKinds ?? []) {
    if (!kinds.includes(expectedKind as SysMLNode['kind'])) failedChecks.push(`missing_kind:${expectedKind}`);
  }
  for (const expectedRelation of fixture.expectedRelations ?? []) {
    if (!kinds.includes(expectedRelation as SysMLNode['kind'])) failedChecks.push(`missing_relation:${expectedRelation}`);
  }

  return {
    lane: fixture.lane,
    path: fixture.path,
    sourceSha256: sha256(sourceBuffer),
    sourceBytes: sourceBuffer.byteLength,
    sourceLines,
    status: failedChecks.length === 0 ? 'pass' : 'fail',
    expected: {
      kinds: fixture.expectedKinds ?? [],
      relations: fixture.expectedRelations ?? [],
      allowedUnsupportedDiagnostics: fixture.allowedUnsupported ?? [],
    },
    observed: {
      topLevelElements: parsed.children.length,
      totalElements: nodes.length,
      unknownElements,
      kindCounts: counts(kinds),
      diagnosticCounts: counts(diagnosticCodes),
      unsupportedDiagnostics: unsupportedDiagnostics.sort(),
      unexpectedUnsupportedDiagnostics: unexpectedUnsupportedDiagnostics.sort(),
    },
    failedChecks,
  };
}

export function qualifyOfficialCorpus(corpusPath: string): OfficialCorpusQualificationReport {
  const corpusRoot = realpathSync(corpusPath);
  const observedCommit = execFileSync('git', ['-C', corpusRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (observedCommit !== OFFICIAL_CORPUS.commit) {
    throw new Error(`official corpus commit mismatch: expected ${OFFICIAL_CORPUS.commit}, observed ${observedCommit}`);
  }
  const licensePath = join(corpusRoot, OFFICIAL_CORPUS.license.path);
  if (!existsSync(licensePath)) throw new Error(`official corpus license missing: ${OFFICIAL_CORPUS.license.path}`);

  const fixtures = OFFICIAL_FIXTURES.map((fixture) => qualifyOfficialFixture(corpusRoot, fixture));
  const laneNames = [...new Set(fixtures.map((fixture) => fixture.lane))].sort();
  const lanes = laneNames.map((lane) => {
    const laneFixtures = fixtures.filter((fixture) => fixture.lane === lane);
    const passed = laneFixtures.filter((fixture) => fixture.status === 'pass').length;
    const failed = laneFixtures.length - passed;
    return {
      lane,
      fixtures: laneFixtures.length,
      passed,
      failed,
      status: failed === 0 ? 'pass' as const : 'fail' as const,
    };
  });
  const passed = fixtures.filter((fixture) => fixture.status === 'pass').length;
  const failed = fixtures.length - passed;

  return {
    schemaVersion: '1.0',
    tool: 'sysml_official_fixture_qualification',
    corpus: {
      repository: OFFICIAL_CORPUS.repository,
      tag: OFFICIAL_CORPUS.tag,
      expectedCommit: OFFICIAL_CORPUS.commit,
      observedCommit,
      license: {
        path: OFFICIAL_CORPUS.license.path,
        spdx: OFFICIAL_CORPUS.license.spdx,
        sha256: sha256(readFileSync(licensePath)),
      },
    },
    summary: {
      status: failed === 0 ? 'pass' : 'fail',
      fixtures: fixtures.length,
      passed,
      failed,
      lanes: lanes.length,
      unintendedSkips: 0,
      unsupportedDiagnosticsObserved: fixtures.reduce(
        (total, fixture) => total + fixture.observed.unsupportedDiagnostics.length, 0,
      ),
      unexpectedUnsupportedDiagnostics: fixtures.reduce(
        (total, fixture) => total + fixture.observed.unexpectedUnsupportedDiagnostics.length, 0,
      ),
    },
    lanes,
    fixtures,
    claimBoundary: 'This report proves deterministic local parser qualification against the exact pinned fixture bytes and explicit unsupported-diagnostic allowances. It does not prove OMG conformance, engineering validity, target-tool compatibility, or project approval.',
  };
}
