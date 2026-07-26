import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { validateReleaseApproval } from '../packages/release-evidence/src/index.js'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as { version: string }
const platform = valueAfter('--platform') ?? `${process.platform}-${process.arch}`
const outputRoot = resolve(
  valueAfter('--release-root') ??
    resolve(repositoryRoot, 'generated/release'),
)
const runtimeLock = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    'utf8',
  ),
) as { semantic: { artifactSha256: string } }
const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
})
const sourceCommit = stdout.trim()
const result = await validateReleaseApproval({
  repositoryRoot,
  manifestPath: resolve(
    valueAfter('--manifest') ??
      resolve(repositoryRoot, 'config/release-approval.json'),
  ),
  productName: 'SysML Engineering Workbench',
  version: packageJson.version,
  platform,
  sourceCommit,
  runtimeArtifactSha256: runtimeLock.semantic.artifactSha256,
  runtimeProvenanceSha256: await fileSha256(
    resolve(outputRoot, 'evidence/phase7-runtime-provenance.json'),
  ),
  releaseArtifactSha256: await fileSha256(
    resolve(
      outputRoot,
      `sysml-engineering-workbench-${packageJson.version}-${platform}.tar.gz`,
    ),
  ),
})
process.stdout.write(
  `${JSON.stringify({
    schemaVersion: 1,
    outcome: 'release-approval-evidence-passed',
    sourceCommit,
    platform,
    evidenceRecords: result.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      sha256: item.sha256,
    })),
  }, null, 2)}\n`,
)

async function fileSha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
