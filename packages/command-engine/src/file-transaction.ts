import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
} from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'

export type WorkspaceTransactionState =
  | 'PREPARED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'FINALIZED'
  | 'ROLLED_BACK'
  | 'RECOVERY_CONFLICT'

export interface WorkspaceTransactionFile {
  absolutePath: string
  workspacePath: string
  beforeSha256: string
  afterSha256: string
  beforeText: string
  afterText: string
}

export interface WorkspaceTransactionReceipt {
  schemaVersion: 1
  transactionId: string
  state: WorkspaceTransactionState
  files: Array<{
    workspacePath: string
    beforeSha256: string
    afterSha256: string
    backupPath: string
  }>
  completedPaths: string[]
}

export interface CommitWorkspaceTransactionInput {
  rootPath: string
  transactionId: string
  files: WorkspaceTransactionFile[]
  faultInjector?: (
    stage: 'after-prepare' | 'before-replace' | 'after-replace' | 'after-commit',
    workspacePath?: string,
  ) => void | Promise<void>
}

export class WorkspaceTransactionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WorkspaceTransactionError'
  }
}

export async function commitWorkspaceTransaction(
  input: CommitWorkspaceTransactionInput,
): Promise<WorkspaceTransactionReceipt> {
  validateTransactionId(input.transactionId)
  if (input.files.length === 0 || input.files.length > 1_000) {
    throw new WorkspaceTransactionError(
      'Workspace transaction must contain 1 to 1000 files',
    )
  }
  const rootPath = await realpath(input.rootPath)
  const files = [...input.files]
    .sort((left, right) => left.workspacePath.localeCompare(right.workspacePath))
  const seen = new Set<string>()
  for (const file of files) {
    file.absolutePath = await realpath(file.absolutePath)
    validateFile(rootPath, file, seen)
    const current = await readFile(file.absolutePath, 'utf8')
    if (digest(current) !== file.beforeSha256 || current !== file.beforeText) {
      throw new WorkspaceTransactionError(
        `Workspace transaction base hash conflict: ${file.workspacePath}`,
      )
    }
    if (digest(file.afterText) !== file.afterSha256) {
      throw new WorkspaceTransactionError(
        `Workspace transaction after hash is invalid: ${file.workspacePath}`,
      )
    }
  }

  const transactionRoot = resolve(
    rootPath,
    '.sysml-workbench',
    'transactions',
    input.transactionId,
  )
  const journalPath = resolve(transactionRoot, 'journal.json')
  const existing = await readExistingJournal(journalPath)
  if (existing) {
    if (existing.state !== 'FINALIZED') {
      throw new WorkspaceTransactionError(
        `Workspace transaction requires recovery: ${input.transactionId}`,
      )
    }
    await verifyFinalized(rootPath, existing)
    return existing
  }
  await mkdir(resolve(transactionRoot, 'backups'), {
    recursive: true,
    mode: 0o700,
  })
  const receipt: WorkspaceTransactionReceipt = {
    schemaVersion: 1,
    transactionId: input.transactionId,
    state: 'PREPARED',
    files: [],
    completedPaths: [],
  }
  for (const [index, file] of files.entries()) {
    const backupPath = `backups/${String(index).padStart(4, '0')}-${digest(file.workspacePath).slice(0, 16)}.source`
    await writeDurable(
      resolve(transactionRoot, backupPath),
      file.beforeText,
      0o600,
    )
    receipt.files.push({
      workspacePath: file.workspacePath,
      beforeSha256: file.beforeSha256,
      afterSha256: file.afterSha256,
      backupPath,
    })
  }
  await persistJournal(journalPath, receipt)
  await input.faultInjector?.('after-prepare')

  try {
    receipt.state = 'COMMITTING'
    await persistJournal(journalPath, receipt)
    for (const file of files) {
      const current = await readFile(file.absolutePath, 'utf8')
      if (digest(current) !== file.beforeSha256) {
        throw new WorkspaceTransactionError(
          `Workspace transaction external-writer conflict: ${file.workspacePath}`,
        )
      }
      await input.faultInjector?.('before-replace', file.workspacePath)
      await replaceDurably(file.absolutePath, file.afterText)
      receipt.completedPaths.push(file.workspacePath)
      await persistJournal(journalPath, receipt)
      await input.faultInjector?.('after-replace', file.workspacePath)
    }
    receipt.state = 'COMMITTED'
    await persistJournal(journalPath, receipt)
    await input.faultInjector?.('after-commit')
    await verifyFinalized(rootPath, receipt)
    receipt.state = 'FINALIZED'
    await persistJournal(journalPath, receipt)
    return structuredClone(receipt)
  } catch (error) {
    try {
      await rollback(rootPath, transactionRoot, receipt)
      receipt.state = 'ROLLED_BACK'
      await persistJournal(journalPath, receipt)
    } catch (rollbackError) {
      receipt.state = 'RECOVERY_CONFLICT'
      await persistJournal(journalPath, receipt)
      throw new WorkspaceTransactionError(
        `Workspace transaction entered recovery conflict: ${input.transactionId}`,
        { cause: rollbackError },
      )
    }
    throw new WorkspaceTransactionError(
      `Workspace transaction rolled back: ${input.transactionId}`,
      { cause: error },
    )
  }
}

