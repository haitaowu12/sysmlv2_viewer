import { spawn, type ChildProcess } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

interface ServiceReady {
  event: 'workbench-service-ready'
  address: string
  port: number
  pairingCode: string
  pairingExpiresAt: string
}

const repositoryRoot = resolve(import.meta.dirname, '..')
const workspaceFile = await requireRegularFile(
  requiredValue('--workspace-file'),
)
const pagesUrl = new URL(
  valueAfter('--pages-url') ??
    process.env.SYSML_WORKBENCH_PAGES_URL ??
    'https://haitaowu12.github.io/sysmlv2_viewer/',
)
if (
  pagesUrl.protocol !== 'https:' &&
  !(
    pagesUrl.protocol === 'http:' &&
    (pagesUrl.hostname === '127.0.0.1' || pagesUrl.hostname === '[::1]')
  )
) {
  throw new Error('--pages-url must use HTTPS or an HTTP loopback origin')
}
pagesUrl.hash = ''
pagesUrl.search = ''

const preservationControl = process.argv.includes('--preservation-control')
if (!preservationControl) assertQualifiedRuntimeEnvironment()

const serviceEntry = resolve(
  valueAfter('--service-entry') ??
    resolve(
      repositoryRoot,
      'dist-workbench/apps/workbench-service/src/main.js',
    ),
)
await requireRegularFile(serviceEntry)

const serviceArguments = [
  serviceEntry,
  '--loopback',
  ...(!preservationControl ? ['--qualified-runtime'] : []),
  '--workspace-root',
  dirname(workspaceFile),
  '--workspace-file',
  workspaceFile,
  '--address',
  '127.0.0.1',
  '--port',
  '0',
  '--origin',
  pagesUrl.origin,
]
const service = spawn(process.execPath, serviceArguments, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: ['ignore', 'inherit', 'pipe'],
})

let stderrBuffer = ''
let ready = false
const timeout = setTimeout(() => {
  if (ready) return
  process.stderr.write(
    'Workbench companion did not become ready within 60 seconds.\n',
  )
  service.kill('SIGTERM')
}, 60_000)

service.stderr?.on('data', (chunk: Buffer) => {
  stderrBuffer += chunk.toString('utf8')
  const lines = stderrBuffer.split(/\r?\n/)
  stderrBuffer = lines.pop() ?? ''
  for (const line of lines) {
    const event = parseReadyEvent(line)
    if (!event) {
      process.stderr.write(`${line}\n`)
      continue
    }
    ready = true
    clearTimeout(timeout)
    void launchWorkbench(pagesUrl, event, process.argv.includes('--no-open'))
  }
})

forwardSignal('SIGINT', service)
forwardSignal('SIGTERM', service)

const exitCode = await new Promise<number>((resolveExit, reject) => {
  service.once('error', reject)
  service.once('exit', (code, signal) => {
    clearTimeout(timeout)
    if (stderrBuffer) process.stderr.write(stderrBuffer)
    if (signal) {
      process.stderr.write(`Workbench companion stopped by ${signal}.\n`)
      resolveExit(1)
      return
    }
    resolveExit(code ?? 1)
  })
})
process.exitCode = exitCode

async function launchWorkbench(
  target: URL,
  event: ServiceReady,
  noOpen: boolean,
): Promise<void> {
  const serviceOrigin = `http://${event.address}:${event.port}`
  target.hash = new URLSearchParams({
    service: serviceOrigin,
    pairing: event.pairingCode,
  }).toString()

  if (noOpen) {
    process.stdout.write(
      [
        'Workbench companion ready.',
        `Open: ${target.href}`,
        `Pairing expires: ${event.pairingExpiresAt}`,
        '',
      ].join('\n'),
    )
    return
  }

  await openExternal(target.href)
  process.stdout.write(
    [
      `Opened ${target.origin}${target.pathname}`,
      'The pairing secret was placed in the URL fragment and removed by the workbench after use.',
      'Keep this terminal open while using the workbench. Press Ctrl+C to stop the companion.',
      '',
    ].join('\n'),
  )
}

async function openExternal(url: string): Promise<void> {
  const command =
    process.platform === 'darwin'
      ? { file: 'open', arguments: [url] }
      : process.platform === 'win32'
        ? { file: 'cmd', arguments: ['/c', 'start', '', url] }
        : { file: 'xdg-open', arguments: [url] }
  const opener = spawn(command.file, command.arguments, {
    detached: true,
    stdio: 'ignore',
  })
  await new Promise<void>((resolveOpen, reject) => {
    opener.once('spawn', resolveOpen)
    opener.once('error', reject)
  })
  opener.unref()
}

function parseReadyEvent(line: string): ServiceReady | null {
  try {
    const value = JSON.parse(line) as Partial<ServiceReady>
    if (
      value.event === 'workbench-service-ready' &&
      typeof value.address === 'string' &&
      typeof value.port === 'number' &&
      typeof value.pairingCode === 'string' &&
      typeof value.pairingExpiresAt === 'string'
    ) {
      return value as ServiceReady
    }
  } catch {
    // Non-JSON service diagnostics are forwarded without interpretation.
  }
  return null
}

function assertQualifiedRuntimeEnvironment(): void {
  const required = [
    'SYSML_WORKBENCH_SEMANTIC_ARTIFACT',
    'SYSML_WORKBENCH_AUTHORING_ARTIFACT',
    'SYSML_WORKBENCH_VINQUT_COMMAND',
    'SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON',
    'SYSML_WORKBENCH_SPEC42_COMMAND',
    'SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON',
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Qualified companion runtime is not configured: ${missing.join(', ')}`,
    )
  }
}

function forwardSignal(
  signal: NodeJS.Signals,
  child: ChildProcess,
): void {
  process.once(signal, () => {
    child.kill(signal)
  })
}

async function requireRegularFile(path: string): Promise<string> {
  const canonical = await realpath(resolve(path))
  if (!(await stat(canonical)).isFile()) {
    throw new Error(`Expected a regular file: ${path}`)
  }
  return canonical
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function requiredValue(flag: string): string {
  const value = valueAfter(flag)
  if (!value) throw new Error(`${flag} is required`)
  return value
}
