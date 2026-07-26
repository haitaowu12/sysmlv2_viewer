import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const desktopRoot = resolve(
  repositoryRoot,
  'apps/workbench-desktop/src-tauri',
)
const sidecar = resolve(
  desktopRoot,
  'binaries/workbench-node-aarch64-apple-darwin',
)
const generated = resolve(desktopRoot, 'generated')
await Promise.all([
  mkdir(resolve(desktopRoot, 'binaries'), { recursive: true }),
  mkdir(resolve(generated, 'workbench'), { recursive: true }),
  mkdir(resolve(generated, 'java'), { recursive: true }),
  mkdir(resolve(generated, 'licenses'), { recursive: true }),
  mkdir(resolve(repositoryRoot, 'dist'), { recursive: true }),
])
const sidecarCreated = await writeIfAbsent(
  sidecar,
  '#!/bin/sh\nexit 86\n',
)
if (sidecarCreated) await chmod(sidecar, 0o755)
await Promise.all([
  writeIfAbsent(
    resolve(generated, 'workbench/CHECK_ONLY.txt'),
    'Compile-check placeholder. Run desktop:stage before bundling.\n',
  ),
  writeIfAbsent(
    resolve(generated, 'java/CHECK_ONLY.txt'),
    'Compile-check placeholder. Run desktop:stage before bundling.\n',
  ),
  writeIfAbsent(
    resolve(generated, 'licenses/CHECK_ONLY.txt'),
    'Compile-check placeholder. Run desktop:stage before bundling.\n',
  ),
  writeIfAbsent(
    resolve(generated, 'desktop-runtime-manifest.json'),
    `${JSON.stringify({
      schemaVersion: 0,
      placeholder: true,
      distributionQualified: false,
    }, null, 2)}\n`,
  ),
  writeIfAbsent(
    resolve(repositoryRoot, 'dist/index.html'),
    '<!doctype html><title>Desktop compile check</title>\n',
  ),
])

async function writeIfAbsent(
  path: string,
  content: string,
): Promise<boolean> {
  try {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx' })
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'EEXIST'
    ) {
      return false
    }
    throw error
  }
}
