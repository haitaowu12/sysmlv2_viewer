import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  inventoryFiles,
  normalizePath,
  sha256File,
} from './workbench-release-support.js'

interface ReleaseManifest {
  schemaVersion: number
  product: { name: string; version: string }
  release: {
    classification: string
    sourceCommit: string
    sourceDirty: boolean
  }
  runtime: {
    semantic: { artifactPath: string; sha256: string }
    authoring: { artifactPath: string; sha256: string }
    officialLibrary: { path: string; fileCount: number }
  }
  files: Array<{ path: string; bytes: number; mode: string; sha256: string }>
}

const bundleRoot = resolve(requiredValue('--bundle'))
const manifestPath = resolve(bundleRoot, 'manifests/release-manifest.json')
const manifest = JSON.parse(
  await readFile(manifestPath, 'utf8'),
) as ReleaseManifest
if (
  manifest.schemaVersion !== 1 ||
  manifest.product.name !== 'SysML Engineering Workbench' ||
  manifest.release.classification !== 'internal-unsigned-release-candidate'
) {
  throw new Error('Release manifest contract is invalid')
}
if (manifest.release.sourceDirty && !process.argv.includes('--allow-dirty')) {
  throw new Error('Dirty-source release bundles cannot qualify')
}

const actualFiles = await inventoryFiles(
  bundleRoot,
  new Set(['manifests/release-manifest.json']),
)
const expectedPaths = manifest.files.map((file) => file.path)
const actualPaths = actualFiles.map((file) => file.path)
if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
  throw new Error('Release file inventory differs from the manifest')
}
for (let index = 0; index < manifest.files.length; index += 1) {
  const expected = manifest.files[index]!
  const actual = actualFiles[index]!
  if (
    expected.path !== actual.path ||
    expected.bytes !== actual.bytes ||
    expected.mode !== actual.mode ||
    expected.sha256 !== actual.sha256
  ) {
    throw new Error(`Release file does not match manifest: ${expected.path}`)
  }
}
for (const runtime of [manifest.runtime.semantic, manifest.runtime.authoring]) {
  const path = resolve(bundleRoot, runtime.artifactPath)
  if ((await sha256File(path)) !== runtime.sha256) {
    throw new Error(`Runtime artifact hash mismatch: ${runtime.artifactPath}`)
  }
}
const libraryFiles = await inventoryFiles(
  resolve(bundleRoot, manifest.runtime.officialLibrary.path),
)
if (libraryFiles.length !== manifest.runtime.officialLibrary.fileCount) {
  throw new Error('Official library file count differs from the manifest')
}
await Promise.all([
  stat(resolve(bundleRoot, 'bin/start-workbench.sh')),
  stat(resolve(bundleRoot, 'bin/start-workbench.cmd')),
  stat(resolve(bundleRoot, 'bin/start-pages-companion.sh')),
  stat(resolve(bundleRoot, 'bin/start-pages-companion.cmd')),
  stat(resolve(bundleRoot, 'bin/launch-pages-companion.mjs')),
  stat(resolve(bundleRoot, 'app/index.html')),
  stat(resolve(bundleRoot, 'service/apps/workbench-service/src/main.js')),
])
const [unixCompanionLauncher, windowsCompanionLauncher] = await Promise.all([
  readFile(resolve(bundleRoot, 'bin/start-pages-companion.sh'), 'utf8'),
  readFile(resolve(bundleRoot, 'bin/start-pages-companion.cmd'), 'utf8'),
])
for (const [name, launcher] of [
  ['start-pages-companion.sh', unixCompanionLauncher],
  ['start-pages-companion.cmd', windowsCompanionLauncher],
] as const) {
  if (
    !launcher.includes('--candidate-manifest') ||
    !launcher.includes('--runtime-lock') ||
    !launcher.includes('--workspace-file') ||
    !launcher.includes('--pages-url')
  ) {
    throw new Error(`${name} does not bind all bundle-local companion inputs`)
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      outcome: 'verified',
      bundle: normalizePath(bundleRoot),
      sourceCommit: manifest.release.sourceCommit,
      fileCount: manifest.files.length,
    },
    null,
    2,
  )}\n`,
)

function requiredValue(flag: string): string {
  const index = process.argv.indexOf(flag)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
