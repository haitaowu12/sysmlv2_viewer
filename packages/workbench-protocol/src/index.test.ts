// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  failure,
  isJsonRpcRequest,
  success,
  WORKBENCH_PROTOCOL_VERSION,
} from './index.js'

describe('Workbench Protocol', () => {
  it('recognizes bounded JSON-RPC requests', () => {
    expect(
      isJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'health/status',
      }),
    ).toBe(true)
    expect(
      isJsonRpcRequest({
        jsonrpc: '2.0',
        method: 'health/status',
      }),
    ).toBe(false)
    expect(WORKBENCH_PROTOCOL_VERSION).toMatch(/^0\.\d+\.\d+$/)
  })

  it('constructs deterministic response envelopes', () => {
    expect(success('request-1', { status: 'ok' })).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      result: { status: 'ok' },
    })
    expect(failure(1, -32602, 'invalid')).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'invalid' },
    })
  })
})
