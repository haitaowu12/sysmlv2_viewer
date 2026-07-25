import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { HybridLanguageAdapter } from './hybrid-language-adapter.js'
import { LspProcessAdapter } from './lsp-process-adapter.js'

export interface EngineCandidate {
  id: string
  name: string
  version: string
  commit: string
  license: string
  adapter: 'lsp-stdio' | 'unimplemented' | 'legacy-control'
  commandEnvironment?: string
  argumentsEnvironment?: string
}

export interface EngineCandidateManifest {
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
  candidates: EngineCandidate[]
}

interface RuntimeLock {
  schemaVersion: 1
  outcome: 'HYBRID GO'
  adapterVersion: string
  referenceRelease: { name: string; commit: string }
  semantic: RuntimeRole
  authoring: RuntimeRole
  officialLibraryIndexSha256: string
}

interface RuntimeRole {
  candidateId: string
  commit: string
  artifactEnvironment: string
  artifactSha256: string
  launchMode: 'java-jar' | 'executable'
}

export async function readCandidateManifest(
  manifestPath: string,
): Promise<EngineCandidateManifest> {
  const value: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Language engine candidate manifest must use schemaVersion 1')
  }
  const manifest = value as unknown as EngineCandidateManifest
  if (
    !isRecord(manifest.qualificationRelease) ||
    !isCommit(manifest.qualificationRelease.commit) ||
    !isRecord(manifest.behavioralOracle) ||
    !isCommit(manifest.behavioralOracle.commit) ||
    !Array.isArray(manifest.candidates) ||
    manifest.candidates.length < 6
  ) {
    throw new Error('Language engine candidate manifest is incomplete')
  }
  return manifest
}

export async function createCandidateAdapter(
  manifestPath: string,
  candidateId: string,
  runtime: {
    requestTimeoutMs?: number
    diagnosticSettleMs?: number
  } = {},
): Promise<LspProcessAdapter> {
  const manifest = await readCandidateManifest(manifestPath)
  const candidate = manifest.candidates.find((item) => item.id === candidateId)
  if (!candidate) {
    throw new Error(`Unknown language engine candidate: ${candidateId}`)
  }
  if (candidate.adapter !== 'lsp-stdio') {
    throw new Error(
      `Candidate ${candidateId} cannot be used by the LSP adapter (${candidate.adapter})`,
    )
  }
  const command = candidate.commandEnvironment
    ? process.env[candidate.commandEnvironment]
    : undefined
  if (!command) {
    throw new Error(
      `Candidate ${candidateId} is not configured via ${candidate.commandEnvironment}`,
    )
  }
  return new LspProcessAdapter({
    metadata: {
      adapterId: `lsp-stdio/${candidate.id}`,
      adapterVersion: '0.1.0',
      engineName: candidate.name,
      engineVersion: candidate.version,
      referenceRelease: manifest.qualificationRelease.name,
      qualificationStatus: 'unqualified',
    },
    command,
    arguments: parseArgumentsEnvironment(candidate.argumentsEnvironment),
    requestTimeoutMs: runtime.requestTimeoutMs,
    diagnosticSettleMs: runtime.diagnosticSettleMs,
  })
}

export async function createQualifiedHybridAdapter(
  manifestPath: string,
  runtimeLockPath: string,
  runtime: {
    requestTimeoutMs?: number
    diagnosticSettleMs?: number
  } = {},
): Promise<HybridLanguageAdapter> {
  const manifest = await readCandidateManifest(manifestPath)
  const lock = JSON.parse(await readFile(runtimeLockPath, 'utf8')) as RuntimeLock
  validateRuntimeLock(lock, manifest)
  await Promise.all([
    verifyRuntimeArtifact(lock.semantic),
    verifyRuntimeArtifact(lock.authoring),
  ])
  validateLaunchBinding(lock.semantic, manifest)
  validateLaunchBinding(lock.authoring, manifest)

  const [semantic, authoring] = await Promise.all([
    createCandidateAdapter(manifestPath, lock.semantic.candidateId, runtime),
    createCandidateAdapter(manifestPath, lock.authoring.candidateId, runtime),
  ])
  return new HybridLanguageAdapter(semantic, authoring, {
    adapterId: 'qualified-hybrid/vinqut-semantic+spec42-authoring',
    adapterVersion: lock.adapterVersion,
    engineName: 'VinQut/Pilot semantic authority + Spec42 authoring assistant',
    engineVersion: `${lock.semantic.commit.slice(0, 7)}+${lock.authoring.commit.slice(0, 7)}`,
    referenceRelease: lock.referenceRelease.name,
    qualificationStatus: 'qualified',
  })
}

function parseArgumentsEnvironment(name: string | undefined): string[] {
  if (!name || !process.env[name]) return []
  const value: unknown = JSON.parse(process.env[name]!)
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a JSON string array`)
  }
  return value as string[]
}

function validateRuntimeLock(
  lock: RuntimeLock,
  manifest: EngineCandidateManifest,
): void {
  if (
    lock.schemaVersion !== 1 ||
    lock.outcome !== 'HYBRID GO' ||
    lock.referenceRelease.name !== manifest.qualificationRelease.name ||
    lock.referenceRelease.commit !== manifest.qualificationRelease.commit ||
    !/^[0-9a-f]{64}$/.test(lock.officialLibraryIndexSha256)
  ) {
    throw new Error('Qualified runtime lock does not match the candidate baseline')
  }
  for (const role of [lock.semantic, lock.authoring]) {
    const candidate = manifest.candidates.find(
      (item) => item.id === role.candidateId,
    )
    if (
      !candidate ||
      candidate.commit !== role.commit ||
      !/^[0-9a-f]{64}$/.test(role.artifactSha256)
    ) {
      throw new Error(
        `Qualified runtime role ${role.candidateId} does not match the candidate manifest`,
      )
    }
  }
}

async function verifyRuntimeArtifact(role: RuntimeRole): Promise<void> {
  const artifact = process.env[role.artifactEnvironment]
  if (!artifact) {
    throw new Error(
      `Qualified runtime artifact is not configured via ${role.artifactEnvironment}`,
    )
  }
  const bytes = await readFile(artifact)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== role.artifactSha256) {
    throw new Error(
      `Qualified runtime artifact hash mismatch for ${role.candidateId}: ${actual}`,
    )
  }
}

function validateLaunchBinding(
  role: RuntimeRole,
  manifest: EngineCandidateManifest,
): void {
  const candidate = manifest.candidates.find(
    (item) => item.id === role.candidateId,
  )!
  const artifact = resolve(process.env[role.artifactEnvironment]!)
  const command = candidate.commandEnvironment
    ? process.env[candidate.commandEnvironment]
    : undefined
  const argumentsList = parseArgumentsEnvironment(
    candidate.argumentsEnvironment,
  ).map((item) => resolveIfPath(item))
  if (role.launchMode === 'executable' && resolve(command ?? '') !== artifact) {
    throw new Error(
      `Qualified runtime command must be the locked ${role.candidateId} artifact`,
    )
  }
  if (role.launchMode === 'java-jar' && !argumentsList.includes(artifact)) {
    throw new Error(
      `Qualified runtime arguments must include the locked ${role.candidateId} jar`,
    )
  }
}

function resolveIfPath(value: string): string {
  return value.includes('/') ? resolve(value) : value
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
