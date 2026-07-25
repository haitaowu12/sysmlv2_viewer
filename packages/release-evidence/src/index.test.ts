// @vitest-environment node
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  validateReleaseApproval,
  type ReleaseApprovalContext,
  type ReleaseEvidenceType,
} from './index.js'

const temporaryDirectories: string[] = []
const sourceCommit = 'c'.repeat(40)
const runtimeArtifactSha256 = 'd'.repeat(64)
const runtimeProvenanceSha256 = 'f'.repeat(64)
const releaseArtifactSha256 = 'e'.repeat(64)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

describe('release approval evidence contract', () => {
  it('accepts exact, hashed evidence covering every production gate', async () => {
    const fixture = await releaseFixture()
    const result = await validateReleaseApproval(fixture.context)
    expect(result.evidence).toHaveLength(6)
    expect(result.evidence.map((item) => item.type).sort()).toEqual([
      'accessibility',
      'distribution-signing',
      'platform-qualification',
      'product-license',
      'runtime-license',
      'usability',
    ])
  })

  it('rejects evidence changed after owner approval', async () => {
    const fixture = await releaseFixture()
    await writeFile(
      resolve(fixture.root, fixture.evidencePaths[0]!),
      '{"tampered":true}\n',
      'utf8',
    )
    await expect(
      validateReleaseApproval(fixture.context),
    ).rejects.toThrow('Evidence hash mismatch')
  })

  it('rejects an assisted usability task', async () => {
    const fixture = await releaseFixture({
      usabilityTaskOverride: { assisted: true },
    })
    await expect(
      validateReleaseApproval(fixture.context),
    ).rejects.toThrow('task assisted must equal false')
  })

  it('rejects approval for a different release archive', async () => {
    const fixture = await releaseFixture()
    await expect(
      validateReleaseApproval({
        ...fixture.context,
        releaseArtifactSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('artifactSha256 exact release binding')
  })

  it('rejects symlinked evidence even when the target is local', async () => {
    const fixture = await releaseFixture()
    const evidencePath = resolve(fixture.root, fixture.evidencePaths[0]!)
    const linkedPath = resolve(fixture.root, 'release/evidence/linked.json')
    await writeFile(linkedPath, '{"local":true}\n', 'utf8')
    await unlink(evidencePath)
    await symlink(linkedPath, evidencePath)
    await expect(
      validateReleaseApproval(fixture.context),
    ).rejects.toThrow('must be a regular file')
  })
})

async function releaseFixture(options: {
  usabilityTaskOverride?: Record<string, unknown>
} = {}): Promise<{
  root: string
  context: ReleaseApprovalContext
  evidencePaths: string[]
}> {
  const root = await mkdtemp(join(tmpdir(), 'release-evidence-'))
  temporaryDirectories.push(root)
  const evidenceRoot = resolve(root, 'release/evidence/0.7.0-rc.1')
  await mkdir(evidenceRoot, { recursive: true })
  const license = 'Approved product license\n'
  await writeFile(resolve(root, 'LICENSE'), license, 'utf8')
  const base = {
    schemaVersion: 1,
    status: 'passed',
    productVersion: '0.7.0-rc.1',
    sourceCommit,
    recordedAt: '2026-07-25T23:30:00.000Z',
    assessor: 'qualification-team',
  }
  const records: Array<{
    id: string
    type: ReleaseEvidenceType
    value: Record<string, unknown>
  }> = [
    {
      id: 'product-license',
      type: 'product-license',
      value: {
        ...base,
        evidenceType: 'product-license',
        approved: true,
        spdxIdentifier: 'Apache-2.0',
        licensePath: 'LICENSE',
        licenseSha256: sha256(license),
        approver: 'owner',
        approvedAt: '2026-07-25T23:31:00.000Z',
      },
    },
    {
      id: 'runtime-license',
      type: 'runtime-license',
      value: {
        ...base,
        evidenceType: 'runtime-license',
        approved: true,
        runtimeArtifactSha256,
        runtimeProvenanceSha256,
        noticeConflictDisposition: 'Reviewed and approved notice set.',
        reviewer: 'qualified-reviewer',
        approvedAt: '2026-07-25T23:32:00.000Z',
      },
    },
    {
      id: 'platform-darwin-arm64',
      type: 'platform-qualification',
      value: {
        ...base,
        evidenceType: 'platform-qualification',
        platform: 'darwin-arm64',
        artifactSha256: releaseArtifactSha256,
        cleanMachine: true,
        networkIsolationVerified: true,
        machineId: 'mac-clean-01',
        steps: Object.fromEntries([
          'installation',
          'workspaceOpen',
          'sourceEditPatch',
          'reportGeneration',
          'backupRestore',
          'interruptedCommandRecovery',
          'crashLogInspection',
          'uninstallRecovery',
        ].map((id) => [id, 'passed'])),
        openCriticalOrSeriousFindings: 0,
      },
    },
    {
      id: 'signing-darwin-arm64',
      type: 'distribution-signing',
      value: {
        ...base,
        evidenceType: 'distribution-signing',
        platform: 'darwin-arm64',
        artifactSha256: releaseArtifactSha256,
        signatureVerified: true,
        notarized: true,
        signerIdentity: 'Developer ID Application: example',
        verificationCommand: 'codesign --verify --deep --strict artifact.app',
      },
    },
    {
      id: 'accessibility-darwin-arm64',
      type: 'accessibility',
      value: {
        ...base,
        evidenceType: 'accessibility',
        platform: 'darwin-arm64',
        checks: Object.fromEntries([
          'keyboardNavigation',
          'screenReader',
          'renderedContrast',
          'zoomAndScalableText',
          'focusOrder',
          'statusWithoutColor',
          'diagramAlternative',
          'reducedMotion',
        ].map((id) => [id, 'passed'])),
        openCriticalOrSeriousFindings: 0,
        assistiveTechnology: 'VoiceOver',
      },
    },
    {
      id: 'usability',
      type: 'usability',
      value: {
        ...base,
        evidenceType: 'usability',
        participants: ['P-01', 'P-02', 'P-03'].map((id, participantIndex) => ({
          id,
          independent: true,
          tasks: Array.from({ length: 8 }, (_, taskIndex) => ({
            id: taskIndex + 1,
            status: 'passed',
            assisted: false,
            elapsedSeconds: 30 + participantIndex + taskIndex,
            ...(participantIndex === 0 && taskIndex === 0
              ? options.usabilityTaskOverride
              : {}),
          })),
        })),
        openCriticalOrSeriousFindings: 0,
      },
    },
  ]
  const references = []
  const evidencePaths: string[] = []
  for (const record of records) {
    const path = `release/evidence/0.7.0-rc.1/${record.id}.json`
    const text = `${JSON.stringify(record.value, null, 2)}\n`
    await writeFile(resolve(root, path), text, 'utf8')
    evidencePaths.push(path)
    references.push({
      id: record.id,
      type: record.type,
      path,
      sha256: sha256(text),
    })
  }
  const manifestPath = resolve(root, 'config/release-approval.json')
  await mkdir(resolve(root, 'config'), { recursive: true })
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      schemaVersion: 2,
      status: 'approved',
      productName: 'SysML Engineering Workbench',
      version: '0.7.0-rc.1',
      sourceCommit,
      qualifiedPlatforms: ['darwin-arm64'],
      approvedAt: '2026-07-25T23:40:00.000Z',
      ownerApproval: {
        approved: true,
        owner: 'owner',
        role: 'release owner',
        approvedAt: '2026-07-25T23:40:00.000Z',
        statement: 'Approved for production distribution.',
      },
      evidence: references,
    }, null, 2)}\n`,
    'utf8',
  )
  return {
    root,
    evidencePaths,
    context: {
      repositoryRoot: root,
      manifestPath,
      productName: 'SysML Engineering Workbench',
      version: '0.7.0-rc.1',
      platform: 'darwin-arm64',
      sourceCommit,
      runtimeArtifactSha256,
      runtimeProvenanceSha256,
      releaseArtifactSha256,
    },
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
