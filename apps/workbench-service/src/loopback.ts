import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import {
  failure,
  isJsonRpcRequest,
  JSON_RPC_ERRORS,
  WORKBENCH_METHODS,
  type JsonRpcRequest,
} from '../../../packages/workbench-protocol/src/index.js'
import { assertLoopbackAddress } from '../../../packages/workspace-service/src/path-security.js'
import type { WorkbenchService } from '../../../packages/workspace-service/src/service.js'

const MAX_BODY_BYTES = 1024 * 1024
const PAIRING_TTL_MS = 2 * 60 * 1000
const SESSION_TTL_MS = 15 * 60 * 1000
const APPLICATION_PROTOCOL = 'sysml-workbench.v1'

interface Session {
  tokenHash: Buffer
  csrfHash: Buffer
  origin: string
  expiresAt: number
}

export interface LoopbackServerOptions {
  service: WorkbenchService
  address?: '127.0.0.1' | '::1'
  port?: number
  allowedOrigins: string[]
  staticRoot?: string
  bootstrapWorkspaceFile?: string
}

export interface LoopbackServerHandle {
  address: string
  port: number
  secure: false
  pairingCode: string
  pairingExpiresAt: string
  close(): Promise<void>
}

export async function createLoopbackServer(
  options: LoopbackServerOptions,
): Promise<LoopbackServerHandle> {
  const address = options.address ?? '127.0.0.1'
  assertLoopbackAddress(address)
  if (options.allowedOrigins.length === 0) {
    throw new Error('At least one exact allowed Origin is required')
  }
  for (const origin of options.allowedOrigins) {
    validateOrigin(origin)
  }
  const staticRoot = options.staticRoot
    ? await realpath(options.staticRoot)
    : undefined

  const pairingCode = randomBytes(12).toString('base64url')
  const bootstrapWorkspaceHandle = options.bootstrapWorkspaceFile
    ? `workspace_${randomBytes(24).toString('base64url')}`
    : undefined
  const pairingExpiresAt = Date.now() + PAIRING_TTL_MS
  let pairingConsumed = false
  const sessions = new Map<string, Session>()
  const sockets = new Set<WebSocket>()
  const handleRequest = async (request: JsonRpcRequest) => {
    const resolved = resolveBootstrapWorkspace(
      request,
      bootstrapWorkspaceHandle,
      options.bootstrapWorkspaceFile,
    )
    if (!resolved) {
      return failure(
        request.id,
        JSON_RPC_ERRORS.workspaceRejected,
        'Workspace must be opened with the companion-issued handle',
      )
    }
    return options.service.handle(resolved)
  }

  const server = createServer(async (request, response) => {
    applySecurityHeaders(response)
    if (
      staticRoot &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      if (!validHost(request)) {
        respondJson(response, 403, { error: 'Host is not loopback' })
        return
      }
      await serveStatic(request, response, staticRoot)
      return
    }
    const origin = request.headers.origin
    if (!origin || !options.allowedOrigins.includes(origin)) {
      respondJson(response, 403, { error: 'Origin is not allowed' })
      return
    }
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')

    if (!validHost(request)) {
      respondJson(response, 403, { error: 'Host is not loopback' })
      return
    }
    if (request.method === 'OPTIONS') {
      if (
        request.headers['access-control-request-private-network'] === 'true'
      ) {
        response.setHeader('Access-Control-Allow-Private-Network', 'true')
        response.appendHeader(
          'Vary',
          'Access-Control-Request-Private-Network',
        )
      }
      response.setHeader(
        'Access-Control-Allow-Headers',
        'authorization, content-type, x-workbench-csrf',
      )
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method !== 'POST') {
      respondJson(response, 405, { error: 'Only POST is supported' })
      return
    }

    if (request.url === '/pair') {
      if (pairingConsumed) {
        respondJson(response, 410, { error: 'Pairing code already used' })
        return
      }
      if (Date.now() >= pairingExpiresAt) {
        respondJson(response, 410, { error: 'Pairing code expired' })
        return
      }
      const body = await readJson(request, response)
      if (!body) return
      if (!constantTimeTextEqual(body.pairingCode, pairingCode)) {
        respondJson(response, 401, { error: 'Invalid pairing code' })
        return
      }
      pairingConsumed = true
      const token = randomBytes(32).toString('base64url')
      const csrf = randomBytes(24).toString('base64url')
      const key = hash(token).toString('hex')
      const expiresAt = Date.now() + SESSION_TTL_MS
      sessions.set(key, {
        tokenHash: hash(token),
        csrfHash: hash(csrf),
        origin,
        expiresAt,
      })
      respondJson(response, 200, {
        token,
        csrf,
        expiresAt: new Date(expiresAt).toISOString(),
        workspaceHandle: bootstrapWorkspaceHandle,
      })
      return
    }

    if (request.url === '/rpc') {
      const session = authenticate(request, origin, sessions)
      if (!session) {
        respondJson(response, 401, { error: 'Invalid or expired session' })
        return
      }
      const csrf = request.headers['x-workbench-csrf']
      if (
        typeof csrf !== 'string' ||
        !safeBufferEqual(session.csrfHash, hash(csrf))
      ) {
        respondJson(response, 403, { error: 'Invalid CSRF token' })
        return
      }
      const body = await readJson(request, response)
      if (!body) return
      if (!isJsonRpcRequest(body)) {
        respondJson(
          response,
          400,
          failure(
            null,
            JSON_RPC_ERRORS.invalidRequest,
            'Invalid JSON-RPC request',
          ),
        )
        return
      }
      respondJson(
        response,
        200,
        await handleRequest(body),
      )
      return
    }

    respondJson(response, 404, { error: 'Not found' })
  })

  const webSockets = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) =>
      protocols.has(APPLICATION_PROTOCOL) ? APPLICATION_PROTOCOL : false,
  })

  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin
    const protocols = parseProtocols(request.headers['sec-websocket-protocol'])
    const encodedToken = protocols.find((protocol) => protocol.startsWith('auth.'))
    const token = encodedToken?.slice('auth.'.length)
    if (
      request.url !== '/rpc' ||
      !origin ||
      !options.allowedOrigins.includes(origin) ||
      !validHost(request) ||
      !protocols.includes(APPLICATION_PROTOCOL) ||
      !token ||
      !authenticateToken(token, origin, sessions)
    ) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSockets.emit('connection', webSocket, request)
    })
  })

  webSockets.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('message', async (data, isBinary) => {
      if (isBinary || rawDataByteLength(data) > MAX_BODY_BYTES) {
        socket.close(1009, 'Message too large')
        return
      }
      let request: unknown
      try {
        request = JSON.parse(data.toString())
      } catch {
        socket.send(
          JSON.stringify(
            failure(null, JSON_RPC_ERRORS.parseError, 'Invalid JSON'),
          ),
        )
        return
      }
      if (!isJsonRpcRequest(request)) {
        socket.send(
          JSON.stringify(
            failure(
              null,
              JSON_RPC_ERRORS.invalidRequest,
              'Invalid JSON-RPC request',
            ),
          ),
        )
        return
      }
      socket.send(JSON.stringify(await handleRequest(request)))
    })
  })

  await listen(server, options.port ?? 0, address)
  const bound = server.address() as AddressInfo
  return {
    address,
    port: bound.port,
    secure: false,
    pairingCode,
    pairingExpiresAt: new Date(pairingExpiresAt).toISOString(),
    close: async () => {
      for (const socket of sockets) socket.close(1001, 'Service shutting down')
      await new Promise<void>((resolveClose, rejectClose) =>
        webSockets.close((webSocketError) => {
          if (webSocketError) rejectClose(webSocketError)
          else resolveClose()
        }),
      )
      await closeServer(server)
    },
  }
}

