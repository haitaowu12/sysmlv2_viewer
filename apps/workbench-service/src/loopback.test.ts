// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const sampleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/workspaces/phase1-sample',
)
const resources: Array<{
  server: LoopbackServerHandle
  service: WorkbenchService
}> = []

afterEach(async () => {
  await Promise.all(
    resources.splice(0).map(async ({ server, service }) => {
      await server.close()
      await service.dispose()
    }),
  )
})

describe('authenticated loopback transport', () => {
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
})

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
