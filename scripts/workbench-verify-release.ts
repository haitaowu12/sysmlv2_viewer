import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

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
if (!allowOwnerBlockers) {
  await validateReleaseApproval(
    resolve(repositoryRoot, 'config/release-approval.json'),
    packageJson.version,
    platform,
  )
}
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
const report = {
  schemaVersion: 1,
  outcome: allowOwnerBlockers
    ? 'technical-release-candidate-passed-owner-blockers-open'
    : 'release-gate-passed',
  sourceCommit: commitOutput.trim(),
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

async function validateReleaseApproval(
  path: string,
  version: string,
  platform: string,
): Promise<void> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(
      'Production release requires config/release-approval.json; use the example contract and attach actual owner evidence',
    )
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Release approval manifest must be an object')
  }
  const approval = value as Record<string, unknown>
  const participants = approval.usabilityParticipants
  const platforms = approval.qualifiedPlatforms
  const cleanMachines = approval.cleanMachineEvidence
  if (
    approval.schemaVersion !== 1 ||
    approval.status !== 'approved' ||
    approval.productName !== 'SysML Engineering Workbench' ||
    approval.version !== version ||
    !Array.isArray(platforms) ||
    !platforms.includes(platform) ||
    !Array.isArray(cleanMachines) ||
    !cleanMachines.includes(platform) ||
    approval.productLicenseApproved !== true ||
    approval.runtimeLicenseReconciled !== true ||
    approval.distributionSigned !== true ||
    approval.manualAccessibilityPassed !== true ||
    approval.recoveryPassed !== true ||
    !Array.isArray(participants) ||
    participants.length < 3 ||
    participants.some((item) => typeof item !== 'string' || !item) ||
    typeof approval.owner !== 'string' ||
    !approval.owner ||
    typeof approval.approvedAt !== 'string' ||
    !approval.approvedAt ||
    !Array.isArray(approval.evidence) ||
    approval.evidence.length === 0
  ) {
    throw new Error('Release approval manifest is incomplete or does not approve this artifact')
  }
}
