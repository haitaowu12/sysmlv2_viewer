import { execFile } from 'node:child_process'
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  canonicalJson,
  inventoryFiles,
  normalizePath,
} from './workbench-release-support.js'
import { stageSelfContainedRuntimes } from './workbench-stage-runtimes.js'

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

await execFileAsync(nodeExecutable, [
  resolve(portableBundle, 'bin/verify-bundle.mjs'),
])
const semanticArtifact = resolve(
  portableBundle,
  'runtime/semantic/sysmlv2-lsp-server.jar',
)

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
])
const runtimes = await stageSelfContainedRuntimes({
  stagingRoot: desktopRoot,
  nodeExecutable,
  javaHome,
  semanticArtifact,
  stagedNodeExecutable: sidecarPath,
  stagedJavaRoot: stagedJava,
  stagedNodeLicense: resolve(
    stagedLicenses,
    'node-MIT-and-third-party.txt',
  ),
  expectedNodeArchitecture: 'arm64',
})

const [portableFiles, javaFiles, licenseFiles] =
  await Promise.all([
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
    version: runtimes.node.version,
    source: 'explicit build input',
    executable: `binaries/${basename(sidecarPath)}`,
    sha256: runtimes.node.executableSha256,
  },
  java: {
    version: runtimes.java.version,
    modules: runtimes.java.modules,
    sourceReleaseSha256: runtimes.java.sourceReleaseSha256,
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
