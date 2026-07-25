import { createHash } from 'node:crypto'
import type { SemanticElement, SemanticSnapshot } from '../../semantic-model/src/index.js'

export const RULE_PACK_ID = 'sysml-workbench/engineering-assurance'
export const RULE_PACK_VERSION = '1.0.0'

export type AssuranceSeverity = 'critical' | 'major' | 'minor' | 'advisory'
export type AssuranceDomain = 'requirement' | 'verification' | 'interface' | 'dependency'

export interface AssuranceFinding {
  id: string
  ruleId: string
  ruleVersion: string
  domain: AssuranceDomain
  severity: AssuranceSeverity
  statement: string
  elementIds: string[]
  relationshipIds: string[]
  evidence: Array<{ key: string; value: string | number | boolean }>
  remediation: string
}

export interface RequirementCoverageRow {
  requirementId: string
  qualifiedName: string
  satisfyingElementIds: string[]
  verificationElementIds: string[]
  satisfaction: 'direct' | 'none'
  verification: 'direct' | 'none'
}

export interface InterfaceRegisterRow {
  interfaceId: string
  qualifiedName: string
  kind: SemanticElement['kind']
  ownerId: string | null
  ownerQualifiedName: string | null
  sourceEndpointIds: string[]
  targetEndpointIds: string[]
  endpointTypeIds: string[]
  exchangedItemIds: string[]
  requirementIds: string[]
  verificationIds: string[]
  sourcePath: string
  unavailableAttributes: string[]
  openFindingIds: string[]
}

export interface AssuranceEvaluation {
  schemaVersion: 1
  rulePack: { id: string; version: string }
  snapshotSha256: string
  resultSha256: string
  findings: AssuranceFinding[]
  requirementCoverage: RequirementCoverageRow[]
  interfaceRegister: InterfaceRegisterRow[]
  summary: {
    critical: number
    major: number
    minor: number
    advisory: number
    requirements: number
    interfaces: number
  }
  limitations: string[]
}

