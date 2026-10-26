import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath, rename, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { BaselineComparison, BaselineManifest, GitWorkspaceStatus } from '../../baseline-service/src/index.js'
import type { LanguageDiagnostic } from '../../language-adapter/src/index.js'
import type { ModelReview } from '../../review-service/src/index.js'
import type { AssuranceEvaluation } from '../../rule-engine/src/index.js'

export const REPORT_ENGINE_VERSION = '1.1.0'

export type ReportKind =
  | 'workspace-health'
  | 'requirement-coverage'
  | 'verification-readiness'
  | 'interface-register'
  | 'interface-quality'
  | 'semantic-change-impact'
  | 'review-findings'
  | 'review-closure'
  | 'baseline-manifest'

export interface ReportProvenance {
  workspace: { id: string; name: string }
  commitSha: string
  snapshotSha256?: string
  configurationName?: string
  baseline: string | null
  languageRelease: string
  workbenchVersion: string
  rulePackVersion: string
  viewConfiguration: string | null
  generatedAt: string
  unresolvedDiagnostics: number
  exclusions: string[]
}

export interface ReportRequest {
  kind: ReportKind
  provenance: ReportProvenance
  assurance?: AssuranceEvaluation
  diagnostics?: LanguageDiagnostic[]
  gitStatus?: GitWorkspaceStatus
  baseline?: BaselineManifest
  comparison?: BaselineComparison
  reviews?: ModelReview[]
}

export interface GeneratedReport {
  kind: ReportKind
  title: string
  html: string
  pdf: Uint8Array
  csv?: string
  contentSha256: {
    html: string
    pdf: string
    csv?: string
  }
}

export interface ReportBundleManifest {
  schemaVersion: 1
  reportEngineVersion: string
  reportKind: ReportKind
  title: string
  provenance: ReportProvenance
  artifacts: Array<{
    format: 'html' | 'pdf' | 'csv'
    path: string
    sha256: string
  }>
}

export function renderReport(request: ReportRequest): Promise<GeneratedReport> {
  validateRequest(request)
  const title = reportTitle(request.kind)
  const sections = buildSections(request)
  const html = renderHtml(title, request.provenance, sections)
  const csv = renderCsv(request)
  return renderPdf(title, request.provenance, sections).then((pdf) => ({
    kind: request.kind,
    title,
    html,
    pdf,
    csv,
    contentSha256: {
      html: sha256(html),
      pdf: sha256(pdf),
      ...(csv === undefined ? {} : { csv: sha256(csv) }),
    },
  }))
}

