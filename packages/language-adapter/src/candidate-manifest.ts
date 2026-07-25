import { readFile } from 'node:fs/promises'
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

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
