import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

interface RuntimeLock {
  semantic: {
    artifactSha256: string
    commit: string
  }
  authoring: {
    artifactSha256: string
    commit: string
  }
  referenceRelease: {
    commit: string
  }
}

interface Component {
  groupId: string
  artifactId: string
  version: string
  sourcePath: string
}

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const semanticArtifact = resolve(requiredValue('--semantic-artifact'))
const authoringArtifact = resolve(requiredValue('--authoring-artifact'))
const semanticSourceRoot = resolve(requiredValue('--semantic-source-root'))
const pilotLicense = resolve(requiredValue('--pilot-license'))
const pilotRoot = dirname(pilotLicense)
const libraryRoot = resolve(requiredValue('--library-root'))
const libraryRepositoryRoot = dirname(libraryRoot)
const outputPath = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'generated/release-evidence/phase7-runtime-provenance.json'),
)
const allowLicenseConflict = process.argv.includes('--allow-license-conflict')
const lock = JSON.parse(
  await readFile(
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    'utf8',
  ),
) as RuntimeLock

await assertRegularFile(semanticArtifact, 'Semantic runtime')
await assertRegularFile(authoringArtifact, 'Authoring runtime')
const semanticSha256 = await fileSha256(semanticArtifact)
const authoringSha256 = await fileSha256(authoringArtifact)
if (semanticSha256 !== lock.semantic.artifactSha256) {
  throw new Error(`Semantic runtime is not the locked artifact: ${semanticSha256}`)
}
if (authoringSha256 !== lock.authoring.artifactSha256) {
  throw new Error(`Authoring runtime is not the locked artifact: ${authoringSha256}`)
}