export async function writeReportBundle(
  rootPath: string,
  reportId: string,
  request: ReportRequest,
): Promise<ReportBundleManifest> {
  validateReportId(reportId)
  const root = await realpath(rootPath)
  const directory = resolve(root, 'generated', 'reports', reportId)
  await assertNoSymlinkSegments(root, directory)
  try { await lstat(directory); throw new Error('Report ID already exists; use a new issued report ID') } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
  await mkdir(resolve(root, 'generated', 'reports'), { recursive: true })
  const staging = resolve(root, 'generated', 'reports', `.staging-${randomUUID()}`)
  await mkdir(staging)
  const report = await renderReport(request)
  const artifacts: ReportBundleManifest['artifacts'] = []
  await atomicWrite(staging, `${reportId}.html`, report.html)
  artifacts.push({ format: 'html', path: `generated/reports/${reportId}/${reportId}.html`, sha256: report.contentSha256.html })
  await atomicWrite(staging, `${reportId}.pdf`, report.pdf)
  artifacts.push({ format: 'pdf', path: `generated/reports/${reportId}/${reportId}.pdf`, sha256: report.contentSha256.pdf })
  if (report.csv !== undefined && report.contentSha256.csv) {
    await atomicWrite(staging, `${reportId}.csv`, report.csv)
    artifacts.push({ format: 'csv', path: `generated/reports/${reportId}/${reportId}.csv`, sha256: report.contentSha256.csv })
  }
  const manifest: ReportBundleManifest = {
    schemaVersion: 1,
    reportEngineVersion: REPORT_ENGINE_VERSION,
    reportKind: request.kind,
    title: report.title,
    provenance: structuredClone(request.provenance),
    artifacts,
  }
  await atomicWrite(staging, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(staging, directory)
  return manifest
}

interface ReportSection {
  heading: string
  paragraphs?: string[]
  rows?: Array<Record<string, string | number | boolean>>
}

function buildSections(request: ReportRequest): ReportSection[] {
  const diagnostics = [...(request.diagnostics ?? [])].sort(compareDiagnostics)
  const assurance = request.assurance
  const reviews = [...(request.reviews ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  switch (request.kind) {
    case 'workspace-health':
      return [
        {
          heading: 'Workspace status',
          rows: [{
            branch: request.gitStatus?.branch ?? 'unavailable',
            dirty: request.gitStatus?.dirty ?? false,
            changedFiles: request.gitStatus?.changedFiles.length ?? 0,
            diagnostics: diagnostics.length,
          }],
        },
        { heading: 'Diagnostics', rows: diagnostics.map(diagnosticRow) },
      ]
    case 'requirement-coverage':
      requireAssurance(assurance)
      return [{
        heading: 'Requirement coverage',
        rows: assurance.requirementCoverage.map((row) => ({
          requirement: row.qualifiedName,
          satisfaction: row.satisfaction,
          satisfyingElements: row.satisfyingElementIds.join('; '),
          verification: row.verification,
          verificationElements: row.verificationElementIds.join('; '),
        })),
      }]
    case 'verification-readiness':
      requireAssurance(assurance)
      return [{
        heading: 'Verification trace coverage',
        paragraphs: ['Trace links identify planned verification. Execution readiness, observed results and stakeholder validation require separate configuration-specific evidence and are not assessed by this report.'],
        rows: assurance.requirementCoverage.map((row) => ({
          requirement: row.qualifiedName,
          traceLinksComplete: row.satisfaction === 'direct' && row.verification === 'direct',
          executionReadiness: 'not-assessed',
          verificationResult: 'not-assessed',
          satisfaction: row.satisfaction,
          verification: row.verification,
        })),
      }]
    case 'interface-register':
      requireAssurance(assurance)
      return [{ heading: 'Interface register', rows: assurance.interfaceRegister.map(interfaceRow) }]
    case 'interface-quality':
      requireAssurance(assurance)
      return [{
        heading: 'Interface quality findings',
        paragraphs: assurance.limitations,
        rows: assurance.findings.filter((finding) => finding.domain === 'interface').map(findingRow),
      }]
    case 'semantic-change-impact':
      if (!request.comparison) throw new Error('Semantic change impact report requires a baseline comparison')
      return [
        {
          heading: 'Baseline comparison',
          rows: [{
            baseline: request.comparison.baseline.id,
            baselineCommit: request.comparison.baseline.commit,
            currentCommit: request.comparison.current.commit,
            changes: request.comparison.semanticDiff.changes.length,
            diagnosticsIntroduced: request.comparison.diagnostics.introduced.length,
            diagnosticsResolved: request.comparison.diagnostics.resolved.length,
          }],
        },
        {
          heading: 'Semantic changes',
          rows: request.comparison.semanticDiff.changes.map((change) => ({
            kind: change.kind,
            elementId: change.elementId ?? '',
            relationshipId: change.relationshipId ?? '',
          })),
        },
        {
          heading: 'Potential downstream impact',
          paragraphs: request.comparison.semanticImpact?.limitations ?? ['Impact was not assessed in this comparison. A list of changed elements is not a downstream impact assessment.'],
          rows: request.comparison.semanticImpact?.affectedElements.map(element => ({
            element: element.qualifiedName,
            reason: element.reason,
            presentInCurrent: element.presentInCurrent,
            witnessPath: element.witnessPath.map(step => `${step.fromId} -> ${step.toId} (${step.relationshipKind}, ${step.snapshot})`).join('; '),
          })) ?? [],
        },
        {
          heading: 'Implementation and assurance artifact review',
          paragraphs: request.comparison.lifecycleReview?.limitations ?? ['Lifecycle artifacts were not assessed.'],
          rows: request.comparison.lifecycleReview?.artifactReviews.map(row => ({
            artifact: row.artifactId, kind: row.kind, status: row.status,
            presentInCurrent: row.presentInCurrent, witness: row.witness.join(' -> '),
          })) ?? [],
        },
        {
          heading: 'Unresolved impact coverage',
          rows: [
            ...(request.comparison.semanticImpact?.unresolvedEndpointIds ?? []).map(id => ({ item: id, gap: 'unresolved model endpoint' })),
            ...(request.comparison.semanticImpact?.opaqueElementIds ?? []).map(id => ({ item: id, gap: 'opaque model semantics' })),
            ...(request.comparison.lifecycleReview?.unlinkedArtifactIds ?? []).map(id => ({ item: id, gap: 'unlinked artifact - impact unknown' })),
            ...(request.comparison.lifecycleReview?.unresolvedDependencies ?? []).map(id => ({ item: id, gap: 'unresolved lifecycle dependency' })),
          ],
        },
        {
          heading: 'Verification planning candidates - not executable',
          rows: request.comparison.lifecycleReview?.testCandidates.map(row => ({
            candidate: row.id, requirements: row.requirementIds.join('; '), configuration: row.configuration,
            modelRevision: row.modelRevision, status: row.status, requiredInputs: row.requiredInputs.join('; '),
          })) ?? [],
        },
      ]
    case 'review-findings':
      return [{ heading: 'Review findings', rows: reviews.flatMap(reviewFindingRows) }]
    case 'review-closure':
      return [{
        heading: 'Review closure',
        rows: reviews.map((review) => ({
          review: review.id,
          title: review.title,
          status: review.status,
          findings: review.findings.length,
          openFindings: review.findings.filter((finding) => finding.disposition === 'open').length,
          updatedAt: review.updatedAt,
        })),
      }]
    case 'baseline-manifest':
      if (!request.baseline) throw new Error('Baseline manifest report requires a baseline')
      return [{
        heading: 'Baseline manifest',
        rows: [{
          id: request.baseline.id,
          commit: request.baseline.commit,
          branch: request.baseline.branch,
          snapshotSha256: request.baseline.snapshot.snapshotSha256,
          diagnostics: request.baseline.diagnostics.length,
          createdAt: request.baseline.createdAt,
          createdBy: request.baseline.createdBy,
        }],
      }]
  }
}

function renderHtml(title: string, provenance: ReportProvenance, sections: ReportSection[]): string {
  const content = sections.map((section) => {
    const paragraphs = (section.paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
    const table = section.rows ? renderHtmlTable(section.rows) : ''
    return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${table}</section>`
  }).join('')
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<meta name="generator" content="SysML Engineering Workbench report-engine ${REPORT_ENGINE_VERSION}">`,
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#172033}h1,h2{color:#102a43}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{border:1px solid #bcccdc;padding:.45rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf2f8}.provenance{background:#f3f6f9;padding:1rem}.muted{color:#52667a}</style>',
    '</head><body>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<div class="provenance"><strong>${escapeHtml(provenance.workspace.name)}</strong><br><span class="muted">Commit ${escapeHtml(provenance.commitSha)} · Generated ${escapeHtml(provenance.generatedAt)} · Workbench ${escapeHtml(provenance.workbenchVersion)} · Rules ${escapeHtml(provenance.rulePackVersion)} · Language ${escapeHtml(provenance.languageRelease)}</span></div>`,
    content,
    `<section><h2>Generation basis</h2>${renderHtmlTable([{
      baseline: provenance.baseline ?? 'none',
      modelRevision: provenance.snapshotSha256 ?? 'unavailable',
      configuration: provenance.configurationName ?? 'unavailable',
      viewConfiguration: provenance.viewConfiguration ?? 'none',
      unresolvedDiagnostics: provenance.unresolvedDiagnostics,
      exclusions: provenance.exclusions.join('; '),
    }])}</section>`,
    '</body></html>\n',
  ].join('')
}

function renderHtmlTable(rows: Array<Record<string, string | number | boolean>>): string {
  if (rows.length === 0) return '<p>No records.</p>'
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
  const head = columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(String(row[column] ?? ''))}</td>`).join('')}</tr>`).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function renderCsv(request: ReportRequest): string | undefined {
  let rows: Array<Record<string, string | number | boolean>> | undefined
  if (request.kind === 'interface-register') {
    requireAssurance(request.assurance)
    rows = request.assurance.interfaceRegister.map(interfaceRow)
  } else if (request.kind === 'requirement-coverage' || request.kind === 'verification-readiness') {
    requireAssurance(request.assurance)
    rows = request.assurance.requirementCoverage.map((row) => ({
      requirementId: row.requirementId,
      qualifiedName: row.qualifiedName,
      satisfaction: row.satisfaction,
      verification: row.verification,
      satisfyingElementIds: row.satisfyingElementIds.join('; '),
      verificationElementIds: row.verificationElementIds.join('; '),
      ...(request.kind === 'verification-readiness' ? {
        traceLinksComplete: row.satisfaction === 'direct' && row.verification === 'direct',
        executionReadiness: 'not-assessed',
        verificationResult: 'not-assessed',
      } : {}),
    }))
  } else if (request.kind === 'review-findings') {
    rows = [...(request.reviews ?? [])].sort((left, right) => left.id.localeCompare(right.id)).flatMap(reviewFindingRows)
  }
  if (!rows) return undefined
  if (rows.length === 0) rows = [{ recordStatus: 'no-records' }]
  rows = rows.map(row => ({ ...row, workspace: request.provenance.workspace.id,
    modelRevision: request.provenance.snapshotSha256 ?? 'unavailable',
    configuration: request.provenance.configurationName ?? 'unavailable',
    exclusions: request.provenance.exclusions.join('; '),
    limitations: (request.assurance?.limitations ?? []).join('; '),
  }))
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
  return `${columns.map(csvCell).join(',')}\n${rows.map((row) => columns.map((column) => csvCell(String(row[column] ?? ''))).join(',')).join('\n')}\n`
}

async function renderPdf(title: string, provenance: ReportProvenance, sections: ReportSection[]): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false })
  const fixedDate = new Date(provenance.generatedAt)
  document.setTitle(title)
  document.setAuthor('SysML Engineering Workbench')
  document.setSubject(`${provenance.workspace.id}@${provenance.commitSha}`)
  document.setCreator(`SysML Engineering Workbench report-engine ${REPORT_ENGINE_VERSION}`)
  document.setProducer(`SysML Engineering Workbench report-engine ${REPORT_ENGINE_VERSION}`)
  document.setCreationDate(fixedDate)
  document.setModificationDate(fixedDate)
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const lines = [
    title,
    `${provenance.workspace.name} | commit ${provenance.commitSha}`,
    `Generated ${provenance.generatedAt} | Workbench ${provenance.workbenchVersion} | Rules ${provenance.rulePackVersion}`,
    '',
    ...sections.flatMap((section) => [
      section.heading,
      ...(section.paragraphs ?? []),
      ...(section.rows ?? []).flatMap((row) => Object.entries(row).map(([key, value]) => `${key}: ${String(value)}`)),
      '',
    ]),
    'Generation basis',
    'PDF text convention: non-ASCII code points use U+ hexadecimal escapes; literal backslashes are doubled.',
    `model revision: ${provenance.snapshotSha256 ?? 'unavailable'}`,
    `configuration: ${provenance.configurationName ?? 'unavailable'}`,
    `baseline: ${provenance.baseline ?? 'none'}`,
    `language release: ${provenance.languageRelease}`,
    `view configuration: ${provenance.viewConfiguration ?? 'none'}`,
    `unresolved diagnostics: ${provenance.unresolvedDiagnostics}`,
    `exclusions: ${provenance.exclusions.join('; ')}`,
  ].flatMap(wrapPdfLine)
  let page = document.addPage([595.28, 841.89])
  let y = 800
  for (const [index, line] of lines.entries()) {
    if (y < 45) {
      page = document.addPage([595.28, 841.89])
      y = 800
    }
    const heading = index === 0 || sections.some((section) => section.heading === line) || line === 'Generation basis'
    page.drawText(line, { x: 42, y, size: heading ? 13 : 9, font: heading ? bold : font, color: rgb(0.07, 0.15, 0.25) })
    y -= heading ? 20 : 13
  }
  return document.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: Number.POSITIVE_INFINITY })
}

