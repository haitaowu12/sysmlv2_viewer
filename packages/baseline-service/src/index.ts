import { execFile } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { LanguageDiagnostic } from '../../language-adapter/src/index.js'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import { compareSemanticSnapshots, type SemanticDiff } from '../../semantic-diff/src/index.js'

const executeFile = promisify(execFile)

export interface GitWorkspaceStatus {
  repositoryRoot: string
  branch: string
  head: string
  dirty: boolean
  changedFiles: Array<{
    status: string
    path: string
    category: 'source' | 'view' | 'layout' | 'review' | 'evidence' | 'generated' | 'configuration' | 'other'
  }>
}

export interface BaselineManifest {
  schemaVersion: 1
  id: string
  workspaceId: string
  commit: string
  branch: string
  createdAt: string
  createdBy: string
  workbenchVersion: string
  rulePackVersion: string
  languageAuthority: SemanticSnapshot['authority']
  snapshot: SemanticSnapshot
  diagnostics: LanguageDiagnostic[]
}

export interface BaselineComparison {
  schemaVersion: 1
  baseline: { id: string; commit: string; snapshotSha256: string }
  current: { commit: string; branch: string; snapshotSha256: string; dirty: boolean }
  semanticDiff: SemanticDiff
  diagnostics: {
    introduced: LanguageDiagnostic[]
    resolved: LanguageDiagnostic[]
  }
  changedFiles: GitWorkspaceStatus['changedFiles']
  reviewOnlyFiles: string[]
  layoutOnlyFiles: string[]
}

export async function readGitStatus(rootPath: string): Promise<GitWorkspaceStatus> {
  const root = await realpath(rootPath)
  const repositoryRoot = (await git(root, ['rev-parse', '--show-toplevel'])).trim()
  const canonicalRepositoryRoot = await realpath(repositoryRoot)
  if (!isWithin(canonicalRepositoryRoot, root)) throw new Error('Workspace root is outside its Git repository')
  const head = (await git(root, ['rev-parse', 'HEAD'])).trim()
  const branch = (await git(root, ['branch', '--show-current'])).trim() || '(detached)'
  const porcelain = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const changedFiles = parsePorcelain(porcelain)
  return { repositoryRoot: canonicalRepositoryRoot, branch, head, dirty: changedFiles.length > 0, changedFiles }
}

export class BaselineRepository {
  constructor(private readonly rootPath: string) {}

  async list(): Promise<BaselineManifest[]> {
    const directory = await this.directory()
    const entries = await readdir(directory, { withFileTypes: true })
    const manifests: BaselineManifest[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      manifests.push(validateManifest(JSON.parse(await readFile(resolve(directory, entry.name), 'utf8'))))
    }
    return manifests
  }

  async get(id: string): Promise<BaselineManifest> {
    validateId(id)
    const directory = await this.directory()
    return validateManifest(JSON.parse(await readFile(resolve(directory, `${id}.json`), 'utf8')))
  }

  async create(input: {
    id: string
    snapshot: SemanticSnapshot
    diagnostics: LanguageDiagnostic[]
    actor: string
    at: string
    workbenchVersion: string
    rulePackVersion: string
  }): Promise<BaselineManifest> {
    validateId(input.id)
    if (Number.isNaN(Date.parse(input.at))) throw new Error('Baseline timestamp is invalid')
    if (input.snapshot.freshness !== 'current') throw new Error('Baseline requires a current semantic snapshot')
    const status = await readGitStatus(this.rootPath)
    if (status.dirty) throw new Error('Baseline creation requires a clean Git working tree')
    const manifest: BaselineManifest = {
      schemaVersion: 1,
      id: input.id,
      workspaceId: input.snapshot.workspace.id,
      commit: status.head,
      branch: status.branch,
      createdAt: input.at,
      createdBy: input.actor,
      workbenchVersion: input.workbenchVersion,
      rulePackVersion: input.rulePackVersion,
      languageAuthority: structuredClone(input.snapshot.authority),
      snapshot: structuredClone(input.snapshot),
      diagnostics: structuredClone(input.diagnostics).sort(compareDiagnostics),
    }
    const directory = await this.directory()
    try {
      await lstat(resolve(directory, `${input.id}.json`))
      throw new Error(`Baseline already exists: ${input.id}`)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
    }
    return this.persist(manifest)
  }

