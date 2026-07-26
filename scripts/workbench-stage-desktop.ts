import { execFile } from 'node:child_process'
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  canonicalJson,
  inventoryFiles,
  normalizePath,
  sha256File,
} from './workbench-release-support.js'

interface PortableManifest {
  product: { name: string; version: string }
  release: {
    platform: string
    sourceCommit: string
    sourceDirty: boolean
  }
}

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const desktopRoot = resolve(
  repositoryRoot,
  'apps/workbench-desktop/src-tauri',
)
const portableBundle = resolve(requiredValue('--portable-bundle'))
const nodeExecutable = resolve(requiredValue('--node-executable'))
const javaHome = resolve(requiredValue('--java-home'))
const targetTriple = valueAfter('--target-triple') ?? 'aarch64-apple-darwin'
if (targetTriple !== 'aarch64-apple-darwin') {
  throw new Error('The initial desktop release is limited to aarch64-apple-darwin')
}

const generatedRoot = resolve(desktopRoot, 'generated')
const stagedBundle = resolve(generatedRoot, 'workbench')
const stagedJava = resolve(generatedRoot, 'java')
const stagedLicenses = resolve(generatedRoot, 'licenses')
const sidecarDirectory = resolve(desktopRoot, 'binaries')
const sidecarPath = resolve(
  sidecarDirectory,
  `workbench-node-${targetTriple}`,
)
assertWithin(desktopRoot, generatedRoot)
assertWithin(desktopRoot, sidecarDirectory)

const [manifestText, { stdout: headOutput }] = await Promise.all([
  readFile(
    resolve(portableBundle, 'manifests/release-manifest.json'),
    'utf8',
  ),
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
])
const manifest = JSON.parse(manifestText) as PortableManifest
const sourceCommit = headOutput.trim()
if (
  manifest.release.platform !== 'darwin-arm64' ||
  manifest.release.sourceDirty ||
  manifest.release.sourceCommit !== sourceCommit
) {
  throw new Error(
    'Portable bundle must be a clean darwin-arm64 artifact from the exact current source commit',
  )
}

await Promise.all([
  assertRegularFile(nodeExecutable, 'Node executable'),
  assertRegularFile(resolve(javaHome, 'bin/java'), 'Java executable'),
  assertRegularFile(resolve(javaHome, 'bin/jdeps'), 'jdeps executable'),
  assertRegularFile(resolve(javaHome, 'bin/jlink'), 'jlink executable'),
  assertRegularFile(resolve(javaHome, 'release'), 'Java release metadata'),
  assertRegularFile(resolve(dirname(nodeExecutable), '../LICENSE'), 'Node license'),
])

const [{ stdout: nodeVersionOutput }, { stdout: nodeFileOutput }] =
  await Promise.all([
    execFileAsync(nodeExecutable, ['--version']),
    execFileAsync('file', [nodeExecutable]),
  ])
const nodeVersion = nodeVersionOutput.trim()
if (!/^v22\./.test(nodeVersion)) {
  throw new Error(`Desktop runtime requires exact Node 22 input; received ${nodeVersion}`)
}
if (!/\barm64\b/.test(nodeFileOutput)) {
  throw new Error('Desktop Node runtime is not an Apple Silicon executable')
}

await execFileAsync(nodeExecutable, [
  resolve(portableBundle, 'bin/verify-bundle.mjs'),
])
const semanticArtifact = resolve(
  portableBundle,
  'runtime/semantic/sysmlv2-lsp-server.jar',
)
const { stdout: modulesOutput } = await execFileAsync(
  resolve(javaHome, 'bin/jdeps'),
  [
    '--multi-release',
    '21',
    '--ignore-missing-deps',
    '--print-module-deps',
    semanticArtifact,
  ],
  { maxBuffer: 16 * 1024 * 1024 },
)
const staticallyDetectedModules = modulesOutput.trim()
if (!staticallyDetectedModules.includes('java.base')) {
  throw new Error('jdeps did not return a valid Java module set')
}
// The Pilot/Xtext runtime loads XML, locale, HTTP, charset, and crypto
// providers reflectively. jdeps cannot see those edges in the fat JAR.
const javaModules = [
  ...new Set([
    ...staticallyDetectedModules.split(','),
    'java.net.http',
    'java.prefs',
    'java.xml',
    'jdk.charsets',
    'jdk.crypto.ec',
    'jdk.localedata',
    'jdk.zipfs',
  ]),
].sort()