function interfaceRow(row: AssuranceEvaluation['interfaceRegister'][number]): Record<string, string | number | boolean> {
  return {
    interfaceId: row.interfaceId,
    qualifiedName: row.qualifiedName,
    kind: row.kind,
    owner: row.ownerQualifiedName ?? '',
    endpoints: (row.endpointIds ?? [...row.sourceEndpointIds, ...row.targetEndpointIds]).join('; '),
    sourceEndpoints: row.sourceEndpointIds.join('; '),
    targetEndpoints: row.targetEndpointIds.join('; '),
    endpointTypes: row.endpointTypeIds.join('; '),
    exchangedItems: row.exchangedItemIds.join('; '),
    requirements: row.requirementIds.join('; '),
    verification: row.verificationIds.join('; '),
    openFindings: row.openFindingIds.length,
    unavailableAttributes: row.unavailableAttributes.join('; '),
    sourcePath: row.sourcePath,
  }
}

function findingRow(finding: AssuranceEvaluation['findings'][number]): Record<string, string | number | boolean> {
  return {
    id: finding.id,
    rule: finding.ruleId,
    severity: finding.severity,
    domain: finding.domain,
    statement: finding.statement,
    elements: finding.elementIds.join('; '),
    remediation: finding.remediation,
  }
}