export function evaluateAssurance(snapshot: SemanticSnapshot): AssuranceEvaluation {
  if (snapshot.freshness !== 'current' || snapshot.authority.qualificationStatus !== 'qualified') {
    throw new Error('Assurance evaluation requires a current qualified semantic snapshot')
  }
  const requirementCoverage = buildRequirementCoverage(snapshot)
  const findings: AssuranceFinding[] = []
  for (const row of requirementCoverage) {
    if (row.satisfaction === 'none') {
      findings.push(finding('REQ-UNSATISFIED', 'requirement', 'major', `Requirement ${row.qualifiedName} has no direct satisfying element.`, [row.requirementId], [], [['satisfyingElements', 0]], 'Create or correct an explicit satisfy relationship.'))
    }
    if (row.verification === 'none') {
      findings.push(finding('REQ-UNVERIFIED', 'verification', 'major', `Requirement ${row.qualifiedName} has no direct verification relationship.`, [row.requirementId], [], [['verificationElements', 0]], 'Create or correct an explicit verification case relationship.'))
    }
  }
  const interfaceRegister = buildInterfaceRegister(snapshot)
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  for (const row of interfaceRegister) {
    if (!row.ownerId) {
      findings.push(finding('IF-MISSING-OWNER', 'interface', 'major', `Interface element ${row.qualifiedName} has no semantic owner.`, [row.interfaceId], [], [], 'Assign the interface element to an owning package or part.'))
    }
    const endpointIds = [...row.sourceEndpointIds, ...row.targetEndpointIds]
    if (endpointIds.length < 2 && (row.kind === 'InterfaceUsage' || row.kind === 'ConnectionUsage')) {
      findings.push(finding('IF-INCOMPLETE-ENDPOINTS', 'interface', 'critical', `Interface ${row.qualifiedName} does not resolve two endpoints.`, [row.interfaceId, ...endpointIds], [], [['resolvedEndpoints', endpointIds.length]], 'Resolve explicit source and target endpoints.'))
    }
    const untyped = endpointIds.filter((endpointId) => !hasOutgoing(snapshot, endpointId, 'typing'))
    for (const endpointId of untyped) {
      findings.push(finding('IF-UNTYPED-ENDPOINT', 'interface', 'major', `Endpoint ${byId.get(endpointId)?.qualifiedName ?? endpointId} has no resolved type.`, [row.interfaceId, endpointId], [], [], 'Assign a compatible port or item type.'))
    }
    if (row.requirementIds.length === 0) {
      findings.push(finding('IF-NO-REQUIREMENT-BASIS', 'interface', 'minor', `Interface ${row.qualifiedName} has no direct requirement basis.`, [row.interfaceId], [], [], 'Trace the interface or one of its endpoints to its governing requirement.'))
    }
    if (row.verificationIds.length === 0) {
      findings.push(finding('IF-NO-VERIFICATION', 'interface', 'minor', `Interface ${row.qualifiedName} has no directly traceable verification.`, [row.interfaceId], [], [], 'Trace an applicable verification case through the governing requirement.'))
    }
  }
  const sortedFindings = findings.sort((left, right) => left.id.localeCompare(right.id))
  for (const row of interfaceRegister) {
    row.openFindingIds = sortedFindings.filter((item) => item.elementIds.includes(row.interfaceId)).map((item) => item.id)
  }
  const resultWithoutHash = {
    schemaVersion: 1 as const,
    rulePack: { id: RULE_PACK_ID, version: RULE_PACK_VERSION },
    snapshotSha256: snapshot.snapshotSha256,
    findings: sortedFindings,
    requirementCoverage,
    interfaceRegister,
    summary: {
      critical: sortedFindings.filter((item) => item.severity === 'critical').length,
      major: sortedFindings.filter((item) => item.severity === 'major').length,
      minor: sortedFindings.filter((item) => item.severity === 'minor').length,
      advisory: sortedFindings.filter((item) => item.severity === 'advisory').length,
      requirements: requirementCoverage.length,
      interfaces: interfaceRegister.length,
    },
    limitations: [
      'Direction, units, protocol, capacity, timing, operating modes, failure behaviour, safety, security, status, and assumptions are not present in the normalized semantic profile and are reported as unavailable rather than inferred.',
      'Coverage is direct semantic coverage; indirect satisfaction and verification paths are not claimed by this rule-pack version.',
    ],
  }
  return { ...resultWithoutHash, resultSha256: sha256(stableJson(resultWithoutHash)) }
}

function buildRequirementCoverage(snapshot: SemanticSnapshot): RequirementCoverageRow[] {
  return snapshot.elements
    .filter((element) => element.kind === 'RequirementDefinition' || element.kind === 'RequirementUsage')
    .map((requirement) => ({
      requirementId: requirement.id,
      qualifiedName: requirement.qualifiedName,
      satisfyingElementIds: incomingSources(snapshot, requirement.id, 'satisfaction'),
      verificationElementIds: incomingSources(snapshot, requirement.id, 'verification'),
      satisfaction: incomingSources(snapshot, requirement.id, 'satisfaction').length ? 'direct' as const : 'none' as const,
      verification: incomingSources(snapshot, requirement.id, 'verification').length ? 'direct' as const : 'none' as const,
    }))
    .sort((left, right) => left.requirementId.localeCompare(right.requirementId))
}

