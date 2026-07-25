import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  commitWorkspaceTransaction,
  recoverWorkspaceTransactions,
} from '../packages/command-engine/src/file-transaction.js'
import { createQualifiedHybridAdapter } from '../packages/language-adapter/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const crashWorker = process.argv.includes('--crash-worker')
if (crashWorker) {
  await runCrashWorker(resolve(requiredValue('--workspace-root')))
} else {
  await runQualification()
}

async function runQualification(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-recovery-'))
  const workspaceRoot = resolve(temporaryRoot, 'workspace')
  const backupRoot = resolve(temporaryRoot, 'backup')
  const outputPath = resolve(
    valueAfter('--output') ??
      resolve(repositoryRoot, 'generated/release-evidence/phase7-recovery.json'),
  )
  try {
    await cp(
      resolve(repositoryRoot, 'fixtures/workspaces/phase5-infrastructure'),
      workspaceRoot,
      { recursive: true },
    )
    await createGovernanceArtifacts(workspaceRoot)
    const before = await openEvidence(workspaceRoot)
    const projectBefore = await projectInventory(workspaceRoot)
    await cp(workspaceRoot, backupRoot, { recursive: true })

    const crash = await spawnCrashWorker(workspaceRoot)
    if (crash.code !== 91) {
      throw new Error(
        `Crash worker did not stop at the injected boundary: ${crash.code}\n${crash.stderr}`,
      )
    }
    const journalPath = resolve(
      workspaceRoot,
      '.sysml-workbench/transactions/P7-INTERRUPTED/journal.json',
    )
    const interruptedJournal = JSON.parse(
      await readFile(journalPath, 'utf8'),
    ) as { state: string; completedPaths: string[] }
    if (
      interruptedJournal.state !== 'COMMITTING' ||
      interruptedJournal.completedPaths.length !== 1
    ) {
      throw new Error('Injected transaction did not leave a mixed COMMITTING journal')
    }
    const mixedState = await transactionFileState(workspaceRoot)
    if (mixedState.changed !== 1 || mixedState.original !== 1) {
      throw new Error('Injected transaction did not leave one replaced and one original file')
    }

    const recovered = await recoverWorkspaceTransactions(workspaceRoot)
    if (
      !recovered.some(
        (item) =>
          item.transactionId === 'P7-INTERRUPTED' &&
          item.state === 'ROLLED_BACK',
      )
    ) {
      throw new Error('Interrupted transaction did not recover by verified rollback')
    }
    const rolledBackState = await transactionFileState(workspaceRoot)
    if (rolledBackState.changed !== 0 || rolledBackState.original !== 2) {
      throw new Error('Recovery did not restore both source files byte-exactly')
    }

    await rm(workspaceRoot, { recursive: true, force: true })
    await cp(backupRoot, workspaceRoot, { recursive: true })
    const projectAfter = await projectInventory(workspaceRoot)
    if (projectBefore.treeSha256 !== projectAfter.treeSha256) {
      throw new Error('Backup restore did not reproduce the project tree')
    }
    const after = await openEvidence(workspaceRoot)
    if (
      before.snapshotSha256 !== after.snapshotSha256 ||
      JSON.stringify(before.elementIds) !== JSON.stringify(after.elementIds)
    ) {
      throw new Error('Restored workspace did not reproduce semantic identities')
    }

    const report = {
      schemaVersion: 1,
      outcome: 'pass',
      gate: 'P7-recovery',
      sourceCommit: await gitHead(),
      fixture: {
        id: before.workspaceId,
        documentCount: before.documentCount,
        elementCount: before.elementIds.length,
      },
      interruptedTransaction: {
        injectedExitCode: crash.code,
        journalStateBeforeRecovery: interruptedJournal.state,
        completedPathsBeforeRecovery: interruptedJournal.completedPaths,
        mixedFileStateObserved: true,
        recovery: recovered.find(
          (item) => item.transactionId === 'P7-INTERRUPTED',
        ),
        sourceRestoredByteExact: true,
      },
      backupRestore: {
        fileCount: projectBefore.files.length,
        treeSha256: projectBefore.treeSha256,
        restoredTreeSha256: projectAfter.treeSha256,
        byteExact: true,
        semanticSnapshotSha256: after.snapshotSha256,
        stableIdentitySetPreserved: true,
        governanceArtifactsPreserved: [
          'views/p7-recovery-view.json',
          'reviews/P7-RECOVERY-REVIEW.json',
          'baselines/P7-RECOVERY-BASELINE.json',
          'evidence/p7-recovery-evidence.json',
          '.sysml-workbench/identity-registry.json',
        ],
      },
      limitations: [
        'This qualification injects a hard process exit at the first durable source replacement and exercises automatic restart recovery.',
        'A signed installer and clean-machine OS recovery exercise remain external release gates.',
      ],
    }
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function runCrashWorker(workspaceRoot: string): Promise<never> {
  const paths = [
    'model/requirements.sysml',
    'model/system.sysml',
  ]
  const files = await Promise.all(
    paths.map(async (workspacePath) => {
      const absolutePath = resolve(workspaceRoot, workspacePath)
      const beforeText = await readFile(absolutePath, 'utf8')
      const afterText = `${beforeText}/* P7 interrupted transaction marker */\n`
      return {
        workspacePath,
        absolutePath,
        beforeText,
        afterText,
        beforeSha256: sha256(beforeText),
        afterSha256: sha256(afterText),
      }
    }),
  )
  await commitWorkspaceTransaction({
    transactionId: 'P7-INTERRUPTED',
    rootPath: workspaceRoot,
    files,
    metadata: {
      commandId: 'P7-INTERRUPTED',
      purpose: 'release recovery qualification',
    },
    faultInjector(stage) {
      if (stage === 'after-replace') process.exit(91)
    },
  })
  throw new Error('Crash worker reached an impossible success path')
}

async function spawnCrashWorker(
  workspaceRoot: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(
      process.execPath,
      [
        ...process.execArgv,
        fileURLToPath(import.meta.url),
        '--crash-worker',
        '--workspace-root',
        workspaceRoot,
      ],
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (value: string) => {
      stdout += value
    })
    child.stderr.on('data', (value: string) => {
      stderr += value
    })
    child.once('error', rejectChild)
    child.once('exit', (code) => resolveChild({ code, stdout, stderr }))
  })
}

