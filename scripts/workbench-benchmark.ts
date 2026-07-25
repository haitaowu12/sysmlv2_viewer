import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  createCandidateAdapter,
  createQualifiedHybridAdapter,
  HybridLanguageAdapter,
  LspProcessAdapter,
  type LanguageAdapter,
  readCandidateManifest,
} from '../packages/language-adapter/src/index.js'
import { buildExplorerProjection } from '../packages/projection-engine/src/index.js'
import { compareSemanticSnapshots } from '../packages/semantic-diff/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const profiles = {
  small: { files: 10, elements: 1_000 },
  medium: { files: 100, elements: 10_000 },
  large: { files: 500, elements: 50_000 },
} as const
const expectedGeneratedDiagnosticCodes = new Set([
  'missing-doc',
  'unused-definition',
])

type ProfileName = keyof typeof profiles

interface BenchmarkRun {
  run: number
  coldOpenMs: number
  warmOpenMs: number
  semanticSnapshotMs: number | null
  explorerQueryMs: number | null
  firstUsefulExplorerMs: number | null
  diagramProjectionMs: number | null
  matrixUpdateMs: number | null
  semanticDiffMs: number | null
  definitionMs: number | null
  incrementalDiagnosticsMs: number | null
  authoringFirstCompletionMs: number | null
  authoringWarmCompletionMs: number | null
  validWorkspaceClean: boolean
  deterministicSnapshot: boolean
  diagnosticsStable: boolean
  [key: string]: unknown
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const profileName = (valueAfter('--profile') ?? 'small') as ProfileName
if (!(profileName in profiles)) {
  throw new Error('--profile must be small, medium, or large')
}
const candidateId = valueAfter('--candidate')
if (!candidateId) throw new Error('--candidate is required')
const repetitions = Number.parseInt(valueAfter('--repetitions') ?? '1', 10)
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 40) {
  throw new Error('--repetitions must be an integer from 1 to 40')
}
const warmups = Number.parseInt(valueAfter('--warmups') ?? '0', 10)
if (!Number.isInteger(warmups) || warmups < 0 || warmups > 10) {
  throw new Error('--warmups must be an integer from 0 to 10')
}
const outputRoot = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, `generated/benchmarks/${profileName}`),
)
const modelRoot = resolve(outputRoot, 'model')
const reportPath = resolve(outputRoot, 'benchmark-report.json')
const candidateManifestPath = resolve(
  repositoryRoot,
  'config/language-engine-candidates.json',
)
const runtimeLockPath = resolve(
  repositoryRoot,
  'config/language-engine-runtime-lock.json',
)
const candidateManifest = await readCandidateManifest(candidateManifestPath)
const candidate = candidateManifest.candidates.find(
  (item) => item.id === candidateId,
)
if (!candidate && candidateId !== 'qualified-hybrid') {
  throw new Error(`Unknown candidate: ${candidateId}`)
}

