// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { EngineSemanticEvidence, WorkspaceDocument } from '../../language-adapter/src/index.js'
import { executeModelQuery } from '../../query-engine/src/index.js'
import { buildExplorerProjection } from '../../projection-engine/src/index.js'
import {
  buildSemanticSnapshot,
  IdentityRegistry,
  SEMANTIC_RELATIONSHIP_KINDS,
} from './index.js'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const fixtureRoot = resolve(repositoryRoot, 'fixtures/workspaces/phase2-semantic')
const sourcePaths = [
  resolve(fixtureRoot, 'libraries/support.sysml'),
  resolve(fixtureRoot, 'model/assurance.sysml'),
]
const documents: WorkspaceDocument[] = sourcePaths.map((absolutePath) => ({
  uri: pathToFileURL(absolutePath).href,
  absolutePath,
  languageId: 'sysml',
  version: 1,
  text: readFileSync(absolutePath, 'utf8'),
  sha256: `fixture-${absolutePath.split('/').at(-1)}`,
}))
const rawEvidence = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, 'fixtures/language/golden/phase2-semantic-evidence.json'),
    'utf8',
  ),
) as EngineSemanticEvidence[]

describe('mandatory Phase 2 semantic golden', () => {
  it('reproduces all qualified relationship and query modes from source plus evidence', () => {
    const evidence = new Map(rawEvidence.map((value) => {
      const document = documents.find((item) =>
        value.uri.endsWith(item.absolutePath.endsWith('support.sysml')
          ? '/libraries/support.sysml'
          : '/model/assurance.sysml'),
      )!
      return [document.uri, { ...value, uri: document.uri }]
    }))
    const snapshot = buildSemanticSnapshot({
      status: {
        workspaceId: 'phase2-semantic',
        rootUri: pathToFileURL(fixtureRoot).href,
        configurationName: 'default',
        indexState: 'ready',
        semanticAuthority: 'qualified-engine',
        documentCount: documents.length,
        snapshotSha256: 'inventory',
        documents: documents.map((document) => ({
          uri: document.uri,
          languageId: document.languageId,
          sha256: document.sha256,
          byteLength: Buffer.byteLength(document.text),
        })),
        diagnostics: { errors: 0, warnings: 0, information: 0, hints: 0 },
        languageCapabilities: {
          workspaceLifecycle: true,
          diagnostics: true,
          documentSymbols: true,
          workspaceSymbols: true,
          definitions: true,
          references: true,
          completion: true,
          hover: true,
          semanticTokens: true,
          rename: true,
          formatting: true,
          semanticEvidence: true,
          semanticSnapshot: true,
        },
        capabilitiesFinal: true,
      },
      authority: {
        adapterId: 'golden-vinqut-pilot',
        adapterVersion: '0.2.0',
        engineName: 'VinQut/Pilot',
        engineVersion: '373dfb9+fa709f2',
        referenceRelease: '2026-05',
        qualificationStatus: 'qualified',
      },
      documents,
      evidence,
      identities: IdentityRegistry.empty('phase2-semantic'),
    })
    expect(new Set(snapshot.relationships.map((relationship) => relationship.kind))).toEqual(
      new Set(SEMANTIC_RELATIONSHIP_KINDS),
    )
    expect(snapshot.relationships.filter((relationship) =>
      relationship.kind === 'verification',
    )).toHaveLength(1)
    for (const mode of [
      'containment',
      'type-hierarchy',
      'neighbourhood',
      'requirements',
      'verification',
      'interfaces',
    ] as const) {
      const result = executeModelQuery(snapshot, {
        schemaVersion: 1,
        roots: ['Phase2Assurance'],
        mode,
        depth: 6,
        maxResults: 1_000,
      })
      expect(result.truncated).toBe(false)
      expect(result.elements.length).toBeGreaterThan(0)
    }
    expect(buildExplorerProjection(snapshot, {
      roots: ['Phase2Assurance'],
      mode: 'containment',
      depth: 6,
    }).nodes.length).toBeGreaterThan(10)
  })
})