function resolveBootstrapWorkspace(
  request: JsonRpcRequest,
  workspaceHandle: string | undefined,
  workspaceFile: string | undefined,
): JsonRpcRequest | null {
  if (!workspaceHandle || !workspaceFile) {
    return request
  }
  if (request.method !== WORKBENCH_METHODS.workspaceOpen) return request
  if (
    !request.params ||
    typeof request.params !== 'object' ||
    Array.isArray(request.params) ||
    !('workspaceFile' in request.params) ||
    request.params.workspaceFile !== workspaceHandle
  ) {
    return null
  }
  return {
    ...request,
    params: {
      ...request.params,
      workspaceFile,
    },
  }
}

function authenticate(
  request: IncomingMessage,
  origin: string,
  sessions: Map<string, Session>,
): Session | undefined {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authenticateToken(authorization.slice('Bearer '.length), origin, sessions)
}

function authenticateToken(
  token: string,
  origin: string,
  sessions: Map<string, Session>,
): Session | undefined {
  const tokenHash = hash(token)
  const session = sessions.get(tokenHash.toString('hex'))
  if (
    !session ||
    session.origin !== origin ||
    Date.now() >= session.expiresAt ||
    !safeBufferEqual(session.tokenHash, tokenHash)
  ) {
    return undefined
  }
  return session
}