await Promise.all([
  rm(generatedRoot, { recursive: true, force: true }),
  rm(sidecarDirectory, { recursive: true, force: true }),
])
await Promise.all([
  mkdir(generatedRoot, { recursive: true }),
  mkdir(stagedLicenses, { recursive: true }),
  mkdir(sidecarDirectory, { recursive: true }),
])
await Promise.all([
  cp(portableBundle, stagedBundle, { recursive: true }),
  copyFile(nodeExecutable, sidecarPath),
  copyFile(
    resolve(dirname(nodeExecutable), '../LICENSE'),
    resolve(stagedLicenses, 'node-MIT-and-third-party.txt'),
  ),
])
await chmod(sidecarPath, 0o755)

await execFileAsync(
  resolve(javaHome, 'bin/jlink'),
  [
    '--module-path',
    resolve(javaHome, 'jmods'),
    '--add-modules',
    javaModules.join(','),
    '--output',
    stagedJava,
    '--strip-debug',
    '--no-header-files',
    '--no-man-pages',
    '--compress=2',
  ],
  { maxBuffer: 16 * 1024 * 1024 },
)
await materializeInternalLinks(stagedJava, stagedJava)
await makeTreeOwnerWritable(stagedJava)
const { stderr: stagedJavaVersionOutput } = await execFileAsync(
  resolve(stagedJava, 'bin/java'),
  ['-version'],
)
if (!/\b21(?:\.|\b)/.test(stagedJavaVersionOutput)) {
  throw new Error('Generated desktop Java runtime is not Java 21')
}

const [nodeSha256, portableFiles, javaFiles, licenseFiles] =
  await Promise.all([
    sha256File(sidecarPath),
    inventoryFiles(stagedBundle),
    inventoryFiles(stagedJava),
    inventoryFiles(stagedLicenses),
  ])
const runtimeManifest = {
  schemaVersion: 1,
  product: manifest.product,
  sourceCommit,
  platform: 'darwin-arm64',
  minimumMacOS: '13.0',
  networkRequiredAfterInstall: false,
  node: {
    version: nodeVersion,
    source: 'explicit build input',
    executable: `binaries/${basename(sidecarPath)}`,
    sha256: nodeSha256,
  },
  java: {
    version: stagedJavaVersionOutput.trim().split('\n')[0],
    modules: javaModules,
    sourceReleaseSha256: await sha256File(resolve(javaHome, 'release')),
  },
  portableBundle: {
    path: normalizePath(relative(repositoryRoot, portableBundle)),
    fileCount: portableFiles.length,
    inventorySha256: sha256Text(canonicalJson(portableFiles)),
  },
  stagedJava: {
    fileCount: javaFiles.length,
    inventorySha256: sha256Text(canonicalJson(javaFiles)),
  },
  licenses: {
    fileCount: licenseFiles.length,
    inventorySha256: sha256Text(canonicalJson(licenseFiles)),
  },
}
await writeFile(
  resolve(generatedRoot, 'desktop-runtime-manifest.json'),
  `${JSON.stringify(runtimeManifest, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`${JSON.stringify(runtimeManifest, null, 2)}\n`)

async function assertRegularFile(path: string, label: string): Promise<void> {
  const details = await lstat(path)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${path}`)
  }
}

async function materializeInternalLinks(
  root: string,
  directory: string,
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await materializeInternalLinks(root, path)
      continue
    }
    if (!entry.isSymbolicLink()) continue
    const target = await realpath(path)
    assertWithin(root, target)
    const targetDetails = await lstat(target)
    if (!targetDetails.isFile()) {
      throw new Error(`Java runtime link does not target a file: ${path}`)
    }
    await unlink(path)
    await copyFile(target, path)
  }
}

async function makeTreeOwnerWritable(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await makeTreeOwnerWritable(path)
      continue
    }
    const details = await lstat(path)
    if (!details.isFile()) {
      throw new Error(`Generated Java runtime contains a special file: ${path}`)
    }
    await chmod(path, details.mode | 0o200)
  }
}

function assertWithin(root: string, path: string): void {
  const relation = relative(root, path)
  if (!relation || relation.startsWith('..') || resolve(root, relation) !== path) {
    throw new Error(`Generated path escapes the desktop root: ${path}`)
  }
}

function requiredValue(flag: string): string {
  return valueAfter(flag) ?? (() => {
    throw new Error(`${flag} is required`)
  })()
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function sha256Text(value: string): string {
  const { createHash } = requireCrypto()
  return createHash('sha256').update(value).digest('hex')
}

function requireCrypto(): typeof import('node:crypto') {
  return globalCryptoModule
}

import * as globalCryptoModule from 'node:crypto'
