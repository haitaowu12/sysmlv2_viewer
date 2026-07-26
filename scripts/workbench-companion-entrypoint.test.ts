// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assertCompanionPackagingEntrypoint } from './workbench-companion-support.js'

describe('companion packaging entrypoint', () => {
  it('rejects the TypeScript implementation as a direct command', () => {
    expect(() =>
      assertCompanionPackagingEntrypoint(
        '/workspace/scripts/workbench-package-companion.ts',
      ),
    ).toThrow('Direct companion packaging is disabled')
  })

  it('rejects the compiled implementation as a direct command', () => {
    expect(() =>
      assertCompanionPackagingEntrypoint(
        'C:\\workspace\\scripts\\workbench-package-companion.js',
      ),
    ).toThrow('Direct companion packaging is disabled')
  })

  it('allows the guarded preflight wrapper and library tests', () => {
    expect(() =>
      assertCompanionPackagingEntrypoint(
        '/workspace/scripts/workbench-package-companion-safe.ts',
      ),
    ).not.toThrow()
    expect(() =>
      assertCompanionPackagingEntrypoint('/workspace/node_modules/vitest.mjs'),
    ).not.toThrow()
  })
})