const [semanticCheckout, pilotCheckout, libraryCheckout] = await Promise.all([
  gitEvidence(semanticSourceRoot),
  gitEvidence(pilotRoot),
  gitEvidence(libraryRepositoryRoot),
])
if (semanticCheckout.commit !== lock.semantic.commit) {
  throw new Error('Semantic source checkout does not match the runtime lock')
}
if (libraryCheckout.commit !== lock.referenceRelease.commit) {
  throw new Error('Official library checkout does not match the runtime lock')
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-runtime-provenance-'))
try {
  const jarEntries = await jarTable(semanticArtifact)
  await extractJarMetadata(semanticArtifact, temporaryRoot)
  const components = await readComponents(temporaryRoot)
  const bundledInputs = await compareBundledInputs(
    resolve(semanticSourceRoot, 'server/lib'),
    pilotRoot,
    resolve(temporaryRoot, 'bundled-inputs'),
  )
  const exactPilotMatches = bundledInputs.filter(
    (item) => item.classification === 'pilot-derived-exact-match',
  )
  const repackagedPilotMatches = bundledInputs.filter(
    (item) => item.classification === 'pilot-repackaged-content-match',
  )
  const unresolvedInputs = bundledInputs.filter(
    (item) =>
      item.classification === 'same-name-byte-mismatch' ||
      item.classification === 'upstream-name-not-found',
  )
  const licenseEvidence = await Promise.all([
    licenseRecord(
      'vinqut-wrapper-license',
      resolve(semanticSourceRoot, 'LICENSE'),
      'VinQut/LICENSE',
    ),
    licenseRecord(
      'vinqut-runtime-notice',
      resolve(semanticSourceRoot, 'NOTICE'),
      'VinQut/NOTICE',
    ),
    licenseRecord(
      'official-pilot-license',
      pilotLicense,
      'SysML-v2-Pilot-Implementation/LICENSE',
    ),
    licenseRecord(
      'official-release-license',
      resolve(libraryRepositoryRoot, 'LICENSE'),
      'SysML-v2-Release/LICENSE',
    ),
    licenseRecord(
      'spec42-license-copy',
      resolve(repositoryRoot, 'docs/licenses/spec42-MIT.txt'),
      'workbench/docs/licenses/spec42-MIT.txt',
    ),
  ])
  const noticeText = await readFile(resolve(semanticSourceRoot, 'NOTICE'), 'utf8')
  const pilotLicenseText = await readFile(pilotLicense, 'utf8')
  const noticeClaimsLgpl = /LGPL-3\.0-or-later/i.test(noticeText)
  const pilotCheckoutDeclaresEpl = /Eclipse Public License - v 2\.0/i.test(
    pilotLicenseText,
  )
  const report = {
    schemaVersion: 1,
    outcome: 'evidence-complete-owner-legal-decision-required',
    sourceCommit: await gitCommit(repositoryRoot),
    lockedRuntime: {
      semantic: {
        artifact: basename(semanticArtifact),
        sha256: semanticSha256,
        sourceCheckout: semanticCheckout,
      },
      authoring: {
        artifact: basename(authoringArtifact),
        sha256: authoringSha256,
        sourceCommit: lock.authoring.commit,
      },
      officialRelease: libraryCheckout,
      officialPilot: pilotCheckout,
    },
    fatJar: {
      entryCount: jarEntries.length,
      classCount: jarEntries.filter((entry) => entry.endsWith('.class')).length,
      componentCount: components.length,
      components,
      largestClassNamespaces: classNamespaces(jarEntries),
    },
    bundledLocalInputs: {
      total: bundledInputs.length,
      byteExactPilotJars: exactPilotMatches.length,
      contentEquivalentPilotRepackages: repackagedPilotMatches.length,
      unresolvedInputs: unresolvedInputs.length,
      allPilotNamedJarsMatched: bundledInputs
        .filter((item) => item.name.startsWith('org.omg.'))
        .every((item) => item.classification === 'pilot-derived-exact-match'),
      allInputsProvenanced: unresolvedInputs.length === 0,
      inputs: bundledInputs,
    },
    licenseEvidence,
    conflicts: [
      {
        id: 'RUNTIME-NOTICE-PILOT-LICENSE',
        present: noticeClaimsLgpl && pilotCheckoutDeclaresEpl,
        statement:
          'The VinQut NOTICE labels the bundled Pilot implementation LGPL-3.0-or-later, while the exact official Pilot checkout root LICENSE declares EPL-2.0.',
        requiredClosure:
          'A qualified legal or owner review must reconcile the distributed notice and approve the final runtime notice set.',
      },
      {
        id: 'UML-INPUT-BYTE-PROVENANCE',
        present: unresolvedInputs.length > 0,
        affectedInputs: unresolvedInputs.map((item) => item.name),
        statement:
          'The five Eclipse UML jars are reproducible repackages of exact directories in the pinned Pilot build; their embedded about.html files identify the Eclipse Public License.',
        requiredClosure:
          'No byte-provenance gap remains; final distribution notice approval remains part of the runtime-license gate.',
      },
      {
        id: 'PRODUCT-LICENSE-ABSENT',
        present: !(await exists(resolve(repositoryRoot, 'LICENSE'))),
        statement:
          'The product repository has no root LICENSE file.',
        requiredClosure:
          'The owner must select and approve the product license before production distribution.',
      },
    ],
    legalConclusion:
      'No legal conclusion is made. This report binds exact bytes to source and license evidence for owner or counsel review.',
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!allowLicenseConflict) {
    throw new Error(
      'Runtime provenance conflicts require owner/legal closure; use --allow-license-conflict only for a technical release candidate',
    )
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

async function compareBundledInputs(
  inputRoot: string,
  upstreamRoot: string,
  extractionRoot: string,
): Promise<
  Array<{
    name: string
    sha256: string
    bytes: number
    upstreamPath: string | null
    upstreamSha256: string | null
    classification:
      | 'pilot-derived-exact-match'
      | 'pilot-repackaged-content-match'
      | 'same-name-byte-mismatch'
      | 'upstream-name-not-found'
  }>
> {
  const inputNames = (await readdir(inputRoot))
    .filter((name) => name.endsWith('.jar'))
    .sort()
  const upstreamFiles = await walkFiles(upstreamRoot, (path) =>
    path.endsWith('.jar') && !path.endsWith('-sources.jar'),
  )
  const upstreamByName = new Map<string, string[]>()
  for (const path of upstreamFiles) {
    const name = basename(path)
    upstreamByName.set(name, [...(upstreamByName.get(name) ?? []), path])
  }
  return Promise.all(
    inputNames.map(async (name) => {
      const path = resolve(inputRoot, name)
      const sha256 = await fileSha256(path)
      const candidates = upstreamByName.get(name) ?? []
      let selected: string | null = null
      let selectedSha256: string | null = null
      for (const candidate of candidates.sort()) {
        const candidateSha256 = await fileSha256(candidate)
        if (!selected) {
          selected = candidate
          selectedSha256 = candidateSha256
        }
        if (candidateSha256 === sha256) {
          selected = candidate
          selectedSha256 = candidateSha256
          break
        }
      }
      const repackagedRoot = resolve(
        upstreamRoot,
        'org.omg.sysml.interactive',
        'target',
        'libs',
        `${name.slice(0, -'.jar'.length)}-eclipse-plugin`,
      )
      let repackagedMatch = false
      if (name.startsWith('org.eclipse.uml2.') && await exists(repackagedRoot)) {
        const extractedRoot = resolve(
          extractionRoot,
          name.replaceAll(/[^A-Za-z0-9._-]/g, '_'),
        )
        await mkdir(extractedRoot, { recursive: true })
        await execFileAsync('jar', ['xf', path], {
          cwd: extractedRoot,
          maxBuffer: 16 * 1024 * 1024,
        })
        repackagedMatch =
          await treeSha256(extractedRoot) === await treeSha256(repackagedRoot)
        if (repackagedMatch) {
          selected = repackagedRoot
          selectedSha256 = await treeSha256(repackagedRoot)
        }
      }
      return {
        name,
        sha256,
        bytes: (await stat(path)).size,
        upstreamPath: selected ? relative(upstreamRoot, selected) : null,
        upstreamSha256: selectedSha256,
        classification:
          repackagedMatch
            ? 'pilot-repackaged-content-match'
            : selected === null
            ? 'upstream-name-not-found'
            : selectedSha256 === sha256
              ? 'pilot-derived-exact-match'
              : 'same-name-byte-mismatch',
      }
    }),
  )
}

async function treeSha256(root: string): Promise<string> {
  const paths = (await walkFiles(root, () => true))
    .map((path) => relative(root, path))
    .filter((path) => path !== 'META-INF/MANIFEST.MF')
    .sort()
  const records = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: await fileSha256(resolve(root, path)),
    })),
  )
  return sha256(JSON.stringify(records))
}

