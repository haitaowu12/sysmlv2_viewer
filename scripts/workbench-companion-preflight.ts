import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import {
  canonicalJson,
  inventoryFiles,
  type ReleaseFile,
} from './workbench-release-support.js'

interface CompanionPortableManifest {
  release?: {
    sourceDirty?: unknown
  }
  runtime?: {
    officialLibrary?: {
      path?: unknown
      fileCount?: unknown
      treeSha256?: unknown
    }
  }
}

export interface CompanionPortablePreflightResult {
  manifestPath: string
  officialLibraryPath: string
  officialLibraryFileCount: number
  officialLibraryTreeSha256: string
}

const OFFICIAL_LIBRARY_PATH = 'runtime/libraries/sysml.library'

export async function verifyCompanionPortablePreflight(
  portableBundlePath: string,
): Promise<CompanionPortablePreflightResult> {
  const portableBundle = await realpath(resolve(portableBundlePath))
  const manifestPath = resolve(
    portableBundle,
    'manifests/release-manifest.json',
  )
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as CompanionPortableManifest

  if (manifest.release?.sourceDirty !== false) {
    throw new Error(
      'Companion preflight requires portable sourceDirty=false',
    )
  }

  const officialLibrary = manifest.runtime?.officialLibrary
  if (
    officialLibrary?.path !== OFFICIAL_LIBRARY_PATH ||
    !Number.isSafeInteger(officialLibrary.fileCount) ||
    (officialLibrary.fileCount as number) < 0 ||
    typeof officialLibrary.treeSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(officialLibrary.treeSha256)
  ) {
    throw new Error('Portable bundle official-library manifest is invalid')
  }

  const officialLibraryPath = await realpath(
    resolve(portableBundle, OFFICIAL_LIBRARY_PATH),
  )
  const relation = relative(portableBundle, officialLibraryPath)
  if (!relation || relation.startsWith('..') || resolve(portableBundle, relation) !== officialLibraryPath) {
    throw new Error('Portable bundle official-library path escapes its root')
  }

  const libraryFiles = await inventoryFiles(officialLibraryPath)
  const treeSha256 = inventoryTreeSha256(libraryFiles)

  if (
    libraryFiles.length !== officialLibrary.fileCount ||
    treeSha256 !== officialLibrary.treeSha256
  ) {
    throw new Error(
      'Portable bundle official-library tree differs from its manifest',
    )
  }

  return {
    manifestPath,
    officialLibraryPath,
    officialLibraryFileCount: libraryFiles.length,
    officialLibraryTreeSha256: treeSha256,
  }
}

export function inventoryTreeSha256(
  files: readonly ReleaseFile[],
): string {
  const normalized = [...files].sort((left, right) =>
    left.path.localeCompare(right.path))
  return createHash('sha256')
    .update(canonicalJson(normalized))
    .digest('hex')
}
