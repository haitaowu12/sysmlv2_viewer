import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import {
  createCandidateAdapter,
  readCandidateManifest,
  type EngineCandidate,
  type LspProcessAdapter,
} from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

interface FixtureManifest {
  schemaVersion: number
  qualificationRelease: {
    name: string
    commit: string
  }
  fixtures: Array<{
    id: string
    workspace: string
    purpose: string[]
    expectation:
      | 'zero-errors'
      | 'zero-diagnostics'
      | 'one-or-more-errors'
      | 'inventory-only'
  }>
}

interface FixtureObservation {
  id: string
  status: 'pass' | 'fail' | 'skipped'
  expectation: string
  reason?: string
  durationMs?: number
  snapshotSha256?: string
  documentCount?: number
  diagnostics?: {
    errors: number
    warnings: number
    information: number
    hints: number
  }
  normalizedDiagnostics?: Array<{
    file: string
    severity: string
    code: string
    message: string
    range?: unknown
  }>
  processEvidence?: ReturnType<LspProcessAdapter['evidence']>
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const candidateManifestPath = resolve(
  repositoryRoot,
  'config/language-engine-candidates.json',
)
const fixtureManifestPath = resolve(
  repositoryRoot,
  'fixtures/language/fixture-manifest.json',
)
const outputDirectory = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'generated/qualification/phase1-fixtures'),
)
const candidateManifest = await readCandidateManifest(candidateManifestPath)
const fixtureManifest = JSON.parse(
  await readFile(fixtureManifestPath, 'utf8'),
) as FixtureManifest
validateFixtureManifest(fixtureManifest)
if (
  fixtureManifest.qualificationRelease.commit !==
  candidateManifest.qualificationRelease.commit
) {
  throw new Error('Fixture and candidate qualification releases do not match')
}

await mkdir(outputDirectory, { recursive: true })
const candidateResults = []
for (const candidate of candidateManifest.candidates) {
  candidateResults.push(await observeCandidate(candidate))
}

const runnable = candidateResults.filter(
  (candidate) => candidate.status !== 'blocked',
)
const report = {
  schemaVersion: 1,
  outcome: runnable.length === 0 ? 'blocked' : 'incomplete',
  selection: null,
  qualificationRelease: candidateManifest.qualificationRelease,
  behavioralOracle: candidateManifest.behavioralOracle,
  fixtureManifest: relative(repositoryRoot, fixtureManifestPath),
  candidates: candidateResults,
}
await writeFile(
  resolve(outputDirectory, 'fixture-qualification-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exitCode = report.outcome === 'blocked' ? 2 : 1

async function observeCandidate(candidate: EngineCandidate) {
  if (candidate.adapter !== 'lsp-stdio') {
    return {
      id: candidate.id,
      pin: candidate.commit,
      status: 'blocked' as const,
      reason: `Adapter lane is ${candidate.adapter}`,
      fixtures: [],
    }
  }
  if (
    !candidate.commandEnvironment ||
    !process.env[candidate.commandEnvironment]
  ) {
    return {
      id: candidate.id,
      pin: candidate.commit,
      status: 'blocked' as const,
      reason: `Executable is not configured via ${candidate.commandEnvironment}`,
      fixtures: [],
    }
  }

  const observations: FixtureObservation[] = []
  for (const fixture of fixtureManifest.fixtures) {
    if (fixture.expectation === 'inventory-only') {
      observations.push({
        id: fixture.id,
        status: 'skipped',
        expectation: fixture.expectation,
        reason: 'Covered by the byte-preservation control test, not semantic interpretation',
      })
      continue
    }
    observations.push(await observeFixture(candidate, fixture))
  }
  return {
    id: candidate.id,
    pin: candidate.commit,
    status: observations.some((fixture) => fixture.status === 'fail')
      ? ('failed' as const)
      : ('observed' as const),
    fixtures: observations,
  }
}

async function observeFixture(
  candidate: EngineCandidate,
  fixture: FixtureManifest['fixtures'][number],
): Promise<FixtureObservation> {
  const startedAt = performance.now()
  const workspaceFile = resolve(dirname(fixtureManifestPath), fixture.workspace)
  const adapter = await createCandidateAdapter(
    candidateManifestPath,
    candidate.id,
    {
      requestTimeoutMs: 120_000,
      diagnosticSettleMs: 10_000,
    },
  )
  const manager = new WorkspaceManager({
    allowedRoots: [dirname(workspaceFile)],
    adapter,
  })
  try {
    const status = await manager.open(workspaceFile)
    const diagnostics = manager
      .diagnostics(status.workspaceId)
      .map((diagnostic) => ({
        file: diagnostic.uri.startsWith(status.rootUri)
          ? diagnostic.uri.slice(status.rootUri.length).replace(/^\/+/, '')
          : diagnostic.uri,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        range: diagnostic.range,
      }))
      .sort((left, right) =>
        `${left.file}:${left.code}:${left.message}`.localeCompare(
          `${right.file}:${right.code}:${right.message}`,
        ),
      )
    const expectationMet =
      fixture.expectation === 'zero-errors'
        ? status.diagnostics.errors === 0
        : fixture.expectation === 'zero-diagnostics'
          ? diagnostics.length === 0
          : status.diagnostics.errors > 0
    await sealRawEvidence(candidate.id, fixture.id, adapter)
    return {
      id: fixture.id,
      status: expectationMet ? 'pass' : 'fail',
      expectation: fixture.expectation,
      reason: expectationMet
        ? undefined
        : `Observed ${status.diagnostics.errors} errors and ${diagnostics.length} total diagnostics`,
      durationMs: Math.round(performance.now() - startedAt),
      snapshotSha256: status.snapshotSha256,
      documentCount: status.documentCount,
      diagnostics: status.diagnostics,
      normalizedDiagnostics: diagnostics,
      processEvidence: adapter.evidence(),
    }
  } catch (error) {
    await sealRawEvidence(candidate.id, fixture.id, adapter)
    return {
      id: fixture.id,
      status: 'fail',
      expectation: fixture.expectation,
      reason: error instanceof Error ? error.message : 'Candidate fixture failed',
      durationMs: Math.round(performance.now() - startedAt),
      processEvidence: adapter.evidence(),
    }
  } finally {
    await manager.dispose()
  }
}

async function sealRawEvidence(
  candidateId: string,
  fixtureId: string,
  adapter: LspProcessAdapter,
): Promise<void> {
  const raw = adapter.rawEvidence()
  const directory = resolve(outputDirectory, candidateId, fixtureId)
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'stdout.lsp'), raw.stdout)
  await writeFile(resolve(directory, 'stderr.log'), raw.stderr)
}

function validateFixtureManifest(manifest: FixtureManifest): void {
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.fixtures) ||
    manifest.fixtures.length < 4 ||
    !/^[0-9a-f]{40}$/.test(manifest.qualificationRelease.commit)
  ) {
    throw new Error('Fixture manifest is incomplete')
  }
  const ids = new Set<string>()
  for (const fixture of manifest.fixtures) {
    if (
      !fixture.id ||
      ids.has(fixture.id) ||
      !fixture.workspace ||
      !Array.isArray(fixture.purpose)
    ) {
      throw new Error(`Invalid or duplicate fixture: ${fixture.id}`)
    }
    ids.add(fixture.id)
  }
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
