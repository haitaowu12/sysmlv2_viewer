import { resolve } from 'node:path'
import {
  createCandidateAdapter,
  createQualifiedHybridAdapter,
  PreservationControlAdapter,
  type LanguageAdapter,
} from '../../../packages/language-adapter/src/index.js'
import { WorkbenchService } from '../../../packages/workspace-service/src/service.js'
import { createLoopbackServer } from './loopback.js'
import { runStdio } from './stdio.js'

interface CliOptions {
  transport: 'stdio' | 'loopback'
  workspaceRoots: string[]
  origins: string[]
  address: '127.0.0.1' | '::1'
  port: number
  candidate?: string
  candidateManifest: string
  qualifiedRuntime: boolean
  runtimeLock: string
  staticRoot?: string
}

const options = parseArguments(process.argv.slice(2))
const adapter: LanguageAdapter = options.qualifiedRuntime
  ? await createQualifiedHybridAdapter(
      options.candidateManifest,
      options.runtimeLock,
    )
  : options.candidate
    ? await createCandidateAdapter(options.candidateManifest, options.candidate)
    : new PreservationControlAdapter()
const service = new WorkbenchService({
  adapter,
  allowedRoots: options.workspaceRoots,
  transport: {
    kind: options.transport,
    secure: options.transport === 'stdio',
  },
})

let shuttingDown = false
async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  await service.dispose()
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)))
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)))

if (options.transport === 'stdio') {
  await runStdio(service)
  await shutdown()
} else {
  const server = await createLoopbackServer({
    service,
    address: options.address,
    port: options.port,
    allowedOrigins: options.origins,
    staticRoot: options.staticRoot,
  })
  process.stderr.write(
    `${JSON.stringify({
      event: 'workbench-service-ready',
      address: server.address,
      port: server.port,
      secure: server.secure,
      pairingCode: server.pairingCode,
      pairingExpiresAt: server.pairingExpiresAt,
    })}\n`,
  )
  process.once('SIGINT', () => void server.close())
  process.once('SIGTERM', () => void server.close())
}

function parseArguments(argumentsList: string[]): CliOptions {
  let transport: CliOptions['transport'] = 'stdio'
  let address: CliOptions['address'] = '127.0.0.1'
  let port = 0
  let candidate: string | undefined
  let qualifiedRuntime = false
  let candidateManifest = resolve(
    import.meta.dirname,
    '../../../config/language-engine-candidates.json',
  )
  let runtimeLock = resolve(
    import.meta.dirname,
    '../../../config/language-engine-runtime-lock.json',
  )
  let staticRoot: string | undefined
  const workspaceRoots: string[] = []
  const origins: string[] = []

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === '--stdio') transport = 'stdio'
    else if (argument === '--loopback') transport = 'loopback'
    else if (argument === '--workspace-root') {
      workspaceRoots.push(resolve(requireArgument(argumentsList, ++index, argument)))
    } else if (argument === '--origin') {
      origins.push(requireArgument(argumentsList, ++index, argument))
    } else if (argument === '--address') {
      const value = requireArgument(argumentsList, ++index, argument)
      if (value !== '127.0.0.1' && value !== '::1') {
        throw new Error('--address must be 127.0.0.1 or ::1')
      }
      address = value
    } else if (argument === '--port') {
      port = Number.parseInt(requireArgument(argumentsList, ++index, argument), 10)
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error('--port must be an integer from 0 to 65535')
      }
    } else if (argument === '--candidate') {
      candidate = requireArgument(argumentsList, ++index, argument)
    } else if (argument === '--qualified-runtime') {
      qualifiedRuntime = true
    } else if (argument === '--candidate-manifest') {
      candidateManifest = resolve(
        requireArgument(argumentsList, ++index, argument),
      )
    } else if (argument === '--runtime-lock') {
      runtimeLock = resolve(
        requireArgument(argumentsList, ++index, argument),
      )
    } else if (argument === '--static-root') {
      staticRoot = resolve(requireArgument(argumentsList, ++index, argument))
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (workspaceRoots.length === 0) {
    throw new Error('At least one --workspace-root is required')
  }
  if (candidate && qualifiedRuntime) {
    throw new Error('--candidate and --qualified-runtime are mutually exclusive')
  }
  if (transport === 'loopback' && origins.length === 0) {
    throw new Error('Loopback transport requires at least one exact --origin')
  }
  return {
    transport,
    workspaceRoots,
    origins,
    address,
    port,
    candidate,
    candidateManifest,
    qualifiedRuntime,
    runtimeLock,
    staticRoot,
  }
}

function requireArgument(
  argumentsList: string[],
  index: number,
  flag: string,
): string {
  const value = argumentsList[index]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
