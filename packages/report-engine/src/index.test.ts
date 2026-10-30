import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AssuranceEvaluation } from '../../rule-engine/src/index.js'
import { renderReport, writeReportBundle, encodePdfText, type ReportRequest } from './index.js'

const assurance: AssuranceEvaluation = {
  schemaVersion: 1,
  rulePack: { id: 'sysml-workbench/engineering-assurance', version: '1.0.0' },
  snapshotSha256: 'a'.repeat(64),
  context: { workspaceId: 'pilot', configurationName: 'default', languageRelease: '2025-02' },
  resultSha256: 'b'.repeat(64),
  findings: [{
    id: 'finding:1',
    ruleId: 'IF-NO-VERIFICATION',
    ruleVersion: '1.0.0',
    domain: 'interface',
    severity: 'minor',
    statement: '<script>alert("unsafe")</script>',
    elementIds: ['element:interface'],
    relationshipIds: [],
    evidence: [],
    remediation: 'Add verification.',
  }],
  requirementCoverage: [{
    requirementId: 'element:req',
    qualifiedName: 'Pilot::REQ-1',
    satisfyingElementIds: ['element:design'],
    verificationElementIds: [],
    satisfaction: 'direct',
    verification: 'none',
  }],
  interfaceRegister: [{
    interfaceId: 'element:interface',
    qualifiedName: 'Pilot::Telemetry',
    kind: 'InterfaceUsage',
    ownerId: 'element:owner',
    ownerQualifiedName: 'Pilot',
    sourceEndpointIds: ['element:source'],
    targetEndpointIds: ['element:target'],
    endpointTypeIds: ['element:type'],
    exchangedItemIds: [],
    requirementIds: ['element:req'],
    verificationIds: [],
    sourcePath: 'model/pilot.sysml',
    unavailableAttributes: ['units'],
    openFindingIds: ['finding:1'],
  }],
  summary: { critical: 0, major: 0, minor: 1, advisory: 0, requirements: 1, interfaces: 1 },
  limitations: ['Units are unavailable.'],
}

function request(kind: ReportRequest['kind'] = 'interface-quality'): ReportRequest {
  return {
    kind,
    provenance: {
      workspace: { id: 'pilot', name: 'Pilot Workspace' },
      commitSha: 'a'.repeat(40),
      snapshotSha256: 'a'.repeat(64), configurationName: 'default',
      baseline: 'baseline-a',
      languageRelease: '2025-02',
      workbenchVersion: '0.6.0',
      rulePackVersion: '1.0.0',
      viewConfiguration: 'views/interface.yaml',
      generatedAt: '2026-07-25T12:00:00.000Z',
      unresolvedDiagnostics: 1,
      exclusions: ['Experimental metadata'],
    },
    assurance,
  }
}

describe('report engine', () => {
  it('does not equate trace links with execution readiness or passed verification', async () => {
    const input = request('verification-readiness')
    input.assurance = structuredClone(assurance)
    input.assurance.requirementCoverage[0]!.verification = 'direct'
    input.assurance.requirementCoverage[0]!.verificationElementIds = ['planned-case']
    const report = await renderReport(input)
    expect(report.html).not.toContain('<th scope="col">ready</th>')
    expect(report.html).toContain('traceLinksComplete')
    expect(report.html).toContain('not-assessed')
    expect(report.csv).toContain('executionReadiness')
    expect(report.csv).toContain('not-assessed')
  })

  it('rejects mixed report and evaluation provenance', async () => {
    for (const key of ['snapshotSha256', 'configurationName', 'rulePackVersion', 'languageRelease'] as const) {
      const input = request(); input.provenance[key] = 'different'
      expect(() => renderReport(input)).toThrow('evaluation context')
    }
    const input = request(); input.provenance.workspace.id = 'other'
    expect(() => renderReport(input)).toThrow('evaluation context')
  })

  it('encodes unsupported PDF characters reversibly rather than substituting question marks', () => {
    expect(encodePdfText('≤ ± °C Ω')).toBe('\\u{2264} \\u{B1} \\u{B0}C \\u{3A9}')
    expect(encodePdfText('literal \\u{2264}')).toBe('literal \\\\u{2264}')
  })

  it('escapes model content in deterministic HTML', async () => {
    const first = await renderReport(request())
    const second = await renderReport(request())
    expect(first.html).not.toContain('<script>')
    expect(first.html).toContain('&lt;script&gt;')
    expect(first.html).toBe(second.html)
    expect(first.contentSha256.html).toBe(second.contentSha256.html)
  })

  it('generates byte-deterministic PDF and stable CSV', async () => {
    const first = await renderReport(request('interface-register'))
    const second = await renderReport(request('interface-register'))
    expect(Buffer.from(first.pdf)).toEqual(Buffer.from(second.pdf))
    expect(first.csv).toBe(second.csv)
    expect(first.csv).toContain('Pilot::Telemetry')
    expect(first.contentSha256.pdf).toBe(second.contentSha256.pdf)
  })

  it('writes a manifest with verifiable artifact digests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sysml-report-'))
    await mkdir(join(root, 'model'))
    const manifest = await writeReportBundle(root, 'interface-quality-001', request())
    expect(manifest.artifacts.map((artifact) => artifact.format)).toEqual(['html', 'pdf'])
    const persisted = JSON.parse(await readFile(join(root, 'generated/reports/interface-quality-001/manifest.json'), 'utf8'))
    expect(persisted).toEqual(manifest)
    await expect(writeReportBundle(root, 'interface-quality-001', request())).rejects.toThrow('already exists')
    expect(manifest.provenance.commitSha).toBe('a'.repeat(40))
  })
})