const generated = await generateWorkspace(
  outputRoot,
  profileName,
  profiles[profileName],
)
const runs: BenchmarkRun[] = []
let measuredWorkspaceBytes = 0
for (let run = 1; run <= repetitions + warmups; run += 1) {
  const adapter = await createBenchmarkAdapter()
  const manager = new WorkspaceManager({
    allowedRoots: [outputRoot],
    adapter,
    maxFiles: profiles.large.files,
    maxBytes: 512 * 1024 * 1024,
  })
  const memoryBefore = process.memoryUsage().rss
  try {
    const coldStartedAt = performance.now()
    const cold = await manager.open(generated.workspaceFile)
    const coldOpenMs = Math.round(performance.now() - coldStartedAt)
    const coldDiagnostics = manager.diagnostics(cold.workspaceId)
    const memoryAfterCold = process.memoryUsage().rss
    const engineMemoryAfterCold = await languageProcessMemory(adapter)

    await manager.close(cold.workspaceId)
    const warmStartedAt = performance.now()
    const warm = await manager.open(generated.workspaceFile)
    const warmOpenMs = Math.round(performance.now() - warmStartedAt)
    const memoryAfterWarm = process.memoryUsage().rss
    const engineMemoryAfterWarm = await languageProcessMemory(adapter)
    const diagnostics = manager.diagnostics(warm.workspaceId)
    let semanticSnapshotMs: number | null = null
    let explorerQueryMs: number | null = null
    let semanticElementCount: number | null = null
    let semanticRelationshipCount: number | null = null
    let explorerResultCount: number | null = null
    let firstUsefulExplorerMs: number | null = null
    let diagramProjectionMs: number | null = null
    let matrixUpdateMs: number | null = null
    let semanticDiffMs: number | null = null
    let definitionMs: number | null = null
    let incrementalDiagnosticsMs: number | null = null
    let authoringFirstCompletionMs: number | null = null
    let authoringWarmCompletionMs: number | null = null
    if (
      candidateId === 'qualified-hybrid' &&
      adapter.capabilities.semanticEvidence
    ) {
      const semanticStartedAt = performance.now()
      const semanticSnapshot = await manager.semanticSnapshot(warm.workspaceId)
      semanticSnapshotMs = Math.round(performance.now() - semanticStartedAt)
      const queryStartedAt = performance.now()
      const explorerQuery = await manager.modelQuery(warm.workspaceId, {
        schemaVersion: 1,
        mode: 'containment',
        depth: 3,
        maxResults: 10_000,
      })
      explorerQueryMs = Math.round(performance.now() - queryStartedAt)
      semanticElementCount = semanticSnapshot.elements.length
      semanticRelationshipCount = semanticSnapshot.relationships.length
      explorerResultCount = explorerQuery.elements.length
      firstUsefulExplorerMs =
        warmOpenMs + semanticSnapshotMs + explorerQueryMs

      const diagramStartedAt = performance.now()
      buildExplorerProjection(semanticSnapshot, {
        mode: 'containment',
        depth: 3,
        maxResults: 500,
      })
      diagramProjectionMs = preciseDuration(diagramStartedAt)

      const matrixStartedAt = performance.now()
      semanticSnapshot.elements
        .filter((element) =>
          `${element.name} ${element.qualifiedName} ${element.kind}`
            .toLocaleLowerCase()
            .includes('element_5'),
        )
        .sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName))
      matrixUpdateMs = preciseDuration(matrixStartedAt)

      const afterSnapshot = structuredClone(semanticSnapshot)
      const changed = afterSnapshot.elements.at(-1)
      if (changed) {
        changed.name = `${changed.name}_changed`
        changed.qualifiedName = `${changed.qualifiedName}_changed`
        changed.fingerprint = `${changed.fingerprint}-changed`
        afterSnapshot.snapshotSha256 = 'changed-benchmark-snapshot'
      }
      const diffStartedAt = performance.now()
      compareSemanticSnapshots(semanticSnapshot, afterSnapshot)
      semanticDiffMs = preciseDuration(diffStartedAt)
    }
    const primaryDocument = warm.documents[0]
    if (primaryDocument && adapter.capabilities.definitions) {
      const definitionStartedAt = performance.now()
      await manager.definition(warm.workspaceId, primaryDocument.uri, {
        line: 1,
        character: 15,
      })
      definitionMs = preciseDuration(definitionStartedAt)
    }
    if (primaryDocument && adapter.changeDocument) {
      const document = manager.readDocument(
        warm.workspaceId,
        primaryDocument.uri,
      )
      const changedText = document.text.replace(
        'part def',
        'doc /* incremental benchmark */ part def',
      )
      const diagnosticsStartedAt = performance.now()
      await manager.changeDocument(
        warm.workspaceId,
        primaryDocument.uri,
        document.version + 1,
        changedText,
      )
      incrementalDiagnosticsMs = preciseDuration(diagnosticsStartedAt)
      await manager.changeDocument(
        warm.workspaceId,
        primaryDocument.uri,
        document.version + 2,
        document.text,
      )
    }
    if (primaryDocument && adapter.capabilities.completion) {
      const firstCompletionStartedAt = performance.now()
      await manager.completion(warm.workspaceId, primaryDocument.uri, {
        line: 1,
        character: 15,
      })
      authoringFirstCompletionMs = preciseDuration(firstCompletionStartedAt)
      const warmCompletionStartedAt = performance.now()
      await manager.completion(warm.workspaceId, primaryDocument.uri, {
        line: 1,
        character: 15,
      })
      authoringWarmCompletionMs = preciseDuration(warmCompletionStartedAt)
    }
    measuredWorkspaceBytes = warm.documents.reduce(
      (total, document) => total + document.byteLength,
      0,
    )
    const coldDiagnosticCodes = countDiagnosticCodes(coldDiagnostics)
    const diagnosticCodes = countDiagnosticCodes(diagnostics)

    const measurement = {
      run: run - warmups,
      coldOpenMs,
      warmOpenMs,
      semanticSnapshotMs,
      explorerQueryMs,
      firstUsefulExplorerMs,
      diagramProjectionMs,
      matrixUpdateMs,
      semanticDiffMs,
      definitionMs,
      incrementalDiagnosticsMs,
      authoringFirstCompletionMs,
      authoringWarmCompletionMs,
      semanticElementCount,
      semanticRelationshipCount,
      explorerResultCount,
      coldDiagnostics: cold.diagnostics,
      warmDiagnostics: warm.diagnostics,
      coldDiagnosticCodes,
      warmDiagnosticCodes: diagnosticCodes,
      diagnosticsStable:
        JSON.stringify(cold.diagnostics) === JSON.stringify(warm.diagnostics) &&
        JSON.stringify(coldDiagnosticCodes) === JSON.stringify(diagnosticCodes),
      validWorkspaceClean:
        cold.diagnostics.errors === 0 &&
        warm.diagnostics.errors === 0 &&
        [...coldDiagnostics, ...diagnostics].every((diagnostic) =>
          expectedGeneratedDiagnosticCodes.has(diagnostic.code),
        ),
      deterministicSnapshot: cold.snapshotSha256 === warm.snapshotSha256,
      clientProcessRssBytes: {
        before: memoryBefore,
        afterCold: memoryAfterCold,
        afterWarm: memoryAfterWarm,
      },
      languageProcessRssBytes: {
        afterCold: engineMemoryAfterCold,
        afterWarm: engineMemoryAfterWarm,
      },
      languageProcess: languageProcessEvidence(adapter),
      diagnosticSamples: diagnostics.slice(0, 10).map((diagnostic) => ({
        file: diagnostic.uri.startsWith(warm.rootUri)
          ? diagnostic.uri.slice(warm.rootUri.length).replace(/^\/+/, '')
          : diagnostic.uri,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        range: diagnostic.range,
      })),
    }
    if (run > warmups) runs.push(measurement)
  } finally {
    await manager.dispose()
  }
}

