import { execFile, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

interface CargoMetadata {
  packages: Array<{ id: string; name: string; version: string }>
  resolve: {
    root: string | null
    nodes: Array<{ id: string; dependencies: string[] }>
  } | null
}

interface AuditFinding {
  kind?: string
  package: { name: string; version: string }
  advisory: {
    id: string
    title: string
    url: string | null
    informational?: string | null
  }
  versions: { patched: string[]; unaffected: string[] }
}

interface CargoAuditReport {
  vulnerabilities: { count: number; list: AuditFinding[] }
  warnings: Record<string, AuditFinding[]>
}

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const manifestPath = resolve(
  repositoryRoot,
  'apps/workbench-desktop/src-tauri/Cargo.toml',
)
const lockPath = resolve(
  repositoryRoot,
  'apps/workbench-desktop/src-tauri/Cargo.lock',
)
const outputPath = resolve(
  valueAfter('--output') ??
    resolve(
      repositoryRoot,
      'docs/revamp/phase7-desktop-rustsec-audit.json',
    ),
)
const target = valueAfter('--target') ?? 'aarch64-apple-darwin'
if (target !== 'aarch64-apple-darwin') {
  throw new Error('The initial desktop security audit is macOS arm64 only')
}
const cargo = process.env.CARGO ?? 'cargo'
const [{ stdout: metadataText }, auditText] = await Promise.all([
  execFileAsync(
    cargo,
    [
      'metadata',
      '--format-version',
      '1',
      '--locked',
      '--filter-platform',
      target,
      '--manifest-path',
      manifestPath,
    ],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
  ),
  runAudit(cargo),
])
const metadata = JSON.parse(metadataText) as CargoMetadata
const audit = JSON.parse(auditText) as CargoAuditReport
const activePackages = targetPackageKeys(metadata)
const targetVulnerabilities = audit.vulnerabilities.list
  .filter((finding) => activePackages.has(packageKey(finding)))
  .map(summarize)
const targetWarnings: Record<
  string,
  Array<ReturnType<typeof summarize>>
> = {}
for (const [kind, findings] of Object.entries(audit.warnings)) {
  const relevant = findings
    .filter((finding) => activePackages.has(packageKey(finding)))
    .map(summarize)
  if (relevant.length > 0) targetWarnings[kind] = relevant
}
const excludedNonTargetWarningCount =
  Object.values(audit.warnings).flat().length -
  Object.values(targetWarnings).flat().length
const blockingWarnings = targetWarnings.unsound ?? []
const blockers = [
  ...targetVulnerabilities,
  ...blockingWarnings,
]
const noticeCount = Object.entries(targetWarnings)
  .filter(([kind]) => kind !== 'unsound')
  .flatMap(([, findings]) => findings).length
const report = {
  schemaVersion: 1,
  outcome:
    blockers.length > 0
      ? 'blocked'
      : noticeCount > 0
        ? 'pass-with-notices'
        : 'pass',
  scope: 'locked Tauri Cargo graph compiled for macOS arm64',
  target,
  lock: 'apps/workbench-desktop/src-tauri/Cargo.lock',
  activeComponentCount: activePackages.size,
  targetVulnerabilities,
  targetWarnings,
  excludedNonTargetWarningCount,
  policy: {
    vulnerabilities: 'blocking',
    unsound: 'blocking',
    unmaintained:
      'recorded notice requiring monitored upstream replacement or owner risk disposition before final release',
  },
  blockers,
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(
  `${JSON.stringify({
    outcome: report.outcome,
    activeComponentCount: report.activeComponentCount,
    targetVulnerabilityCount: targetVulnerabilities.length,
    targetWarningCounts: Object.fromEntries(
      Object.entries(targetWarnings).map(([kind, findings]) => [
        kind,
        findings.length,
      ]),
    ),
    excludedNonTargetWarningCount,
    output: outputPath,
  }, null, 2)}\n`,
)
if (blockers.length > 0) process.exitCode = 1

async function runAudit(cargoExecutable: string): Promise<string> {
  const child = spawn(
    cargoExecutable,
    ['audit', '--file', lockPath, '--json'],
    {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })
  const code = await new Promise<number | null>((resolveExit, rejectExit) => {
    child.once('error', rejectExit)
    child.once('exit', resolveExit)
  })
  if (!stdout.trim().startsWith('{')) {
    throw new Error(
      `cargo audit did not return JSON (code=${String(code)}): ${stderr}`,
    )
  }
  return stdout
}

function targetPackageKeys(metadataValue: CargoMetadata): Set<string> {
  const root = metadataValue.resolve?.root
  if (!root || !metadataValue.resolve) {
    throw new Error('Cargo metadata did not include a resolved target graph')
  }
  const dependencies = new Map(
    metadataValue.resolve.nodes.map((node) => [node.id, node.dependencies]),
  )
  const discovered = new Set<string>()
  const pending = [root]
  while (pending.length > 0) {
    const id = pending.pop()!
    if (discovered.has(id)) continue
    discovered.add(id)
    pending.push(...(dependencies.get(id) ?? []))
  }
  return new Set(
    metadataValue.packages
      .filter((component) => discovered.has(component.id))
      .map((component) => `${component.name}@${component.version}`),
  )
}

function packageKey(finding: AuditFinding): string {
  return `${finding.package.name}@${finding.package.version}`
}

function summarize(finding: AuditFinding) {
  return {
    advisoryId: finding.advisory.id,
    package: finding.package.name,
    version: finding.package.version,
    title: finding.advisory.title,
    url: finding.advisory.url,
    patched: finding.versions.patched,
  }
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