async function openEvidence(workspaceRoot: string): Promise<{
  workspaceId: string
  documentCount: number
  snapshotSha256: string
  elementIds: string[]
}> {
  const adapter = await createQualifiedHybridAdapter(
    resolve(repositoryRoot, 'config/language-engine-candidates.json'),
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    { requestTimeoutMs: 180_000, diagnosticSettleMs: 10_000 },
  )
  const manager = new WorkspaceManager({
    allowedRoots: [workspaceRoot],
    adapter,
    workbenchVersion: '0.7.0-rc.1',
  })
  try {
    const status = await manager.open(
      resolve(workspaceRoot, 'sysml-workspace.yaml'),
    )
    const snapshot = await manager.semanticSnapshot(status.workspaceId)
    return {
      workspaceId: status.workspaceId,
      documentCount: status.documentCount,
      snapshotSha256: snapshot.snapshotSha256,
      elementIds: snapshot.elements.map((element) => element.id).sort(),
    }
  } finally {
    await manager.dispose()
  }
}

async function createGovernanceArtifacts(workspaceRoot: string): Promise<void> {
  const artifacts = {
    'views/p7-recovery-view.json': {
      schemaVersion: 1,
      id: 'p7-recovery-view',
      query: { schemaVersion: 1, mode: 'interfaces', maxResults: 100 },
    },
    'reviews/P7-RECOVERY-REVIEW.json': {
      schemaVersion: 1,
      id: 'P7-RECOVERY-REVIEW',
      status: 'closed',
      statement: 'Representative recovery artifact',
    },
    'baselines/P7-RECOVERY-BASELINE.json': {
      schemaVersion: 1,
      id: 'P7-RECOVERY-BASELINE',
      commit: '0'.repeat(40),
    },
    'evidence/p7-recovery-evidence.json': {
      schemaVersion: 1,
      id: 'P7-RECOVERY-EVIDENCE',
      sha256: '0'.repeat(64),
    },
  }
  for (const [path, value] of Object.entries(artifacts)) {
    const destination = resolve(workspaceRoot, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }
}

async function transactionFileState(
  workspaceRoot: string,
): Promise<{ original: number; changed: number }> {
  const result = { original: 0, changed: 0 }
  for (const path of ['model/requirements.sysml', 'model/system.sysml']) {
    const text = await readFile(resolve(workspaceRoot, path), 'utf8')
    if (text.includes('P7 interrupted transaction marker')) result.changed += 1
    else result.original += 1
  }
  return result
}

async function projectInventory(root: string): Promise<{
  files: Array<{ path: string; bytes: number; sha256: string }>
  treeSha256: string
}> {
  const files: Array<{ path: string; bytes: number; sha256: string }> = []
  await walk(root)
  files.sort((left, right) => left.path.localeCompare(right.path))
  return {
    files,
    treeSha256: sha256(JSON.stringify(files)),
  }

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Backup project contains a symbolic link: ${absolute}`)
      }
      if (entry.isDirectory()) {
        await walk(absolute)
      } else if (entry.isFile()) {
        const bytes = await readFile(absolute)
        files.push({
          path: relative(root, absolute),
          bytes: (await stat(absolute)).size,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
    }
  }
}

async function gitHead(): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  })
  return stdout.trim()
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function requiredValue(flag: string): string {
  return valueAfter(flag) ?? (() => {
    throw new Error(`${flag} is required`)
  })()
}
