import { resolve } from 'node:path'
import { verifyCompanionPortablePreflight } from './workbench-companion-preflight.js'

const portableBundle = valueAfter('--portable-bundle')
if (!portableBundle) {
  throw new Error('--portable-bundle is required')
}

await verifyCompanionPortablePreflight(resolve(portableBundle))
await import('./workbench-package-companion.js')

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}
