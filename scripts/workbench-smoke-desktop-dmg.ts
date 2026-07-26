import { execFile } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { sha256File } from './workbench-release-support.js'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const dmgPath = resolve(requiredValue('--dmg'))
const workspaceFile = resolve(requiredValue('--workspace-file'))
const modelMarker = valueAfter('--model-marker')
const outputPath = valueAfter('--output')
  ? resolve(valueAfter('--output')!)
  : null
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The initial DMG smoke requires a macOS arm64 host')
}
const dmgDetails = await lstat(dmgPath)
if (!dmgDetails.isFile() || dmgDetails.isSymbolicLink()) {
  throw new Error('DMG input must be a regular file')
}

const mountPoint = await mkdtemp(
  resolve(tmpdir(), 'sysml-workbench-dmg-smoke-'),
)
const innerOutput = resolve(mountPoint, '..', `${basename(mountPoint)}.json`)
let attached = false
try {
  await execFileAsync(
    'hdiutil',
    ['attach', '-readonly', '-nobrowse', '-mountpoint', mountPoint, dmgPath],
    { maxBuffer: 4 * 1024 * 1024 },
  )
  attached = true
  const appBundle = resolve(mountPoint, 'SysML Engineering Workbench.app')
  const argumentsList = [
    resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    resolve(repositoryRoot, 'scripts/workbench-smoke-desktop-bundle.ts'),
    '--app',
    appBundle,
    '--workspace-file',
    workspaceFile,
    '--output',
    innerOutput,
  ]
  if (modelMarker) {
    argumentsList.push('--model-marker', modelMarker)
  }
  await execFileAsync(process.execPath, argumentsList, {
    cwd: repositoryRoot,
    maxBuffer: 32 * 1024 * 1024,
  })
  const innerReport = JSON.parse(await readFile(innerOutput, 'utf8')) as
    Record<string, unknown>
  const report = {
    ...innerReport,
    container: {
      type: 'dmg',
      name: basename(dmgPath),
      sha256: await sha256File(dmgPath),
      mountedReadOnly: true,
    },
  }
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  if (attached) {
    await execFileAsync('hdiutil', ['detach', mountPoint]).catch(() => undefined)
  }
  await rmdir(mountPoint).catch(() => undefined)
  await unlink(innerOutput).catch(() => undefined)
}

function requiredValue(flag: string): string {
  const value = valueAfter(flag)
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
