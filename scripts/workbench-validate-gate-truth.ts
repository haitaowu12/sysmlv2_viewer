import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

const requiredFiles = [
  'README.md',
  'docs/revamp/23-phase4-product-shell-status.md',
  'docs/revamp/24-phase5-assurance-plan.md',
  'docs/revamp/25-phase5-gate-decision.md',
  'docs/revamp/26-phase6-controlled-ai-plan.md',
  'docs/revamp/27-phase6-gate-decision.md',
  'docs/revamp/36-failed-attempt-postmortem.md',
  'docs/revamp/37-recovery-acceptance-contract.md',
  'docs/revamp/38-codex-recovery-execution-handoff.md',
]

const governedFiles = [
  'README.md',
  ...(await markdownFiles('docs/adr')),
  ...(await markdownFiles('docs/revamp')),
].sort()

const contents = Object.fromEntries(
  await Promise.all(
    governedFiles.map(async (path) => [
      path,
      await readFile(resolve(repositoryRoot, path), 'utf8'),
    ]),
  ),
) as Record<string, string>

const failures: string[] = []

for (const required of requiredFiles) {
  if (!(required in contents)) {
    failures.push(`Required recovery document is missing: ${required}`)
  }
}

requireText(
  'README.md',
  'Recovery status: **pre-alpha technical foundation; not a production release**',
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
    schemaVersion: 2,
    result: 'pass',
    recoveryState: 'pre-alpha',
    p4: 'invalidated',
    p5: 'invalidated',
    p6: 'service-safety-evidence-only',
    requiredFiles,
    governedMarkdownFiles: governedFiles.length,
  }, null, 2)}\n`,
)

async function markdownFiles(relativeRoot: string): Promise<string[]> {
  const entries = await readdir(resolve(repositoryRoot, relativeRoot), {
    withFileTypes: true,
  })
  const result: string[] = []
  for (const entry of entries) {
    const relativePath = `${relativeRoot}/${entry.name}`
    if (entry.isDirectory()) {
      result.push(...await markdownFiles(relativePath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(relativePath)
    }
  }
  return result
}

function requireText(path: string, expected: string): void {
  if (!contents[path]?.includes(expected)) {
    failures.push(`${path} is missing required text: ${expected}`)
  }
}

function forbidText(path: string, prohibited: string): void {
  if (contents[path]?.includes(prohibited)) {
    failures.push(`${path} contains prohibited text: ${prohibited}`)
  }
}

function forbidAcrossGoverned(prohibited: string): void {
  for (const path of governedFiles) {
    forbidText(path, prohibited)
  }
}
