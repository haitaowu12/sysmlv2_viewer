import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { sha256File } from './workbench-release-support.js'

interface CompanionManifest {
  product: { version: string }
  release: {
    platform: string
    sourceCommit: string
    sourceDirty: boolean
  }
  payload: { authoringArchitecture: string }
  runtimes: {
    node: { executable: string; executableSha256: string; version: string }
    java: { executable: string; version: string; architecture: string }
  }
  distribution: {
    selfContained: boolean
    networkRequiredAfterInstall: boolean
    localRuntimeNetworkRequired: boolean
    signed: boolean
    notarized: boolean
    windowsQualified: boolean
  }
}

const execFileAsync = promisify(execFile)
const bundleRoot = resolve(requiredValue('--bundle'))
const workspaceFile = resolve(requiredValue('--workspace-file'))
const modelMarker = requiredValue('--model-marker')
const outputPath = valueAfter('--output')
  ? resolve(valueAfter('--output')!)
  : null
const manifestPath = resolve(
  bundleRoot,
  'manifests/companion-manifest.json',
)
const manifest = JSON.parse(
  await readFile(manifestPath, 'utf8'),
) as CompanionManifest
if (
  process.platform !== 'darwin' ||
  process.arch !== 'arm64' ||
  manifest.release.platform !== 'darwin-arm64'
) {
  throw new Error(
    'Companion bundle smoke requires an Apple Silicon macOS qualification host',
  )
}
if (manifest.release.sourceDirty && !process.argv.includes('--allow-dirty')) {
  throw new Error('Dirty-source companion bundles cannot qualify')
}
if (
  !manifest.distribution.selfContained ||
  !manifest.distribution.networkRequiredAfterInstall ||
  manifest.distribution.localRuntimeNetworkRequired ||
  manifest.distribution.signed ||
  manifest.distribution.notarized ||
  manifest.distribution.windowsQualified
) {
  throw new Error('Companion distribution claims do not match this smoke profile')
}

const nodeExecutable = resolve(
  bundleRoot,
  manifest.runtimes.node.executable,
)
const javaExecutable = resolve(
  bundleRoot,
  manifest.runtimes.java.executable,
)
const [
  { stdout: nodeVersionOutput },
  { stderr: javaVersionOutput },
  nodeSha256,
] = await Promise.all([
  execFileAsync(nodeExecutable, ['--version']),
  execFileAsync(javaExecutable, ['-version']),
  sha256File(nodeExecutable),
])
if (
  nodeVersionOutput.trim() !== manifest.runtimes.node.version ||
  nodeSha256 !== manifest.runtimes.node.executableSha256
) {
  throw new Error('Bundled Node runtime does not match companion provenance')
}
if (
  !javaVersionOutput.includes('21') ||
  !manifest.runtimes.java.version.includes('21') ||
  manifest.runtimes.java.architecture !== 'arm64' ||
  manifest.payload.authoringArchitecture !== 'arm64'
) {
  throw new Error('Bundled Java/authoring runtime architecture is not qualified')
}

