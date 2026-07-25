import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const fixturesPath = requiredValue('--fixtures')
const operationsPath = requiredValue('--operations')
const mediumPath = requiredValue('--medium')
const largePath = requiredValue('--large')
const outputPath = resolve(requiredValue('--output'))

const [fixtureBytes, operationBytes, mediumBytes, largeBytes] =
  await Promise.all([
    readFile(fixturesPath),
    readFile(operationsPath),
    readFile(mediumPath),
    readFile(largePath),
  ])
const fixtures = JSON.parse(fixtureBytes.toString('utf8'))
const operations = JSON.parse(operationBytes.toString('utf8'))
const medium = JSON.parse(mediumBytes.toString('utf8'))
const large = JSON.parse(largeBytes.toString('utf8'))

const report = {
  schemaVersion: 1,
  selection: {
    outcome: 'HYBRID GO',
    semanticAuthority: 'vinqut',
    authoringAssistant: 'spec42',
  },
  qualificationRelease: fixtures.qualificationRelease,
  behavioralOracle: fixtures.behavioralOracle,
  sourceEvidence: [
    evidence('exact-library-fixtures', fixtureBytes),
    evidence('language-operations', operationBytes),
    evidence('medium-benchmark', mediumBytes),
    evidence('large-benchmark', largeBytes),
  ],
  fixtureComparisons: fixtures.candidates.map(
    (candidate: Record<string, unknown>) => ({
      id: candidate.id,
      status: candidate.status,
      fixtures: Array.isArray(candidate.fixtures)
        ? candidate.fixtures.map((fixture: Record<string, unknown>) => ({
            id: fixture.id,
            status: fixture.status,
            documentCount: fixture.documentCount,
            diagnostics: fixture.diagnostics,
            durationMs: fixture.durationMs,
          }))
        : [],
    }),
  ),
  operationComparisons: operations.candidates.map(
    (candidate: Record<string, unknown>) => ({
      id: candidate.id,
      status: candidate.status,
      diagnostics: candidate.diagnostics,
      capabilities: candidate.capabilities,
      operations: candidate.operations,
    }),
  ),
  benchmarks: [benchmarkSummary(medium), benchmarkSummary(large)],
}

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

function evidence(kind: string, bytes: Buffer): {
  kind: string
  sha256: string
} {
  return {
    kind,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function benchmarkSummary(value: Record<string, any>) {
  const runs = value.result.runs as Array<Record<string, any>>
  return {
    profile: value.profile,
    repetitions: value.result.repetitions,
    distributions: value.result.distributions,
    allRunsValid: value.result.allRunsValid,
    peakLanguageProcessRssBytes: {
      semantic: maximumMemory(runs, 'semantic'),
      authoring: maximumMemory(runs, 'authoring'),
    },
  }
}

function maximumMemory(
  runs: Array<Record<string, any>>,
  role: string,
): number | null {
  const values = runs.flatMap((run) => [
    run.languageProcessRssBytes?.afterCold?.[role],
    run.languageProcessRssBytes?.afterWarm?.[role],
  ])
  const numeric = values.filter(
    (value): value is number => typeof value === 'number',
  )
  return numeric.length > 0 ? Math.max(...numeric) : null
}

function requiredValue(flag: string): string {
  const index = process.argv.indexOf(flag)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`${flag} is required`)
  return resolve(value)
}
