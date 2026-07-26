import { execFile } from 'node:child_process'
import {
  chmod,
  cp,
  mkdir,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { create as createTar } from 'tar'
import {
  inventoryFiles,
  normalizePath,
  sha256File,
} from './workbench-release-support.js'
import { stageSelfContainedRuntimes } from './workbench-stage-runtimes.js'
import {
  embeddedCompanionVerifier,
  validateCompanionPackageIdentity,
} from './workbench-companion-support.js'

interface PortableManifest {
  product: { name: string; version: string }
  release: {
    classification: string
    platform: string
    sourceCommit: string
    sourceDirty: boolean
  }
  runtime: {
    semantic: { artifactPath: string; sha256: string }
    authoring: { artifactPath: string; sha256: string }
    officialLibrary: {
      path: string
      commit: string
      treeSha256: string
      fileCount: number
    }
  }
  files: Array<{ path: string; bytes: number; mode: string; sha256: string }>
}

interface PackageJson {
  name: string
  version: string
}

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const portableBundle = await realpath(
  resolve(requiredValue('--portable-bundle')),
)
const nodeExecutable = resolve(requiredValue('--node-executable'))
const javaHome = resolve(requiredValue('--java-home'))
const outputRoot = await canonicalizeOutputRoot(
  resolve(valueAfter('--output') ?? resolve(repositoryRoot, 'release')),
)
const platform = valueAfter('--platform') ?? 'darwin-arm64'
const allowDirty = process.argv.includes('--allow-dirty')
if (platform !== 'darwin-arm64') {
  throw new Error(
    'The self-contained companion is currently qualified only for darwin-arm64',
  )
}

const portableManifestPath = resolve(
  portableBundle,
  'manifests/release-manifest.json',
)
const portableManifest = JSON.parse(
  await readFile(portableManifestPath, 'utf8'),
) as PortableManifest
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as PackageJson
const packageIdentity = validateCompanionPackageIdentity({
  productName: portableManifest.product.name,
  portableVersion: portableManifest.product.version,
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  authoringArtifactPath: portableManifest.runtime.authoring.artifactPath,
})
const authoringArtifactPath = packageIdentity.authoringArtifactPath
const [
  { stdout: headOutput },
  { stdout: sourceTimeOutput },
  { stdout: dirtyOutput },
] = await Promise.all([
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
  execFileAsync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
    cwd: repositoryRoot,
  }),
  execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot,
    maxBuffer: 16 * 1024 * 1024,
  }),
])
const sourceCommit = headOutput.trim()
const sourceDirty = dirtyOutput.trim().length > 0
if (sourceDirty && !allowDirty) {
  throw new Error('Companion assembly requires a clean Git worktree')
}
if (
  portableManifest.release.platform !== platform ||
  portableManifest.release.sourceCommit !== sourceCommit
) {
  throw new Error(
    'Portable bundle must target darwin-arm64 and match the exact current source commit',
  )
}
if (portableManifest.release.sourceDirty && !allowDirty) {
  throw new Error('A dirty-source portable bundle cannot qualify')
}
await verifyPortableBundle(portableBundle, portableManifest)

const bundleName =
  `sysml-engineering-workbench-${packageIdentity.version}` +
  `-pages-companion-${platform}`
const bundleRoot = resolve(outputRoot, bundleName)
const archivePath = resolve(outputRoot, `${bundleName}.tar.gz`)
if (
  outputRoot === repositoryRoot ||
  dirname(outputRoot) === outputRoot ||
  bundleRoot === repositoryRoot
) {
  throw new Error('Companion output must not be the repository root')
}
assertWithin(outputRoot, bundleRoot)
assertWithin(outputRoot, archivePath)
if (pathsOverlap(portableBundle, bundleRoot)) {
  throw new Error('Portable input and companion output must not overlap')
}

await Promise.all([
  rm(bundleRoot, { recursive: true, force: true }),
  rm(archivePath, { force: true }),
])
await mkdir(outputRoot, { recursive: true })
await cp(portableBundle, bundleRoot, { recursive: true })

// This distribution has one supported launcher. Remove platform-generic
// launchers that could imply an unqualified desktop or Windows distribution.
await Promise.all([
  unlink(resolve(bundleRoot, 'bin/start-workbench.sh')).catch(ignoreMissing),
  unlink(resolve(bundleRoot, 'bin/start-workbench.cmd')).catch(ignoreMissing),
  unlink(resolve(bundleRoot, 'bin/start-pages-companion.cmd')).catch(
    ignoreMissing,
  ),
])

const stagedNode = resolve(bundleRoot, 'runtime/node/bin/node')
const stagedJava = resolve(bundleRoot, 'runtime/java')
const nodeLicense = resolve(
  bundleRoot,
  'licenses/runtime/node-MIT-and-third-party.txt',
)
const semanticArtifact = resolve(
  bundleRoot,
  'runtime/semantic/sysmlv2-lsp-server.jar',
)
const authoringArtifact = resolve(bundleRoot, authoringArtifactPath)
const { stdout: authoringFileOutput } = await execFileAsync(
  'file',
  [authoringArtifact],
)
if (!/\barm64\b/.test(authoringFileOutput)) {
  throw new Error('Companion authoring runtime is not Apple Silicon arm64')
}
const runtimes = await stageSelfContainedRuntimes({
  stagingRoot: bundleRoot,
  nodeExecutable,
  javaHome,
  semanticArtifact,
  stagedNodeExecutable: stagedNode,
  stagedJavaRoot: stagedJava,
  stagedNodeLicense: nodeLicense,
  expectedNodeArchitecture: 'arm64',
})

