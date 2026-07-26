import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

export const RELEASE_EVIDENCE_TYPES = [
  'product-license',
  'runtime-license',
  'platform-qualification',
  'distribution-signing',
  'accessibility',
  'usability',
] as const

export type ReleaseEvidenceType = (typeof RELEASE_EVIDENCE_TYPES)[number]

export interface ReleaseApprovalContext {
  repositoryRoot: string
  manifestPath: string
  productName: string
  version: string
  platform: string
  sourceCommit: string
  runtimeArtifactSha256: string
  runtimeProvenanceSha256: string
  releaseArtifactSha256: string
}

export interface ValidatedEvidence {
  id: string
  type: ReleaseEvidenceType
  path: string
  sha256: string
  value: Record<string, unknown>
}

export interface ValidatedReleaseApproval {
  manifest: Record<string, unknown>
  evidence: ValidatedEvidence[]
}

const REQUIRED_PLATFORM_STEPS = [
  'installation',
  'workspaceOpen',
  'sourceEditPatch',
  'reportGeneration',
  'backupRestore',
  'interruptedCommandRecovery',
  'crashLogInspection',
  'uninstallRecovery',
] as const

const REQUIRED_ACCESSIBILITY_CHECKS = [
  'keyboardNavigation',
  'screenReader',
  'renderedContrast',
  'zoomAndScalableText',
  'focusOrder',
  'statusWithoutColor',
  'diagramAlternative',
  'reducedMotion',
] as const

export async function validateReleaseApproval(
  context: ReleaseApprovalContext,
): Promise<ValidatedReleaseApproval> {
  const repositoryRoot = await realpath(context.repositoryRoot)
  const requestedManifestPath = resolve(context.manifestPath)
  await assertRegularFile(requestedManifestPath, 'Release approval manifest')
  const manifestPath = await realpath(requestedManifestPath)
  assertWithin(repositoryRoot, manifestPath, 'Release approval manifest')
  const manifest = parseObject(
    JSON.parse(await readFile(manifestPath, 'utf8')),
    'Release approval manifest',
  )
  requireEqual(manifest.schemaVersion, 2, 'manifest.schemaVersion')
  requireEqual(manifest.status, 'approved', 'manifest.status')
  requireEqual(manifest.productName, context.productName, 'manifest.productName')
  requireEqual(manifest.version, context.version, 'manifest.version')
  requireEqual(manifest.sourceCommit, context.sourceCommit, 'manifest.sourceCommit')
  requireTimestamp(manifest.approvedAt, 'manifest.approvedAt')

  const qualifiedPlatforms = stringArray(
    manifest.qualifiedPlatforms,
    'manifest.qualifiedPlatforms',
  )
  if (!qualifiedPlatforms.includes(context.platform)) {
    throw new Error(`Release approval does not qualify ${context.platform}`)
  }
  if (new Set(qualifiedPlatforms).size !== qualifiedPlatforms.length) {
    throw new Error('manifest.qualifiedPlatforms contains duplicates')
  }
  const owner = parseObject(manifest.ownerApproval, 'manifest.ownerApproval')
  requireEqual(owner.approved, true, 'manifest.ownerApproval.approved')
  requireString(owner.owner, 'manifest.ownerApproval.owner')
  requireString(owner.role, 'manifest.ownerApproval.role')
  requireTimestamp(owner.approvedAt, 'manifest.ownerApproval.approvedAt')
  requireString(owner.statement, 'manifest.ownerApproval.statement')

  if (!Array.isArray(manifest.evidence) || manifest.evidence.length === 0) {
    throw new Error('manifest.evidence must contain evidence references')
  }
  const references = manifest.evidence.map((value, index) =>
    validateReference(value, index),
  )
  if (new Set(references.map((item) => item.id)).size !== references.length) {
    throw new Error('manifest.evidence ids must be unique')
  }
  const evidence = await Promise.all(
    references.map(async (reference) => {
      const path = resolve(repositoryRoot, reference.path)
      assertWithin(repositoryRoot, path, `Evidence ${reference.id}`)
      if (!reference.path.startsWith('release/evidence/')) {
        throw new Error(
          `Evidence ${reference.id} must be stored below release/evidence/`,
        )
      }
      await assertRegularFile(path, `Evidence ${reference.id}`)
      assertWithin(
        repositoryRoot,
        await realpath(path),
        `Evidence ${reference.id} real path`,
      )
      const bytes = await readFile(path)
      const actualSha256 = sha256(bytes)
      if (actualSha256 !== reference.sha256) {
        throw new Error(`Evidence hash mismatch: ${reference.id}`)
      }
      const value = parseObject(
        JSON.parse(bytes.toString('utf8')),
        `Evidence ${reference.id}`,
      )
      validateEvidenceBase(value, reference, context)
      validateEvidenceType(value, reference.type, context)
      return { ...reference, value }
    }),
  )

  requireSingleton(evidence, 'product-license')
  requireSingleton(evidence, 'runtime-license')
  requireSingleton(evidence, 'usability')
  const productLicense = evidence.find(
    (item) => item.type === 'product-license',
  )!
  const licensePath = resolve(
    repositoryRoot,
    requireString(productLicense.value.licensePath, 'product-license.licensePath'),
  )
  assertWithin(repositoryRoot, licensePath, 'Approved product license')
  await assertRegularFile(licensePath, 'Approved product license')
  assertWithin(
    repositoryRoot,
    await realpath(licensePath),
    'Approved product license real path',
  )
  requireEqual(
    sha256(await readFile(licensePath)),
    productLicense.value.licenseSha256,
    'product-license exact file hash',
  )
  const runtimeLicense = evidence.find(
    (item) => item.type === 'runtime-license',
  )!
  requireEqual(
    runtimeLicense.value.runtimeProvenanceSha256,
    context.runtimeProvenanceSha256,
    'runtime-license exact provenance report binding',
  )
  for (const platform of qualifiedPlatforms) {
    requirePlatformEvidence(evidence, 'platform-qualification', platform)
    requirePlatformEvidence(evidence, 'distribution-signing', platform)
    requirePlatformEvidence(evidence, 'accessibility', platform)
    const platformRecord = evidence.find(
      (item) =>
        item.type === 'platform-qualification' &&
        item.value.platform === platform,
    )!
    const signingRecord = evidence.find(
      (item) =>
        item.type === 'distribution-signing' &&
        item.value.platform === platform,
    )!
    requireEqual(
      platformRecord.value.artifactSha256,
      signingRecord.value.artifactSha256,
      `${platform}.artifactSha256 binding`,
    )
    if (platform === context.platform) {
      requireEqual(
        platformRecord.value.artifactSha256,
        context.releaseArtifactSha256,
        `${platform}.artifactSha256 exact release binding`,
      )
    }
  }
  return { manifest, evidence }
}

