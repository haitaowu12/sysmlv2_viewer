// @vitest-environment node
import { execFile } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inventoryFiles,
  sha256File,
} from './workbench-release-support.js'
import {
  embeddedCompanionVerifier,
  validateCompanionPackageIdentity,
} from './workbench-companion-support.js'

const execFileAsync = promisify(execFile)
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('embedded companion verifier', () => {
  it('accepts the exact complete inventory', async () => {
    const fixture = await createFixture()
    await expect(runVerifier(fixture)).resolves.toContain('Verified 2 companion files')
  })

  it('rejects an unexpected extra file', async () => {
    const fixture = await createFixture()
    await writeFile(resolve(fixture, 'unexpected.txt'), 'not inventoried', 'utf8')
    await expect(runVerifier(fixture)).rejects.toThrow(
      'Companion file inventory differs from the manifest',
    )
  })

  it('rejects mode changes', async () => {
    const fixture = await createFixture()
    await chmod(resolve(fixture, 'payload.txt'), 0o600)
    await expect(runVerifier(fixture)).rejects.toThrow(
      'Companion file inventory differs from the manifest',
    )
  })

  it('rejects links instead of following them', async () => {
    const fixture = await createFixture()
    await symlink(
      resolve(fixture, 'payload.txt'),
      resolve(fixture, 'payload-link.txt'),
    )
    await expect(runVerifier(fixture)).rejects.toThrow(
      'Companion tree cannot contain links or special files',
    )
  })
})

describe('companion package identity', () => {
  const valid = {
    productName: 'SysML Engineering Workbench',
    portableVersion: '0.7.0-rc.1',
    packageName: 'sysml-engineering-workbench',
    packageVersion: '0.7.0-rc.1',
    authoringArtifactPath: 'runtime/authoring/spec42',
  }

  it('accepts only the source-owned version and locked authoring path', () => {
    expect(validateCompanionPackageIdentity(valid)).toEqual({
      version: '0.7.0-rc.1',
      authoringArtifactPath: 'runtime/authoring/spec42',
    })
  })

  it('rejects traversal in a manifest-controlled version', () => {
    expect(() =>
      validateCompanionPackageIdentity({
        ...valid,
        portableVersion: '../../../../victim',
        packageVersion: '../../../../victim',
      }),
    ).toThrow('product identity is invalid')
  })

  it('rejects shell syntax or alternate authoring artifact paths', () => {
    expect(() =>
      validateCompanionPackageIdentity({
        ...valid,
        authoringArtifactPath: 'runtime/authoring/$(touch injected)',
      }),
    ).toThrow('authoring artifact path')
  })
})

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workbench-companion-verifier-'))
  temporaryRoots.push(root)
  const verifierPath = resolve(root, 'bin/verify-companion.mjs')
  await mkdir(dirname(verifierPath), { recursive: true })
  await mkdir(resolve(root, 'manifests'), { recursive: true })
  await writeFile(verifierPath, embeddedCompanionVerifier(), 'utf8')
  await writeFile(resolve(root, 'payload.txt'), 'qualified payload\n', 'utf8')
  const files = await inventoryFiles(
    root,
    new Set(['manifests/companion-manifest.json']),
  )
  await writeFile(
    resolve(root, 'manifests/companion-manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      product: {
        name: 'SysML Engineering Workbench',
        version: 'test',
      },
      runtimes: {
        node: {
          executableSha256: await sha256File(process.execPath),
        },
      },
      distribution: { selfContained: true },
      files,
    }, null, 2)}\n`,
    'utf8',
  )
  return root
}

async function runVerifier(root: string): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [resolve(root, 'bin/verify-companion.mjs')],
  )
  return stdout
}