const launcher = resolve(bundleRoot, 'bin/start-pages-companion.sh')
const pagesUrl = 'https://haitaowu12.github.io/sysmlv2_viewer/'
const child = spawn(
  launcher,
  [workspaceFile, pagesUrl, '--no-open'],
  {
    cwd: bundleRoot,
    env: {
      // There is intentionally no executable search path. The launcher and
      // service must use only absolute paths to their staged runtimes.
      PATH: '/sysml-workbench-smoke-no-system-runtime',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      NODE_OPTIONS:
        '--require=/sysml-workbench-smoke-missing-preload.cjs',
      NODE_PATH: '/sysml-workbench-smoke-missing-node-path',
      JAVA_TOOL_OPTIONS: '-XX:SysMLWorkbenchSmokeInvalidOption',
      JDK_JAVA_OPTIONS: '--sysml-workbench-smoke-invalid-option',
      _JAVA_OPTIONS: '-XX:SysMLWorkbenchSmokeInvalidOption',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk: string) => {
  stdout += chunk
})
child.stderr.on('data', (chunk: string) => {
  stderr += chunk
})

try {
  const target = await waitForOpenUrl()
  const parameters = new URLSearchParams(target.hash.slice(1))
  const serviceOrigin = parameters.get('service')
  const pairingCode = parameters.get('pairing')
  if (
    !serviceOrigin ||
    !pairingCode ||
    !serviceOrigin.startsWith('http://127.0.0.1:')
  ) {
    throw new Error('Companion did not return a loopback pairing URL')
  }

  const pairing = (await post(
    `${serviceOrigin}/pair`,
    target.origin,
    { pairingCode },
  )) as { token: string; csrf: string; workspaceHandle?: string }
  if (
    !pairing.workspaceHandle ||
    !/^workspace_[A-Za-z0-9_-]+$/.test(pairing.workspaceHandle)
  ) {
    throw new Error('Companion pairing did not return an opaque workspace handle')
  }
  const headers = {
    authorization: `Bearer ${pairing.token}`,
    'content-type': 'application/json',
    origin: target.origin,
    'x-workbench-csrf': pairing.csrf,
  }
  const initialize = await rpc(serviceOrigin, headers, {
    jsonrpc: '2.0',
    id: 1,
    method: 'workbench/initialize',
    params: {
      protocolVersion: '0.7.0',
      client: {
        name: 'self-contained-companion-smoke',
        version: manifest.product.version,
      },
    },
  })
  if (
    initialize.result?.languageAuthority?.qualificationStatus !== 'qualified'
  ) {
    throw new Error(
      'Companion did not start the qualified language authority',
    )
  }
  const opened = await rpc(serviceOrigin, headers, {
    jsonrpc: '2.0',
    id: 2,
    method: 'workspace/open',
    params: { workspaceFile: pairing.workspaceHandle },
  })
  if (
    typeof opened.result?.workspaceId !== 'string' ||
    !Array.isArray(opened.result?.documents) ||
    opened.result.documents.length === 0
  ) {
    throw new Error(
      `Companion workspace smoke failed: ${JSON.stringify(opened)}`,
    )
  }

  await delay(100)
  const capturedLogs = `${stdout}\n${stderr}`
  const logSafety = {
    modelMarkerAbsent: !capturedLogs.includes(modelMarker),
    sessionTokenAbsent: !capturedLogs.includes(pairing.token),
    csrfAbsent: !capturedLogs.includes(pairing.csrf),
    capturedBytes: Buffer.byteLength(capturedLogs, 'utf8'),
  }
  if (
    !logSafety.modelMarkerAbsent ||
    !logSafety.sessionTokenAbsent ||
    !logSafety.csrfAbsent
  ) {
    throw new Error(
      'Companion logs exposed model content or session credentials',
    )
  }

  const report = {
    schemaVersion: 1,
    outcome: 'passed',
    bundle: basename(bundleRoot),
    manifestSha256: await sha256File(manifestPath),
    sourceCommit: manifest.release.sourceCommit,
    platform: manifest.release.platform,
    languageAuthority:
      initialize.result.languageAuthority.adapterId,
    workspaceId: opened.result.workspaceId,
    documentCount: opened.result.documents.length,
    runtimeIsolation: {
      path: '/sysml-workbench-smoke-no-system-runtime',
      bundledNode: nodeVersionOutput.trim(),
      bundledNodeSha256: nodeSha256,
      bundledJava: manifest.runtimes.java.version,
      bundledJavaArchitecture: manifest.runtimes.java.architecture,
      bundledAuthoringArchitecture:
        manifest.payload.authoringArchitecture,
      noSystemNodeOrJavaResolution: true,
      inheritedRuntimeInjectionCleared: true,
    },
    loopbackPairing: true,
    localRuntimeNetworkRequired: false,
    browserShellNetworkQualified: false,
    selfContained: true,
    signed: false,
    notarized: false,
    hostedRunnerEvidenceIsHumanCleanMachineAcceptance: false,
    logSafety,
  }
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(
      outputPath,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    )
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolveExit) =>
      child.once('exit', () => resolveExit()),
    ),
    delay(3_000),
  ])
}

async function waitForOpenUrl(): Promise<URL> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const match = stdout.match(/^Open: (https:\/\/\S+)$/m)
    if (match?.[1]) return new URL(match[1])
    if (child.exitCode !== null) {
      throw new Error(
        `Companion exited before readiness (${child.exitCode}): ${stderr}${stdout}`,
      )
    }
    await delay(50)
  }
  throw new Error(`Companion readiness timed out: ${stderr}${stdout}`)
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
  if (!response.ok) {
    throw new Error(`Companion smoke HTTP ${response.status}`)
  }
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
    throw new Error(`Companion smoke RPC HTTP ${response.status}`)
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
