import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

/**
 * Governing recovery and deployment records. Historical research, observations,
 * and superseded phase notes remain available, but only these files are allowed
 * to define current gate or delivery posture.
 */
const governedFiles = [
  'README.md',
  'docs/adr/ADR-001-language-reference-and-runtime-engine-selection.md',
  'docs/adr/ADR-003-client-service-and-deployment-architecture.md',
  'docs/adr/ADR-008-deployment-profiles.md',
  'docs/revamp/04-target-product-contract.md',
  'docs/revamp/15-deployment-and-access-strategy.md',
  'docs/revamp/23-phase4-product-shell-status.md',
  'docs/revamp/24-phase5-assurance-plan.md',
  'docs/revamp/25-phase5-gate-decision.md',
  'docs/revamp/26-phase6-controlled-ai-plan.md',
  'docs/revamp/27-phase6-gate-decision.md',
  'docs/revamp/34-web-companion-deployment.md',
  'docs/revamp/35-self-contained-companion-packaging.md',
  'docs/revamp/36-failed-attempt-postmortem.md',
  'docs/revamp/37-recovery-acceptance-contract.md',
  'docs/revamp/38-codex-recovery-execution-handoff.md',
] as const

const contents = Object.fromEntries(
  await Promise.all(
    governedFiles.map(async (path) => [
      path,
      await readFile(resolve(repositoryRoot, path), 'utf8'),
    ]),
  ),
) as Record<(typeof governedFiles)[number], string>

const failures: string[] = []

requireText(
  'README.md',
  'Recovery status: **pre-alpha technical foundation; not a production release**',
)
requireText(
  'docs/adr/ADR-003-client-service-and-deployment-architecture.md',
  'The recovery authoring client is a **VS Code extension**',
)
requireText(
  'docs/adr/ADR-008-deployment-profiles.md',
  '- Status: amended for recovery',
)
requireText(
  'docs/revamp/15-deployment-and-access-strategy.md',
  'Status: amended for recovery; production profile selection deferred',
)
requireText(
  'docs/revamp/23-phase4-product-shell-status.md',
  'Status: **invalidated as a product gate**',
)
requireText(
  'docs/revamp/24-phase5-assurance-plan.md',
  'Status: historical implementation plan; **P5 product-gate result invalidated**',
)
requireText(
  'docs/revamp/25-phase5-gate-decision.md',
  'Decision: **invalidated as a product gate**',
)
requireText(
  'docs/revamp/26-phase6-controlled-ai-plan.md',
  'Status: historical implementation plan; **P6 product-gate status withdrawn**',
)
requireText(
  'docs/revamp/27-phase6-gate-decision.md',
  'Decision: **product-gate status withdrawn; service safety evidence retained**',
)
requireText(
  'docs/revamp/34-web-companion-deployment.md',
  'production recommendation\nwithdrawn during recovery',
)
requireText(
  'docs/revamp/35-self-contained-companion-packaging.md',
  'release work frozen during\nrecovery',
)
requireText(
  'docs/revamp/37-recovery-acceptance-contract.md',
  '## Required evidence layers',
)
requireText(
  'docs/revamp/38-codex-recovery-execution-handoff.md',
  'Do not merge automatically.',
)

forbidAcrossGoverned('Gates P1-P6 provide:')
forbidAcrossGoverned('first-class local production authoring')
forbidAcrossGoverned('Gate P4 passes')
forbidAcrossGoverned('Gate P5 passed')
forbidAcrossGoverned('Gate P6 passes')
forbidText(
  'docs/revamp/25-phase5-gate-decision.md',
  'Decision: **pass**',
)

if (failures.length > 0) {
  throw new Error(
    `Recovery gate-truth validation failed:\n- ${failures.join('\n- ')}`,
  )
}

process.stdout.write(
  `${JSON.stringify({
    schemaVersion: 3,
    result: 'pass',
    recoveryState: 'pre-alpha',
    p4: 'invalidated',
    p5: 'invalidated',
    p6: 'service-safety-evidence-only',
    governedFiles: [...governedFiles],
  }, null, 2)}\n`,
)

function requireText(
  path: (typeof governedFiles)[number],
  expected: string,
): void {
  if (!contents[path].includes(expected)) {
    failures.push(`${path} is missing required text: ${expected}`)
  }
}

function forbidText(
  path: (typeof governedFiles)[number],
  prohibited: string,
): void {
  if (contents[path].includes(prohibited)) {
    failures.push(`${path} contains prohibited text: ${prohibited}`)
  }
}

function forbidAcrossGoverned(prohibited: string): void {
  for (const path of governedFiles) {
    forbidText(path, prohibited)
  }
}