  async compare(id: string, currentSnapshot: SemanticSnapshot, currentDiagnostics: LanguageDiagnostic[]): Promise<BaselineComparison> {
    const baseline = await this.get(id)
    if (baseline.workspaceId !== currentSnapshot.workspace.id) throw new Error('Baseline belongs to a different workspace')
    const gitStatus = await readGitStatus(this.rootPath)
    const beforeDiagnostics = new Map(baseline.diagnostics.map((item) => [diagnosticKey(item), item]))
    const afterDiagnostics = new Map(currentDiagnostics.map((item) => [diagnosticKey(item), item]))
    return {
      schemaVersion: 1,
      baseline: { id: baseline.id, commit: baseline.commit, snapshotSha256: baseline.snapshot.snapshotSha256 },
      current: { commit: gitStatus.head, branch: gitStatus.branch, snapshotSha256: currentSnapshot.snapshotSha256, dirty: gitStatus.dirty },
      semanticDiff: compareSemanticSnapshots(baseline.snapshot, currentSnapshot),
      diagnostics: {
        introduced: [...afterDiagnostics].filter(([key]) => !beforeDiagnostics.has(key)).map(([, item]) => item).sort(compareDiagnostics),
        resolved: [...beforeDiagnostics].filter(([key]) => !afterDiagnostics.has(key)).map(([, item]) => item).sort(compareDiagnostics),
      },
      changedFiles: gitStatus.changedFiles,
      reviewOnlyFiles: gitStatus.changedFiles.filter((file) => file.category === 'review').map((file) => file.path),
      layoutOnlyFiles: gitStatus.changedFiles.filter((file) => file.category === 'layout' || file.category === 'view').map((file) => file.path),
    }
  }

  private async directory(): Promise<string> {
    const root = await realpath(this.rootPath)
    const directory = resolve(root, 'baselines')
    await assertNoSymlinkSegments(root, directory)
    await mkdir(directory, { recursive: true })
    await assertNoSymlinkSegments(root, directory)
    return directory
  }

  private async persist(manifest: BaselineManifest): Promise<BaselineManifest> {
    const validated = validateManifest(manifest)
    const directory = await this.directory()
    const destination = resolve(directory, `${validated.id}.json`)
    const temporary = resolve(directory, `.${validated.id}.${process.pid}.${Date.now()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, destination)
    return structuredClone(validated)
  }
}

function parsePorcelain(value: string): GitWorkspaceStatus['changedFiles'] {
  const entries = value.split('\0').filter(Boolean)
  const files: GitWorkspaceStatus['changedFiles'] = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!
    const status = entry.slice(0, 2)
    let path = entry.slice(3)
    if (status.includes('R') || status.includes('C')) path = entries[++index] ?? path
    path = path.replaceAll('\\', '/')
    files.push({ status, path, category: categorize(path) })
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function categorize(path: string): GitWorkspaceStatus['changedFiles'][number]['category'] {
  if (path.endsWith('.sysml') || path.endsWith('.kerml') || path.startsWith('model/') || path.startsWith('libraries/')) return 'source'
  if (path.startsWith('views/')) return 'view'
  if (path.startsWith('layouts/')) return 'layout'
  if (path.startsWith('reviews/')) return 'review'
  if (path.startsWith('evidence/')) return 'evidence'
  if (path.startsWith('generated/')) return 'generated'
  if (path === 'sysml-workspace.yaml' || path.startsWith('.sysml-workbench/')) return 'configuration'
  return 'other'
}

function validateManifest(value: unknown): BaselineManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Baseline manifest must be an object')
  const manifest = value as BaselineManifest
  if (manifest.schemaVersion !== 1) throw new Error('Baseline schemaVersion must be 1')
  validateId(manifest.id)
  if (!/^[0-9a-f]{40,64}$/.test(manifest.commit)) throw new Error('Baseline commit is invalid')
  if (!manifest.snapshot || manifest.snapshot.schemaVersion !== 1) throw new Error('Baseline semantic snapshot is invalid')
  if (!Array.isArray(manifest.diagnostics)) throw new Error('Baseline diagnostics are invalid')
  if (Buffer.byteLength(JSON.stringify(manifest), 'utf8') > 64 * 1024 * 1024) throw new Error('Baseline manifest exceeds the 64 MiB limit')
  return structuredClone(manifest)
}
function validateId(value: string): void { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) throw new Error('Baseline id must be a bounded lowercase slug') }
function diagnosticKey(item: LanguageDiagnostic): string { return JSON.stringify([item.uri, item.severity, item.code, item.message, item.range]) }
function compareDiagnostics(left: LanguageDiagnostic, right: LanguageDiagnostic): number { return diagnosticKey(left).localeCompare(diagnosticKey(right)) }
async function git(root: string, argumentsList: string[]): Promise<string> { return (await executeFile('git', ['-C', root, ...argumentsList], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).stdout }

async function assertNoSymlinkSegments(root: string, target: string): Promise<void> {
  if (!isWithin(root, target)) throw new Error('Baseline path escapes workspace')
  let current = root
  for (const segment of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Baseline paths may not contain symbolic links')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
  }
}
function isWithin(root: string, target: string): boolean { const path = relative(root, target); return path === '' || (!path.startsWith('..') && !path.startsWith('/') && !path.startsWith('\\')) }