function validateReference(
  value: unknown,
  index: number,
): Omit<ValidatedEvidence, 'value'> {
  const reference = parseObject(value, `manifest.evidence[${index}]`)
  const id = requireString(reference.id, `manifest.evidence[${index}].id`)
  const type = requireString(
    reference.type,
    `manifest.evidence[${index}].type`,
  )
  if (!RELEASE_EVIDENCE_TYPES.includes(type as ReleaseEvidenceType)) {
    throw new Error(`Unsupported release evidence type: ${type}`)
  }
  const path = requireString(reference.path, `manifest.evidence[${index}].path`)
  if (
    path.startsWith('/') ||
    path.split('/').includes('..') ||
    !path.endsWith('.json')
  ) {
    throw new Error(`Unsafe release evidence path: ${path}`)
  }
  const digest = requireString(
    reference.sha256,
    `manifest.evidence[${index}].sha256`,
  )
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`Invalid evidence SHA-256: ${id}`)
  }
  return { id, type: type as ReleaseEvidenceType, path, sha256: digest }
}

function validateEvidenceBase(
  value: Record<string, unknown>,
  reference: Omit<ValidatedEvidence, 'value'>,
  context: ReleaseApprovalContext,
): void {
  requireEqual(value.schemaVersion, 1, `${reference.id}.schemaVersion`)
  requireEqual(value.evidenceType, reference.type, `${reference.id}.evidenceType`)
  requireEqual(value.status, 'passed', `${reference.id}.status`)
  requireEqual(value.productVersion, context.version, `${reference.id}.productVersion`)
  requireEqual(value.sourceCommit, context.sourceCommit, `${reference.id}.sourceCommit`)
  requireTimestamp(value.recordedAt, `${reference.id}.recordedAt`)
  requireString(value.assessor, `${reference.id}.assessor`)
}

