import { execFile } from 'node:child_process'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
  unlink,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  canonicalJson,
  inventoryFiles,
  sha256File,
} from './workbench-release-support.js'
import { createHash } from 'node:crypto'

export interface StagedRuntimeResult {
  node: {
    version: string
    executableSha256: string
    licenseSha256: string
  }
  java: {
    version: string
    architecture: 'arm64'
    modules: string[]
    sourceReleaseSha256: string
    fileCount: number
    inventorySha256: string
  }
}

export interface StageRuntimeOptions {
  stagingRoot: string
  nodeExecutable: string
  javaHome: string
  semanticArtifact: string
  stagedNodeExecutable: string
  stagedJavaRoot: string
  stagedNodeLicense: string
  expectedNodeArchitecture: 'arm64'
}

const execFileAsync = promisify(execFile)

/**
 * Materialize the exact Node and minimized Java runtimes used by the native
 * desktop and local Pages companion distributions.
 */
export async function stageSelfContainedRuntimes(
  options: StageRuntimeOptions,
): Promise<StagedRuntimeResult> {
  const nodeExecutable = resolve(options.nodeExecutable)
  const javaHome = resolve(options.javaHome)
  const semanticArtifact = resolve(options.semanticArtifact)
  const stagingRoot = resolve(options.stagingRoot)
  const stagedNodeExecutable = resolve(options.stagedNodeExecutable)
  const stagedJavaRoot = resolve(options.stagedJavaRoot)
  const stagedNodeLicense = resolve(options.stagedNodeLicense)
  const nodeLicense = resolve(dirname(nodeExecutable), '../LICENSE')
  assertWithin(stagingRoot, stagedNodeExecutable)
  assertWithin(stagingRoot, stagedJavaRoot)
  assertWithin(stagingRoot, stagedNodeLicense)

  await Promise.all([
    assertRegularFile(nodeExecutable, 'Node executable'),
    assertRegularFile(resolve(javaHome, 'bin/java'), 'Java executable'),
    assertRegularFile(resolve(javaHome, 'bin/jdeps'), 'jdeps executable'),
    assertRegularFile(resolve(javaHome, 'bin/jlink'), 'jlink executable'),
    assertRegularFile(resolve(javaHome, 'release'), 'Java release metadata'),
    assertRegularFile(nodeLicense, 'Node license'),
    assertRegularFile(semanticArtifact, 'Semantic language service'),
  ])

  const [
    { stdout: nodeVersionOutput },
    { stdout: nodeFileOutput },
    { stdout: javaFileOutput },
    { stderr: javaVersionOutput },
  ] = await Promise.all([
    execFileAsync(nodeExecutable, ['--version']),
    execFileAsync('file', [nodeExecutable]),
    execFileAsync('file', [resolve(javaHome, 'bin/java')]),
    execFileAsync(resolve(javaHome, 'bin/java'), ['-version']),
  ])
  const nodeVersion = nodeVersionOutput.trim()
  if (!/^v22\./.test(nodeVersion)) {
    throw new Error(`Self-contained runtime requires Node 22; received ${nodeVersion}`)
  }
  if (
    options.expectedNodeArchitecture === 'arm64' &&
    !/\barm64\b/.test(nodeFileOutput)
  ) {
    throw new Error('Self-contained runtime requires an Apple Silicon Node executable')
  }
  if (!/\b21(?:\.|\b)/.test(javaVersionOutput)) {
    throw new Error('Self-contained runtime requires a Java 21 JDK')
  }
  if (!/\barm64\b/.test(javaFileOutput)) {
    throw new Error('Self-contained runtime requires an Apple Silicon Java executable')
  }

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
  // The Pilot/Xtext runtime loads these providers reflectively. jdeps cannot
  // discover those edges in the assembled semantic-service JAR.
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
    rm(stagedNodeExecutable, { force: true }),
    rm(stagedJavaRoot, { recursive: true, force: true }),
    rm(stagedNodeLicense, { force: true }),
  ])
  await Promise.all([
    mkdir(dirname(stagedNodeExecutable), { recursive: true }),
    mkdir(dirname(stagedNodeLicense), { recursive: true }),
  ])
  await Promise.all([
    copyFile(nodeExecutable, stagedNodeExecutable),
    copyFile(nodeLicense, stagedNodeLicense),
  ])
  await chmod(stagedNodeExecutable, 0o755)

  await execFileAsync(
    resolve(javaHome, 'bin/jlink'),
    [
      '--module-path',
      resolve(javaHome, 'jmods'),
      '--add-modules',
      javaModules.join(','),
      '--output',
      stagedJavaRoot,
      '--strip-debug',
      '--no-header-files',
      '--no-man-pages',
      '--compress=2',
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  )
  await materializeInternalLinks(stagedJavaRoot, stagedJavaRoot)
  await makeTreeOwnerWritable(stagedJavaRoot)
  const { stderr: stagedJavaVersionOutput } = await execFileAsync(
    resolve(stagedJavaRoot, 'bin/java'),
    ['-version'],
  )
  if (!/\b21(?:\.|\b)/.test(stagedJavaVersionOutput)) {
    throw new Error('Generated Java runtime is not Java 21')
  }

  const javaFiles = await inventoryFiles(stagedJavaRoot)
  return {
    node: {
      version: nodeVersion,
      executableSha256: await sha256File(stagedNodeExecutable),
      licenseSha256: await sha256File(stagedNodeLicense),
    },
    java: {
      version:
        stagedJavaVersionOutput.trim().split('\n')[0] ??
        'unknown Java 21 runtime',
      architecture: 'arm64',
      modules: javaModules,
      sourceReleaseSha256: await sha256File(resolve(javaHome, 'release')),
      fileCount: javaFiles.length,
      inventorySha256: sha256Text(canonicalJson(javaFiles)),
    },
  }
}

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
  if (
    !relation ||
    relation.startsWith('..') ||
    resolve(root, relation) !== path
  ) {
    throw new Error(`Generated path escapes its runtime root: ${path}`)
  }
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
