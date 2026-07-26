// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { PreservationControlAdapter } from '../../../packages/language-adapter/src/index.js'
import {
  WORKBENCH_METHODS,
  WORKBENCH_PROTOCOL_VERSION,
} from '../../../packages/workbench-protocol/src/index.js'
import { WorkbenchService } from '../../../packages/workspace-service/src/service.js'
import {
  createLoopbackServer,
  type LoopbackServerHandle,
} from './loopback.js'

const origin = 'http://127.0.0.1:5173'
const pagesOrigin = 'https://haitaowu12.github.io'
const sampleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/workspaces/phase1-sample',
)
const resources: Array<{
  server: LoopbackServerHandle
  service: WorkbenchService
}> = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    resources.splice(0).map(async ({ server, service }) => {
      await server.close()
      await service.dispose()
    }),
  )
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('authenticated loopback transport', () => {
  it('permits an exact Pages origin through Private Network Access preflight', async () => {
    const workspaceFile = resolve(sampleRoot, 'sysml-workspace.yaml')
    const service = new WorkbenchService({
      adapter: new PreservationControlAdapter(),
      allowedRoots: [sampleRoot],
      transport: { kind: 'loopback', secure: false },
    })
    const server = await createLoopbackServer({
      service,
      allowedOrigins: [pagesOrigin],
      bootstrapWorkspaceFile: workspaceFile,
    })
    resources.push({ server, service })
    const base = `http://${server.address}:${server.port}`

    const preflight = await fetch(`${base}/pair`, {
      method: 'OPTIONS',
      headers: {
        Origin: pagesOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Private-Network': 'true',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      pagesOrigin,
    )
    expect(
      preflight.headers.get('access-control-allow-private-network'),
    ).toBe('true')
    expect(preflight.headers.get('vary')).toContain(
      'Access-Control-Request-Private-Network',
    )

    const deniedPreflight = await fetch(`${base}/pair`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Private-Network': 'true',
      },
    })
    expect(deniedPreflight.status).toBe(403)
    expect(
      deniedPreflight.headers.get('access-control-allow-private-network'),
    ).toBeNull()

    const paired = await fetch(`${base}/pair`, {
      method: 'POST',
      headers: {
        Origin: pagesOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pairingCode: server.pairingCode }),
    })
    expect(paired.status).toBe(200)
    const credentials = (await paired.json()) as {
      token: string
      csrf: string
      workspaceHandle: string
    }
    expect(credentials.workspaceHandle).toMatch(/^workspace_[A-Za-z0-9_-]+$/)
    expect(JSON.stringify(credentials)).not.toContain(workspaceFile)

    const replayedPairing = await fetch(`${base}/pair`, {
      method: 'POST',
      headers: {
        Origin: pagesOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pairingCode: server.pairingCode }),
    })
    expect(replayedPairing.status).toBe(410)
    await expect(replayedPairing.json()).resolves.toEqual({
      error: 'Pairing code already used',
    })

    const initialized = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: {
        Origin: pagesOrigin,
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
        'X-Workbench-CSRF': credentials.csrf,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: WORKBENCH_METHODS.initialize,
        params: {
          protocolVersion: WORKBENCH_PROTOCOL_VERSION,
          client: { name: 'pages-test', version: '1' },
        },
      }),
    })
    expect(initialized.status).toBe(200)

    const rejectedPath = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: {
        Origin: pagesOrigin,
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
        'X-Workbench-CSRF': credentials.csrf,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: WORKBENCH_METHODS.workspaceOpen,
        params: { workspaceFile },
      }),
    })
    expect(rejectedPath.status).toBe(200)
    await expect(rejectedPath.json()).resolves.toMatchObject({
      error: {
        code: -32010,
        message: 'Workspace must be opened with the companion-issued handle',
      },
    })

    const opened = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: {
        Origin: pagesOrigin,
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
        'X-Workbench-CSRF': credentials.csrf,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: WORKBENCH_METHODS.workspaceOpen,
        params: { workspaceFile: credentials.workspaceHandle },
      }),
    })
    expect(opened.status).toBe(200)
    await expect(opened.json()).resolves.toMatchObject({
      result: { workspaceId: 'phase1-sample' },
    })
  })

  it('enforces Origin, pairing, bearer token, and CSRF', async () => {
    const service = new WorkbenchService({
      adapter: new PreservationControlAdapter(),
      allowedRoots: [sampleRoot],
      transport: { kind: 'loopback', secure: false },
    })
    const server = await createLoopbackServer({
      service,
      allowedOrigins: [origin],
    })
    resources.push({ server, service })
    const base = `http://${server.address}:${server.port}`

    const wrongOrigin = await fetch(`${base}/pair`, {
      method: 'POST',
      headers: { Origin: 'http://attacker.invalid' },
      body: JSON.stringify({ pairingCode: server.pairingCode }),
    })
    expect(wrongOrigin.status).toBe(403)

    const paired = await fetch(`${base}/pair`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pairingCode: server.pairingCode }),
    })
    expect(paired.status).toBe(200)
    expect(paired.headers.get('access-control-allow-origin')).toBe(origin)
    const session = (await paired.json()) as { token: string; csrf: string }

    const missingCsrf = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: WORKBENCH_METHODS.health,
      }),
    })
    expect(missingCsrf.status).toBe(403)

    const initialized = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
        'X-Workbench-CSRF': session.csrf,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: WORKBENCH_METHODS.initialize,
        params: {
          protocolVersion: WORKBENCH_PROTOCOL_VERSION,
          client: { name: 'loopback-test', version: '1' },
        },
      }),
    })
    expect(initialized.status).toBe(200)
    await expect(initialized.json()).resolves.toMatchObject({
      result: {
        transport: { kind: 'loopback', secure: false },
      },
    })

    await expect(
      connectWebSocket(
        `ws://${server.address}:${server.port}/rpc`,
        'not-a-session-token',
      ),
    ).rejects.toThrow('Unexpected server response: 401')

    const socket = await connectWebSocket(
      `ws://${server.address}:${server.port}/rpc`,
      session.token,
    )
    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: WORKBENCH_METHODS.health,
      }),
    )
    await expect(nextMessage(socket)).resolves.toMatchObject({
      result: { status: 'ok', initialized: true },
    })
    socket.close()
  })

  it('serves a local UI with strict CSP and rejects traversal', async () => {
    const staticRoot = await mkdtemp(joinPath('sysml-workbench-static-'))
    temporaryDirectories.push(staticRoot)
    await mkdir(resolve(staticRoot, 'assets'))
    await writeFile(
      resolve(staticRoot, 'index.html'),
      '<!doctype html><script type="module" src="/assets/app.js"></script>',
    )
    await writeFile(resolve(staticRoot, 'assets/app.js'), 'export const ready = true')
    const service = new WorkbenchService({
      adapter: new PreservationControlAdapter(),
      allowedRoots: [sampleRoot],
      transport: { kind: 'loopback', secure: false },
    })
    const server = await createLoopbackServer({
      service,
      allowedOrigins: [origin],
      staticRoot,
    })
    resources.push({ server, service })
    const base = `http://${server.address}:${server.port}`

    const index = await fetch(`${base}/`)
    expect(index.status).toBe(200)
    expect(await index.text()).toContain('/assets/app.js')
    expect(index.headers.get('content-security-policy')).toContain(
      "script-src 'self'",
    )
    expect(index.headers.get('content-security-policy')).not.toContain(
      "'unsafe-eval'",
    )
    expect(index.headers.get('cache-control')).toBe('no-store')

    const asset = await fetch(`${base}/assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(asset.headers.get('content-type')).toContain('text/javascript')

    const traversal = await fetch(`${base}/%2e%2e%2Foutside.txt`)
    expect(traversal.status).toBe(400)
  })
})

function joinPath(prefix: string): string {
  return resolve(tmpdir(), prefix)
}

function connectWebSocket(url: string, token: string): Promise<WebSocket> {
  return new Promise((resolveSocket, rejectSocket) => {
    const socket = new WebSocket(
      url,
      ['sysml-workbench.v1', `auth.${token}`],
      { origin },
    )
    socket.once('open', () => resolveSocket(socket))
    socket.once('error', rejectSocket)
  })
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolveMessage, rejectMessage) => {
    socket.once('message', (data) => {
      try {
        resolveMessage(JSON.parse(data.toString()))
      } catch (error) {
        rejectMessage(error)
      }
    })
    socket.once('error', rejectMessage)
  })
}
