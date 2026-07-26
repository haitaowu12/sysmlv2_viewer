import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

interface CargoMetadata {
  packages: Array<{
    id: string
    name: string
    version: string
    license: string | null
    source: string | null
  }>
  resolve: {
    root: string | null
    nodes: Array<{ id: string; dependencies: string[] }>
  } | null
}

const allowedExpressions = new Set([
  '(Apache-2.0 OR MIT) AND BSD-3-Clause',
  '(MIT OR Apache-2.0) AND Unicode-3.0',
  '0BSD OR MIT OR Apache-2.0',
  'Apache-2.0',
  'Apache-2.0 / MIT',
  'Apache-2.0 AND MIT',
  'Apache-2.0 OR MIT',
  'Apache-2.0 WITH LLVM-exception',
  'Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT',
  'Apache-2.0/MIT',
  'BSD-3-Clause',
  'BSD-3-Clause AND MIT',
  'BSD-3-Clause OR MIT OR Apache-2.0',
  'BSD-3-Clause/MIT',
  'CC0-1.0 OR MIT-0 OR Apache-2.0',
  'ISC',
  'MIT',
  'MIT OR Apache-2.0',
  'MIT OR Apache-2.0 OR LGPL-2.1-or-later',
  'MIT OR Apache-2.0 OR Zlib',
  'MIT OR Zlib OR Apache-2.0',
  'MIT/Apache-2.0',
  'MPL-2.0',
  'Unicode-3.0',
  'Unlicense OR MIT',
  'Unlicense/MIT',
  'Zlib',
  'Zlib OR Apache-2.0 OR MIT',
])
const repositoryRoot = resolve(import.meta.dirname, '..')
const manifestPath = resolve(
  repositoryRoot,
  'apps/workbench-desktop/src-tauri/Cargo.toml',
)
const outputPath = resolve(
  valueAfter('--output') ??
    resolve(
      repositoryRoot,
      'docs/revamp/phase7-desktop-rust-license-inventory.json',
    ),
)
const cargo = process.env.CARGO ?? 'cargo'
const { stdout } = await promisify(execFile)(
  cargo,
  [
    'metadata',
    '--format-version',
    '1',
    '--locked',
    '--manifest-path',
    manifestPath,
  ],
  {
    cwd: repositoryRoot,
    maxBuffer: 64 * 1024 * 1024,
  },
)
const metadata = JSON.parse(stdout) as CargoMetadata
const reachable = reachablePackageIds(metadata)
const packages = metadata.packages
  .filter((component) => reachable.has(component.id))
  .map((component) => ({
    name: component.name,
    version: component.version,
    license: component.license ?? 'UNKNOWN',
    source: component.source ?? 'workspace',
  }))
  .sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
    ),
  )
const unapprovedFindings = packages
  .filter((component) => !allowedExpressions.has(component.license))
  .map((component) => ({
    package: component.name,
    version: component.version,
    license: component.license,
  }))
const licenseCounts = packages.reduce<Record<string, number>>(
  (counts, component) => {
    counts[component.license] = (counts[component.license] ?? 0) + 1
    return counts
  },
  {},
)
const report = {
  schemaVersion: 1,
  outcome: unapprovedFindings.length === 0 ? 'pass' : 'blocked',
  scope: 'locked Tauri desktop Cargo dependency graph',
  manifest: 'apps/workbench-desktop/src-tauri/Cargo.toml',
  lock: 'apps/workbench-desktop/src-tauri/Cargo.lock',
  componentCount: packages.length,
  allowedExpressions: [...allowedExpressions].sort(),
  licenseCounts: Object.fromEntries(
    Object.entries(licenseCounts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ),
  unapprovedFindings,
  packages,
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(
  `${JSON.stringify({
    outcome: report.outcome,
    componentCount: report.componentCount,
    unapprovedFindings,
    output: outputPath,
  }, null, 2)}\n`,
)
if (unapprovedFindings.length > 0) process.exitCode = 1

function reachablePackageIds(metadataValue: CargoMetadata): Set<string> {
  const root = metadataValue.resolve?.root
  if (!root || !metadataValue.resolve) {
    throw new Error('Cargo metadata did not include a resolved root graph')
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
  return discovered
}

function dirname(path: string): string {
  return resolve(path, '..')
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
