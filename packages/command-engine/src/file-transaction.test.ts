// @vitest-environment node
import { createHash } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  commitWorkspaceTransaction,
  WorkspaceTransactionError,
} from './file-transaction.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('durable workspace file transaction', () => {
  it('commits multiple files with a finalized journal and receipt', async () => {
    const root = await workspace()
    const first = resolve(root, 'model/first.sysml')
    const second = resolve(root, 'model/second.sysml')
    const receipt = await commitWorkspaceTransaction({
      rootPath: root,
      transactionId: 'proposal-001',
      files: [
        change(first, 'model/first.sysml', 'package First;\n', 'package One;\n'),
        change(second, 'model/second.sysml', 'package Second;\n', 'package Two;\n'),
      ],
    })

    expect(await readFile(first, 'utf8')).toBe('package One;\n')
    expect(await readFile(second, 'utf8')).toBe('package Two;\n')
    expect(receipt.state).toBe('FINALIZED')
    expect(receipt.files.map((file) => file.workspacePath)).toEqual([
      'model/first.sysml',
      'model/second.sysml',
    ])
    const persisted = JSON.parse(
      await readFile(
        resolve(
          root,
          '.sysml-workbench/transactions/proposal-001/journal.json',
        ),
        'utf8',
      ),
    )
    expect(persisted).toMatchObject({
      transactionId: 'proposal-001',
      state: 'FINALIZED',
      completedPaths: ['model/first.sysml', 'model/second.sysml'],
    })
  })

  it('rejects an external-writer hash conflict before replacement', async () => {
    const root = await workspace()
    const first = resolve(root, 'model/first.sysml')
    await writeFile(first, 'external change\n')
    await expect(
      commitWorkspaceTransaction({
        rootPath: root,
        transactionId: 'proposal-stale',
        files: [
          change(first, 'model/first.sysml', 'package First;\n', 'package One;\n'),
        ],
      }),
    ).rejects.toThrow('base hash conflict')
    expect(await readFile(first, 'utf8')).toBe('external change\n')
  })

  it('rolls back completed replacements after an injected failure', async () => {
    const root = await workspace()
    const first = resolve(root, 'model/first.sysml')
    const second = resolve(root, 'model/second.sysml')
    await expect(
      commitWorkspaceTransaction({
        rootPath: root,
        transactionId: 'proposal-fault',
        files: [
          change(first, 'model/first.sysml', 'package First;\n', 'package One;\n'),
          change(second, 'model/second.sysml', 'package Second;\n', 'package Two;\n'),
        ],
        faultInjector(stage, workspacePath) {
          if (stage === 'after-replace' && workspacePath === 'model/first.sysml') {
            throw new Error('injected crash')
          }
        },
      }),
    ).rejects.toThrow(WorkspaceTransactionError)
    expect(await readFile(first, 'utf8')).toBe('package First;\n')
    expect(await readFile(second, 'utf8')).toBe('package Second;\n')
    const persisted = JSON.parse(
      await readFile(
        resolve(
          root,
          '.sysml-workbench/transactions/proposal-fault/journal.json',
        ),
        'utf8',
      ),
    )
    expect(persisted.state).toBe('ROLLED_BACK')
  })
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sysml-command-transaction-'))
  temporaryDirectories.push(root)
  await mkdir(resolve(root, 'model'), { recursive: true })
  await writeFile(resolve(root, 'model/first.sysml'), 'package First;\n')
  await writeFile(resolve(root, 'model/second.sysml'), 'package Second;\n')
  return root
}

function change(
  absolutePath: string,
  workspacePath: string,
  before: string,
  after: string,
) {
  return {
    absolutePath,
    workspacePath,
    beforeSha256: digest(before),
    afterSha256: digest(after),
    beforeText: before,
    afterText: after,
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
