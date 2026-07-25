import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createQualifiedHybridAdapter } from '../packages/language-adapter/src/index.js'
import { buildExplorerProjection } from '../packages/projection-engine/src/index.js'
import { SEMANTIC_RELATIONSHIP_KINDS } from '../packages/semantic-model/src/index.js'
import { WorkspaceManager } from '../packages/workspace-service/src/workspace.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const sourceFixture = resolve(repositoryRoot, 'fixtures/workspaces/phase2-semantic')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'sysml-workbench-phase2-'))
const fixtureRoot = resolve(temporaryRoot, 'phase2-semantic')
const reportPath = resolve(
  valueAfter('--output') ??
    resolve(repositoryRoot, 'docs/revamp/phase2-qualification-observation.json'),
)
const modes = [
  'containment',
  'type-hierarchy',
  'dependency',
  'neighbourhood',
  'requirements',
  'verification',
  'interfaces',
] as const

try {
  await cp(sourceFixture, fixtureRoot, { recursive: true })
  const adapter = await createQualifiedHybridAdapter(
    resolve(repositoryRoot, 'config/language-engine-candidates.json'),
    resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'),
    { requestTimeoutMs: 180_000, diagnosticSettleMs: 10_000 },
  )
  const manager = new WorkspaceManager({ allowedRoots: [fixtureRoot], adapter })
  try {
    const openStartedAt = performance.now()
    const status = await manager.open(resolve(fixtureRoot, 'sysml-workspace.yaml'))
    const openMs = Math.round(performance.now() - openStartedAt)
    const diagnostics = manager.diagnostics(status.workspaceId)
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      throw new Error('Phase 2 fixture produced authoritative errors')
    }
    const snapshotStartedAt = performance.now()
    const snapshot = await manager.semanticSnapshot(status.workspaceId)
    const snapshotMs = Math.round(performance.now() - snapshotStartedAt)
    const relationshipKinds = [...new Set(
      snapshot.relationships.map((relationship) => relationship.kind),
    )].sort()
    const missingKinds = SEMANTIC_RELATIONSHIP_KINDS.filter(
      (kind) => !relationshipKinds.includes(kind),
    )
    if (missingKinds.length > 0) {
      throw new Error(`Phase 2 fixture is missing relationship evidence: ${missingKinds.join(', ')}`)
    }
    const queries = []
    for (const mode of modes) {
      const startedAt = performance.now()
      const query = await manager.modelQuery(status.workspaceId, {
        schemaVersion: 1,
        roots: ['Phase2Assurance'],
        mode,
        depth: 6,
        maxResults: 1_000,
      })
      queries.push({
        mode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        elements: query.elements.length,
        relationships: query.relationships.length,
        truncated: query.truncated,
      })
    }
    const projection = buildExplorerProjection(snapshot, {
      roots: ['Phase2Assurance'],
      mode: 'containment',
      depth: 6,
    })
    await manager.close(status.workspaceId)
    const reopenStartedAt = performance.now()
    const reopened = await manager.open(resolve(fixtureRoot, 'sysml-workspace.yaml'))
    const reopenedSnapshot = await manager.semanticSnapshot(reopened.workspaceId)
    const reopenMs = Math.round(performance.now() - reopenStartedAt)
    const stableIds = snapshot.elements.map((element) => element.id).sort()
      .every((id, index) => id === reopenedSnapshot.elements.map((element) => element.id).sort()[index])
    if (!stableIds || snapshot.snapshotSha256 !== reopenedSnapshot.snapshotSha256) {
      throw new Error('Phase 2 snapshot or identities changed across clean reopen')
    }
    const runtimeLock = JSON.parse(
      await readFile(resolve(repositoryRoot, 'config/language-engine-runtime-lock.json'), 'utf8'),
    )
    const report = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      gate: 'P2',
      result: 'pass',
      runtimeLock,
      fixture: {
        id: status.workspaceId,
        documents: status.documentCount,
        diagnostics,
      },
      performance: { openMs, snapshotMs, reopenMs, queries },
      semantic: {
        snapshotSha256: snapshot.snapshotSha256,
        elements: snapshot.elements.length,
        relationships: snapshot.relationships.length,
        relationshipKinds,
        stableIdsAcrossReopen: stableIds,
      },
      projection: {
        mode: projection.mode,
        nodes: projection.nodes.length,
        edges: projection.edges.length,
        source: 'normalized-semantic-snapshot',
      },
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await manager.dispose()
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