function validHost(request: IncomingMessage): boolean {
  const host = request.headers.host
  if (!host) return false
  try {
    const url = new URL(`http://${host}`)
    return url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

function validateOrigin(origin: string): void {
  const parsed = new URL(origin)
  if (
    parsed.origin !== origin ||
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
  ) {
    throw new Error(`Allowed Origin must be an exact HTTP(S) origin: ${origin}`)
  }
}

async function readJson(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunkValue of request) {
    const chunk = Buffer.from(chunkValue)
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      respondJson(response, 413, { error: 'Request body too large' })
      return undefined
    }
    chunks.push(chunk)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('JSON body must be an object')
    }
    return value as Record<string, unknown>
  } catch {
    respondJson(response, 400, { error: 'Invalid JSON body' })
    return undefined
  }
}

function respondJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.writableEnded) return
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.writeHead(status)
  response.end(JSON.stringify(body))
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'none'")
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  staticRoot: string,
): Promise<void> {
  let pathname: string
  try {
    pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    pathname = decodeURIComponent(pathname)
  } catch {
    respondJson(response, 400, { error: 'Invalid static asset path' })
    return
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  if (
    relativePath.length === 0 ||
    relativePath.includes('\0') ||
    relativePath.split('/').some((segment) => segment === '..')
  ) {
    respondJson(response, 400, { error: 'Invalid static asset path' })
    return
  }
  const candidate = resolve(staticRoot, relativePath)
  if (!isWithin(staticRoot, candidate)) {
    respondJson(response, 403, { error: 'Static asset path escapes the UI root' })
    return
  }
  try {
    const canonical = await realpath(candidate)
    if (!isWithin(staticRoot, canonical) || !(await stat(canonical)).isFile()) {
      respondJson(response, 404, { error: 'Static asset not found' })
      return
    }
    const bytes = await readFile(canonical)
    applyStaticSecurityHeaders(response)
    response.setHeader(
      'Cache-Control',
      relativePath.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
    )
    response.setHeader(
      'Content-Type',
      contentType(canonical),
    )
    response.setHeader('Content-Length', String(bytes.byteLength))
    response.writeHead(200)
    response.end(request.method === 'HEAD' ? undefined : bytes)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      respondJson(response, 404, { error: 'Static asset not found' })
      return
    }
    throw error
  }
}

function applyStaticSecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'self' ws:",
      "font-src 'self' data:",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
    ].join('; '),
  )
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`))
}

function parseProtocols(header: string | string[] | undefined): string[] {
  const value = Array.isArray(header) ? header.join(',') : header ?? ''
  return value
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean)
}

function rawDataByteLength(data: RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.byteLength, 0)
  }
  return Buffer.byteLength(data as Buffer | ArrayBuffer)
}

function hash(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function constantTimeTextEqual(value: unknown, expected: string): boolean {
  if (typeof value !== 'string') return false
  return safeBufferEqual(hash(value), hash(expected))
}

function safeBufferEqual(left: Buffer, right: Buffer): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}

function listen(server: Server, port: number, address: string): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, address, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error)
      else resolveClose()
    })
  })
}
