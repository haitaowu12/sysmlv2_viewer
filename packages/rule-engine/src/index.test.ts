import { describe, expect, it } from 'vitest'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'
import { evaluateAssurance, RULE_PACK_VERSION } from './index.js'

describe('engineering assurance rule pack', () => {
  it('reports requirement and interface gaps without inventing unavailable attributes', () => {
    const result = evaluateAssurance(snapshot())
    expect(result.rulePack.version).toBe(RULE_PACK_VERSION)
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      'REQ-UNSATISFIED', 'REQ-UNVERIFIED', 'IF-UNTYPED-ENDPOINT', 'IF-NO-REQUIREMENT-BASIS', 'IF-NO-VERIFICATION',
    ]))
    expect(result.requirementCoverage).toEqual([
      expect.objectContaining({ requirementId: 'requirement', satisfaction: 'none', verification: 'none' }),
    ])
    expect(result.interfaceRegister[0]).toMatchObject({ interfaceId: 'interface', unavailableAttributes: expect.arrayContaining(['direction', 'units', 'protocol']) })
    expect(result.limitations[0]).toContain('not present')
  })

  it('is byte-deterministic for the same semantic snapshot', () => {
    expect(evaluateAssurance(snapshot()).resultSha256).toBe(evaluateAssurance(snapshot()).resultSha256)
  })

  it('fails closed for stale or unqualified snapshots', () => {
    expect(() => evaluateAssurance({ ...snapshot(), freshness: 'stale' })).toThrow('current qualified')
    expect(() => evaluateAssurance({ ...snapshot(), authority: { ...snapshot().authority, qualificationStatus: 'control-only' } })).toThrow('current qualified')
  })
})

function snapshot(): SemanticSnapshot {
  const element = (id: string, kind: SemanticSnapshot['elements'][number]['kind'], ownerId?: string) => ({
    id, kind, rawKind: kind, name: id, qualifiedName: `Pilot::${id}`, ownerId,
    source: { uri: 'file:///pilot/model.sysml', workspacePath: 'model.sysml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, documentSha256: 'doc' },
    fingerprint: `fingerprint-${id}`,
    provenance: { authority: 'qualified-language-engine' as const, extraction: 'pilot-emf-semantic-evidence' as const, classification: 'engine-metaclass' as const, engineId: `engine-${id}` },
  })
  return {
    schemaVersion: 1,
    snapshotSha256: 'snapshot',
    workspace: { id: 'pilot', rootUri: 'file:///pilot', configurationName: 'default' },
    authority: { adapterId: 'qualified', adapterVersion: '1', engineName: 'engine', engineVersion: '1', referenceRelease: '2026-05', qualificationStatus: 'qualified' },
    freshness: 'current',
    documents: [{ uri: 'file:///pilot/model.sysml', languageId: 'sysml', sha256: 'doc', byteLength: 100 }],
    elements: [element('package', 'Package'), element('requirement', 'RequirementDefinition', 'package'), element('leftPort', 'PortUsage', 'package'), element('rightPort', 'PortUsage', 'package'), element('interface', 'InterfaceUsage', 'package')],
    relationships: [
      { id: 'rel-left', kind: 'interface', sourceId: 'interface', targetId: 'leftPort', provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-explicit-reference', engineMetaclass: 'InterfaceUsage', features: ['source'] } },
      { id: 'rel-right', kind: 'interface', sourceId: 'interface', targetId: 'rightPort', provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-explicit-reference', engineMetaclass: 'InterfaceUsage', features: ['target'] } },
    ],
  }
}
