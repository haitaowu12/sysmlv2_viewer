import { execFile, spawn } from 'node:child_process'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

interface ReadyEvent {
  event: 'workbench-service-ready'
  pairingCode: string
  port: number
}

interface DesktopRuntimeManifest {
  sourceCommit: string
  platform: string
  minimumMacOS: string
  networkRequiredAfterInstall: boolean
  node: { version: string; sha256: string }
  java: { version: string; modules: string[] }
}

const execFileAsync = promisify(execFile)
const appBundle = resolve(requiredValue('--app'))
const workspaceFile = resolve(requiredValue('--workspace-file'))
const outputPath = valueAfter('--output')
  ? resolve(valueAfter('--output')!)
  : null
const modelMarker = valueAfter('--model-marker')
const contents = resolve(appBundle, 'Contents')
const resources = resolve(contents, 'Resources')
const bundleRoot = resolve(resources, 'workbench')
const nodeExecutable = resolve(contents, 'MacOS/workbench-node')
const javaExecutable = resolve(resources, 'runtime/java/bin/java')
const serviceEntry = resolve(
  bundleRoot,
  'service/apps/workbench-service/src/main.js',
)
const verifier = resolve(bundleRoot, 'bin/verify-bundle.mjs')
const semanticArtifact = resolve(
  bundleRoot,
  'runtime/semantic/sysmlv2-lsp-server.jar',
)
const libraryRoot = resolve(bundleRoot, 'runtime/libraries/sysml.library')
const candidateManifest = resolve(
  bundleRoot,
  'config/language-engine-candidates.json',
)
const runtimeLock = resolve(
  bundleRoot,
  'config/language-engine-runtime-lock.json',
)
const workspaceRoot = dirname(workspaceFile)

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error(
    'The initial desktop smoke requires a macOS arm64 qualification host',
  )
}
for (const path of [
  nodeExecutable,
  javaExecutable,
  serviceEntry,
  verifier,
  semanticArtifact,
  candidateManifest,
  runtimeLock,
  workspaceFile,
]) {
  await assertRegularFile(path)
}
const authoringArtifact = await findSingleRegularFile(
  resolve(bundleRoot, 'runtime/authoring'),
)
const runtimeManifest = JSON.parse(
  await readFile(
    resolve(resources, 'desktop-runtime-manifest.json'),
    'utf8',
  ),
) as DesktopRuntimeManifest
const releaseManifest = JSON.parse(
  await readFile(resolve(bundleRoot, 'manifests/release-manifest.json'), 'utf8'),
) as {
  product: { version: string }
  release: { sourceCommit: string; sourceDirty: boolean; platform: string }
}
if (
  runtimeManifest.platform !== 'darwin-arm64' ||
  runtimeManifest.networkRequiredAfterInstall ||
  releaseManifest.release.platform !== 'darwin-arm64' ||
  releaseManifest.release.sourceDirty ||
  runtimeManifest.sourceCommit !== releaseManifest.release.sourceCommit
) {
  throw new Error('Desktop and portable runtime manifests are inconsistent')
}

const [
  { stdout: bundleIdentifier },
  { stdout: nodeVersion },
  { stderr: javaVersion },
  { stdout: nodeArchitecture },
  signing,
] = await Promise.all([
  execFileAsync('plutil', [
    '-extract',
    'CFBundleIdentifier',
    'raw',
    resolve(contents, 'Info.plist'),
  ]),
  execFileAsync(nodeExecutable, ['--version']),
  execFileAsync(javaExecutable, ['-version']),
  execFileAsync('file', [nodeExecutable]),
  inspectSigning(appBundle),
  execFileAsync(nodeExecutable, [verifier], { cwd: bundleRoot }),
  execFileAsync('codesign', ['--verify', '--deep', '--strict', appBundle]),
])
if (bundleIdentifier.trim() !== 'io.sysml.workbench') {
  throw new Error(`Unexpected desktop bundle identifier: ${bundleIdentifier}`)
}
if (!nodeArchitecture.includes('arm64')) {
  throw new Error('Bundled Node executable is not Apple Silicon')
}
if (nodeVersion.trim() !== runtimeManifest.node.version) {
  throw new Error('Bundled Node version does not match the runtime manifest')
}
if (!javaVersion.includes('version "21')) {
  throw new Error('Bundled Java runtime is not Java 21')
}

