import { execFile } from 'node:child_process'
import {
  chmod,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { create as createTar } from 'tar'
import {
  canonicalJson,
  inventoryFiles,
  normalizePath,
  sha256File,
} from './workbench-release-support.js'

interface RuntimeRole {
  candidateId: string
  commit: string
  artifactSha256: string
}

interface RuntimeLock {
  schemaVersion: number
  referenceRelease: { name: string; commit: string }
  semantic: RuntimeRole
  authoring: RuntimeRole
  officialLibraryIndexSha256: string
}

interface PackageJson {
  name: string
  version: string
  dependencies: Record<string, string>
}

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as PackageJson
const runtimeLockPath = resolve(
  valueAfter('--runtime-lock') ??
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
)
const candidateManifestPath = resolve(
  valueAfter('--candidate-manifest') ??
    resolve(repositoryRoot, 'config/language-engine-candidates.json'),
)
const semanticArtifact = resolve(
  requiredValue(
    '--semantic-artifact',
    process.env.SYSML_WORKBENCH_SEMANTIC_ARTIFACT,
  ),
)
const authoringArtifact = resolve(
  requiredValue(
    '--authoring-artifact',
    process.env.SYSML_WORKBENCH_AUTHORING_ARTIFACT,
  ),
)
const libraryRoot = resolve(
  requiredValue('--library-root', process.env.SYSML_WORKBENCH_LIBRARY_ROOT),
)
const semanticLicenseRoot = resolve(
  requiredValue(
    '--semantic-license-root',
    process.env.SYSML_WORKBENCH_SEMANTIC_LICENSE_ROOT,
  ),
)
const pilotLicense = resolve(
  requiredValue(
    '--pilot-license',
    process.env.SYSML_WORKBENCH_PILOT_LICENSE,
  ),
)
const authoringLicense = resolve(
  valueAfter('--authoring-license') ??
    resolve(repositoryRoot, 'docs/licenses/spec42-MIT.txt'),
)
const officialLibraryLicense = resolve(libraryRoot, '../LICENSE')
const platform = valueAfter('--platform') ?? `${process.platform}-${process.arch}`
const outputRoot = resolve(
  valueAfter('--output') ?? resolve(repositoryRoot, 'release'),
)
const allowDirty = process.argv.includes('--allow-dirty')
const bundleName = `sysml-engineering-workbench-${packageJson.version}-${platform}`
const bundleRoot = resolve(outputRoot, bundleName)
const archivePath = resolve(outputRoot, `${bundleName}.tar.gz`)

if (outputRoot === repositoryRoot || bundleRoot === repositoryRoot) {
  throw new Error('Release output must not be the repository root')
}

const runtimeLock = JSON.parse(
  await readFile(runtimeLockPath, 'utf8'),
) as RuntimeLock
if (runtimeLock.schemaVersion !== 1) {
  throw new Error('Unsupported runtime lock schema')
}

const [semanticSha256, authoringSha256] = await Promise.all([
  sha256File(semanticArtifact),
  sha256File(authoringArtifact),
])
if (semanticSha256 !== runtimeLock.semantic.artifactSha256) {
  throw new Error(`Semantic artifact does not match the runtime lock: ${semanticSha256}`)
}
if (authoringSha256 !== runtimeLock.authoring.artifactSha256) {
  throw new Error(`Authoring artifact does not match the runtime lock: ${authoringSha256}`)
}

const [
  { stdout: headOutput },
  { stdout: sourceTimeOutput },
  { stdout: dirtyOutput },
  { stdout: libraryCommitOutput },
] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
    execFileAsync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: repositoryRoot,
    }),
    execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: repositoryRoot,
      maxBuffer: 16 * 1024 * 1024,
    }),
    execFileAsync('git', ['-C', libraryRoot, 'rev-parse', 'HEAD']),
  ])
const sourceCommit = headOutput.trim()
const sourceTime = sourceTimeOutput.trim()
const dirty = dirtyOutput.trim().length > 0
if (dirty && !allowDirty) {
  throw new Error('Release assembly requires a clean Git worktree')
}
const libraryCommit = libraryCommitOutput.trim()
if (libraryCommit !== runtimeLock.referenceRelease.commit) {
  throw new Error(
    `Official library checkout is ${libraryCommit}; expected ${runtimeLock.referenceRelease.commit}`,
  )
}

await Promise.all([
  rm(bundleRoot, { recursive: true, force: true }),
  rm(archivePath, { force: true }),
])
await Promise.all([
  mkdir(resolve(bundleRoot, 'config'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'runtime/semantic'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'runtime/authoring'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'runtime/libraries'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'service'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'node_modules/@pdf-lib'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'bin'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'licenses/runtime'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'licenses/product'), { recursive: true }),
  mkdir(resolve(bundleRoot, 'licenses/npm'), { recursive: true }),
])