const report = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  qualificationRelease: candidateManifest.qualificationRelease,
  candidate:
    candidateId === 'qualified-hybrid'
      ? {
          id: candidateId,
          version: 'runtime-lock-0.2.0',
          commit: `${candidateManifest.candidates.find((item) => item.id === 'vinqut')!.commit}+${candidateManifest.candidates.find((item) => item.id === 'spec42')!.commit}`,
        }
      : {
          id: candidate!.id,
          version: candidate!.version,
          commit: candidate!.commit,
        },
  profile: {
    name: profileName,
    files: generated.files,
    declaredElements: generated.elements,
    bytes: measuredWorkspaceBytes,
  },
  result: {
    warmups,
    repetitions,
    distributions: {
      coldOpenMs: distribution(runs.map((run) => run.coldOpenMs)),
      warmOpenMs: distribution(runs.map((run) => run.warmOpenMs)),
      semanticSnapshotMs: nullableDistribution(
        runs.map((run) => run.semanticSnapshotMs),
      ),
      explorerQueryMs: nullableDistribution(
        runs.map((run) => run.explorerQueryMs),
      ),
      firstUsefulExplorerMs: nullableDistribution(
        runs.map((run) => run.firstUsefulExplorerMs),
      ),
      incrementalDiagnosticsMs: nullableDistribution(
        runs.map((run) => run.incrementalDiagnosticsMs),
      ),
      definitionMs: nullableDistribution(
        runs.map((run) => run.definitionMs),
      ),
      authoringFirstCompletionMs: nullableDistribution(
        runs.map((run) => run.authoringFirstCompletionMs),
      ),
      authoringWarmCompletionMs: nullableDistribution(
        runs.map((run) => run.authoringWarmCompletionMs),
      ),
      diagramProjectionMs: nullableDistribution(
        runs.map((run) => run.diagramProjectionMs),
      ),
      matrixUpdateMs: nullableDistribution(
        runs.map((run) => run.matrixUpdateMs),
      ),
      semanticDiffMs: nullableDistribution(
        runs.map((run) => run.semanticDiffMs),
      ),
    },
    targets: performanceTargets(runs, profileName),
    expectedDiagnosticCodes: [...expectedGeneratedDiagnosticCodes].sort(),
    allRunsValid: runs.every(
      (run) =>
        run.validWorkspaceClean &&
        run.deterministicSnapshot &&
        run.diagnosticsStable,
    ),
    runs,
  },
}
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.result.allRunsValid) {
  process.exitCode = 1
}

