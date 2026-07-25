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

const repositoryRoot = resolve(import.meta.dirname, '..')
const profileName = (valueAfter('--profile') ?? 'small') as ProfileName
if (!(profileName in profiles)) {
  throw new Error('--profile must be small, medium, or large')
}
const candidateId = valueAfter('--candidate')
if (!candidateId) throw new Error('--candidate is required')
const repetitions = Number.parseInt(valueAfter('--repetitions') ?? '1', 10)
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) {
  throw new Error('--repetitions must be an integer from 1 to 20')
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
const runs = []
let measuredWorkspaceBytes = 0
for (let run = 1; run <= repetitions; run += 1) {
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
  measuredWorkspaceBytes = warm.documents.reduce(
    (total, document) => total + document.byteLength,
    0,
  )
  const coldDiagnosticCodes = countDiagnosticCodes(coldDiagnostics)
  const diagnosticCodes = countDiagnosticCodes(diagnostics)

  runs.push({
    run,
    coldOpenMs,
    warmOpenMs,
    coldDiagnostics: cold.diagnostics,
    warmDiagnostics: warm.diagnostics,
    coldDiagnosticCodes,
    warmDiagnosticCodes: diagnosticCodes,
    diagnosticsStable:
      JSON.stringify(cold.diagnostics) === JSON.stringify(warm.diagnostics) &&
      JSON.stringify(coldDiagnosticCodes) ===
        JSON.stringify(diagnosticCodes),
    validWorkspaceClean:
      cold.diagnostics.errors === 0 &&
      warm.diagnostics.errors === 0 &&
      [...coldDiagnostics, ...diagnostics].every((diagnostic) =>
        expectedGeneratedDiagnosticCodes.has(diagnostic.code),
      ),
    deterministicSnapshot:
      cold.snapshotSha256 === warm.snapshotSha256,
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
  })
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
      repetitions,
      distributions: {
        coldOpenMs: distribution(runs.map((run) => run.coldOpenMs)),
        warmOpenMs: distribution(runs.map((run) => run.warmOpenMs)),
      },
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
    return adapter.evidence()
  }
  return null
}

async function languageProcessMemory(
  adapter: LanguageAdapter,
): Promise<Record<string, number | null>> {
  const evidence = languageProcessEvidence(adapter)
  const result: Record<string, number | null> = {}
  if (
    evidence &&
    typeof evidence === 'object' &&
    'processId' in evidence
  ) {
    result.engine = await residentBytes(
      typeof evidence.processId === 'number' ? evidence.processId : null,
    )
  } else if (evidence && typeof evidence === 'object') {
    const evidenceRecord = evidence as Record<string, unknown>
    for (const role of ['semantic', 'authoring'] as const) {
      const roleValue = evidenceRecord[role]
      const roleEvidence =
        roleValue &&
        typeof roleValue === 'object'
          ? roleValue
          : null
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
    [...diagnostics.reduce((counts, diagnostic) => {
      counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1)
      return counts
    }, new Map<string, number>())].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
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
      resolve(modelRoot, `benchmark-${String(fileIndex).padStart(4, '0')}.sysml`),
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