function reviewFindingRows(review: ModelReview): Array<Record<string, string | number | boolean>> {
  return review.findings.map((finding) => ({
    reviewId: review.id,
    findingId: finding.id,
    severity: finding.severity,
    category: finding.category,
    statement: finding.statement,
    anchor: finding.elementId ?? finding.relationshipId ?? '',
    owner: finding.owner ?? '',
    disposition: finding.disposition,
    response: finding.response ?? '',
  }))
}

function diagnosticRow(item: LanguageDiagnostic): Record<string, string | number | boolean> {
  return { uri: item.uri, code: item.code ?? '', severity: item.severity, message: item.message, line: (item.range?.start.line ?? 0) + 1 }
}

function validateRequest(request: ReportRequest): void {
  if (!REPORT_KINDS.has(request.kind)) throw new Error('Unknown report kind')
  const provenance = request.provenance
  if (!provenance.workspace.id || !provenance.workspace.name) throw new Error('Report workspace identity is required')
  if (!/^[0-9a-f]{7,64}$/.test(provenance.commitSha)) throw new Error('Report commit SHA is invalid')
  if (Number.isNaN(Date.parse(provenance.generatedAt))) throw new Error('Report generation timestamp is invalid')
  if (request.assurance) {
    const context = request.assurance.context
    if (!context || context.workspaceId !== provenance.workspace.id ||
        context.configurationName !== provenance.configurationName ||
        context.languageRelease !== provenance.languageRelease ||
        request.assurance.snapshotSha256 !== provenance.snapshotSha256 ||
        request.assurance.rulePack.version !== provenance.rulePackVersion) {
      throw new Error('Report provenance does not match assurance evaluation context')
    }
  }
  if (request.comparison && (request.comparison.workspace?.id !== provenance.workspace.id ||
      request.comparison.workspace?.configurationName !== provenance.configurationName ||
      request.comparison.current.commit !== provenance.commitSha ||
      request.comparison.baseline.id !== provenance.baseline ||
      request.comparison.current.snapshotSha256 !== provenance.snapshotSha256)) {
    throw new Error('Report provenance does not match baseline comparison')
  }
  if (!Array.isArray(provenance.exclusions)) throw new Error('Report exclusions must be an array')
}

