// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pairLoopbackService } from './index.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('loopback pairing', () => {
  it('annotates the request as loopback Local Network Access', async () => {
    const result = {
      token: 'token',
      csrf: 'csrf',
      expiresAt: '2026-07-26T00:00:00.000Z',
      workspaceHandle: 'workspace-handle',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      pairLoopbackService('http://127.0.0.1:43117', 'pairing-code'),
    ).resolves.toEqual(result)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, request] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit & { targetAddressSpace?: string },
    ]
    expect(url.href).toBe('http://127.0.0.1:43117/pair')
    expect(request).toMatchObject({
      method: 'POST',
      targetAddressSpace: 'loopback',
      body: JSON.stringify({ pairingCode: 'pairing-code' }),
    })
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports an HTTP pairing failure without calling it a permission failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    )

    await expect(
      pairLoopbackService('http://127.0.0.1:43117', 'expired'),
    ).rejects.toThrow('Workbench pairing failed with HTTP 403')
  })

  it('turns a browser fetch failure into actionable recovery guidance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    await expect(
      pairLoopbackService('http://127.0.0.1:43117', 'pairing-code'),
    ).rejects.toThrow(
      'Allow this site to look for and connect to devices on your local network',
    )
  })

  it('times out with actionable Local Network Access guidance', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', abortablePendingFetch())

    const pairing = pairLoopbackService(
      'http://127.0.0.1:43117',
      'pairing-code',
      { timeoutMs: 1_000 },
    )
    const rejection = expect(pairing).rejects.toThrow(
      'Allow this site to look for and connect to devices on your local network',
    )
    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
  })

  it('preserves caller cancellation instead of reporting a permission failure', async () => {
    vi.stubGlobal('fetch', abortablePendingFetch())
    const controller = new AbortController()
    const reason = new Error('Pairing view closed')
    const pairing = pairLoopbackService(
      'http://127.0.0.1:43117',
      'pairing-code',
      { signal: controller.signal },
    )
    const rejection = expect(pairing).rejects.toBe(reason)

    controller.abort(reason)

    await rejection
  })
})

function abortablePendingFetch(): typeof fetch {
  return vi.fn((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason)
        return
      }
      init?.signal?.addEventListener(
        'abort',
        () => reject(init.signal?.reason),
        { once: true },
      )
    })) as typeof fetch
}