await Promise.all([
  cp(resolve(repositoryRoot, 'dist'), resolve(bundleRoot, 'app'), {
    recursive: true,
  }),
  cp(
    resolve(repositoryRoot, 'dist-workbench/apps'),
    resolve(bundleRoot, 'service/apps'),
    { recursive: true },
  ),
  cp(
    resolve(repositoryRoot, 'dist-workbench/packages'),
    resolve(bundleRoot, 'service/packages'),
    { recursive: true },
  ),
  cp(candidateManifestPath, resolve(bundleRoot, 'config/language-engine-candidates.json')),
  cp(runtimeLockPath, resolve(bundleRoot, 'config/language-engine-runtime-lock.json')),
  cp(
    semanticArtifact,
    resolve(bundleRoot, 'runtime/semantic/sysmlv2-lsp-server.jar'),
  ),
  cp(authoringArtifact, resolve(bundleRoot, `runtime/authoring/${basename(authoringArtifact)}`)),
  cp(libraryRoot, resolve(bundleRoot, 'runtime/libraries/sysml.library'), {
    recursive: true,
  }),
  cp(
    resolve(semanticLicenseRoot, 'LICENSE'),
    resolve(bundleRoot, 'licenses/runtime/vinqut-MIT.txt'),
  ),
  cp(
    resolve(semanticLicenseRoot, 'NOTICE'),
    resolve(bundleRoot, 'licenses/runtime/vinqut-NOTICE.txt'),
  ),
  cp(pilotLicense, resolve(bundleRoot, 'licenses/runtime/pilot-upstream-license.txt')),
  cp(
    authoringLicense,
    resolve(bundleRoot, 'licenses/runtime/spec42-MIT.txt'),
  ),
  cp(
    officialLibraryLicense,
    resolve(bundleRoot, 'licenses/runtime/official-library-EPL-2.0.txt'),
  ),
  cp(resolve(repositoryRoot, 'LICENSE'), resolve(bundleRoot, 'LICENSE')),
  cp(resolve(repositoryRoot, 'NOTICE'), resolve(bundleRoot, 'NOTICE')),
  cp(
    resolve(repositoryRoot, 'LICENSE'),
    resolve(bundleRoot, 'licenses/product/Apache-2.0.txt'),
  ),
  cp(
    resolve(repositoryRoot, 'docs/licenses/vinqut-runtime-disposition.md'),
    resolve(bundleRoot, 'licenses/runtime/vinqut-runtime-disposition.md'),
  ),
])

const runtimeDependencies = [
  '@pdf-lib/standard-fonts',
  '@pdf-lib/upng',
  'pako',
  'pdf-lib',
  'tslib',
  'ws',
  'yaml',
] as const
for (const dependency of runtimeDependencies) {
  await cp(
    resolve(repositoryRoot, 'node_modules', dependency),
    resolve(bundleRoot, 'node_modules', dependency),
    { recursive: true },
  )
  const license = await findLicense(
    resolve(repositoryRoot, 'node_modules', dependency),
  )
  await cp(
    license,
    resolve(
      bundleRoot,
      'licenses/npm',
      `${dependency.replace('/', '__')}-${basename(license)}`,
    ),
  )
}

const bundledPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  private: true,
  type: 'module',
  dependencies: Object.fromEntries(
    ['pdf-lib', 'ws', 'yaml'].map((name) => [
      name,
      packageJson.dependencies[name],
    ]),
  ),
}
await Promise.all([
  writeFile(
    resolve(bundleRoot, 'package.json'),
    `${JSON.stringify(bundledPackageJson, null, 2)}\n`,
    'utf8',
  ),
  writeFile(
    resolve(bundleRoot, 'README.md'),
    releaseReadme(bundleName, platform, packageJson.version),
    'utf8',
  ),
  writeFile(
    resolve(bundleRoot, 'bin/start-workbench.sh'),
    unixLauncher(basename(authoringArtifact)),
    'utf8',
  ),
  writeFile(
    resolve(bundleRoot, 'bin/start-workbench.cmd'),
    windowsLauncher(basename(authoringArtifact)),
    'utf8',
  ),
  writeFile(
    resolve(bundleRoot, 'bin/verify-bundle.mjs'),
    embeddedVerifier(),
    'utf8',
  ),
])
await Promise.all([
  chmod(resolve(bundleRoot, 'bin/start-workbench.sh'), 0o755),
  chmod(resolve(bundleRoot, `runtime/authoring/${basename(authoringArtifact)}`), 0o755),
])

