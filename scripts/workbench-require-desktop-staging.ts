import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { sha256File } from './workbench-release-support.js'

interface DesktopRuntimeManifest {
  schemaVersion: number
  sourceCommit: string
  platform: string
  networkRequiredAfterInstall: boolean
  node: {
    version: string
    executable: string
    sha256: string
  }
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const desktopRoot = resolve(
  repositoryRoot,
  'apps/workbench-desktop/src-tauri',
)
const generated = resolve(desktopRoot, 'generated')
const manifest = JSON.parse(
  await readFile(
    resolve(generated, 'desktop-runtime-manifest.json'),
    'utf8',
  ),
) as DesktopRuntimeManifest
const { stdout } = await promisify(execFile)(
  'git',
  ['rev-parse', 'HEAD'],
  { cwd: repositoryRoot },
)
const sourceCommit = stdout.trim()
if (
  manifest.schemaVersion !== 1 ||
  manifest.sourceCommit !== sourceCommit ||
  manifest.platform !== 'darwin-arm64' ||
  manifest.networkRequiredAfterInstall ||
  !/^v22\./.test(manifest.node?.version ?? '')
) {
  throw new Error(
    'Desktop runtime staging is missing, a compile-check placeholder, or not bound to the exact current source commit',
  )
}
const sidecar = resolve(desktopRoot, manifest.node.executable)
await assertRegularFile(sidecar)
if (await sha256File(sidecar) !== manifest.node.sha256) {
  throw new Error('Staged Node sidecar hash does not match its manifest')
}
await Promise.all([
  assertRegularFile(resolve(generated, 'java/bin/java')),
  assertRegularFile(
    resolve(generated, 'workbench/manifests/release-manifest.json'),
  ),
  assertRegularFile(resolve(generated, 'workbench/bin/verify-bundle.mjs')),
])
process.stdout.write(
  `${JSON.stringify({
    outcome: 'passed',
    sourceCommit,
    platform: manifest.platform,
    nodeVersion: manifest.node.version,
  }, null, 2)}\n`,
)

async function assertRegularFile(path: string): Promise<void> {
  const details = await lstat(path)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Required staged desktop path is not a regular file: ${path}`)
  }
}
