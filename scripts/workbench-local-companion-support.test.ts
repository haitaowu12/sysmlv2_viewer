// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { localCompanionEntry } from './workbench-local-companion-support.js'
const exec = promisify(execFile)
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'local-companion-tests-'))
  roots.push(root)
  const bundle = resolve(root, 'bundle')
  await mkdir(resolve(bundle, 'bin'), { recursive: true })
  await mkdir(resolve(bundle, 'samples/contributor-pilot'), { recursive: true })
  await writeFile(resolve(bundle, 'samples/contributor-pilot/sysml-workspace.yaml'), 'fixture: true')
  const entry = resolve(bundle, 'bin/local-workbench.mjs')
  await writeFile(entry, localCompanionEntry())
  return { root, bundle, entry }
}
it('does not allow a sample destination under the immutable installation, including dot-prefixed names', async () => {
  const f = await fixture()
  await expect(exec(process.execPath, [f.entry, '--sample', resolve(f.bundle, '..hidden')])).rejects.toThrow('outside the immutable bundle')
})
it('does not overwrite an existing sample workspace', async () => {
  const f = await fixture()
  const workspace = resolve(f.root, 'existing')
  await mkdir(workspace)
  const marker = resolve(workspace, 'sysml-workspace.yaml')
  await writeFile(marker, 'retain source')
  await expect(exec(process.execPath, [f.entry, '--sample', workspace])).rejects.toThrow('EEXIST')
  expect(await readFile(marker, 'utf8')).toBe('retain source')
})
it('rejects directly editing the included immutable sample', async () => {
  const f = await fixture()
  await expect(exec(process.execPath, [f.entry, resolve(f.bundle, 'samples/contributor-pilot/sysml-workspace.yaml')])).rejects.toThrow('outside the immutable bundle')
})
it('rejects unsafe port values before starting the service', async () => {
  const f = await fixture()
  const workspace = resolve(f.root, 'sysml-workspace.yaml')
  await writeFile(workspace, 'fixture: true')
  for (const port of ['0', '22', '65536', '4317;exec', '-1', '4317suffix']) {
    await expect(exec(process.execPath, [f.entry, workspace, '--port', port])).rejects.toThrow('--port must be an integer')
  }
})

it('rejects traversal or unknown sample profiles before copying', async () => {
  const f = await fixture()
  await expect(exec(process.execPath, [f.entry, '--sample', resolve(f.root, 'new'), '--sample-profile', '../../payload'])).rejects.toThrow('Unknown --sample-profile')
})
