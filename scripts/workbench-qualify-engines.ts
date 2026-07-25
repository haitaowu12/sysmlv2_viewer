import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LspProcessAdapter,
  type LanguageAdapterMetadata,
} from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

interface Candidate {
  id: string
  name: string
  version: string
  commit: string
  license: string
  adapter: 'lsp-stdio' | 'unimplemented' | 'legacy-control'
  commandEnvironment?: string
  argumentsEnvironment?: string
}

interface CandidateManifest {
  schemaVersion: number
  qualificationRelease: {
    name: string
    repository: string
    commit: string
  }
  behavioralOracle: {
    name: string
    repository: string
    commit: string
  }
  candidates: Candidate[]
}

interface CandidateResult {
  id: string
  status: 'observed' | 'blocked' | 'failed'
  reason?: string
  pin: string
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
  capabilities?: Record<string, boolean>
  processEvidence?: ReturnType<LspProcessAdapter['evidence']>
  durationMs?: number
  operations?: Record<
    string,
    {
      status: 'observed' | 'failed' | 'unsupported'
      result?: unknown
      reason?: string
    }
  >
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const manifestPath = resolve(
  repositoryRoot,
  'config/language-engine-candidates.json',
)
const workspaceFile = resolve(
  repositoryRoot,
  'fixtures/workspaces/phase1-sample/sysml-workspace.yaml',
)
const outputDirectory = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'generated/qualification/phase1-local'),
)
const manifest = JSON.parse(
  await readFile(manifestPath, 'utf8'),
) as CandidateManifest
validateManifest(manifest)
await mkdir(outputDirectory, { recursive: true })

const results: CandidateResult[] = []
for (const candidate of manifest.candidates) {
  results.push(await qualify(candidate))
}

