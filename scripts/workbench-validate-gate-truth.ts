import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

const requiredFiles = [
  'README.md',
  'docs/revamp/23-phase4-product-shell-status.md',
  'docs/revamp/25-phase5-gate-decision.md',
  'docs/revamp/27-phase6-gate-decision.md',
  'docs/revamp/36-failed-attempt-postmortem.md',
  'docs/revamp/37-recovery-acceptance-contract.md',
  'docs/revamp/38-codex-recovery-execution-handoff.md',
] as const

const contents = Object.fromEntries(
  await Promise.all(
    requiredFiles.map(async (path) => [
      path,
      await readFile(resolve(repositoryRoot, path), 'utf8'),
    ]),
  ),
) as Record<(typeof requiredFiles)[number], string>

const failures: string[] = []

requireText(
  'README.md',
  'Recovery status: **pre-alpha technical foundation; not a production release**',
)
requireText(
  'docs/revamp/23-phase4-product-shell-status.md',
  'Status: **invalidated as a product gate**',
)
requireText(
  'docs/revamp/25-phase5-gate-decision.md',
  'Decision: **invalidated as a product gate**',
)
requireText(
  'docs/revamp/27-phase6-gate-decision.md',
  'Decision: **product-gate status withdrawn; service safety evidence retained**',
)
requireText(
  'docs/revamp/37-recovery-acceptance-contract.md',
  '## Required evidence layers',
)
requireText(
  'docs/revamp/38-codex-recovery-execution-handoff.md',
  'Do not merge automatically.',
)

forbidText('README.md', 'Gates P1-P6 provide:')
forbidText('README.md', 'first-class local production authoring')
forbidText(
  'docs/revamp/23-phase4-product-shell-status.md',
  'Gate P4 passes',
)
forbidText(
  'docs/revamp/25-phase5-gate-decision.md',
  'Decision: **pass**',
)
forbidText(
  'docs/revamp/27-phase6-gate-decision.md',
  'Gate P6 passes',
)

if (failures.length > 0) {
  throw new Error(
    `Recovery gate-truth validation failed:\n- ${failures.join('\n- ')}`,
  )
}

process.stdout.write(
  `${JSON.stringify({
    schemaVersion: 1,
    result: 'pass',
    recoveryState: 'pre-alpha',
    p4: 'invalidated',
    p5: 'invalidated',
    p6: 'service-safety-evidence-only',
    requiredFiles: [...requiredFiles],
  }, null, 2)}\n`,
)

function requireText(
  path: (typeof requiredFiles)[number],
  expected: string,
): void {
  if (!contents[path].includes(expected)) {
    failures.push(`${path} is missing required text: ${expected}`)
  }
}

function forbidText(
  path: (typeof requiredFiles)[number],
  prohibited: string,
): void {
  if (contents[path].includes(prohibited)) {
    failures.push(`${path} contains prohibited text: ${prohibited}`)
  }
}