async function createBenchmarkAdapter(): Promise<LanguageAdapter> {
  const runtime = {
    requestTimeoutMs: 180_000,
    diagnosticSettleMs: 30_000,
  }
  return candidateId === 'qualified-hybrid'
    ? createQualifiedHybridAdapter(
        candidateManifestPath,
        runtimeLockPath,
        runtime,
      )
    : createCandidateAdapter(candidateManifestPath, candidateId!, runtime)
}

function languageProcessEvidence(adapter: LanguageAdapter): unknown {
  if (
    adapter instanceof LspProcessAdapter ||
    adapter instanceof HybridLanguageAdapter
  ) {
    return sanitizeLanguageProcessEvidence(adapter.evidence())
  }
  return null
}

function sanitizeLanguageProcessEvidence(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLanguageProcessEvidence(item))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['command', 'arguments', 'processId'].includes(key))
      .map(([key, nested]) => [key, sanitizeLanguageProcessEvidence(nested)]),
  )
}

async function languageProcessMemory(
  adapter: LanguageAdapter,
): Promise<Record<string, number | null>> {
  const evidence =
    adapter instanceof LspProcessAdapter ||
    adapter instanceof HybridLanguageAdapter
      ? adapter.evidence()
      : null
  const result: Record<string, number | null> = {}
  if (evidence && typeof evidence === 'object' && 'processId' in evidence) {
    result.engine = await residentBytes(
      typeof evidence.processId === 'number' ? evidence.processId : null,
    )
  } else if (evidence && typeof evidence === 'object') {
    const evidenceRecord = evidence as Record<string, unknown>
    for (const role of ['semantic', 'authoring'] as const) {
      const roleValue = evidenceRecord[role]
      const roleEvidence =
        roleValue && typeof roleValue === 'object' ? roleValue : null
      result[role] = await residentBytes(
        roleEvidence &&
          'processId' in roleEvidence &&
          typeof roleEvidence.processId === 'number'
          ? roleEvidence.processId
          : null,
      )
    }
  }
  return result
}

async function residentBytes(processId: number | null): Promise<number | null> {
  if (processId === null) return null
  try {
    const { stdout } = await promisify(execFile)('ps', [
      '-o',
      'rss=',
      '-p',
      String(processId),
    ])
    const kibibytes = Number.parseInt(stdout.trim(), 10)
    return Number.isFinite(kibibytes) ? kibibytes * 1024 : null
  } catch {
    return null
  }
}

function distribution(values: number[]): {
  min: number
  median: number
  p95: number
  max: number
} {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    min: sorted[0]!,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1)!,
  }
}

