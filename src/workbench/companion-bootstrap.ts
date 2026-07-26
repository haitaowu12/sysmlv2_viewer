export interface CompanionBootstrap {
  serviceOrigin: string
  pairingCode: string
}

export function consumeCompanionBootstrap(
  location: Location,
  history: History,
): CompanionBootstrap | null {
  const parameters = new URLSearchParams(location.hash.slice(1))
  const serviceOrigin = parameters.get('service')
  const pairingCode = parameters.get('pairing')
  if (!serviceOrigin || !pairingCode) return null

  const origin = new URL(serviceOrigin)
  if (
    origin.protocol !== 'http:' ||
    (origin.hostname !== '127.0.0.1' && origin.hostname !== '[::1]')
  ) {
    throw new Error('Companion bootstrap requires an HTTP loopback origin')
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(pairingCode)) {
    throw new Error('Companion bootstrap contains an invalid pairing code')
  }

  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}`,
  )
  return {
    serviceOrigin: origin.origin,
    pairingCode,
  }
}
