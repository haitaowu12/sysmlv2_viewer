import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
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
  metadata?: Record<string, unknown>
}

export interface CommitWorkspaceTransactionInput {
  rootPath: string
  transactionId: string
  files: WorkspaceTransactionFile[]
  metadata?: Record<string, unknown>
  faultInjector?: (
    stage: 'after-prepare' | 'before-replace' | 'after-replace' | 'after-commit',
    workspacePath?: string,
  ) => void | Promise<void>
}

export interface WorkspaceTransactionRecovery {
  transactionId: string
  state: 'FINALIZED' | 'ROLLED_BACK'
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
  validateMetadata(input.metadata)
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
    ...(input.metadata === undefined
      ? {}
      : { metadata: structuredClone(input.metadata) }),
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

export async function recoverWorkspaceTransactions(
  workspaceRoot: string,
): Promise<WorkspaceTransactionRecovery[]> {
  const rootPath = await realpath(workspaceRoot)
  const transactionsRoot = resolve(
    rootPath,
    '.sysml-workbench',
    'transactions',
  )
  let entries
  try {
    entries = await readdir(transactionsRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }

  const recovered: WorkspaceTransactionRecovery[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new WorkspaceTransactionError(
        `Transaction directory is unsafe: ${entry.name}`,
      )
    }
    validateTransactionId(entry.name)
    const transactionRoot = resolve(transactionsRoot, entry.name)
    const journalPath = resolve(transactionRoot, 'journal.json')
    const receipt = await readExistingJournal(journalPath)
    if (!receipt || receipt.transactionId !== entry.name) {
      throw new WorkspaceTransactionError(
        `Transaction journal is missing or mismatched: ${entry.name}`,
      )
    }
    validateJournal(rootPath, transactionRoot, receipt)

    try {
      const state = await recoverTransaction(
        rootPath,
        transactionRoot,
        journalPath,
        receipt,
      )
      recovered.push({ transactionId: receipt.transactionId, state })
    } catch (error) {
      receipt.state = 'RECOVERY_CONFLICT'
      await persistJournal(journalPath, receipt)
      throw new WorkspaceTransactionError(
        `Workspace transaction recovery conflict: ${receipt.transactionId}`,
        { cause: error },
      )
    }
  }
  return recovered
}

export async function readWorkspaceTransaction(
  workspaceRoot: string,
  transactionId: string,
): Promise<WorkspaceTransactionReceipt | null> {
  validateTransactionId(transactionId)
  const rootPath = await realpath(workspaceRoot)
  const transactionRoot = resolve(
    rootPath,
    '.sysml-workbench',
    'transactions',
    transactionId,
  )
  try {
    const metadata = await lstat(transactionRoot)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new WorkspaceTransactionError('Transaction directory is unsafe')
    }
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
  const receipt = await readExistingJournal(resolve(transactionRoot, 'journal.json'))
  if (!receipt) return null
  if (receipt.transactionId !== transactionId) {
    throw new WorkspaceTransactionError('Transaction journal id is mismatched')
  }
  validateJournal(rootPath, transactionRoot, receipt)
  return structuredClone(receipt)
}

async function recoverTransaction(
  rootPath: string,
  transactionRoot: string,
  journalPath: string,
  receipt: WorkspaceTransactionReceipt,
): Promise<'FINALIZED' | 'ROLLED_BACK'> {
  if (receipt.state === 'RECOVERY_CONFLICT') {
    throw new WorkspaceTransactionError('Manual transaction recovery is required')
  }
  if (receipt.state === 'FINALIZED') return 'FINALIZED'
  if (receipt.state === 'ROLLED_BACK') return 'ROLLED_BACK'
  const hashes = new Map<string, string>()
  for (const file of receipt.files) {
    const absolutePath = resolve(rootPath, file.workspacePath)
    await assertRegularFile(absolutePath, `Transaction target: ${file.workspacePath}`)
    const current = await readFile(absolutePath, 'utf8')
    hashes.set(file.workspacePath, digest(current))
  }
  const allBefore = receipt.files.every(
    (file) => hashes.get(file.workspacePath) === file.beforeSha256,
  )
  const allAfter = receipt.files.every(
    (file) => hashes.get(file.workspacePath) === file.afterSha256,
  )

  if (receipt.state === 'COMMITTED') {
    if (!allAfter) {
      throw new WorkspaceTransactionError('Committed transaction files diverged')
    }
    receipt.state = 'FINALIZED'
    receipt.completedPaths = receipt.files.map((file) => file.workspacePath)
    await persistJournal(journalPath, receipt)
    return 'FINALIZED'
  }
  if (receipt.state === 'PREPARED') {
    if (!allBefore) {
      throw new WorkspaceTransactionError('Uncommitted transaction files diverged')
    }
    receipt.state = 'ROLLED_BACK'
    receipt.completedPaths = []
    await persistJournal(journalPath, receipt)
    return 'ROLLED_BACK'
  }
  if (allAfter) {
    receipt.state = 'FINALIZED'
    receipt.completedPaths = receipt.files.map((file) => file.workspacePath)
    await persistJournal(journalPath, receipt)
    return 'FINALIZED'
  }
  if (allBefore) {
    receipt.state = 'ROLLED_BACK'
    receipt.completedPaths = []
    await persistJournal(journalPath, receipt)
    return 'ROLLED_BACK'
  }

  const completed = new Set(receipt.completedPaths)
  for (const file of receipt.files) {
    const currentHash = hashes.get(file.workspacePath)
    const expected = completed.has(file.workspacePath)
      ? file.afterSha256
      : file.beforeSha256
    if (currentHash !== expected) {
      throw new WorkspaceTransactionError(
        `Transaction journal does not match file state: ${file.workspacePath}`,
      )
    }
  }
  await rollback(rootPath, transactionRoot, receipt)
  receipt.state = 'ROLLED_BACK'
  await persistJournal(journalPath, receipt)
  return 'ROLLED_BACK'
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
    await assertRegularFile(absolutePath, `Rollback target: ${workspacePath}`)
    const current = await readFile(absolutePath, 'utf8')
    if (digest(current) !== record.afterSha256) {
      throw new WorkspaceTransactionError(
        `Rollback found external divergence: ${workspacePath}`,
      )
    }
    const backupPath = resolve(transactionRoot, record.backupPath)
    await assertRegularFile(backupPath, `Rollback backup: ${workspacePath}`)
    const backup = await readFile(backupPath, 'utf8')
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
    const absolutePath = resolve(rootPath, file.workspacePath)
    await assertRegularFile(absolutePath, `Committed target: ${file.workspacePath}`)
    const current = await readFile(absolutePath, 'utf8')
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

function validateMetadata(value: Record<string, unknown> | undefined): void {
  if (value === undefined) return
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch (error) {
    throw new WorkspaceTransactionError('Transaction metadata is not JSON-safe', {
      cause: error,
    })
  }
  if (!encoded || encoded.length > 1024 * 1024) {
    throw new WorkspaceTransactionError('Transaction metadata exceeds the size limit')
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

async function assertRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new WorkspaceTransactionError(`${label} is unsafe`)
  }
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

function validateJournal(
  rootPath: string,
  transactionRoot: string,
  receipt: WorkspaceTransactionReceipt,
): void {
  validateMetadata(receipt.metadata)
  if (receipt.files.length === 0 || receipt.files.length > 1_000) {
    throw new WorkspaceTransactionError('Transaction journal file count is invalid')
  }
  if (![
    'PREPARED',
    'COMMITTING',
    'COMMITTED',
    'FINALIZED',
    'ROLLED_BACK',
    'RECOVERY_CONFLICT',
  ].includes(receipt.state)) {
    throw new WorkspaceTransactionError('Transaction journal state is invalid')
  }
  const seen = new Set<string>()
  for (const file of receipt.files) {
    if (
      !file.workspacePath ||
      file.workspacePath.startsWith('/') ||
      file.workspacePath.split('/').includes('..') ||
      seen.has(file.workspacePath) ||
      !isWithin(rootPath, resolve(rootPath, file.workspacePath)) ||
      !/^[a-f0-9]{64}$/.test(file.beforeSha256) ||
      !/^[a-f0-9]{64}$/.test(file.afterSha256) ||
      !file.backupPath.startsWith('backups/') ||
      file.backupPath.split('/').includes('..') ||
      !isWithin(transactionRoot, resolve(transactionRoot, file.backupPath))
    ) {
      throw new WorkspaceTransactionError('Transaction journal file record is invalid')
    }
    seen.add(file.workspacePath)
  }
  if (
    receipt.completedPaths.some((path) => !seen.has(path)) ||
    new Set(receipt.completedPaths).size !== receipt.completedPaths.length
  ) {
    throw new WorkspaceTransactionError('Transaction journal completion list is invalid')
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT',
  )
}

function isWithin(rootPath: string, candidate: string): boolean {
  const path = relative(rootPath, candidate)
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'))
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
