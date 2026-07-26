import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  lstat,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ReleaseEvidenceType } from '../packages/release-evidence/src/index.js'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as { version: string }
const platform = valueAfter('--platform') ?? `${process.platform}-${process.arch}`
const manifestPath = resolve(
  valueAfter('--manifest') ??
    resolve(repositoryRoot, 'config/release-approval.json'),
)
const evidenceRoot = resolve(
  repositoryRoot,
  'release',
  'evidence',
  packageJson.version,
)
assertWithinRepository(manifestPath, 'Release approval manifest')
const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
})
const sourceCommit = stdout.trim()
const runtimeLock = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    'utf8',
  ),
) as { semantic: { artifactSha256: string } }
const archivePath = resolve(
  repositoryRoot,
  'generated',
  'release',
  `sysml-engineering-workbench-${packageJson.version}-${platform}.tar.gz`,
)
const runtimeProvenancePath = resolve(
  repositoryRoot,
  'generated',
  'release',
  'evidence',
  'phase7-runtime-provenance.json',
)
const licensePath = resolve(repositoryRoot, 'LICENSE')
const releaseArtifactSha256 = await optionalFileSha256(archivePath)
const runtimeProvenanceSha256 = await optionalFileSha256(runtimeProvenancePath)
const productLicenseSha256 = await optionalFileSha256(licensePath)
const recordedAt = new Date().toISOString()
const base = {
  schemaVersion: 1,
  status: 'pending',
  productVersion: packageJson.version,
  sourceCommit,
  recordedAt,
  assessor: '',
}

const records: Array<{
  id: string
  type: ReleaseEvidenceType
  value: Record<string, unknown>
}> = [
  {
    id: 'product-license',
    type: 'product-license',
    value: {
      ...base,
      evidenceType: 'product-license',
      approved: false,
      spdxIdentifier: '',
      licensePath: 'LICENSE',
      licenseSha256: productLicenseSha256,
      approver: '',
      approvedAt: '',
    },
  },
  {
    id: 'runtime-license',
    type: 'runtime-license',
    value: {
      ...base,
      evidenceType: 'runtime-license',
      approved: false,
      runtimeArtifactSha256: runtimeLock.semantic.artifactSha256,
      runtimeProvenanceSha256,
      noticeConflictDisposition: '',
      reviewer: '',
      approvedAt: '',
    },
  },
  {
    id: `platform-${platform}`,
    type: 'platform-qualification',
    value: {
      ...base,
      evidenceType: 'platform-qualification',
      platform,
      artifactSha256: releaseArtifactSha256,
      cleanMachine: false,
      networkIsolationVerified: false,
      machineId: '',
      steps: Object.fromEntries([
        'installation',
        'workspaceOpen',
        'sourceEditPatch',
        'reportGeneration',
        'backupRestore',
        'interruptedCommandRecovery',
        'crashLogInspection',
        'uninstallRecovery',
      ].map((id) => [id, 'not-run'])),
      openCriticalOrSeriousFindings: null,
      observations: [],
    },
  },
  {
    id: `signing-${platform}`,
    type: 'distribution-signing',
    value: {
      ...base,
      evidenceType: 'distribution-signing',
      platform,
      artifactSha256: releaseArtifactSha256,
      signatureVerified: false,
      notarized: false,
      signerIdentity: '',
      verificationCommand: '',
    },
  },
  {
    id: `accessibility-${platform}`,
    type: 'accessibility',
    value: {
      ...base,
      evidenceType: 'accessibility',
      platform,
      checks: Object.fromEntries([
        'keyboardNavigation',
        'screenReader',
        'renderedContrast',
        'zoomAndScalableText',
        'focusOrder',
        'statusWithoutColor',
        'diagramAlternative',
        'reducedMotion',
      ].map((id) => [id, 'not-run'])),
      openCriticalOrSeriousFindings: null,
      assistiveTechnology: '',
      observations: [],
    },
  },
  {
    id: 'usability',
    type: 'usability',
    value: {
      ...base,
      evidenceType: 'usability',
      participants: [],
      openCriticalOrSeriousFindings: null,
      findings: [],
    },
  },
]

const targets = [
  manifestPath,
  ...records.map((record) => resolve(evidenceRoot, `${record.id}.json`)),
]
for (const target of targets) {
  if (await exists(target)) {
    throw new Error(
      `Release evidence already exists and will not be overwritten: ${target}`,
    )
  }
}
await mkdir(evidenceRoot, { recursive: true })
await mkdir(dirname(manifestPath), { recursive: true })
const evidence = []
for (const record of records) {
  const path = `release/evidence/${packageJson.version}/${record.id}.json`
  const text = `${JSON.stringify(record.value, null, 2)}\n`
  await writeFile(resolve(repositoryRoot, path), text, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  evidence.push({
    id: record.id,
    type: record.type,
    path,
    sha256: sha256(text),
  })
}
const manifest = {
  schemaVersion: 2,
  status: 'pending',
  productName: 'SysML Engineering Workbench',
  version: packageJson.version,
  sourceCommit,
  qualifiedPlatforms: [platform],
  approvedAt: '',
  ownerApproval: {
    approved: false,
    owner: '',
    role: '',
    approvedAt: '',
    statement: '',
  },
  evidence,
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
})
process.stdout.write(
  `${JSON.stringify({
    schemaVersion: 1,
    outcome: 'pending-evidence-kit-created',
    manifestPath,
    evidenceRoot,
    platform,
    sourceCommit,
    releaseArtifactBound: releaseArtifactSha256 !== '0'.repeat(64),
    runtimeProvenanceBound: runtimeProvenanceSha256 !== '0'.repeat(64),
    nextAction:
      'Record genuine results, recompute evidence hashes in the manifest, then obtain owner approval. Pending records do not pass the release gate.',
  }, null, 2)}\n`,
)

async function optionalFileSha256(path: string): Promise<string> {
  return await exists(path) ? sha256(await readFile(path)) : '0'.repeat(64)
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function assertWithinRepository(path: string, label: string): void {
  const pathFromRoot = relative(repositoryRoot, path)
  if (
    pathFromRoot === '' ||
    pathFromRoot === '..' ||
    pathFromRoot.startsWith('../') ||
    pathFromRoot.startsWith('..\\')
  ) {
    throw new Error(`${label} must stay inside the repository`)
  }
}
