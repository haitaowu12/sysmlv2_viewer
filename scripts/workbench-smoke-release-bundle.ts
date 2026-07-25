import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

interface ReadyEvent {
  event: 'workbench-service-ready'
  pairingCode: string
  port: number
}

const bundleRoot = resolve(requiredValue('--bundle'))
const workspaceFile = resolve(requiredValue('--workspace-file'))
const workspaceRoot = resolve(workspaceFile, '..')
const manifest = JSON.parse(
  await readFile(
    resolve(bundleRoot, 'manifests/release-manifest.json'),
    'utf8',
  ),
) as {
  product: { version: string }
  release: { platform: string; sourceCommit: string; sourceDirty: boolean }
}
if (manifest.release.sourceDirty && !process.argv.includes('--allow-dirty')) {
  throw new Error('Dirty-source release bundles cannot qualify')
}
if (process.platform === 'win32') {
  throw new Error('Windows release smoke must run in the Windows qualification job')
}

const launcher = resolve(bundleRoot, 'bin/start-workbench.sh')
const child = spawn(launcher, [workspaceRoot], {
  cwd: bundleRoot,
  env: {
    PATH: process.env.PATH,
    JAVA_COMMAND: process.env.JAVA_COMMAND,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stderr = ''
let stdout = ''
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
  const staticResponse = await fetch(`${origin}/`)
  if (!staticResponse.ok || !(await staticResponse.text()).includes('<html')) {
    throw new Error('Bundled static UI did not load')
  }
  if (!staticResponse.headers.get('content-security-policy')) {
    throw new Error('Bundled static UI did not return a CSP')
  }
  const pairing = await post(`${origin}/pair`, origin, {
    pairingCode: ready.pairingCode,
  }) as { token: string; csrf: string }
  const headers = {
    authorization: `Bearer ${pairing.token}`,
    'content-type': 'application/json',
    origin,
    'x-workbench-csrf': pairing.csrf,
  }
  const initialize = await rpc(origin, headers, {
    jsonrpc: '2.0',
    id: 1,
    method: 'workbench/initialize',
    params: {
      protocolVersion: '0.7.0',
      client: {
        name: 'release-bundle-smoke',
        version: manifest.product.version,
      },
    },
  })
  if (
    initialize.result?.languageAuthority?.qualificationStatus !== 'qualified'
  ) {
    throw new Error('Release bundle did not start the qualified language authority')
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
    throw new Error(`Release workspace smoke failed: ${JSON.stringify(opened)}`)
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        outcome: 'passed',
        bundle: basename(bundleRoot),
        sourceCommit: manifest.release.sourceCommit,
        languageAuthority:
          initialize.result.languageAuthority.adapterId,
        workspaceId: opened.result.workspaceId,
        documentCount: opened.result.documents.length,
        staticCsp: true,
        offlineRuntime: true,
      },
      null,
      2,
    )}\n`,
  )
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
    delay(3_000),
  ])
}

async function waitForReady(): Promise<ReadyEvent> {
  const deadline = Date.now() + 30_000
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
        // The service may write non-JSON engine diagnostics before readiness.
      }
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Release service exited before readiness (${child.exitCode}): ${stderr}${stdout}`,
      )
    }
    await delay(50)
  }
  throw new Error(`Release service readiness timed out: ${stderr}${stdout}`)
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
  if (!response.ok) throw new Error(`Release smoke HTTP ${response.status}`)
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
  if (!response.ok) throw new Error(`Release smoke RPC HTTP ${response.status}`)
  return response.json() as Promise<Record<string, any>>
}

function requiredValue(flag: string): string {
  const index = process.argv.indexOf(flag)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
