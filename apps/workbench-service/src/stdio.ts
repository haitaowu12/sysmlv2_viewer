import { createInterface } from 'node:readline'
import {
  failure,
  isJsonRpcRequest,
  JSON_RPC_ERRORS,
} from '../../../packages/workbench-protocol/src/index.js'
import type { WorkbenchService } from '../../../packages/workspace-service/src/service.js'

export async function runStdio(service: WorkbenchService): Promise<void> {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  for await (const line of input) {
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      write(
        failure(
          null,
          JSON_RPC_ERRORS.parseError,
          'Input must be one JSON-RPC request per line',
        ),
      )
      continue
    }
    if (!isJsonRpcRequest(value)) {
      write(
        failure(
          null,
          JSON_RPC_ERRORS.invalidRequest,
          'Invalid JSON-RPC request',
        ),
      )
      continue
    }
    write(await service.handle(value))
  }
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}
