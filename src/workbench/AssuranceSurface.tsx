import { useEffect, useState } from 'react'
import type { BaselineComparison, BaselineManifest, GitWorkspaceStatus } from '../../packages/baseline-service/src/index.js'
import type { ModelReview, ReviewStaleness } from '../../packages/review-service/src/index.js'
import type { AssuranceEvaluation } from '../../packages/rule-engine/src/index.js'
import type { ReportBundleManifest, ReportKind } from '../../packages/report-engine/src/index.js'
import type { SemanticElement } from '../../packages/semantic-model/src/index.js'
import type { WorkbenchGateway } from './gateway.js'

export type AssuranceActivity = 'interfaces' | 'verification' | 'reviews' | 'changes' | 'reports'

export function AssuranceSurface({
  activity,
  gateway,
  workspaceId,
  userId,
  selected,
  onSelectId,
}: {
  activity: AssuranceActivity
  gateway: WorkbenchGateway
  workspaceId: string
  userId: string
  selected?: SemanticElement
  onSelectId(id: string): void
}) {
  const [assurance, setAssurance] = useState<AssuranceEvaluation | null>(null)
  const [gitStatus, setGitStatus] = useState<GitWorkspaceStatus | null>(null)
  const [baselines, setBaselines] = useState<BaselineManifest[]>([])
  const [reviews, setReviews] = useState<ModelReview[]>([])
  const [comparison, setComparison] = useState<BaselineComparison | null>(null)
  const [staleness, setStaleness] = useState<Record<string, ReviewStaleness>>({})
  const [report, setReport] = useState<ReportBundleManifest | null>(null)
  const [baselineId, setBaselineId] = useState('pilot-baseline')
  const [reviewId, setReviewId] = useState('RVW-PILOT-001')
  const [findingId, setFindingId] = useState('F-001')
  const [findingStatement, setFindingStatement] = useState('Resolve the selected engineering assurance gap.')
  const [reportKind, setReportKind] = useState<ReportKind>('interface-register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    const [nextAssurance, nextGit, nextBaselines, nextReviews] = await Promise.all([
      gateway.evaluateAssurance(workspaceId),
      gateway.gitStatus(workspaceId),
      gateway.listBaselines(workspaceId),
      gateway.listReviews(workspaceId),
    ])
    setAssurance(nextAssurance)
    setGitStatus(nextGit)
    setBaselines(nextBaselines)
    setReviews(nextReviews)
    if (nextBaselines[0] && !baselines.some((item) => item.id === baselineId)) {
      setBaselineId(nextBaselines[0].id)
    }
  }

  useEffect(() => {
    let active = true
    setError('')
    void Promise.all([
      gateway.evaluateAssurance(workspaceId),
      gateway.gitStatus(workspaceId),
      gateway.listBaselines(workspaceId),
      gateway.listReviews(workspaceId),
    ]).then(([nextAssurance, nextGit, nextBaselines, nextReviews]) => {
      if (!active) return
      setAssurance(nextAssurance)
      setGitStatus(nextGit)
      setBaselines(nextBaselines)
      setReviews(nextReviews)
      if (nextBaselines[0]) setBaselineId(nextBaselines[0].id)
    }).catch((cause: unknown) => {
      if (active) setError(message(cause))
    })
    return () => { active = false }
  }, [gateway, workspaceId])

  const execute = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!assurance || !gitStatus) {
    return <div className="assurance-surface"><p>{error || 'Loading engineering assurance data…'}</p></div>
  }

  return (
    <div className="assurance-surface">
      <header className="assurance-header">
        <div>
          <p className="eyebrow">DETERMINISTIC ENGINEERING ASSURANCE</p>
          <h2>{title(activity)}</h2>
        </div>
        <div className="assurance-badges">
          <span>{gitStatus.branch}</span>
          <span className={gitStatus.dirty ? 'warning' : 'ready'}>{gitStatus.dirty ? 'working tree changed' : 'clean baseline'}</span>
          <span>{assurance.findings.length} rule findings</span>
        </div>
      </header>
      {error && <p role="alert" className="error-banner">{error}</p>}

      {activity === 'interfaces' && (
        <>
          <SummaryCards values={[
            ['Interfaces', assurance.summary.interfaces],
            ['Critical', assurance.summary.critical],
            ['Major', assurance.summary.major],
            ['Quality gaps', assurance.findings.filter((item) => item.domain === 'interface').length],
          ]} />
          <AssuranceTable
            caption="Interface register"
            columns={['Interface', 'Kind', 'Owner', 'Endpoints', 'Types', 'Requirements', 'Verification', 'Findings']}
            rows={assurance.interfaceRegister.map((row) => ({
              id: row.interfaceId,
              values: [
                row.qualifiedName,
                row.kind,
                row.ownerQualifiedName ?? 'Unassigned',
                row.sourceEndpointIds.length + row.targetEndpointIds.length,
                row.endpointTypeIds.length,
                row.requirementIds.length,
                row.verificationIds.length,
                row.openFindingIds.length,
              ],
            }))}
            onSelectId={onSelectId}
          />
          <FindingTable findings={assurance.findings.filter((item) => item.domain === 'interface')} onSelectId={onSelectId} />
        </>
      )}

      {activity === 'verification' && (
        <>
          <SummaryCards values={[
            ['Requirements', assurance.summary.requirements],
            ['Satisfied', assurance.requirementCoverage.filter((row) => row.satisfaction === 'direct').length],
            ['Verified', assurance.requirementCoverage.filter((row) => row.verification === 'direct').length],
            ['Not ready', assurance.requirementCoverage.filter((row) => row.satisfaction === 'none' || row.verification === 'none').length],
          ]} />
          <AssuranceTable
            caption="Requirement-to-verification coverage"
            columns={['Requirement', 'Satisfaction', 'Satisfying elements', 'Verification', 'Verification cases', 'Ready']}
            rows={assurance.requirementCoverage.map((row) => ({
              id: row.requirementId,
              values: [
                row.qualifiedName,
                row.satisfaction,
                row.satisfyingElementIds.length,
                row.verification,
                row.verificationElementIds.length,
                row.satisfaction === 'direct' && row.verification === 'direct' ? 'yes' : 'no',
              ],
            }))}
            onSelectId={onSelectId}
          />
        </>
      )}

      {activity === 'changes' && (
        <>
          <section className="assurance-controls" aria-label="Baseline controls">
            <label>Baseline id<input value={baselineId} onChange={(event) => setBaselineId(event.target.value)} /></label>
            <button type="button" disabled={busy || gitStatus.dirty} onClick={() => void execute(async () => {
              await gateway.createBaseline(workspaceId, { id: baselineId, actor: userId, at: new Date().toISOString() })
              await refresh()
            })}>Create clean baseline</button>
            <button type="button" disabled={busy || baselines.length === 0} onClick={() => void execute(async () => {
              setComparison(await gateway.compareBaseline(workspaceId, baselineId))
            })}>Compare semantic baseline</button>
          </section>
          <AssuranceTable
            caption="Git working tree"
            columns={['Status', 'Path', 'Category']}
            rows={gitStatus.changedFiles.map((file) => ({ values: [file.status, file.path, file.category] }))}
          />
          <AssuranceTable
            caption="Saved baselines"
            columns={['Id', 'Commit', 'Branch', 'Created', 'Snapshot']}
            rows={baselines.map((baseline) => ({ values: [baseline.id, baseline.commit.slice(0, 12), baseline.branch, baseline.createdAt, baseline.snapshot.snapshotSha256.slice(0, 12)] }))}
          />
          {comparison && (
            <AssuranceTable
              caption={`Semantic changes from ${comparison.baseline.id}`}
              columns={['Kind', 'Element', 'Relationship']}
              rows={comparison.semanticDiff.changes.map((change) => ({
                id: change.elementId,
                values: [change.kind, change.elementId ?? '', change.relationshipId ?? ''],
              }))}
              onSelectId={onSelectId}
            />
          )}
        </>
      )}

      {activity === 'reviews' && (
        <>
          <section className="assurance-controls" aria-label="Review controls">
            <label>Review id<input value={reviewId} onChange={(event) => setReviewId(event.target.value.toUpperCase())} /></label>
            <button type="button" disabled={busy} onClick={() => void execute(async () => {
              await gateway.createReview(workspaceId, {
                id: reviewId,
                title: 'Engineering assurance review',
                scope: { query: { schemaVersion: 1, mode: 'neighbourhood', roots: selected ? [selected.id] : undefined, depth: 3, maxResults: 500 } },
                participants: [{ role: 'chair', name: userId }],
                actor: userId,
                at: new Date().toISOString(),
              })
              await refresh()
            })}>Create review at current commit</button>
            <button type="button" disabled={busy || !reviews.some((review) => review.id === reviewId)} onClick={() => void execute(async () => {
              const result = await gateway.reviewStaleness(workspaceId, reviewId)
              setStaleness((current) => ({ ...current, [reviewId]: result }))
            })}>Check anchors</button>
          </section>
          {reviews.map((review) => (
            <section className="review-card" key={review.id}>
              <header><div><strong>{review.id}</strong><span>{review.title}</span></div><span className={`review-status ${review.status}`}>{review.status}</span></header>
              <p>Frozen at {review.baseline.slice(0, 16)} · {review.findings.length} findings · {staleness[review.id]?.stale.length ?? 0} stale anchors</p>
              <div className="review-findings">
                {review.findings.map((finding) => (
                  <div key={finding.id}>
                    <button type="button" onClick={() => finding.elementId && onSelectId(finding.elementId)}>{finding.id}</button>
                    <span>{finding.severity}</span><span>{finding.statement}</span><span>{finding.disposition}</span>
                    {finding.disposition !== 'closed' && <button type="button" disabled={busy} onClick={() => void execute(async () => {
                      await gateway.dispositionReviewFinding(workspaceId, {
                        reviewId: review.id,
                        findingId: finding.id,
                        disposition: 'closed',
                        response: 'Disposition confirmed through workbench review.',
                        actor: userId,
                        at: new Date().toISOString(),
                      })
                      await refresh()
                    })}>Close finding</button>}
                  </div>
                ))}
              </div>
              {review.id === reviewId && review.status !== 'closed' && (
                <div className="inline-review-actions">
                  <input aria-label="Finding id" value={findingId} onChange={(event) => setFindingId(event.target.value.toUpperCase())} />
                  <input aria-label="Finding statement" value={findingStatement} onChange={(event) => setFindingStatement(event.target.value)} />
                  <button type="button" disabled={busy || !selected} onClick={() => void execute(async () => {
                    if (!selected) return
                    await gateway.addReviewFinding(workspaceId, {
                      reviewId: review.id,
                      finding: {
                        id: findingId,
                        elementId: selected.id,
                        severity: 'major',
                        category: 'quality',
                        statement: findingStatement,
                        owner: userId,
                        actor: userId,
                        at: new Date().toISOString(),
                      },
                    })
                    await refresh()
                  })}>Anchor finding to selection</button>
                  <button type="button" disabled={busy || review.findings.some((finding) => finding.disposition === 'open')} onClick={() => void execute(async () => {
                    await gateway.closeReview(workspaceId, review.id, { actor: userId, at: new Date().toISOString(), note: 'All findings dispositioned.' })
                    await refresh()
                  })}>Close review</button>
                </div>
              )}
            </section>
          ))}
          {reviews.length === 0 && <p className="empty-register">No reviews recorded in this workspace.</p>}
        </>
      )}

      {activity === 'reports' && (
        <>
          <section className="assurance-controls" aria-label="Report controls">
            <label>Report type<select value={reportKind} onChange={(event) => setReportKind(event.target.value as ReportKind)}>
              {REPORT_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select></label>
            <label>Baseline<select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>
              <option value="">No baseline</option>
              {baselines.map((baseline) => <option key={baseline.id} value={baseline.id}>{baseline.id}</option>)}
            </select></label>
            <button type="button" disabled={busy || (reportKind === 'semantic-change-impact' && !baselineId)} onClick={() => void execute(async () => {
              setReport(await gateway.generateReport(workspaceId, {
                reportId: `${reportKind}-${new Date().toISOString().slice(0, 10)}`,
                kind: reportKind,
                at: new Date().toISOString(),
                baselineId: baselineId || undefined,
                viewConfiguration: activity,
              }))
            })}>Generate evidence package</button>
          </section>
          {report && (
            <section className="report-result" aria-label="Generated report">
              <h3>{report.title}</h3>
              <p>Commit {report.provenance.commitSha}</p>
              {report.artifacts.map((artifact) => <code key={artifact.path}>{artifact.format.toUpperCase()} · {artifact.path} · sha256:{artifact.sha256.slice(0, 16)}…</code>)}
            </section>
          )}
          <p className="assurance-note">Reports are written under generated/reports with source commit, language authority, workbench version, rule-pack version, diagnostics, exclusions, and artifact hashes.</p>
        </>
      )}
    </div>
  )
}

