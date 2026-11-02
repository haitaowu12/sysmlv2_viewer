import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import { renderReport } from '../../report-engine/src/index.js'
import { BaselineRepository, readGitStatus } from './index.js'

const run = promisify(execFile)
const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('Git semantic baseline repository', () => {
  it('captures a clean commit and compares stable-identity semantic changes', async () => {
    const root = await repository()
    const baselines = new BaselineRepository(root)
    const before = snapshot('before', 'Engine', 'fingerprint-before')
    const manifest = await baselines.create({ id: 'design-review', snapshot: before, diagnostics: [], actor: 'configuration-manager', at: '2026-01-01T00:00:00.000Z', workbenchVersion: '0.5.0', rulePackVersion: '1.0.0' })
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/)
    const after = snapshot('after', 'Motor', 'fingerprint-after')
    const comparison = await baselines.compare('design-review', after, [{ uri: 'file:///pilot/model.sysml', severity: 'warning', code: 'NEW', message: 'new diagnostic' }])
    expect(comparison.semanticDiff.changes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'element-renamed', elementId: 'engine' })]))
    expect(comparison.diagnostics.introduced).toHaveLength(1)
    expect(comparison.semanticImpact?.affectedElements.map(e => e.elementId)).toEqual(['engine'])
  })

  it('captures lifecycle links and reports downstream artifact applicability after a design revision', async () => {
    const root = await repository()
    await mkdir(resolve(root, 'lifecycle'))
    const artifacts = [
      { id: 'design-drawing', kind: 'design-artifact', revision: 'A', configuration: 'default', modelElementIds: ['engine'], dependsOn: [] },
      { id: 'sat-observation', kind: 'test-observation', revision: 'historical-pass', configuration: 'default', modelElementIds: [], dependsOn: ['design-drawing'] },
    ]
    await writeFile(resolve(root, 'lifecycle/artifacts.json'), JSON.stringify({ schemaVersion: 1, artifacts }))
    await run('git', ['add', 'lifecycle/artifacts.json'], { cwd: root }); await run('git', ['commit', '-m', 'lifecycle register'], { cwd: root })
    const baselines = new BaselineRepository(root), model = snapshot('before', 'Engine', 'fingerprint')
    await baselines.create({ id: 'lifecycle-a', snapshot: model, diagnostics: [], actor: 'test', at: '2026-01-01T00:00:00Z', workbenchVersion: 'test', rulePackVersion: 'test' })
    artifacts[0]!.revision = 'B'
    await writeFile(resolve(root, 'lifecycle/artifacts.json'), JSON.stringify({ schemaVersion: 1, artifacts }))
    const comparison = await baselines.compare('lifecycle-a', model, [])
    expect(comparison.lifecycleReview?.changedArtifactIds).toEqual(['design-drawing'])
    expect(comparison.lifecycleReview?.artifactReviews.find(a => a.artifactId === 'sat-observation')?.status).toBe('applicability-review-required')
    expect((await baselines.get('lifecycle-a')).lifecycleArtifacts?.[0]?.revision).toBe('A')
    const report = await renderReport({ kind: 'semantic-change-impact', comparison, provenance: {
      workspace: { id: 'pilot', name: 'Pilot' }, commitSha: comparison.current.commit, snapshotSha256: model.snapshotSha256, configurationName: model.workspace.configurationName, baseline: 'lifecycle-a', languageRelease: 'test', workbenchVersion: 'test', rulePackVersion: 'test', viewConfiguration: null, generatedAt: '2026-01-01T00:00:00Z', unresolvedDiagnostics: 0, exclusions: [],
    } })
    expect(report.html).toContain('sat-observation'); expect(report.html).toContain('applicability-review-required')
    expect(report.pdf.length).toBeGreaterThan(100)
  })

  it('classifies working-tree source, review, and layout changes', async () => {
    const root = await repository()
    await mkdir(resolve(root, 'reviews')); await writeFile(resolve(root, 'reviews/RVW.json'), '{}')
    await mkdir(resolve(root, 'layouts')); await writeFile(resolve(root, 'layouts/view.json'), '{}')
    await writeFile(resolve(root, 'model.sysml'), 'package Changed {}')
    const status = await readGitStatus(root)
    expect(status.dirty).toBe(true)
    expect(status.changedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'model.sysml', category: 'source' }),
      expect.objectContaining({ path: 'reviews/RVW.json', category: 'review' }),
      expect.objectContaining({ path: 'layouts/view.json', category: 'layout' }),
    ]))
  })

  it('rejects baseline creation from a dirty tree', async () => {
    const root = await repository()
    await writeFile(resolve(root, 'model.sysml'), 'package Dirty {}')
    await expect(new BaselineRepository(root).create({ id: 'dirty', snapshot: snapshot('dirty', 'Engine', 'fingerprint'), diagnostics: [], actor: 'user', at: '2026-01-01T00:00:00.000Z', workbenchVersion: '0.5.0', rulePackVersion: '1.0.0' })).rejects.toThrow('clean Git working tree')
  })
})

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sysml-baseline-')); roots.push(root)
  await run('git', ['init', '-b', 'main'], { cwd: root })
  await run('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root })
  await run('git', ['config', 'user.name', 'Test'], { cwd: root })
  await writeFile(resolve(root, 'model.sysml'), 'package Pilot {}')
  await run('git', ['add', 'model.sysml'], { cwd: root })
  await run('git', ['commit', '-m', 'baseline'], { cwd: root })
  return root
}

function snapshot(hash: string, name: string, fingerprint: string): SemanticSnapshot {
  return {
    schemaVersion: 1, snapshotSha256: hash, workspace: { id: 'pilot', rootUri: 'file:///pilot', configurationName: 'default' }, authority: { adapterId: 'qualified', adapterVersion: '1', engineName: 'engine', engineVersion: '1', referenceRelease: '2026-05', qualificationStatus: 'qualified' }, freshness: 'current', documents: [],
    elements: [{ id: 'engine', kind: 'PartDefinition', rawKind: 'PartDefinition', name, qualifiedName: `Pilot::${name}`, source: { uri: 'file:///pilot/model.sysml', workspacePath: 'model.sysml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, documentSha256: 'doc' }, fingerprint, provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-semantic-evidence', classification: 'engine-metaclass', engineId: 'engine-id' } }], relationships: [],
  }
}
