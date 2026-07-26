// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inventoryFiles,
  type ReleaseFile,
} from './workbench-release-support.js'
import {
  inventoryTreeSha256,
  verifyCompanionPortablePreflight,
} from './workbench-companion-preflight.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })),
  )
})

describe('companion portable preflight', () => {
  it('canonicalizes inventory order', () => {
    const files: ReleaseFile[] = [
      { path: 'b.sysml', bytes: 2, mode: '644', sha256: 'b'.repeat(64) },
      { path: 'a.sysml', bytes: 1, mode: '644', sha256: 'a'.repeat(64) },
    ]
    expect(inventoryTreeSha256(files)).toBe(
      inventoryTreeSha256([...files].reverse()),
    )
  })

  it('changes the tree hash when file evidence changes', () => {
    const files: ReleaseFile[] = [
      { path: 'a.sysml', bytes: 1, mode: '644', sha256: 'a'.repeat(64) },
    ]
    expect(inventoryTreeSha256(files)).not.toBe(
      inventoryTreeSha256([
        { ...files[0]!, sha256: 'c'.repeat(64) },
      ]),
    )
  })

  it('accepts an exact clean official-library tree', async () => {
    const root = await fixture(false)
    await expect(verifyCompanionPortablePreflight(root)).resolves.toMatchObject({
      officialLibraryFileCount: 1,
    })
  })

  it('rejects a dirty portable input even when downstream assembly allows dirty worktrees', async () => {
    const root = await fixture(true)
    await expect(verifyCompanionPortablePreflight(root)).rejects.toThrow(
      'sourceDirty=false',
    )
  })

  it('rejects byte changes that preserve the library file count', async () => {
    const root = await fixture(false)
    await writeFile(
      resolve(root, 'runtime/libraries/sysml.library/library.sysml'),
      'changed bytes\n',
      'utf8',
    )
    await expect(verifyCompanionPortablePreflight(root)).rejects.toThrow(
      'official-library tree differs',
    )
  })

  it('rejects an alternate or traversing official-library path before inventory', async () => {
    const root = await fixture(false)
    const manifestPath = resolve(root, 'manifests/release-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.runtime.officialLibrary.path = '../../outside'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await expect(verifyCompanionPortablePreflight(root)).rejects.toThrow(
      'official-library manifest is invalid',
    )
  })

  it('rejects malformed tree provenance', async () => {
    const root = await fixture(false)
    const manifestPath = resolve(root, 'manifests/release-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.runtime.officialLibrary.treeSha256 = 'not-a-hash'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await expect(verifyCompanionPortablePreflight(root)).rejects.toThrow(
      'official-library manifest is invalid',
    )
  })
})

async function fixture(sourceDirty: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'companion-preflight-'))
  temporaryRoots.push(root)
  const libraryRoot = resolve(root, 'runtime/libraries/sysml.library')
  await mkdir(libraryRoot, { recursive: true })
  await mkdir(resolve(root, 'manifests'), { recursive: true })
  await writeFile(
    resolve(libraryRoot, 'library.sysml'),
    'package Library;\n',
    'utf8',
  )
  const files = await inventoryFiles(libraryRoot)
  await writeFile(
    resolve(root, 'manifests/release-manifest.json'),
    `${JSON.stringify({
      release: { sourceDirty },
      runtime: {
        officialLibrary: {
          path: 'runtime/libraries/sysml.library',
          fileCount: files.length,
          treeSha256: inventoryTreeSha256(files),
        },
      },
    }, null, 2)}\n`,
    'utf8',
  )
  return root
}