function SummaryCards({ values }: { values: Array<[string, number]> }) {
  return <section className="summary-cards">{values.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
}

function AssuranceTable({ caption, columns, rows, onSelectId }: {
  caption: string
  columns: string[]
  rows: Array<{ id?: string; values: Array<string | number | boolean> }>
  onSelectId?(id: string): void
}) {
  return (
    <section className="assurance-table">
      <h3>{caption}<span>{rows.length}</span></h3>
      <div><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.id ?? 'row'}:${index}`}>{row.values.map((value, cellIndex) => (
          <td key={columns[cellIndex]}>{cellIndex === 0 && row.id && onSelectId
            ? <button type="button" onClick={() => onSelectId(row.id!)}>{String(value)}</button>
            : String(value)}</td>
        ))}</tr>)}</tbody>
      </table>{rows.length === 0 && <p className="empty-register">No records.</p>}</div>
    </section>
  )
}

function FindingTable({ findings, onSelectId }: {
  findings: AssuranceEvaluation['findings']
  onSelectId(id: string): void
}) {
  return <AssuranceTable caption="Deterministic findings" columns={['Rule', 'Severity', 'Statement', 'Remediation']} rows={findings.map((finding) => ({
    id: finding.elementIds[0],
    values: [finding.ruleId, finding.severity, finding.statement, finding.remediation],
  }))} onSelectId={onSelectId} />
}

function title(activity: AssuranceActivity): string {
  return {
    interfaces: 'Interface assurance',
    verification: 'Verification readiness',
    reviews: 'Model-anchored reviews',
    changes: 'Baselines and semantic change',
    reports: 'Reports and evidence',
  }[activity]
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Engineering assurance operation failed'
}

const REPORT_KINDS: ReportKind[] = [
  'workspace-health',
  'requirement-coverage',
  'verification-readiness',
  'interface-register',
  'interface-quality',
  'semantic-change-impact',
  'review-findings',
  'review-closure',
  'baseline-manifest',
]