function validateEvidenceType(
  value: Record<string, unknown>,
  type: ReleaseEvidenceType,
  context: ReleaseApprovalContext,
): void {
  switch (type) {
    case 'product-license': {
      requireEqual(value.approved, true, 'product-license.approved')
      requireString(value.spdxIdentifier, 'product-license.spdxIdentifier')
      requireEqual(value.licensePath, 'LICENSE', 'product-license.licensePath')
      requireDigest(value.licenseSha256, 'product-license.licenseSha256')
      requireString(value.approver, 'product-license.approver')
      requireTimestamp(value.approvedAt, 'product-license.approvedAt')
      return
    }
    case 'runtime-license': {
      requireEqual(value.approved, true, 'runtime-license.approved')
      requireEqual(
        value.runtimeArtifactSha256,
        context.runtimeArtifactSha256,
        'runtime-license.runtimeArtifactSha256',
      )
      requireDigest(
        value.runtimeProvenanceSha256,
        'runtime-license.runtimeProvenanceSha256',
      )
      requireString(
        value.noticeConflictDisposition,
        'runtime-license.noticeConflictDisposition',
      )
      requireString(value.reviewer, 'runtime-license.reviewer')
      requireTimestamp(value.approvedAt, 'runtime-license.approvedAt')
      return
    }
    case 'platform-qualification': {
      requireString(value.platform, 'platform-qualification.platform')
      requireDigest(value.artifactSha256, 'platform-qualification.artifactSha256')
      requireEqual(value.cleanMachine, true, 'platform-qualification.cleanMachine')
      requireEqual(
        value.networkIsolationVerified,
        true,
        'platform-qualification.networkIsolationVerified',
      )
      requireString(value.machineId, 'platform-qualification.machineId')
      const steps = parseObject(value.steps, 'platform-qualification.steps')
      for (const step of REQUIRED_PLATFORM_STEPS) {
        requireEqual(steps[step], 'passed', `platform-qualification.steps.${step}`)
      }
      requireEqual(
        value.openCriticalOrSeriousFindings,
        0,
        'platform-qualification.openCriticalOrSeriousFindings',
      )
      return
    }
    case 'distribution-signing': {
      const platform = requireString(
        value.platform,
        'distribution-signing.platform',
      )
      requireDigest(value.artifactSha256, 'distribution-signing.artifactSha256')
      requireEqual(
        value.signatureVerified,
        true,
        'distribution-signing.signatureVerified',
      )
      if (platform.startsWith('darwin-')) {
        requireEqual(value.notarized, true, 'distribution-signing.notarized')
      }
      requireString(value.signerIdentity, 'distribution-signing.signerIdentity')
      requireString(
        value.verificationCommand,
        'distribution-signing.verificationCommand',
      )
      return
    }
    case 'accessibility': {
      requireString(value.platform, 'accessibility.platform')
      const checks = parseObject(value.checks, 'accessibility.checks')
      for (const check of REQUIRED_ACCESSIBILITY_CHECKS) {
        requireEqual(checks[check], 'passed', `accessibility.checks.${check}`)
      }
      requireEqual(
        value.openCriticalOrSeriousFindings,
        0,
        'accessibility.openCriticalOrSeriousFindings',
      )
      requireString(value.assistiveTechnology, 'accessibility.assistiveTechnology')
      return
    }
    case 'usability': {
      if (!Array.isArray(value.participants) || value.participants.length < 3) {
        throw new Error('usability.participants must contain at least three records')
      }
      const participantIds = new Set<string>()
      for (const [index, participantValue] of value.participants.entries()) {
        const participant = parseObject(
          participantValue,
          `usability.participants[${index}]`,
        )
        const participantId = requireString(
          participant.id,
          `usability.participants[${index}].id`,
        )
        participantIds.add(participantId)
        requireEqual(
          participant.independent,
          true,
          `usability.participants[${index}].independent`,
        )
        if (!Array.isArray(participant.tasks) || participant.tasks.length !== 8) {
          throw new Error(
            `usability participant ${participantId} must contain eight tasks`,
          )
        }
        const taskIds = new Set<number>()
        for (const taskValue of participant.tasks) {
          const task = parseObject(taskValue, `usability participant ${participantId} task`)
          if (!Number.isInteger(task.id) || Number(task.id) < 1 || Number(task.id) > 8) {
            throw new Error(`usability participant ${participantId} has invalid task id`)
          }
          taskIds.add(Number(task.id))
          requireEqual(task.status, 'passed', `usability participant ${participantId} task status`)
          requireEqual(task.assisted, false, `usability participant ${participantId} task assisted`)
          if (
            typeof task.elapsedSeconds !== 'number' ||
            !Number.isFinite(task.elapsedSeconds) ||
            task.elapsedSeconds < 0
          ) {
            throw new Error(
              `usability participant ${participantId} task elapsedSeconds is invalid`,
            )
          }
        }
        if (taskIds.size !== 8) {
          throw new Error(`usability participant ${participantId} task ids are incomplete`)
        }
      }
      if (participantIds.size !== value.participants.length) {
        throw new Error('usability participant ids must be unique')
      }
      requireEqual(
        value.openCriticalOrSeriousFindings,
        0,
        'usability.openCriticalOrSeriousFindings',
      )
      return
    }
  }
}

function requireSingleton(
  evidence: ValidatedEvidence[],
  type: ReleaseEvidenceType,
): void {
  const count = evidence.filter((item) => item.type === type).length
  if (count !== 1) {
    throw new Error(`Release approval requires exactly one ${type} record`)
  }
}

function requirePlatformEvidence(
  evidence: ValidatedEvidence[],
  type: ReleaseEvidenceType,
  platform: string,
): void {
  const matches = evidence.filter(
    (item) => item.type === type && item.value.platform === platform,
  )
  if (matches.length !== 1) {
    throw new Error(
      `Release approval requires exactly one ${type} record for ${platform}`,
    )
  }
}

function parseObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new Error(`${label} must be a string array`)
  }
  return value as string[]
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}`)
  }
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireString(value, label)
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${label} must be a SHA-256`)
  }
  return digest
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label)
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} must be an ISO timestamp`)
  }
  return timestamp
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  try {
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must be a regular file`)
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      throw new Error(`${label} is missing`, { cause: error })
    }
    throw error
  }
}

function assertWithin(root: string, path: string, label: string): void {
  const pathFromRoot = relative(root, path)
  if (
    pathFromRoot === '' ||
    pathFromRoot === '..' ||
    pathFromRoot.startsWith('../') ||
    pathFromRoot.startsWith('..\\')
  ) {
    throw new Error(`${label} is outside the repository`)
  }
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}