const report = {
  schemaVersion: 1,
  outcome: results.some((result) => result.status === 'observed')
    ? 'incomplete'
    : 'blocked',
  selection: null,
  qualificationRelease: manifest.qualificationRelease,
  behavioralOracle: manifest.behavioralOracle,
  fixture: {
    workspaceFile: basename(workspaceFile),
  },
  candidates: results,
}
await writeFile(
  resolve(outputDirectory, 'qualification-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exitCode = report.outcome === 'blocked' ? 2 : 1

async function qualify(candidate: Candidate): Promise<CandidateResult> {
  const startedAt = performance.now()
  if (candidate.adapter !== 'lsp-stdio') {
    return {
      id: candidate.id,
      status: 'blocked',
      reason: `Adapter lane is ${candidate.adapter}; it has not been implemented or approved as runtime authority`,
      pin: candidate.commit,
      durationMs: elapsed(startedAt),
    }
  }
  const command = candidate.commandEnvironment
    ? process.env[candidate.commandEnvironment]
    : undefined
  if (!command) {
    return {
      id: candidate.id,
      status: 'blocked',
      reason: `Pinned candidate executable is not configured via ${candidate.commandEnvironment}`,
      pin: candidate.commit,
      durationMs: elapsed(startedAt),
    }
  }

  const metadata: LanguageAdapterMetadata = {
    adapterId: `lsp-stdio/${candidate.id}`,
    adapterVersion: '0.1.0',
    engineName: candidate.name,
    engineVersion: candidate.version,
    referenceRelease: manifest.qualificationRelease.name,
    qualificationStatus: 'unqualified',
  }
  const adapter = new LspProcessAdapter({
    metadata,
    command,
    arguments: parseArgumentsEnvironment(candidate.argumentsEnvironment),
    requestTimeoutMs: 120_000,
    diagnosticSettleMs: 10_000,
  })
  const workspace = new WorkspaceManager({
    allowedRoots: [resolve(workspaceFile, '..')],
    adapter,
  })
  try {
    const status = await workspace.open(workspaceFile)
    const diagnostics = workspace
      .diagnostics(status.workspaceId)
      .map((diagnostic) => ({
        file: diagnostic.uri.startsWith('file:')
          ? relative(resolve(workspaceFile, '..'), fileURLToPath(diagnostic.uri))
          : diagnostic.uri,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        range: diagnostic.range,
      }))
      .sort((left, right) =>
        `${left.file}:${left.range ? JSON.stringify(left.range) : ''}:${left.code}`.localeCompare(
          `${right.file}:${right.range ? JSON.stringify(right.range) : ''}:${right.code}`,
        ),
      )
    const vehicle = status.documents.find((document) =>
      document.uri.endsWith('/model/vehicle.sysml'),
    )
    const operations: NonNullable<CandidateResult['operations']> = {}
    if (vehicle) {
      const text = await readFile(fileURLToPath(vehicle.uri), 'utf8')
      const commandPortPosition = positionOf(text, 'CommandPort;')
      const vehiclePosition = positionOf(text, 'Vehicle {')
      operations.documentSymbols = await observeOperation(
        adapter.capabilities.documentSymbols,
        () => workspace.documentSymbols(status.workspaceId, vehicle.uri),
        (symbols) => ({
          count: symbols.length,
          names: symbols.map((symbol) => symbol.name).sort(),
        }),
      )
      operations.definition = await observeOperation(
        adapter.capabilities.definitions,
        () =>
          workspace.definition(
            status.workspaceId,
            vehicle.uri,
            commandPortPosition,
          ),
        (locations) => locations.map(normalizeLocation),
      )
      operations.references = await observeOperation(
        adapter.capabilities.references,
        () =>
          workspace.references(
            status.workspaceId,
            vehicle.uri,
            vehiclePosition,
          ),
        (locations) => locations.map(normalizeLocation),
      )
      operations.hover = await observeOperation(
        adapter.capabilities.hover,
        () =>
          workspace.hover(
            status.workspaceId,
            vehicle.uri,
            commandPortPosition,
          ),
        (hover) => hover,
      )
      operations.completion = await observeOperation(
        adapter.capabilities.completion,
        () =>
          workspace.completion(
            status.workspaceId,
            vehicle.uri,
            { line: 3, character: 8 },
          ),
        (items) => ({
          count: items.length,
          labels: items
            .map((item) => item.label)
            .sort()
            .slice(0, 25),
          truncated: items.length > 25,
        }),
      )
    }
    await sealRawEvidence(candidate.id, adapter)
    return {
      id: candidate.id,
      status: 'observed',
      pin: candidate.commit,
      diagnostics: status.diagnostics,
      normalizedDiagnostics: diagnostics,
      capabilities: { ...adapter.capabilities },
      processEvidence: adapter.evidence(),
      durationMs: elapsed(startedAt),
      operations,
    }
  } catch (error) {
    await sealRawEvidence(candidate.id, adapter)
    return {
      id: candidate.id,
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Candidate failed',
      pin: candidate.commit,
      processEvidence: adapter.evidence(),
      durationMs: elapsed(startedAt),
    }
  } finally {
    await workspace.dispose()
  }
}

async function sealRawEvidence(
  candidateId: string,
  adapter: LspProcessAdapter,
): Promise<void> {
  const raw = adapter.rawEvidence()
  const candidateOutput = resolve(outputDirectory, candidateId)
  await mkdir(candidateOutput, { recursive: true })
  await writeFile(resolve(candidateOutput, 'stdout.lsp'), raw.stdout)
  await writeFile(resolve(candidateOutput, 'stderr.log'), raw.stderr)
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

async function observeOperation<T>(
  supported: boolean,
  operation: () => Promise<T>,
  summarize: (value: T) => unknown,
): Promise<{
  status: 'observed' | 'failed' | 'unsupported'
  result?: unknown
  reason?: string
}> {
  if (!supported) return { status: 'unsupported' }
  try {
    return { status: 'observed', result: summarize(await operation()) }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Operation failed',
    }
  }
}

function positionOf(
  text: string,
  needle: string,
): { line: number; character: number } {
  const offset = text.indexOf(needle)
  if (offset < 0) throw new Error(`Fixture token not found: ${needle}`)
  const prefix = text.slice(0, offset)
  const lines = prefix.split('\n')
  return {
    line: lines.length - 1,
    character: lines.at(-1)?.length ?? 0,
  }
}

function normalizeLocation(location: {
  uri: string
  range: unknown
}): { file: string; range: unknown } {
  return {
    file: location.uri.startsWith('file:')
      ? relative(resolve(workspaceFile, '..'), fileURLToPath(location.uri))
      : location.uri,
    range: location.range,
  }
}

function parseArgumentsEnvironment(name: string | undefined): string[] {
  if (!name || !process.env[name]) return []
  const value: unknown = JSON.parse(process.env[name]!)
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a JSON string array`)
  }
  return value as string[]
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function validateManifest(value: CandidateManifest): void {
  if (
    value.schemaVersion !== 1 ||
    value.qualificationRelease.commit.length !== 40 ||
    value.behavioralOracle.commit.length !== 40 ||
    value.candidates.length < 6
  ) {
    throw new Error('Language engine candidate manifest is incomplete')
  }
}
