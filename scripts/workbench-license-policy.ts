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
  'Apache-2.0 OR MIT',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'MIT OR Apache-2.0',
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
const productLicensePath = resolve(repositoryRoot, 'LICENSE')
const productNoticePath = resolve(repositoryRoot, 'NOTICE')
const runtimeDispositionPath = resolve(
  repositoryRoot,
  'docs/licenses/vinqut-runtime-disposition.md',
)
const [
  productLicenseDeclared,
  productNoticeDeclared,
  runtimeDispositionDeclared,
] = await Promise.all([
  exists(productLicensePath),
  exists(productNoticePath),
  exists(runtimeDispositionPath),
])
const productLicenseText = productLicenseDeclared
  ? await readFile(productLicensePath, 'utf8')
  : ''
const productLicenseIsApache20 =
  /Apache License\s+Version 2\.0, January 2004/.test(productLicenseText)
const runtimeDispositionText = runtimeDispositionDeclared
  ? await readFile(runtimeDispositionPath, 'utf8')
  : ''
const runtimeDispositionMatchesLock =
  runtimeDispositionText.includes(
    '373dfb960860c3ac259f56169ddabc06d2847eca',
  ) &&
  runtimeDispositionText.includes(
    'fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa',
  ) &&
  runtimeDispositionText.includes(
    '8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160',
  ) &&
  /Eclipse Public\s+License 2\.0/.test(runtimeDispositionText)
const runtimeFindings = [
  {
    id: 'RUNTIME-LICENSE-001',
    severity: runtimeDispositionMatchesLock ? 'informational' : 'blocking',
    status: runtimeDispositionMatchesLock ? 'closed' : 'open',
    statement:
      runtimeDispositionMatchesLock
        ? 'The exact-pin owner disposition preserves the original VinQut NOTICE and applies the pinned Pilot EPL-2.0 license to the proven Pilot-derived inputs.'
        : 'The VinQut fat-JAR NOTICE identifies bundled Pilot software as LGPL-3.0-or-later, while the pinned Pilot checkout declares EPL-2.0. The redistributed class set and corresponding obligations require an exact-pin owner disposition.',
  },
]
const blockers = [
  ...(productLicenseDeclared && productLicenseIsApache20
    ? []
    : [{
        id: 'PRODUCT-LICENSE-001',
        severity: 'blocking',
        status: 'open',
        statement:
          'The repository owner has not declared the selected Apache-2.0 product license; public distribution is prohibited.',
      }]),
  ...(productNoticeDeclared
    ? []
    : [{
        id: 'PRODUCT-NOTICE-001',
        severity: 'blocking',
        status: 'open',
        statement:
          'The repository has no product NOTICE carrying the runtime attributions.',
      }]),
  ...runtimeFindings.filter((finding) => finding.status === 'open'),
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
    spdxIdentifier: productLicenseIsApache20 ? 'Apache-2.0' : null,
    noticeDeclared: productNoticeDeclared,
  },
  runtime: {
    noticesBundledByReleaseAssembler: true,
    exactPinDispositionDeclared: runtimeDispositionMatchesLock,
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