function reportTitle(kind: ReportKind): string {
  if (kind === 'verification-readiness') return 'Verification Trace Coverage and Readiness Limits'
  return kind.split('-').map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' ')
}

function requireAssurance(value: AssuranceEvaluation | undefined): asserts value is AssuranceEvaluation {
  if (!value) throw new Error('Report requires an assurance evaluation')
}

export function encodePdfText(value: string): string {
  return [...value].map(c => /^[\x20-\x7E]$/.test(c) ? (c === '\\' ? '\\\\' : c) : `\\u{${c.codePointAt(0)!.toString(16).toUpperCase()}}`).join('')
}

function wrapPdfLine(value: string): string[] {
  const normalized = encodePdfText(value)
  if (normalized.length <= 92) return [normalized]
  const lines: string[] = []
  let remaining = normalized
  while (remaining.length > 92) {
    const splitAt = Math.max(remaining.lastIndexOf(' ', 92), 40)
    lines.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  lines.push(remaining)
  return lines
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function csvCell(value: string): string {
  const escaped = value.replaceAll('"', '""')
  return /[",\r\n]/.test(value) ? `"${escaped}"` : escaped
}

function compareDiagnostics(left: LanguageDiagnostic, right: LanguageDiagnostic): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function validateReportId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) throw new Error('Report id must be a bounded lowercase slug')
}

async function atomicWrite(directory: string, filename: string, content: string | Uint8Array): Promise<void> {
  const destination = resolve(directory, filename)
  const temporary = resolve(directory, `.${filename}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
  await rename(temporary, destination)
}

async function assertNoSymlinkSegments(root: string, target: string): Promise<void> {
  if (!isWithin(root, target)) throw new Error('Report path escapes workspace')
  let current = root
  for (const segment of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Report paths may not contain symbolic links')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
  }
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!path.startsWith('..') && !path.startsWith('/') && !path.startsWith('\\'))
}

const REPORT_KINDS = new Set<ReportKind>([
  'workspace-health',
  'requirement-coverage',
  'verification-readiness',
  'interface-register',
  'interface-quality',
  'semantic-change-impact',
  'review-findings',
  'review-closure',
  'baseline-manifest',
])
