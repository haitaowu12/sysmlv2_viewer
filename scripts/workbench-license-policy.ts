import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface Inventory {
  packages: Array<{ name: string; version: string; licenses: string[] }>
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const inventoryPath = resolve(
  valueAfter('--inventory') ??
    resolve(repositoryRoot, 'docs/revamp/phase7-package-license-inventory.json'),
)
const outputPath = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'docs/revamp/phase7-license-policy.json'),
)
const allowOwnerBlocker = process.argv.includes('--allow-owner-blocker')
const inventory = JSON.parse(
  await readFile(inventoryPath, 'utf8'),
) as Inventory
const allowedNpmLicenses = new Set([
  '(MIT AND Zlib)',
  '(MPL-2.0 OR Apache-2.0)',
  '0BSD',
  'BSD-3-Clause',
  'ISC',
  'MIT',
])
const npmFindings = inventory.packages.flatMap((component) =>
  component.licenses.length === 0
    ? [{ package: component.name, version: component.version, license: 'UNKNOWN' }]
    : component.licenses
        .filter((license) => !allowedNpmLicenses.has(license))
        .map((license) => ({
          package: component.name,
          version: component.version,
          license,
        })),
)
const productLicenseDeclared = await exists(resolve(repositoryRoot, 'LICENSE'))
const runtimeFindings = [
  {
    id: 'RUNTIME-LICENSE-001',
    severity: 'blocking',
    status: 'open',
    statement:
      'The VinQut fat-JAR NOTICE identifies bundled Pilot software as LGPL-3.0-or-later, while the pinned Pilot checkout declares EPL-2.0. The redistributed class set and corresponding obligations require legal/source provenance reconciliation.',
  },
]
const blockers = [
  ...(productLicenseDeclared
    ? []
    : [{
        id: 'PRODUCT-LICENSE-001',
        severity: 'blocking',
        status: 'open',
        statement:
          'The repository owner has not declared a product license; public distribution is prohibited.',
      }]),
  ...runtimeFindings,
]
const report = {
  schemaVersion: 1,
  outcome:
    npmFindings.length === 0 && blockers.length === 0
      ? 'pass'
      : 'blocked',
  scope: 'release dependency and distribution license policy',
  npm: {
    componentCount: inventory.packages.length,
    allowedExpressions: [...allowedNpmLicenses].sort(),
    unapprovedFindings: npmFindings,
  },
  product: {
    licenseDeclared: productLicenseDeclared,
  },
  runtime: {
    noticesBundledByReleaseAssembler: true,
    findings: runtimeFindings,
  },
  blockers,
}
await mkdir(resolve(outputPath, '..'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (
  npmFindings.length > 0 ||
  (!allowOwnerBlocker && blockers.length > 0)
) {
  process.exitCode = 1
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