const libraryFiles = await inventoryFiles(
  resolve(bundleRoot, 'runtime/libraries/sysml.library'),
)
const libraryTreeSha256 = sha256Text(canonicalJson(libraryFiles))
const files = await inventoryFiles(
  bundleRoot,
  new Set(['manifests/release-manifest.json']),
)
const manifest = {
  schemaVersion: 1,
  product: {
    name: 'SysML Engineering Workbench',
    version: packageJson.version,
  },
  release: {
    classification: 'internal-unsigned-release-candidate',
    platform,
    sourceCommit,
    sourceDirty: dirty,
    createdAt: sourceTime,
    reproducibility: 'file inventory and archive metadata normalized',
  },
  runtime: {
    node: { minimumMajor: 22 },
    java: { minimumMajor: 21 },
    referenceRelease: runtimeLock.referenceRelease,
    semantic: {
      candidateId: runtimeLock.semantic.candidateId,
      commit: runtimeLock.semantic.commit,
      artifactPath: 'runtime/semantic/sysmlv2-lsp-server.jar',
      sha256: semanticSha256,
    },
    authoring: {
      candidateId: runtimeLock.authoring.candidateId,
      commit: runtimeLock.authoring.commit,
      artifactPath: `runtime/authoring/${basename(authoringArtifact)}`,
      sha256: authoringSha256,
    },
    officialLibrary: {
      path: 'runtime/libraries/sysml.library',
      commit: libraryCommit,
      fileCount: libraryFiles.length,
      treeSha256: libraryTreeSha256,
      compiledIndexSha256: runtimeLock.officialLibraryIndexSha256,
    },
  },
  distribution: {
    signed: false,
    notarized: false,
    productLicenseDeclared: true,
    productLicenseSpdx: 'Apache-2.0',
    runtimeLicenseReconciliation: 'exact-pin-owner-disposition-recorded',
    networkRequiredAfterInstall: false,
    launcher: platform.startsWith('win32')
      ? 'bin/start-workbench.cmd'
      : 'bin/start-workbench.sh',
  },
  files,
}
await mkdir(resolve(bundleRoot, 'manifests'), { recursive: true })
await writeFile(
  resolve(bundleRoot, 'manifests/release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)

await createTar(
  {
    cwd: outputRoot,
    file: archivePath,
    gzip: true,
    portable: true,
    noMtime: true,
    sync: false,
  },
  [bundleName],
)

const result = {
  schemaVersion: 1,
  outcome: dirty ? 'assembled-dirty-nonqualifying' : 'assembled',
  bundle: normalizePath(relative(repositoryRoot, bundleRoot)),
  archive: normalizePath(relative(repositoryRoot, archivePath)),
  archiveSha256: await sha256File(archivePath),
  sourceCommit,
  platform,
  fileCount: files.length,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

function requiredValue(flag: string, fallback: string | undefined): string {
  return valueAfter(flag) ?? fallback ?? (() => {
    throw new Error(`${flag} or its corresponding environment variable is required`)
  })()
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

async function findLicense(packageRoot: string): Promise<string> {
  const { readdir } = await import('node:fs/promises')
  const names = await readdir(packageRoot)
  const name = names
    .filter((item) => /^licen[cs]e(?:\.|$)/i.test(item))
    .sort()[0]
  if (!name) throw new Error(`Dependency has no packaged license: ${packageRoot}`)
  return resolve(packageRoot, name)
}

function sha256Text(value: string): string {
  const { createHash } = requireCrypto()
  return createHash('sha256').update(value).digest('hex')
}

function requireCrypto(): typeof import('node:crypto') {
  // Keeps the hashing implementation identical in source and bundled verifier.
  return globalCryptoModule
}

import * as globalCryptoModule from 'node:crypto'

function unixLauncher(authoringName: string): string {
  return `#!/bin/sh
set -eu
BUNDLE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORKSPACE_ROOT=\${1:-}
if [ -z "$WORKSPACE_ROOT" ]; then
  echo "Usage: $0 /absolute/path/to/workspace" >&2
  exit 64
fi
node "$BUNDLE_ROOT/bin/verify-bundle.mjs"
export SYSML_WORKBENCH_SEMANTIC_ARTIFACT="$BUNDLE_ROOT/runtime/semantic/sysmlv2-lsp-server.jar"
export SYSML_WORKBENCH_AUTHORING_ARTIFACT="$BUNDLE_ROOT/runtime/authoring/${authoringName}"
export SYSML_WORKBENCH_VINQUT_COMMAND="\${JAVA_COMMAND:-java}"
export SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON=$(node -e 'process.stdout.write(JSON.stringify(["-jar", process.argv[1]]))' "$SYSML_WORKBENCH_SEMANTIC_ARTIFACT")
export SYSML_WORKBENCH_SPEC42_COMMAND="$SYSML_WORKBENCH_AUTHORING_ARTIFACT"
export SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON=$(node -e 'process.stdout.write(JSON.stringify(["lsp", "--stdlib-path", process.argv[1]]))' "$BUNDLE_ROOT/runtime/libraries/sysml.library")
exec node "$BUNDLE_ROOT/service/apps/workbench-service/src/main.js" \\
  --loopback --qualified-runtime \\
  --workspace-root "$WORKSPACE_ROOT" \\
  --address 127.0.0.1 --port 4317 \\
  --origin http://127.0.0.1:4317 \\
  --static-root "$BUNDLE_ROOT/app" \\
  --candidate-manifest "$BUNDLE_ROOT/config/language-engine-candidates.json" \\
  --runtime-lock "$BUNDLE_ROOT/config/language-engine-runtime-lock.json"
`
}

function windowsLauncher(authoringName: string): string {
  return `@echo off
setlocal
set "BUNDLE_ROOT=%~dp0.."
if "%~1"=="" (
  echo Usage: %~nx0 C:\\absolute\\path\\to\\workspace 1>&2
  exit /b 64
)
node "%BUNDLE_ROOT%\\bin\\verify-bundle.mjs" || exit /b 1
set "BUNDLE_JSON_ROOT=%BUNDLE_ROOT:\\=/%"
set "SYSML_WORKBENCH_SEMANTIC_ARTIFACT=%BUNDLE_ROOT%\\runtime\\semantic\\sysmlv2-lsp-server.jar"
set "SYSML_WORKBENCH_AUTHORING_ARTIFACT=%BUNDLE_ROOT%\\runtime\\authoring\\${authoringName}"
if "%JAVA_COMMAND%"=="" set "JAVA_COMMAND=java"
set "SYSML_WORKBENCH_VINQUT_COMMAND=%JAVA_COMMAND%"
set "SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON=["-jar","%BUNDLE_JSON_ROOT%/runtime/semantic/sysmlv2-lsp-server.jar"]"
set "SYSML_WORKBENCH_SPEC42_COMMAND=%SYSML_WORKBENCH_AUTHORING_ARTIFACT%"
set "SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON=["lsp","--stdlib-path","%BUNDLE_JSON_ROOT%/runtime/libraries/sysml.library"]"
node "%BUNDLE_ROOT%\\service\\apps\\workbench-service\\src\\main.js" --loopback --qualified-runtime --workspace-root "%~1" --address 127.0.0.1 --port 4317 --origin http://127.0.0.1:4317 --static-root "%BUNDLE_ROOT%\\app" --candidate-manifest "%BUNDLE_ROOT%\\config\\language-engine-candidates.json" --runtime-lock "%BUNDLE_ROOT%\\config\\language-engine-runtime-lock.json"
`
}

function embeddedVerifier(): string {
  return `import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'manifests/release-manifest.json'), 'utf8'))
for (const file of manifest.files) {
  const path = resolve(root, file.path)
  const details = await stat(path)
  const hash = createHash('sha256').update(await readFile(path)).digest('hex')
  if (details.size !== file.bytes || hash !== file.sha256) {
    throw new Error(\`Bundle integrity check failed: \${file.path}\`)
  }
}
if (Number.parseInt(process.versions.node.split('.')[0], 10) < manifest.runtime.node.minimumMajor) {
  throw new Error(\`Node \${manifest.runtime.node.minimumMajor}+ is required\`)
}
process.stdout.write(\`Verified \${manifest.files.length} release files for \${manifest.product.name} \${manifest.product.version}.\\n\`)
`
}

function releaseReadme(
  name: string,
  platformName: string,
  version: string,
): string {
  return `# SysML Engineering Workbench ${version}

Artifact: \`${name}\`
Qualified target: \`${platformName}\`
Distribution class: internal unsigned release candidate.

Requirements: Node.js 22+, Java 21+, and a workspace directory containing a
\`sysml-workspace.yaml\` file. No network connection is required after this
bundle is installed.

Run:

\`\`\`sh
./bin/start-workbench.sh /absolute/path/to/workspace
\`\`\`

Open <http://127.0.0.1:4317>, enter the one-time pairing code printed by the
service, then select the workspace file. The launcher verifies every bundled
file before startup. Do not edit files inside this bundle; model source and
review/evidence state belong in the selected workspace.

This artifact is not signed or notarized. It is not approved for public
production distribution.
`
}
