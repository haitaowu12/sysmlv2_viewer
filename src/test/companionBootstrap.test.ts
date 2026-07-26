import { afterEach, describe, expect, it } from 'vitest'
import { consumeCompanionBootstrap } from '../workbench/companion-bootstrap.js'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('Pages companion bootstrap', () => {
  it('accepts a loopback service and scrubs the pairing fragment', () => {
    window.history.replaceState(
      null,
      '',
      '/sysmlv2_viewer/#service=http%3A%2F%2F127.0.0.1%3A4317&pairing=abcdefghijklmnop',
    )

    expect(
      consumeCompanionBootstrap(window.location, window.history),
    ).toEqual({
      serviceOrigin: 'http://127.0.0.1:4317',
      pairingCode: 'abcdefghijklmnop',
    })
    expect(window.location.pathname).toBe('/sysmlv2_viewer/')
    expect(window.location.hash).toBe('')
  })

  it('rejects a non-loopback service without scrubbing the evidence', () => {
    window.history.replaceState(
      null,
      '',
      '/sysmlv2_viewer/#service=https%3A%2F%2Fattacker.invalid&pairing=abcdefghijklmnop',
    )

    expect(() =>
      consumeCompanionBootstrap(window.location, window.history),
    ).toThrow('HTTP loopback origin')
    expect(window.location.hash).toContain('attacker.invalid')
  })

  it('rejects malformed pairing material', () => {
    window.history.replaceState(
      null,
      '',
      '/sysmlv2_viewer/#service=http%3A%2F%2F127.0.0.1%3A4317&pairing=too-short',
    )

    expect(() =>
      consumeCompanionBootstrap(window.location, window.history),
    ).toThrow('invalid pairing code')
  })
})