function buildInterfaceRegister(snapshot: SemanticSnapshot): InterfaceRegisterRow[] {
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]))
  const interfaceKinds = new Set<SemanticElement['kind']>(['InterfaceUsage', 'InterfaceDefinition', 'ConnectionUsage', 'ConnectionDefinition', 'FlowUsage', 'FlowDefinition'])
  return snapshot.elements.filter((element) => interfaceKinds.has(element.kind)).map((element) => {
    const interfaceLinks = snapshot.relationships.filter((relationship) => relationship.kind === 'interface' && relationship.sourceId === element.id)
    const connectionLinks = snapshot.relationships.filter((relationship) => relationship.kind === 'connection' && (relationship.sourceId === element.id || relationship.targetId === element.id))
    const endpointIds = [...new Set([
      ...interfaceLinks.map((relationship) => relationship.targetId),
      ...connectionLinks.flatMap((relationship) => [relationship.sourceId, relationship.targetId]).filter((id) => id !== element.id),
    ])].sort()
    const flowLinks = snapshot.relationships.filter((relationship) => relationship.kind === 'flow' && (endpointIds.includes(relationship.sourceId) || endpointIds.includes(relationship.targetId)))
    const requirementIds = [...new Set([
      ...incomingTargets(snapshot, element.id, 'satisfaction'),
      ...endpointIds.flatMap((id) => incomingTargets(snapshot, id, 'satisfaction')),
    ])].sort()
    const verificationIds = [...new Set(requirementIds.flatMap((id) => incomingSources(snapshot, id, 'verification')))].sort()
    const endpointTypeIds = [...new Set(endpointIds.flatMap((id) => outgoingTargets(snapshot, id, 'typing')))].sort()
    return {
      interfaceId: element.id,
      qualifiedName: element.qualifiedName,
      kind: element.kind,
      ownerId: element.ownerId ?? null,
      ownerQualifiedName: element.ownerId ? byId.get(element.ownerId)?.qualifiedName ?? null : null,
      sourceEndpointIds: interfaceLinks.slice(0, 1).map((relationship) => relationship.targetId),
      targetEndpointIds: interfaceLinks.slice(1).map((relationship) => relationship.targetId),
      endpointTypeIds,
      exchangedItemIds: [...new Set(flowLinks.flatMap((relationship) => [relationship.sourceId, relationship.targetId]).filter((id) => !endpointIds.includes(id)))].sort(),
      requirementIds,
      verificationIds,
      sourcePath: element.source.workspacePath,
      unavailableAttributes: ['direction', 'units', 'protocol', 'rateCapacity', 'timing', 'operatingModes', 'failureBehaviour', 'safety', 'security', 'status', 'assumptions'],
      openFindingIds: [],
    }
  }).sort((left, right) => left.interfaceId.localeCompare(right.interfaceId))
}

function finding(ruleId: string, domain: AssuranceDomain, severity: AssuranceSeverity, statement: string, elementIds: string[], relationshipIds: string[], evidenceEntries: Array<[string, string | number | boolean]>, remediation: string): AssuranceFinding {
  const evidence = evidenceEntries.map(([key, value]) => ({ key, value }))
  const identity = stableJson({ ruleId, elementIds: [...elementIds].sort(), relationshipIds: [...relationshipIds].sort(), evidence })
  return { id: `finding:${sha256(identity).slice(0, 24)}`, ruleId, ruleVersion: RULE_PACK_VERSION, domain, severity, statement, elementIds: [...new Set(elementIds)].sort(), relationshipIds: [...new Set(relationshipIds)].sort(), evidence, remediation }
}

function incomingSources(snapshot: SemanticSnapshot, targetId: string, kind: SemanticSnapshot['relationships'][number]['kind']): string[] { return snapshot.relationships.filter((item) => item.kind === kind && item.targetId === targetId).map((item) => item.sourceId).sort() }
function incomingTargets(snapshot: SemanticSnapshot, sourceId: string, kind: SemanticSnapshot['relationships'][number]['kind']): string[] { return snapshot.relationships.filter((item) => item.kind === kind && item.sourceId === sourceId).map((item) => item.targetId).sort() }
function outgoingTargets(snapshot: SemanticSnapshot, sourceId: string, kind: SemanticSnapshot['relationships'][number]['kind']): string[] { return snapshot.relationships.filter((item) => item.kind === kind && item.sourceId === sourceId).map((item) => item.targetId).sort() }
function hasOutgoing(snapshot: SemanticSnapshot, sourceId: string, kind: SemanticSnapshot['relationships'][number]['kind']): boolean { return snapshot.relationships.some((item) => item.kind === kind && item.sourceId === sourceId) }
function stableJson(value: unknown): string { return JSON.stringify(sortValue(value)) }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)])); return value }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