async function rollback(
  rootPath: string,
  transactionRoot: string,
  receipt: WorkspaceTransactionReceipt,
): Promise<void> {
  for (const workspacePath of [...receipt.completedPaths].reverse()) {
    const record = receipt.files.find(
      (candidate) => candidate.workspacePath === workspacePath,
    )!
    const absolutePath = resolve(rootPath, workspacePath)
    const current = await readFile(absolutePath, 'utf8')
    if (digest(current) !== record.afterSha256) {
      throw new WorkspaceTransactionError(
        `Rollback found external divergence: ${workspacePath}`,
      )
    }
    const backup = await readFile(resolve(transactionRoot, record.backupPath), 'utf8')
    if (digest(backup) !== record.beforeSha256) {
      throw new WorkspaceTransactionError(
        `Rollback backup hash mismatch: ${workspacePath}`,
      )
    }
    await replaceDurably(absolutePath, backup)
  }
  receipt.completedPaths = []
}

async function verifyFinalized(
  rootPath: string,
  receipt: WorkspaceTransactionReceipt,
): Promise<void> {
  for (const file of receipt.files) {
    const current = await readFile(resolve(rootPath, file.workspacePath), 'utf8')
    if (digest(current) !== file.afterSha256) {
      throw new WorkspaceTransactionError(
        `Committed file hash mismatch: ${file.workspacePath}`,
      )
    }
  }
}

function validateFile(
  rootPath: string,
  file: WorkspaceTransactionFile,
  seen: Set<string>,
): void {
  if (
    !file.workspacePath ||
    file.workspacePath.startsWith('/') ||
    file.workspacePath.split('/').includes('..')
  ) {
    throw new WorkspaceTransactionError('Transaction workspace path is unsafe')
  }
  const expected = resolve(rootPath, file.workspacePath)
  if (expected !== resolve(file.absolutePath) || !isWithin(rootPath, expected)) {
    throw new WorkspaceTransactionError(
      `Transaction file is outside the workspace: ${file.workspacePath}`,
    )
  }
  if (seen.has(file.workspacePath)) {
    throw new WorkspaceTransactionError(
      `Transaction contains a duplicate file: ${file.workspacePath}`,
    )
  }
  seen.add(file.workspacePath)
}

function validateTransactionId(value: string): void {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new WorkspaceTransactionError('Transaction id is unsafe')
  }
}

async function replaceDurably(path: string, text: string): Promise<void> {
  const metadata = await stat(path)
  const temporary = resolve(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  )
  await writeDurable(temporary, text, metadata.mode & 0o777)
  await rename(temporary, path)
  await syncDirectory(dirname(path))
}

async function persistJournal(
  path: string,
  receipt: WorkspaceTransactionReceipt,
): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`
  await writeDurable(
    temporary,
    `${JSON.stringify(receipt, null, 2)}\n`,
    0o600,
  )
  await rename(temporary, path)
  await syncDirectory(dirname(path))
}

async function writeDurable(
  path: string,
  text: string,
  mode: number,
): Promise<void> {
  const handle = await open(path, 'w', mode)
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readExistingJournal(
  path: string,
): Promise<WorkspaceTransactionReceipt | null> {
  try {
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new WorkspaceTransactionError('Transaction journal is unsafe')
    }
    const value = JSON.parse(await readFile(path, 'utf8')) as WorkspaceTransactionReceipt
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.files) ||
      !Array.isArray(value.completedPaths)
    ) {
      throw new WorkspaceTransactionError('Transaction journal is invalid')
    }
    return value
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}

function isWithin(rootPath: string, candidate: string): boolean {
  const path = relative(rootPath, candidate)
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'))
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