const semanticArguments = JSON.stringify(['-jar', semanticArtifact])
const authoringArguments = JSON.stringify([
  'lsp',
  '--stdlib-path',
  libraryRoot,
])
const originHeader = 'http://tauri.localhost'
const child = spawn(
  nodeExecutable,
  [
    serviceEntry,
    '--loopback',
    '--qualified-runtime',
    '--workspace-root',
    workspaceRoot,
    '--address',
    '127.0.0.1',
    '--port',
    '0',
    '--origin',
    originHeader,
    '--candidate-manifest',
    candidateManifest,
    '--runtime-lock',
    runtimeLock,
  ],
  {
    cwd: bundleRoot,
    env: {
      PATH: '/usr/bin:/bin',
      SYSML_WORKBENCH_SEMANTIC_ARTIFACT: semanticArtifact,
      SYSML_WORKBENCH_AUTHORING_ARTIFACT: authoringArtifact,
      SYSML_WORKBENCH_VINQUT_COMMAND: javaExecutable,
      SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON: semanticArguments,
      SYSML_WORKBENCH_SPEC42_COMMAND: authoringArtifact,
      SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON: authoringArguments,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let stderr = ''
let stdout = ''
let report: Record<string, unknown> | undefined
child.stderr.setEncoding('utf8')
child.stdout.setEncoding('utf8')
child.stderr.on('data', (chunk: string) => {
  stderr += chunk
})
child.stdout.on('data', (chunk: string) => {
  stdout += chunk
})

try {
  const ready = await waitForReady()
  const origin = `http://127.0.0.1:${ready.port}`
  const pairing = await post(`${origin}/pair`, originHeader, {
    pairingCode: ready.pairingCode,
  }) as { token: string; csrf: string }
  const headers = {
    authorization: `Bearer ${pairing.token}`,
    'content-type': 'application/json',
    origin: originHeader,
    'x-workbench-csrf': pairing.csrf,
  }
  const initialize = await rpc(origin, headers, {
    jsonrpc: '2.0',
    id: 1,
    method: 'workbench/initialize',
    params: {
      protocolVersion: '0.7.0',
      client: {
        name: 'desktop-bundle-smoke',
        version: releaseManifest.product.version,
      },
    },
  })
  if (
    initialize.result?.languageAuthority?.qualificationStatus !== 'qualified'
  ) {
    throw new Error('Desktop bundle did not start the qualified language authority')
  }
  const opened = await rpc(origin, headers, {
    jsonrpc: '2.0',
    id: 2,
    method: 'workspace/open',
    params: { workspaceFile },
  })
  if (
    typeof opened.result?.workspaceId !== 'string' ||
    !Array.isArray(opened.result?.documents) ||
    opened.result.documents.length === 0
  ) {
    throw new Error(`Desktop workspace smoke failed: ${JSON.stringify(opened)}`)
  }
  const diagnostics = await rpc(origin, headers, {
    jsonrpc: '2.0',
    id: 3,
    method: 'language/diagnostics',
    params: { workspaceId: opened.result.workspaceId },
  })
  if (!Array.isArray(diagnostics.result)) {
    throw new Error('Desktop diagnostics smoke did not return a diagnostic list')
  }
  await delay(100)
  const capturedLogs = `${stdout}\n${stderr}`
  const logSafety = {
    modelMarkerAbsent: modelMarker
      ? !capturedLogs.includes(modelMarker)
      : null,
    sessionTokenAbsent: !capturedLogs.includes(pairing.token),
    csrfAbsent: !capturedLogs.includes(pairing.csrf),
    capturedBytes: Buffer.byteLength(capturedLogs, 'utf8'),
  }
  if (
    logSafety.modelMarkerAbsent === false ||
    !logSafety.sessionTokenAbsent ||
    !logSafety.csrfAbsent
  ) {
    throw new Error('Desktop service logs exposed model content or credentials')
  }
  report = {
    schemaVersion: 1,
    outcome: 'passed',
    appBundle: basename(appBundle),
    bundleIdentifier: bundleIdentifier.trim(),
    sourceCommit: runtimeManifest.sourceCommit,
    platform: runtimeManifest.platform,
    minimumMacOS: runtimeManifest.minimumMacOS,
    nodeVersion: nodeVersion.trim(),
    javaVersion: javaVersion.trim().split('\n')[0],
    languageAuthority: initialize.result.languageAuthority.adapterId,
    workspaceId: opened.result.workspaceId,
    documentCount: opened.result.documents.length,
    diagnosticCount: diagnostics.result.length,
    offlineRuntime: true,
    signing,
    logSafety,
  }
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
    delay(5_000),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}
if (child.exitCode !== 0) {
  throw new Error(
    `Desktop service did not shut down cleanly (code=${String(child.exitCode)}, signal=${String(child.signalCode)}): ${stderr}${stdout}`,
  )
}
if (!report) throw new Error('Desktop smoke did not produce a report')
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

async function inspectSigning(path: string): Promise<{
  technicalIntegrity: 'passed'
  distributionIdentity: 'developer-id' | 'ad-hoc'
  notarizationRequired: boolean
}> {
  const { stderr } = await execFileAsync(
    'codesign',
    ['-d', '--verbose=4', path],
    { maxBuffer: 4 * 1024 * 1024 },
  )
  const developerId = /Authority=Developer ID Application:/.test(stderr)
  return {
    technicalIntegrity: 'passed',
    distributionIdentity: developerId ? 'developer-id' : 'ad-hoc',
    notarizationRequired: !developerId,
  }
}

async function findSingleRegularFile(directory: string): Promise<string> {
  const candidates: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = resolve(directory, entry.name)
    await assertRegularFile(path)
    candidates.push(path)
  }
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one authoring runtime, found ${candidates.length}`,
    )
  }
  return candidates[0]!
}

async function assertRegularFile(path: string): Promise<void> {
  const details = await lstat(path)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Required desktop path is not a regular file: ${path}`)
  }
}

async function waitForReady(): Promise<ReadyEvent> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    for (const line of stderr.split(/\r?\n/)) {
      if (!line.startsWith('{')) continue
      try {
        const event = JSON.parse(line) as Partial<ReadyEvent>
        if (
          event.event === 'workbench-service-ready' &&
          typeof event.pairingCode === 'string' &&
          typeof event.port === 'number'
        ) {
          return event as ReadyEvent
        }
      } catch {
        // Engine diagnostics may contain non-JSON stderr before readiness.
      }
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Desktop service exited before readiness (${child.exitCode}): ${stderr}${stdout}`,
      )
    }
    await delay(50)
  }
  throw new Error(`Desktop service readiness timed out: ${stderr}${stdout}`)
}

async function post(
  url: string,
  origin: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Desktop smoke HTTP ${response.status}`)
  return response.json()
}

async function rpc(
  origin: string,
  headers: Record<string, string>,
  request: unknown,
): Promise<Record<string, any>> {
  const response = await fetch(`${origin}/rpc`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`Desktop smoke RPC HTTP ${response.status}`)
  }
  return response.json() as Promise<Record<string, any>>
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
