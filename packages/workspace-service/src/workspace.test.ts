// @vitest-environment node
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { PreservationControlAdapter } from '../../language-adapter/src/index.js'
import { WorkspaceManager } from './workspace.js'

const sampleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/workspaces/phase1-sample',
)
const managers: WorkspaceManager[] = []

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.dispose()))
})

describe('WorkspaceManager', () => {
  it('loads a multi-file workspace deterministically without claiming semantics', async () => {
    const manager = new WorkspaceManager({
      allowedRoots: [sampleRoot],
      adapter: new PreservationControlAdapter(),
    })
    managers.push(manager)

    const first = await manager.open(resolve(sampleRoot, 'sysml-workspace.yaml'))
    const reopened = await manager.open(resolve(sampleRoot, 'sysml-workspace.yaml'))

    expect(first.documentCount).toBe(3)
    expect(first.snapshotSha256).toBe(reopened.snapshotSha256)
    expect(first.semanticAuthority).toBe('none')
    expect(first.indexState).toBe('failed')
    expect(first.diagnostics.errors).toBe(1)
  })

  it('rejects workspace paths outside authorized roots', async () => {
    const manager = new WorkspaceManager({
      allowedRoots: [sampleRoot],
      adapter: new PreservationControlAdapter(),
    })
    managers.push(manager)

    await expect(manager.open('/etc/hosts')).rejects.toThrow(
      /outside all authorized workspace roots/,
    )
  })

  it('rejects symlinks in model source roots', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'sysml-workbench-'))
    const model = resolve(root, 'model')
    await mkdir(model)
    await writeFile(
      resolve(root, 'sysml-workspace.yaml'),
      'schemaVersion: 1\nsourceRoots: [model]\n',
    )
    await symlink('/etc/hosts', resolve(model, 'escape.sysml'))
    const manager = new WorkspaceManager({
      allowedRoots: [root],
      adapter: new PreservationControlAdapter(),
    })
    managers.push(manager)

    await expect(
      manager.open(resolve(root, 'sysml-workspace.yaml')),
    ).rejects.toThrow(/Symbolic link escapes/)
  })
})
