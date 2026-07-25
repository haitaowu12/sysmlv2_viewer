import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { validateReleaseApproval } from '../packages/release-evidence/src/index.js'

interface PackageJson {
  version: string
}

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const outputRoot = resolve(
  valueAfter('--output') ?? resolve(repositoryRoot, 'generated/release'),
)
const evidenceRoot = resolve(outputRoot, 'evidence')
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as PackageJson
const platform = valueAfter('--platform') ?? `${process.platform}-${process.arch}`
const allowOwnerBlockers = process.argv.includes('--allow-owner-blockers')
const requiredEnvironment = [
  'SYSML_WORKBENCH_SEMANTIC_ARTIFACT',
  'SYSML_WORKBENCH_AUTHORING_ARTIFACT',
  'SYSML_WORKBENCH_LIBRARY_ROOT',
  'SYSML_WORKBENCH_SEMANTIC_LICENSE_ROOT',
  'SYSML_WORKBENCH_PILOT_LICENSE',
] as const
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`Release verification requires ${name}`)
}
await mkdir(evidenceRoot, { recursive: true })

await runNpm(['run', 'release:inventory', '--', '--output', evidenceRoot, '--label', 'phase7'])
await runNpm([
  'run',
  'release:license-policy',
  '--',
  '--inventory',
  resolve(evidenceRoot, 'phase7-package-license-inventory.json'),
  '--output',
  resolve(evidenceRoot, 'phase7-license-policy.json'),
  ...(allowOwnerBlockers ? ['--allow-owner-blocker'] : []),
])
await runNpm(['run', 'build'], {
  VITE_BASE_PATH: '/',
})
await runNpm([
  'run',
  'qualify:phase6',
  '--',
  '--output',
  resolve(evidenceRoot, 'phase6-regression.json'),
])
await runNpm([
  'run',
  'qualify:recovery',
  '--',
  '--output',
  resolve(evidenceRoot, 'phase7-recovery.json'),
])
await runNpm([
  'run',
  'release:runtime-provenance',
  '--',
  '--semantic-artifact',
  process.env.SYSML_WORKBENCH_SEMANTIC_ARTIFACT!,
  '--authoring-artifact',
  process.env.SYSML_WORKBENCH_AUTHORING_ARTIFACT!,
  '--semantic-source-root',
  process.env.SYSML_WORKBENCH_SEMANTIC_LICENSE_ROOT!,
  '--pilot-license',
  process.env.SYSML_WORKBENCH_PILOT_LICENSE!,
  '--library-root',
  process.env.SYSML_WORKBENCH_LIBRARY_ROOT!,
  '--output',
  resolve(evidenceRoot, 'phase7-runtime-provenance.json'),
  ...(allowOwnerBlockers ? ['--allow-license-conflict'] : []),
])
await runNpm([
  'run',
  'release:package',
  '--',
  '--semantic-artifact',
  process.env.SYSML_WORKBENCH_SEMANTIC_ARTIFACT!,
  '--authoring-artifact',
  process.env.SYSML_WORKBENCH_AUTHORING_ARTIFACT!,
  '--library-root',
  process.env.SYSML_WORKBENCH_LIBRARY_ROOT!,
  '--semantic-license-root',
  process.env.SYSML_WORKBENCH_SEMANTIC_LICENSE_ROOT!,
  '--pilot-license',
  process.env.SYSML_WORKBENCH_PILOT_LICENSE!,
  '--platform',
  platform,
  '--output',
  outputRoot,
])
const bundleRoot = resolve(
  outputRoot,
  `sysml-engineering-workbench-${packageJson.version}-${platform}`,
)
await runNpm([
  'run',
  'release:verify-bundle',
  '--',
  '--bundle',
  bundleRoot,
])
await runNpm([
  'run',
  'release:smoke-bundle',
  '--',
  '--bundle',
  bundleRoot,
  '--workspace-file',
  resolve(
    repositoryRoot,
    'fixtures/workspaces/phase5-infrastructure/sysml-workspace.yaml',
  ),
  '--model-marker',
  'ControlCentre',
  '--output',
  resolve(evidenceRoot, 'phase7-copied-bundle-smoke.json'),
])

const { stdout: commitOutput } = await execFileAsync(
  'git',
  ['rev-parse', 'HEAD'],
  { cwd: repositoryRoot },
)
const sourceCommit = commitOutput.trim()
const runtimeProvenancePath = resolve(
  evidenceRoot,
  'phase7-runtime-provenance.json',
)
const archivePath = resolve(
  outputRoot,
  `sysml-engineering-workbench-${packageJson.version}-${platform}.tar.gz`,
)
if (!allowOwnerBlockers) {
  const runtimeLock = JSON.parse(
    await readFile(
      resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
      'utf8',
    ),
  ) as { semantic: { artifactSha256: string } }
  await validateReleaseApproval({
    repositoryRoot,
    manifestPath: resolve(repositoryRoot, 'config/release-approval.json'),
    productName: 'SysML Engineering Workbench',
    version: packageJson.version,
    platform,
    sourceCommit,
    runtimeArtifactSha256: runtimeLock.semantic.artifactSha256,
    runtimeProvenanceSha256: await fileSha256(runtimeProvenancePath),
    releaseArtifactSha256: await fileSha256(archivePath),
  })
}
const report = {
  schemaVersion: 1,
  outcome: allowOwnerBlockers
    ? 'technical-release-candidate-passed-owner-blockers-open'
    : 'release-gate-passed',
  sourceCommit,
  version: packageJson.version,
  platform,
  bundle: bundleRoot,
  exactRuntimeRegression: 'passed',
  bundleIntegrity: 'passed',
  copiedBundleSmoke: 'passed',
  recoveryQualification: 'passed',
  logSafety: 'passed',
  runtimeProvenance: allowOwnerBlockers
    ? 'evidenced-conflicts-open'
    : 'approved',
  ownerBlockersAllowed: allowOwnerBlockers,
  ownerApprovalManifest: allowOwnerBlockers ? 'bypassed-for-technical-rc' : 'approved',
}
await writeFile(
  resolve(evidenceRoot, 'phase7-technical-verification.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

async function runNpm(
  argumentsList: string[],
  environment: Record<string, string> = {},
): Promise<void> {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = execFileAsync(executable, argumentsList, {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    maxBuffer: 32 * 1024 * 1024,
  })
  const { stdout, stderr } = await child
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

async function fileSha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}