function nullableDistribution(values: Array<number | null>): {
  min: number
  median: number
  p95: number
  max: number
} | null {
  const measured = values.filter((value): value is number => value !== null)
  return measured.length > 0 ? distribution(measured) : null
}

function preciseDuration(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

function performanceTargets(
  measuredRuns: typeof runs,
  profile: ProfileName,
): Array<{
  metric: string
  thresholdMs: number
  observedP95: number | null
  status: 'pass' | 'miss' | 'not-applicable'
}> {
  const targets = [
    target('warmOpenMs', 3_000, measuredRuns.map((run) => run.warmOpenMs)),
    target(
      'firstUsefulExplorerMs',
      5_000,
      measuredRuns.map((run) => run.firstUsefulExplorerMs),
    ),
    target(
      'incrementalDiagnosticsMs',
      500,
      measuredRuns.map((run) => run.incrementalDiagnosticsMs),
    ),
    target(
      'definitionMs',
      300,
      measuredRuns.map((run) => run.definitionMs),
    ),
    target(
      'diagramProjectionMs',
      2_000,
      measuredRuns.map((run) => run.diagramProjectionMs),
    ),
    target(
      'matrixUpdateMs',
      500,
      measuredRuns.map((run) => run.matrixUpdateMs),
    ),
    target(
      'semanticDiffMs',
      10_000,
      measuredRuns.map((run) => run.semanticDiffMs),
    ),
  ]
  return targets.map((item) =>
    profile === 'medium'
      ? item
      : { ...item, status: 'not-applicable' as const },
  )
}

function target(
  metric: string,
  thresholdMs: number,
  values: Array<number | null>,
): {
  metric: string
  thresholdMs: number
  observedP95: number | null
  status: 'pass' | 'miss' | 'not-applicable'
} {
  const measured = values.filter((value): value is number => value !== null)
  const observedP95 =
    measured.length > 0
      ? distribution(measured).p95
      : null
  return {
    metric,
    thresholdMs,
    observedP95,
    status:
      observedP95 === null
        ? 'not-applicable'
        : observedP95 <= thresholdMs
          ? 'pass'
          : 'miss',
  }
}

function percentile(sorted: number[], percentileValue: number): number {
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1),
  )
  return sorted[index]!
}

function countDiagnosticCodes(
  diagnostics: Array<{ code: string }>,
): Record<string, number> {
  return Object.fromEntries(
    [
      ...diagnostics.reduce((counts, diagnostic) => {
        counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1)
        return counts
      }, new Map<string, number>()),
    ].sort(([left], [right]) => left.localeCompare(right)),
  )
}

async function generateWorkspace(
  root: string,
  name: ProfileName,
  profile: { files: number; elements: number },
): Promise<{ workspaceFile: string; files: number; elements: number }> {
  await mkdir(modelRoot, { recursive: true })
  const baseElements = Math.floor(profile.elements / profile.files)
  const remainder = profile.elements % profile.files
  let generatedElements = 0
  for (let fileIndex = 0; fileIndex < profile.files; fileIndex += 1) {
    const elementCount = baseElements + (fileIndex < remainder ? 1 : 0)
    const lines = [`package Benchmark_${name}_${fileIndex} {`]
    for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
      lines.push(`    part def Element_${fileIndex}_${elementIndex};`)
    }
    lines.push('}', '')
    await writeFile(
      resolve(
        modelRoot,
        `benchmark-${String(fileIndex).padStart(4, '0')}.sysml`,
      ),
      lines.join('\n'),
      'utf8',
    )
    generatedElements += elementCount
  }
  const workspaceFile = resolve(root, 'sysml-workspace.yaml')
  await writeFile(
    workspaceFile,
    [
      'schemaVersion: 1',
      `id: benchmark-${name}`,
      `name: Benchmark ${name}`,
      'sourceRoots:',
      '  - model',
      'libraries: []',
      'activeConfiguration: default',
      'modelConfigurations:',
      '  default: {}',
      '',
    ].join('\n'),
    'utf8',
  )
  return {
    workspaceFile,
    files: profile.files,
    elements: generatedElements,
  }
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
