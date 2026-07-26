import { spawn } from 'node:child_process'
import { readFile, readdir, realpath, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  WORKBENCH_METHODS,
  WORKBENCH_PROTOCOL_VERSION,
} from '../packages/workbench-protocol/src/index.js'

interface JsonRpcResponse<T> {
  result?: T
  error?: { code: number; message: string }
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const workspaceFile = await realpath(
  resolve(
    valueAfter('--workspace-file') ??
      resolve(
        repositoryRoot,
        'fixtures/workspaces/phase5-infrastructure/sysml-workspace.yaml',
      ),
  ),
)
if (!(await stat(workspaceFile)).isFile()) {
  throw new Error('Web companion qualification workspace is not a file')
}
const pagesUrl =
  valueAfter('--pages-url') ??
  'https://haitaowu12.github.io/sysmlv2_viewer/'
const outputPath = resolve(
  valueAfter('--output') ??
    resolve(
      repositoryRoot,
      'generated/release-evidence/web-companion-qualification.json',
    ),
)

await assertPagesBuild()

const launcher = resolve(
  repositoryRoot,
  'dist-workbench/scripts/workbench-launch-companion.js',
)
const serviceEntry = resolve(
  repositoryRoot,
  'dist-workbench/apps/workbench-service/src/main.js',
)
const companion = spawn(
  process.execPath,
  [
    launcher,
    '--service-entry',
    serviceEntry,
    '--workspace-file',
    workspaceFile,
    '--pages-url',
    pagesUrl,
    '--preservation-control',
    '--no-open',
  ],
  {
    cwd: repositoryRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let stderr = ''
companion.stderr?.on('data', (chunk: Buffer) => {
  stderr += chunk.toString('utf8')
})

try {
  const launchUrl = await readLaunchUrl(companion)
  const bootstrapUrl = new URL(launchUrl)
  const fragment = new URLSearchParams(bootstrapUrl.hash.slice(1))
  const serviceOrigin = fragment.get('service')
  const pairingCode = fragment.get('pairing')
  if (!serviceOrigin || !pairingCode) {
    throw new Error('Companion launcher did not emit a complete bootstrap')
  }
  if (fragment.has('workspace') || launchUrl.includes(workspaceFile)) {
    throw new Error('Companion launcher exposed the workspace path in the URL')
  }
  const page = new URL(pagesUrl)
  if (
    bootstrapUrl.origin !== page.origin ||
    bootstrapUrl.pathname !== page.pathname
  ) {
    throw new Error('Companion launcher opened an unexpected Pages target')
  }

  const preflight = await fetch(new URL('/pair', serviceOrigin), {
    method: 'OPTIONS',
    headers: {
      Origin: page.origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Private-Network': 'true',
    },
  })
  if (
    preflight.status !== 204 ||
    preflight.headers.get('access-control-allow-origin') !== page.origin ||
    preflight.headers.get('access-control-allow-private-network') !== 'true'
  ) {
    throw new Error('Pages Private Network Access preflight did not pass')
  }

  const paired = await fetch(new URL('/pair', serviceOrigin), {
    method: 'POST',
    headers: {
      Origin: page.origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pairingCode }),
  })
  if (!paired.ok) {
    throw new Error(`Pages pairing failed with HTTP ${paired.status}`)
  }
  const credentials = (await paired.json()) as {
    token: string
    csrf: string
    workspaceHandle?: string
  }
  if (!credentials.workspaceHandle?.startsWith('workspace_')) {
    throw new Error('Paired companion did not return an opaque workspace handle')
  }
  if (JSON.stringify(credentials).includes(workspaceFile)) {
    throw new Error('Paired companion exposed the workspace path to the client')
  }

  const initialize = await rpc<{
    protocolVersion: string
    transport: { kind: string; secure: boolean }
    languageAuthority: { qualificationStatus: string }
  }>(serviceOrigin, page.origin, credentials, 1, WORKBENCH_METHODS.initialize, {
    protocolVersion: WORKBENCH_PROTOCOL_VERSION,
    client: { name: 'pages-companion-qualification', version: '1' },
  })
  await expectRpcFailure(
    serviceOrigin,
    page.origin,
    credentials,
    2,
    WORKBENCH_METHODS.workspaceOpen,
    { workspaceFile },
    -32010,
  )
  const workspace = await rpc<{
    workspaceId: string
    documentCount: number
  }>(
    serviceOrigin,
    page.origin,
    credentials,
    3,
    WORKBENCH_METHODS.workspaceOpen,
    { workspaceFile: credentials.workspaceHandle },
  )
  const report = {
    schemaVersion: 1,
    outcome: 'passed',
    pages: {
      origin: page.origin,
      pathname: page.pathname,
      modernWorkbenchShell: true,
      cspAllowsExactLoopback: true,
    },
    companion: {
      loopbackOnly: true,
      privateNetworkPreflight: true,
      pairingSecretInFragment: true,
      workspacePathAbsentFromUrl: true,
      opaqueWorkspaceHandleReturnedAfterPairing: true,
      directWorkspacePathRejected: true,
    },
    protocol: {
      version: initialize.protocolVersion,
      transport: initialize.transport,
      qualificationStatus: initialize.languageAuthority.qualificationStatus,
      workspaceId: workspace.workspaceId,
      documentCount: workspace.documentCount,
    },
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  companion.kill('SIGTERM')
  await new Promise<void>((resolveExit) => {
    if (companion.exitCode !== null) {
      resolveExit()
      return
    }
    companion.once('exit', () => resolveExit())
  })
  if (stderr.trim()) process.stderr.write(stderr)
}

async function assertPagesBuild(): Promise<void> {
  const indexPath = resolve(repositoryRoot, 'dist/index.html')
  const index = await readFile(indexPath, 'utf8')
  if (!index.includes('/sysmlv2_viewer/')) {
    throw new Error('dist is not built for the GitHub Pages base path')
  }
  if (!index.includes('http://127.0.0.1:*')) {
    throw new Error('Pages build CSP does not allow the loopback companion')
  }
  const assets = await readdir(resolve(repositoryRoot, 'dist/assets'))
  const javascript = await Promise.all(
    assets
      .filter((name) => name.endsWith('.js'))
      .map((name) =>
        readFile(resolve(repositoryRoot, 'dist/assets', name), 'utf8'),
      ),
  )
  if (!javascript.some((source) => source.includes('GITHUB PAGES · LOCAL COMPANION'))) {
    throw new Error('Pages build does not contain the modern companion shell')
  }
}

async function readLaunchUrl(
  companion: ReturnType<typeof spawn>,
): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let stdout = ''
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for the companion launch URL'))
    }, 30_000)
    companion.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      const match = stdout.match(/^Open: (.+)$/m)
      if (!match?.[1]) return
      clearTimeout(timeout)
      resolveUrl(match[1].trim())
    })
    companion.once('exit', (code) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `Companion exited before qualification with ${code}: ${stderr}`,
        ),
      )
    })
    companion.once('error', reject)
  })
}

