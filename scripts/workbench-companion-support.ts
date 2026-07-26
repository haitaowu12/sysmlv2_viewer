export interface CompanionPackageIdentity {
  productName: string
  portableVersion: string
  packageName: string
  packageVersion: string
  authoringArtifactPath: string
}

export function validateCompanionPackageIdentity(
  identity: CompanionPackageIdentity,
): { version: string; authoringArtifactPath: 'runtime/authoring/spec42' } {
  assertCompanionPackagingEntrypoint()
  if (
    identity.productName !== 'SysML Engineering Workbench' ||
    identity.packageName !== 'sysml-engineering-workbench' ||
    identity.portableVersion !== identity.packageVersion ||
    !/^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/.test(identity.packageVersion)
  ) {
    throw new Error('Portable bundle product identity is invalid')
  }
  const authoringArtifactPath = identity.authoringArtifactPath.replaceAll(
    '\\',
    '/',
  )
  if (authoringArtifactPath !== 'runtime/authoring/spec42') {
    throw new Error(
      'Portable bundle authoring artifact path is not the locked darwin-arm64 path',
    )
  }
  return {
    version: identity.packageVersion,
    authoringArtifactPath,
  }
}

/**
 * The implementation module is deliberately not a supported command-line
 * entrypoint. The public packaging command must execute the portable preflight
 * before importing it. This guard prevents a direct `tsx`/compiled invocation
 * from bypassing dirty-source and official-library tree verification.
 */
export function assertCompanionPackagingEntrypoint(
  entrypoint = process.argv[1],
): void {
  const normalized = entrypoint?.replaceAll('\\', '/') ?? ''
  if (
    normalized.endsWith('/workbench-package-companion.ts') ||
    normalized.endsWith('/workbench-package-companion.js')
  ) {
    throw new Error(
      'Direct companion packaging is disabled; use npm run companion:package so the portable preflight runs first',
    )
  }
}

/**
 * Emit the verifier shipped inside the self-contained Pages companion.
 *
 * The manifest is intentionally excluded from its own inventory. The archive
 * SHA-256 is the external trust anchor; this verifier detects any later
 * addition, removal, mode change, link, special file, or byte mutation.
 */
export function embeddedCompanionVerifier(): string {
  return `import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'manifests/companion-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (
  manifest.schemaVersion !== 1 ||
  manifest.product?.name !== 'SysML Engineering Workbench' ||
  manifest.distribution?.selfContained !== true
) {
  throw new Error('Companion manifest contract is invalid')
}

const actualFiles = []
await walk(root)
actualFiles.sort((left, right) => left.path.localeCompare(right.path))
if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
  throw new Error('Companion file inventory differs from the manifest')
}

const runningNodeHash = await sha256(process.execPath)
if (runningNodeHash !== manifest.runtimes.node.executableSha256) {
  throw new Error('Companion must be launched with its bundled Node runtime')
}
if (!process.versions.node.startsWith('22.')) {
  throw new Error('Companion bundled Node runtime must be major version 22')
}
process.stdout.write(\`Verified \${manifest.files.length} companion files for \${manifest.product.name} \${manifest.product.version}.\\n\`)

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name)
    const relation = relative(root, absolute)
    if (!relation || relation.startsWith('..') || isAbsolute(relation)) {
      throw new Error(\`Companion inventory path escapes its root: \${absolute}\`)
    }
    const path = sep === '/' ? relation : relation.split(sep).join('/')
    if (path === 'manifests/companion-manifest.json') continue
    if (entry.isDirectory()) {
      await walk(absolute)
      continue
    }
    if (!entry.isFile()) {
      throw new Error(\`Companion tree cannot contain links or special files: \${path}\`)
    }
    const details = await lstat(absolute)
    actualFiles.push({
      path,
      bytes: details.size,
      mode: (details.mode & 0o777).toString(8).padStart(3, '0'),
      sha256: await sha256(absolute),
    })
  }
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}
`
}
