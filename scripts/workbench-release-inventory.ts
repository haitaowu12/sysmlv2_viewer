import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

interface CycloneDxComponent {
  ['bom-ref']: string
  name: string
  version?: string
  licenses?: Array<{
    license?: { id?: string; name?: string }
    expression?: string
  }>
}

interface CycloneDxBom {
  serialNumber?: string
  metadata?: { timestamp?: string }
  components?: CycloneDxComponent[]
  dependencies?: Array<{ ref: string }>
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const outputDirectory = resolve(
  valueAfter('--output') ?? resolve(repositoryRoot, 'docs/revamp'),
)
const label = valueAfter('--label') ?? 'phase7'
if (!/^[a-z0-9-]+$/.test(label)) {
  throw new Error('--label must contain only lowercase letters, numbers, and dashes')
}
await mkdir(outputDirectory, { recursive: true })

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const { stdout } = await promisify(execFile)(
  npmExecutable,
  ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev'],
  {
    cwd: repositoryRoot,
    maxBuffer: 32 * 1024 * 1024,
  },
)
const bom = JSON.parse(stdout) as CycloneDxBom
delete bom.serialNumber
if (bom.metadata) delete bom.metadata.timestamp
bom.components?.sort((left, right) =>
  left['bom-ref'].localeCompare(right['bom-ref']),
)
bom.dependencies?.sort((left, right) => left.ref.localeCompare(right.ref))

const packages = (bom.components ?? []).map((component) => ({
  name: component.name,
  version: component.version ?? 'unknown',
  licenses: (component.licenses ?? [])
    .map((entry) =>
      entry.expression ??
      entry.license?.id ??
      entry.license?.name ??
      'UNKNOWN',
    )
    .sort(),
}))
const licenseCounts = packages.reduce<Record<string, number>>(
  (counts, component) => {
    for (const license of component.licenses) {
      counts[license] = (counts[license] ?? 0) + 1
    }
    return counts
  },
  {},
)
const inventory = {
  schemaVersion: 1,
  scope: 'production npm dependency graph',
  componentCount: packages.length,
  licenseCounts: Object.fromEntries(
    Object.entries(licenseCounts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ),
  packages,
}

await Promise.all([
  writeFile(
    resolve(outputDirectory, `${label}-production-sbom.cdx.json`),
    `${JSON.stringify(bom, null, 2)}\n`,
    'utf8',
  ),
  writeFile(
    resolve(outputDirectory, `${label}-package-license-inventory.json`),
    `${JSON.stringify(inventory, null, 2)}\n`,
    'utf8',
  ),
])

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
