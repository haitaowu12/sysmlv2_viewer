import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createCandidateAdapter,
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
const candidateManifest = await readCandidateManifest(candidateManifestPath)
const candidate = candidateManifest.candidates.find(
  (item) => item.id === candidateId,
)
if (!candidate) throw new Error(`Unknown candidate: ${candidateId}`)

const generated = await generateWorkspace(
  outputRoot,
  profileName,
  profiles[profileName],
)
const adapter = await createCandidateAdapter(
  candidateManifestPath,
  candidateId,
  {
    requestTimeoutMs: 180_000,
    diagnosticSettleMs: 30_000,
  },
)
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

  await manager.close(cold.workspaceId)
  const warmStartedAt = performance.now()
  const warm = await manager.open(generated.workspaceFile)
  const warmOpenMs = Math.round(performance.now() - warmStartedAt)
  const memoryAfterWarm = process.memoryUsage().rss
  const diagnostics = manager.diagnostics(warm.workspaceId)
  const coldDiagnosticCodes = countDiagnosticCodes(coldDiagnostics)
  const diagnosticCodes = countDiagnosticCodes(diagnostics)

  const report = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    qualificationRelease: candidateManifest.qualificationRelease,
    candidate: {
      id: candidate.id,
      version: candidate.version,
      commit: candidate.commit,
    },
    profile: {
      name: profileName,
      files: generated.files,
      declaredElements: generated.elements,
      bytes: warm.documents.reduce(
        (total, document) => total + document.byteLength,
        0,
      ),
    },
    result: {
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
      expectedDiagnosticCodes: [...expectedGeneratedDiagnosticCodes].sort(),
      diagnosticSamples: diagnostics.slice(0, 10).map((diagnostic) => ({
        file: diagnostic.uri.startsWith(warm.rootUri)
          ? diagnostic.uri.slice(warm.rootUri.length).replace(/^\/+/, '')
          : diagnostic.uri,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        range: diagnostic.range,
      })),
      deterministicSnapshot:
        cold.snapshotSha256 === warm.snapshotSha256,
      clientProcessRssBytes: {
        before: memoryBefore,
        afterCold: memoryAfterCold,
        afterWarm: memoryAfterWarm,
      },
      languageProcess: adapter.evidence(),
    },
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (
    warm.diagnostics.errors > 0 ||
    !report.result.validWorkspaceClean ||
    !report.result.deterministicSnapshot ||
    !report.result.diagnosticsStable
  ) {
    process.exitCode = 1
  }
} finally {
  await manager.dispose()
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