async function readComponents(root: string): Promise<Component[]> {
  const paths = await walkFiles(root, (path) => path.endsWith('pom.properties'))
  const components = await Promise.all(
    paths.map(async (path) => {
      const properties = new Map<string, string>()
      for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
        const separator = line.indexOf('=')
        if (separator > 0) {
          properties.set(line.slice(0, separator), line.slice(separator + 1))
        }
      }
      return {
        groupId: properties.get('groupId') ?? 'unknown',
        artifactId: properties.get('artifactId') ?? 'unknown',
        version: properties.get('version') ?? 'unknown',
        sourcePath: relative(root, path),
      }
    }),
  )
  return components.sort((left, right) =>
    `${left.groupId}:${left.artifactId}:${left.version}`.localeCompare(
      `${right.groupId}:${right.artifactId}:${right.version}`,
    ),
  )
}

function classNamespaces(
  entries: string[],
): Array<{ namespace: string; classes: number }> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.endsWith('.class') || !entry.includes('/')) continue
    const namespace = entry.split('/').slice(0, 3).join('/')
    counts.set(namespace, (counts.get(namespace) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([namespace, classes]) => ({ namespace, classes }))
    .sort((left, right) => right.classes - left.classes)
    .slice(0, 20)
}

async function extractJarMetadata(jarPath: string, outputRoot: string): Promise<void> {
  await execFileAsync(
    'jar',
    ['xf', jarPath, 'META-INF/maven', 'META-INF/LICENSE', 'META-INF/NOTICE'],
    { cwd: outputRoot, maxBuffer: 64 * 1024 * 1024 },
  )
}

async function jarTable(path: string): Promise<string[]> {
  const { stdout } = await execFileAsync('jar', ['tf', path], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout.split(/\r?\n/).filter(Boolean)
}

async function gitEvidence(
  root: string,
): Promise<{ commit: string; dirty: boolean; remote: string | null }> {
  const [commit, status, remote] = await Promise.all([
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['status', '--porcelain']),
    git(root, ['remote', 'get-url', 'origin']).catch(() => ''),
  ])
  return {
    commit,
    dirty: status.length > 0,
    remote: remote || null,
  }
}

async function gitCommit(root: string): Promise<string> {
  return git(root, ['rev-parse', 'HEAD'])
}

async function git(root: string, argumentsList: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', argumentsList, {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout.trim()
}

async function licenseRecord(
  id: string,
  path: string,
  source: string,
): Promise<{ id: string; source: string; sha256: string; firstLine: string }> {
  const text = await readFile(path, 'utf8')
  return {
    id,
    source,
    sha256: sha256(text),
    firstLine: text.split(/\r?\n/).find((line) => line.trim()) ?? '',
  }
}

async function walkFiles(
  root: string,
  select: (path: string) => boolean,
): Promise<string[]> {
  const result: string[] = []
  await walk(root)
  return result

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && select(path)) result.push(path)
    }
  }
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} is not a safe regular file: ${path}`)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

async function fileSha256(path: string): Promise<string> {
  return sha256(await readFile(path))
}

function sha256(value: string | Buffer): string {
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
  const value = valueAfter(flag)
  if (!value) throw new Error(`${flag} is required`)
  return value
}