async function rpc<T>(
  serviceOrigin: string,
  origin: string,
  credentials: { token: string; csrf: string },
  id: number,
  method: string,
  params: unknown,
): Promise<T> {
  const response = await fetch(new URL('/rpc', serviceOrigin), {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
      'X-Workbench-CSRF': credentials.csrf,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}`)
  }
  const payload = (await response.json()) as JsonRpcResponse<T>
  if (payload.error) {
    throw new Error(`${method} failed: ${payload.error.message}`)
  }
  if (payload.result === undefined) {
    throw new Error(`${method} returned no result`)
  }
  return payload.result
}

async function expectRpcFailure(
  serviceOrigin: string,
  origin: string,
  credentials: { token: string; csrf: string },
  id: number,
  method: string,
  params: unknown,
  expectedCode: number,
): Promise<void> {
  const response = await fetch(new URL('/rpc', serviceOrigin), {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
      'X-Workbench-CSRF': credentials.csrf,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  if (!response.ok) {
    throw new Error(`${method} rejection returned HTTP ${response.status}`)
  }
  const payload = (await response.json()) as JsonRpcResponse<unknown>
  if (payload.error?.code !== expectedCode) {
    throw new Error(
      `${method} did not reject direct workspace authority with ${expectedCode}`,
    )
  }
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