await Promise.all([
  writeFile(
    resolve(bundleRoot, 'bin/start-pages-companion.sh'),
    companionLauncher(basename(authoringArtifactPath)),
    'utf8',
  ),
  writeFile(
    resolve(bundleRoot, 'bin/verify-companion.mjs'),
    embeddedCompanionVerifier(),
    'utf8',
  ),
  writeFile(
    resolve(bundleRoot, 'README.md'),
    companionReadme(packageIdentity.version),
    'utf8',
  ),
])
await chmod(resolve(bundleRoot, 'bin/start-pages-companion.sh'), 0o755)

const manifestRelativePath = 'manifests/companion-manifest.json'
const files = await inventoryFiles(
  bundleRoot,
  new Set([manifestRelativePath]),
)
const companionManifest = {
  schemaVersion: 1,
  product: portableManifest.product,
  release: {
    classification: 'internal-unsigned-technical-candidate',
    platform,
    sourceCommit,
    sourceDirty,
    createdAt: sourceTimeOutput.trim(),
  },
  payload: {
    portableManifestSha256: await sha256File(portableManifestPath),
    semanticArtifactSha256: portableManifest.runtime.semantic.sha256,
    authoringArtifactSha256: portableManifest.runtime.authoring.sha256,
    authoringArchitecture: 'arm64',
    officialLibraryCommit:
      portableManifest.runtime.officialLibrary.commit,
    officialLibraryTreeSha256:
      portableManifest.runtime.officialLibrary.treeSha256,
  },
  runtimes: {
    node: {
      version: runtimes.node.version,
      executable: 'runtime/node/bin/node',
      executableSha256: runtimes.node.executableSha256,
      licenseSha256: runtimes.node.licenseSha256,
    },
    java: {
      version: runtimes.java.version,
      architecture: runtimes.java.architecture,
      executable: 'runtime/java/bin/java',
      modules: runtimes.java.modules,
      sourceReleaseSha256: runtimes.java.sourceReleaseSha256,
      fileCount: runtimes.java.fileCount,
      inventorySha256: runtimes.java.inventorySha256,
    },
  },
  distribution: {
    selfContained: true,
    networkRequiredAfterInstall: true,
    localRuntimeNetworkRequired: false,
    signed: false,
    notarized: false,
    launcher: 'bin/start-pages-companion.sh',
    hostedRunnerEvidenceIsCleanMachineAcceptance: false,
    windowsQualified: false,
  },
  files,
}
await writeFile(
  resolve(bundleRoot, manifestRelativePath),
  `${JSON.stringify(companionManifest, null, 2)}\n`,
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
  outcome: sourceDirty
    ? 'assembled-dirty-nonqualifying'
    : 'assembled-unsigned-technical-candidate',
  platform,
  bundle: normalizePath(relative(repositoryRoot, bundleRoot)),
  archive: normalizePath(relative(repositoryRoot, archivePath)),
  archiveSha256: await sha256File(archivePath),
  companionManifestSha256: await sha256File(
    resolve(bundleRoot, manifestRelativePath),
  ),
  sourceCommit,
  fileCount: files.length,
  selfContained: true,
  signed: false,
  notarized: false,
  humanCleanMachineAccepted: false,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

function companionLauncher(authoringName: string): string {
  return `#!/bin/sh
set -eu
# Do not let inherited runtime injection settings execute code before the
# bundle verifier or alter either qualified language engine.
unset NODE_OPTIONS NODE_PATH JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS _JAVA_OPTIONS
BUNDLE_ROOT=$(CDPATH= cd -- "\${0%/*}/.." && pwd)
WORKSPACE_FILE=\${1:-}
PAGES_URL=\${2:-https://haitaowu12.github.io/sysmlv2_viewer/}
OPEN_MODE=\${3:-}
if [ -z "$WORKSPACE_FILE" ]; then
  echo "Usage: $0 /absolute/path/to/sysml-workspace.yaml [pages-url] [--no-open]" >&2
  exit 64
fi
NODE="$BUNDLE_ROOT/runtime/node/bin/node"
JAVA="$BUNDLE_ROOT/runtime/java/bin/java"
"$NODE" "$BUNDLE_ROOT/bin/verify-companion.mjs"
export SYSML_WORKBENCH_SEMANTIC_ARTIFACT="$BUNDLE_ROOT/runtime/semantic/sysmlv2-lsp-server.jar"
export SYSML_WORKBENCH_AUTHORING_ARTIFACT="$BUNDLE_ROOT/runtime/authoring/${authoringName}"
export SYSML_WORKBENCH_VINQUT_COMMAND="$JAVA"
export SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON=$("$NODE" -e 'process.stdout.write(JSON.stringify(["-jar", process.argv[1]]))' "$SYSML_WORKBENCH_SEMANTIC_ARTIFACT")
export SYSML_WORKBENCH_SPEC42_COMMAND="$SYSML_WORKBENCH_AUTHORING_ARTIFACT"
export SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON=$("$NODE" -e 'process.stdout.write(JSON.stringify(["lsp", "--stdlib-path", process.argv[1]]))' "$BUNDLE_ROOT/runtime/libraries/sysml.library")
if [ "$OPEN_MODE" = "--no-open" ]; then
  exec "$NODE" "$BUNDLE_ROOT/bin/launch-pages-companion.mjs" \\
    --service-entry "$BUNDLE_ROOT/service/apps/workbench-service/src/main.js" \\
    --candidate-manifest "$BUNDLE_ROOT/config/language-engine-candidates.json" \\
    --runtime-lock "$BUNDLE_ROOT/config/language-engine-runtime-lock.json" \\
    --workspace-file "$WORKSPACE_FILE" \\
    --pages-url "$PAGES_URL" \\
    --no-open
fi
exec "$NODE" "$BUNDLE_ROOT/bin/launch-pages-companion.mjs" \\
  --service-entry "$BUNDLE_ROOT/service/apps/workbench-service/src/main.js" \\
  --candidate-manifest "$BUNDLE_ROOT/config/language-engine-candidates.json" \\
  --runtime-lock "$BUNDLE_ROOT/config/language-engine-runtime-lock.json" \\
  --workspace-file "$WORKSPACE_FILE" \\
  --pages-url "$PAGES_URL"
`
}

function companionReadme(version: string): string {
  return `# SysML Engineering Workbench Pages Companion ${version}

Qualified target: \`darwin-arm64\` (Apple Silicon macOS).
Distribution class: internal unsigned technical candidate.

This archive contains its own Node.js 22 and minimized Java 21 runtimes. It
does not use a system Node or Java installation. It also contains the exact
locked language-engine artifacts, standard library, local Workbench Service,
and runtime licenses.

Run:

\`\`\`sh
./bin/start-pages-companion.sh /absolute/path/to/sysml-workspace.yaml
\`\`\`

The launcher verifies the complete file inventory before starting, binds the
service to loopback, and opens the GitHub Pages shell with a short-lived
one-time pairing secret in the URL fragment. It clears inherited Node/Java
runtime-injection settings before starting. Source files remain local.
The local runtime does not make external requests, but the default GitHub Pages
shell requires network access on its initial load.

The archive is unsigned and not notarized. macOS may quarantine downloaded
executables. This artifact is CI-qualified engineering evidence, not an
approved public production installer. A separate human clean-machine
acceptance record is still required. Windows is not qualified by this archive.
`
}

function requiredValue(flag: string): string {
  const value = valueAfter(flag)
  if (!value) throw new Error(`${flag} is required`)
  return value
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function ignoreMissing(error: unknown): void {
  if (
    !(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
  ) {
    throw error
  }
}

function assertWithin(root: string, path: string): void {
  const relation = relative(root, path)
  if (
    !relation ||
    relation.startsWith('..') ||
    resolve(root, relation) !== path
  ) {
    throw new Error(`Companion path escapes its output root: ${path}`)
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || isWithin(left, right) || isWithin(right, left)
}

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path)
  return (
    relation.length > 0 &&
    !relation.startsWith('..') &&
    resolve(root, relation) === path
  )
}

async function canonicalizeOutputRoot(requested: string): Promise<string> {
  try {
    return await realpath(requested)
  } catch (error) {
    if (
      !(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
    ) {
      throw error
    }
    const parent = await realpath(dirname(requested))
    return resolve(parent, basename(requested))
  }
}

async function verifyPortableBundle(
  root: string,
  manifest: PortableManifest,
): Promise<void> {
  if (
    manifest.release.classification !==
      'internal-unsigned-release-candidate' ||
    manifest.runtime.semantic.artifactPath !==
      'runtime/semantic/sysmlv2-lsp-server.jar' ||
    manifest.runtime.officialLibrary.path !==
      'runtime/libraries/sysml.library'
  ) {
    throw new Error('Portable bundle manifest contract is invalid')
  }
  const actualFiles = await inventoryFiles(
    root,
    new Set(['manifests/release-manifest.json']),
  )
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
    throw new Error('Portable bundle file inventory differs from its manifest')
  }
  const [semanticSha256, authoringSha256, libraryFiles] = await Promise.all([
    sha256File(resolve(root, manifest.runtime.semantic.artifactPath)),
    sha256File(resolve(root, manifest.runtime.authoring.artifactPath)),
    inventoryFiles(resolve(root, manifest.runtime.officialLibrary.path)),
  ])
  if (
    semanticSha256 !== manifest.runtime.semantic.sha256 ||
    authoringSha256 !== manifest.runtime.authoring.sha256 ||
    libraryFiles.length !== manifest.runtime.officialLibrary.fileCount
  ) {
    throw new Error('Portable bundle runtime payload differs from its manifest')
  }
}
