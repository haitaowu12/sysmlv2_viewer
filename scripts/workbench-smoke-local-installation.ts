import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, mkdtemp, rename } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { extract } from 'tar'
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
const archive = resolve(requiredValue('--archive'))
const scratch = await mkdtemp(resolve(tmpdir(), 'workbench-local-install-'))
const home = resolve(scratch, 'new home')
await mkdir(home)
await extract({ file: archive, cwd: scratch, strict: true })
const bundleRoot = resolve(scratch, basename(archive, '.tar.gz'))
const workspaceRoot = resolve(home, 'Pilot workspace')
const modelMarker = 'ContributorPilot'
const isolatedEnvironment = { HOME: home, PATH: '/workbench-no-system-tools', TMPDIR: scratch, LANG: 'en_US.UTF-8', NODE_OPTIONS: '--require=/missing-injected-code.cjs', NODE_PATH: '/missing-module-path', JAVA_TOOL_OPTIONS: '-XX:InvalidInjectedOption', JDK_JAVA_OPTIONS: '--invalid-injected-option', _JAVA_OPTIONS: '-XX:InvalidInjectedOption' }
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
  manifest.distribution.networkRequiredAfterInstall ||
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

const launcher = resolve(bundleRoot, 'bin/start-local-workbench.sh')
await execFileAsync(launcher, ['--doctor'], { env: isolatedEnvironment, cwd: home })
const negativeChecks: string[] = []
const uiFile = resolve(bundleRoot, 'app/index.html')
const originalUi = await readFile(uiFile)
await writeFile(uiFile, Buffer.concat([originalUi, Buffer.from('tampered')]))
await expectDoctorFailure('tampered UI')
await writeFile(uiFile, originalUi)
const javaFile = resolve(bundleRoot, 'runtime/java/bin/java')
await rename(javaFile, resolve(scratch, 'java-held'))
await expectDoctorFailure('missing Java')
await rename(resolve(scratch, 'java-held'), javaFile)
await execFileAsync(launcher, ['--doctor'], { env: isolatedEnvironment, cwd: home })
negativeChecks.push('restored original installation verifies')
const networkPolicy = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))'
await execFileAsync('/usr/bin/sandbox-exec', ['-p', networkPolicy, nodeExecutable, '-e', "const s = require('net').createConnection({host:'192.0.2.1',port:443}); s.on('error',e=>process.exit(['EPERM','EACCES'].includes(e.code)?0:1)); s.on('connect',()=>process.exit(2)); setTimeout(()=>process.exit(3),2000)"], { env: { HOME: home, PATH: isolatedEnvironment.PATH }, timeout: 5000 })
const child = spawn(
  '/usr/bin/sandbox-exec',
  ['-p', networkPolicy, launcher, '--sample', workspaceRoot, '--port', valueAfter('--port') ?? '44317'],
  {
    cwd: bundleRoot,
    env: isolatedEnvironment,
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

  const staticResponse = await fetch(target.origin)
  const staticHtml = await staticResponse.text()
  if (!staticResponse.ok || !staticHtml.includes('<html') || !staticResponse.headers.get('content-security-policy')) throw new Error('Packaged local UI or CSP missing')
  const assetPaths = [...staticHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]!)
  if (!assetPaths.length) throw new Error('No packaged UI assets referenced')
  for (const path of assetPaths) {
    const url = new URL(path, target.origin)
    if (url.origin !== target.origin || !(await fetch(url)).ok) throw new Error('UI asset is missing or requires an external origin')
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

  const semantic = await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 4, method: 'semantic/snapshot', params: { workspaceId: opened.result.workspaceId } })
  if (!semantic.result?.elements?.some((element: { qualifiedName: string }) => element.qualifiedName?.includes(modelMarker))) throw new Error('Expected semantic model missing')
  const diagnosticResponse = await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 3, method: 'language/diagnostics', params: { workspaceId: opened.result.workspaceId } })
  if (!Array.isArray(diagnosticResponse.result) || diagnosticResponse.result.some((item: {severity: string}) => item.severity === 'error')) throw new Error('Bundled runtime has errors: ' + JSON.stringify(diagnosticResponse))
  const modelPath = resolve(workspaceRoot, 'model/control.sysml')
  const baselineSource = await readFile(modelPath, 'utf8')
  const invalidSource = baselineSource.replace('responseLimitMs : ScalarValues::Real', 'responseLimitMs : MissingInstalledType')
  if (invalidSource === baselineSource) throw new Error('Installed negative fixture did not select the scalar type')
  await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 5, method: 'workspace/close', params: { workspaceId: opened.result.workspaceId } })
  await writeFile(modelPath, invalidSource)
  const invalidOpen = await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 6, method: 'workspace/open', params: { workspaceFile: pairing.workspaceHandle } })
  const invalidDiagnostics = await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 7, method: 'language/diagnostics', params: { workspaceId: invalidOpen.result?.workspaceId } })
  if (!Array.isArray(invalidDiagnostics.result) || !invalidDiagnostics.result.some((item: { severity: string }) => item.severity === 'error')) throw new Error('Installed runtime failed to report an invalid type')
  await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 8, method: 'workspace/close', params: { workspaceId: invalidOpen.result.workspaceId } })
  await writeFile(modelPath, baselineSource)
  const restoredOpen = await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 9, method: 'workspace/open', params: { workspaceFile: pairing.workspaceHandle } })
  const restoredDiagnostics = await rpc(serviceOrigin, headers, { jsonrpc: '2.0', id: 10, method: 'language/diagnostics', params: { workspaceId: restoredOpen.result?.workspaceId } })
  if (!Array.isArray(restoredDiagnostics.result) || restoredDiagnostics.result.some((item: { severity: string }) => item.severity === 'error')) throw new Error('Installed runtime did not recover after source restoration')
  negativeChecks.push('invalid model type reported and exact baseline restored with zero errors')
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
    outcome: manifest.release.sourceDirty ? 'passed-development-nonqualifying' : 'passed-isolated-local-installation',
    archiveSha256: await sha256File(archive),
    extractedDirectory: scratch,
    archiveRelocated: true,
    newHome: home,
    negativeChecks,
    staticUiAndAssets: true,
    staticCsp: true,
    semanticErrorCount: 0,
    semanticElementCount: semantic.result.elements.length,
    bundle: basename(bundleRoot),
    manifestSha256: await sha256File(manifestPath),
    sourceCommit: manifest.release.sourceCommit,
    platform: manifest.release.platform,
    languageAuthority:
      initialize.result.languageAuthority.adapterId,
    workspaceId: opened.result.workspaceId,
    documentCount: opened.result.documents.length,
    runtimeIsolation: {
      path: isolatedEnvironment.PATH,
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
    localUiRequiresNetwork: false,
    networkEgressBlocked: true,
    networkPolicy,
    outboundDenialProbe: 'EPERM-or-EACCES-on-TEST-NET-1-address',
    separateCleanMachineAccepted: false,
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
    const match = stdout.match(/^Open: (http:\/\/127\.0\.0\.1:\d+\/\S+)$/m)
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

async function expectDoctorFailure(label: string): Promise<void> {
  let rejected = false
  try { await execFileAsync(launcher, ['--doctor'], { env: isolatedEnvironment, cwd: home }) } catch { rejected = true }
  if (!rejected) throw new Error('Doctor accepted ' + label)
  negativeChecks.push(label + ' rejected before service launch')
}
