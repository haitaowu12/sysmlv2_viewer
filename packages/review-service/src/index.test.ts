import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import { ReviewRepository } from './index.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('model-anchored review repository', () => {
  it('persists a baseline-scoped review and explicit finding lifecycle', async () => {
    const root = await workspace()
    const repository = new ReviewRepository(root)
    await repository.create({ id: 'RVW-2026-001', title: 'Interface review', baseline: 'git:abc123', scope: { viewId: 'interface-review' }, actor: 'chair', at: '2026-01-01T00:00:00.000Z' }, snapshot())
    const withFinding = await repository.addFinding('RVW-2026-001', { id: 'F-001', elementId: 'interface', severity: 'major', category: 'interface', statement: 'Endpoint typing is incomplete.', owner: 'interface-owner', actor: 'reviewer', at: '2026-01-02T00:00:00.000Z' }, snapshot())
    expect(withFinding.status).toBe('in-review')
    expect(withFinding.findings[0]).toMatchObject({ disposition: 'open', anchorFingerprint: 'fingerprint-interface' })
    const disposed = await repository.dispositionFinding('RVW-2026-001', 'F-001', { disposition: 'accepted', response: 'Correction approved.', actor: 'owner', at: '2026-01-03T00:00:00.000Z' })
    expect(disposed.findings[0]?.history.at(-1)).toMatchObject({ from: 'open', to: 'accepted' })
    const closed = await repository.close('RVW-2026-001', { actor: 'chair', at: '2026-01-04T00:00:00.000Z' })
    expect(closed.status).toBe('closed')
    expect(JSON.parse(await readFile(resolve(root, 'reviews/RVW-2026-001.json'), 'utf8'))).toMatchObject({ status: 'closed' })
  })

  it('detects changed and deleted stable anchors', async () => {
    const root = await workspace()
    const repository = new ReviewRepository(root)
    await repository.create({ id: 'RVW-STALE', title: 'Stale review', baseline: 'git:base', scope: { query: { schemaVersion: 1, mode: 'interfaces' } }, actor: 'chair', at: '2026-01-01T00:00:00.000Z' }, snapshot())
    await repository.addFinding('RVW-STALE', { id: 'F-CHANGED', elementId: 'interface', severity: 'major', category: 'interface', statement: 'Review anchor.', actor: 'reviewer', at: '2026-01-02T00:00:00.000Z' }, snapshot())
    expect(await repository.staleness('RVW-STALE', { ...snapshot(), elements: snapshot().elements.map((element) => element.id === 'interface' ? { ...element, fingerprint: 'changed' } : element) })).toEqual({ reviewId: 'RVW-STALE', stale: [{ findingId: 'F-CHANGED', reason: 'anchor-changed', elementId: 'interface' }] })
    expect((await repository.staleness('RVW-STALE', { ...snapshot(), elements: [] })).stale[0]?.reason).toBe('anchor-deleted')
  })

  it('rejects invalid identifiers, anchors, and premature closure', async () => {
    const root = await workspace()
    const repository = new ReviewRepository(root)
    await expect(repository.create({ id: '../escape', title: 'bad', baseline: 'git:a', scope: { viewId: 'v' }, actor: 'chair', at: '2026-01-01T00:00:00.000Z' }, snapshot())).rejects.toThrow('uppercase identifier')
    await repository.create({ id: 'RVW-VALID', title: 'valid', baseline: 'git:a', scope: { viewId: 'v' }, actor: 'chair', at: '2026-01-01T00:00:00.000Z' }, snapshot())
    await expect(repository.addFinding('RVW-VALID', { id: 'F-001', elementId: 'missing', severity: 'major', category: 'quality', statement: 'bad', actor: 'reviewer', at: '2026-01-02T00:00:00.000Z' }, snapshot())).rejects.toThrow('Unknown finding')
    await repository.addFinding('RVW-VALID', { id: 'F-002', elementId: 'interface', severity: 'major', category: 'quality', statement: 'open', actor: 'reviewer', at: '2026-01-02T00:00:00.000Z' }, snapshot())
    await expect(repository.close('RVW-VALID', { actor: 'chair', at: '2026-01-03T00:00:00.000Z' })).rejects.toThrow('open findings')
  })
})

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'sysml-review-')); roots.push(root); return root }
function snapshot(): SemanticSnapshot {
  return {
    schemaVersion: 1, snapshotSha256: 'snapshot', workspace: { id: 'pilot', rootUri: 'file:///pilot', configurationName: 'default' },
    authority: { adapterId: 'qualified', adapterVersion: '1', engineName: 'engine', engineVersion: '1', referenceRelease: '2026-05', qualificationStatus: 'qualified' }, freshness: 'current', documents: [],
    elements: [{ id: 'interface', kind: 'InterfaceUsage', rawKind: 'InterfaceUsage', name: 'interface', qualifiedName: 'Pilot::interface', source: { uri: 'file:///pilot/model.sysml', workspacePath: 'model.sysml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, documentSha256: 'doc' }, fingerprint: 'fingerprint-interface', provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-semantic-evidence', classification: 'engine-metaclass', engineId: 'engine-interface' } }], relationships: [],
  }
}
