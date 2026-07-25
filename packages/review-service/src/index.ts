import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import type { ModelQuery } from '../../query-engine/src/index.js'
import type { SemanticSnapshot } from '../../semantic-model/src/index.js'

export type ReviewStatus = 'open' | 'in-review' | 'closed' | 'cancelled'
export type FindingDisposition = 'open' | 'accepted' | 'rejected' | 'deferred' | 'closed'

export interface ReviewFinding {
  id: string
  elementId?: string
  relationshipId?: string
  anchorFingerprint: string
  severity: 'critical' | 'major' | 'minor' | 'advisory'
  category: 'requirement' | 'verification' | 'interface' | 'change' | 'quality' | 'other'
  statement: string
  owner?: string
  dueDate?: string
  disposition: FindingDisposition
  response?: string
  evidence: string[]
  createdAt: string
  createdBy: string
  updatedAt: string
  history: Array<{
    at: string
    actor: string
    action: string
    from?: string
    to?: string
    note?: string
  }>
}

export interface ModelReview {
  schemaVersion: 1
  id: string
  title: string
  baseline: string
  baselineSnapshotSha256: string
  scope: { viewId?: string; query?: ModelQuery }
  status: ReviewStatus
  participants: Array<{ role: string; name: string }>
  findings: ReviewFinding[]
  createdAt: string
  createdBy: string
  updatedAt: string
  history: Array<{ at: string; actor: string; action: string; note?: string }>
}

export interface ReviewStaleness {
  reviewId: string
  stale: Array<{
    findingId: string
    reason: 'anchor-deleted' | 'anchor-changed'
    elementId?: string
    relationshipId?: string
  }>
}

export class ReviewRepository {
  constructor(private readonly rootPath: string) {}

  async list(): Promise<ModelReview[]> {
    const directory = await this.directory()
    const entries = await readdir(directory, { withFileTypes: true })
    const reviews: ModelReview[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      reviews.push(validateReview(JSON.parse(await readFile(resolve(directory, entry.name), 'utf8'))))
    }
    return reviews
  }

  async get(reviewId: string): Promise<ModelReview> {
    validateId(reviewId, 'review')
    const directory = await this.directory()
    return validateReview(JSON.parse(await readFile(resolve(directory, `${reviewId}.json`), 'utf8')))
  }

  async create(input: {
    id: string
    title: string
    baseline: string
    scope: ModelReview['scope']
    participants?: ModelReview['participants']
    actor: string
    at: string
  }, snapshot: SemanticSnapshot): Promise<ModelReview> {
    validateId(input.id, 'review')
    validateTimestamp(input.at)
    if (!input.title.trim() || input.title.length > 300) throw new Error('Review title is invalid')
    if (!input.baseline.startsWith('git:')) throw new Error('Review baseline must be a Git identity')
    if (!input.scope.viewId && !input.scope.query) throw new Error('Review scope must freeze a view or query')
    const review: ModelReview = {
      schemaVersion: 1,
      id: input.id,
      title: input.title.trim(),
      baseline: input.baseline,
      baselineSnapshotSha256: snapshot.snapshotSha256,
      scope: structuredClone(input.scope),
      status: 'open',
      participants: structuredClone(input.participants ?? []),
      findings: [],
      createdAt: input.at,
      createdBy: input.actor,
      updatedAt: input.at,
      history: [{ at: input.at, actor: input.actor, action: 'review-created' }],
    }
    const directory = await this.directory()
    try {
      await lstat(resolve(directory, `${input.id}.json`))
      throw new Error(`Review already exists: ${input.id}`)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
    }
    return this.persist(review)
  }

  async addFinding(reviewId: string, input: {
    id: string
    elementId?: string
    relationshipId?: string
    severity: ReviewFinding['severity']
    category: ReviewFinding['category']
    statement: string
    owner?: string
    dueDate?: string
    evidence?: string[]
    actor: string
    at: string
  }, snapshot: SemanticSnapshot): Promise<ModelReview> {
    const review = await this.get(reviewId)
    if (review.status === 'closed' || review.status === 'cancelled') throw new Error('Closed or cancelled reviews cannot accept findings')
    validateId(input.id, 'finding')
    validateTimestamp(input.at)
    if (review.findings.some((finding) => finding.id === input.id)) throw new Error(`Review finding already exists: ${input.id}`)
    const anchorFingerprint = resolveAnchorFingerprint(snapshot, input.elementId, input.relationshipId)
    if (!input.statement.trim() || input.statement.length > 4_000) throw new Error('Finding statement is invalid')
    const finding: ReviewFinding = {
      id: input.id,
      elementId: input.elementId,
      relationshipId: input.relationshipId,
      anchorFingerprint,
      severity: input.severity,
      category: input.category,
      statement: input.statement.trim(),
      owner: input.owner,
      dueDate: input.dueDate,
      disposition: 'open',
      evidence: [...new Set(input.evidence ?? [])].sort(),
      createdAt: input.at,
      createdBy: input.actor,
      updatedAt: input.at,
      history: [{ at: input.at, actor: input.actor, action: 'finding-created' }],
    }
    review.findings.push(finding)
    review.findings.sort((left, right) => left.id.localeCompare(right.id))
    review.status = 'in-review'
    review.updatedAt = input.at
    review.history.push({ at: input.at, actor: input.actor, action: 'finding-added', note: input.id })
    return this.persist(review)
  }

  async dispositionFinding(reviewId: string, findingId: string, input: {
    disposition: FindingDisposition
    response: string
    actor: string
    at: string
  }): Promise<ModelReview> {
    const review = await this.get(reviewId)
    validateTimestamp(input.at)
    const finding = review.findings.find((item) => item.id === findingId)
    if (!finding) throw new Error(`Unknown review finding: ${findingId}`)
    const allowed: Record<FindingDisposition, FindingDisposition[]> = {
      open: ['accepted', 'rejected', 'deferred', 'closed'],
      accepted: ['closed', 'open'],
      rejected: ['closed', 'open'],
      deferred: ['open', 'closed'],
      closed: ['open'],
    }
    if (!allowed[finding.disposition].includes(input.disposition)) {
      throw new Error(`Invalid finding transition: ${finding.disposition} -> ${input.disposition}`)
    }
    if (!input.response.trim()) throw new Error('Finding disposition requires a response')
    const previous = finding.disposition
    finding.disposition = input.disposition
    finding.response = input.response.trim()
    finding.updatedAt = input.at
    finding.history.push({ at: input.at, actor: input.actor, action: 'finding-disposition', from: previous, to: input.disposition, note: finding.response })
    review.updatedAt = input.at
    review.history.push({ at: input.at, actor: input.actor, action: 'finding-disposition', note: `${finding.id}:${previous}->${input.disposition}` })
    return this.persist(review)
  }

  async close(reviewId: string, input: { actor: string; at: string; note?: string }): Promise<ModelReview> {
    const review = await this.get(reviewId)
    validateTimestamp(input.at)
    const open = review.findings.filter((finding) => finding.disposition === 'open')
    if (open.length) throw new Error(`Review has ${open.length} open findings`)
    const previous = review.status
    review.status = 'closed'
    review.updatedAt = input.at
    review.history.push({ at: input.at, actor: input.actor, action: `review-status:${previous}->closed`, note: input.note })
    return this.persist(review)
  }

  async staleness(reviewId: string, snapshot: SemanticSnapshot): Promise<ReviewStaleness> {
    const review = await this.get(reviewId)
    const elements = new Map(snapshot.elements.map((element) => [element.id, element]))
    const relationships = new Map(snapshot.relationships.map((relationship) => [relationship.id, relationship]))
    const stale: ReviewStaleness['stale'] = []
    for (const finding of review.findings) {
      if (finding.elementId) {
        const element = elements.get(finding.elementId)
        if (!element) stale.push({ findingId: finding.id, reason: 'anchor-deleted', elementId: finding.elementId })
        else if (element.fingerprint !== finding.anchorFingerprint) stale.push({ findingId: finding.id, reason: 'anchor-changed', elementId: finding.elementId })
      } else if (finding.relationshipId) {
        const relationship = relationships.get(finding.relationshipId)
        if (!relationship) stale.push({ findingId: finding.id, reason: 'anchor-deleted', relationshipId: finding.relationshipId })
        else if (relationshipFingerprint(relationship) !== finding.anchorFingerprint) stale.push({ findingId: finding.id, reason: 'anchor-changed', relationshipId: finding.relationshipId })
      }
    }
    return { reviewId, stale }
  }

  private async directory(): Promise<string> {
    const root = await realpath(this.rootPath)
    const directory = resolve(root, 'reviews')
    await assertNoSymlinkSegments(root, directory)
    await mkdir(directory, { recursive: true })
    await assertNoSymlinkSegments(root, directory)
    return directory
  }

  private async persist(review: ModelReview): Promise<ModelReview> {
    const validated = validateReview(review)
    const directory = await this.directory()
    const destination = resolve(directory, `${validated.id}.json`)
    const temporary = resolve(directory, `.${validated.id}.${process.pid}.${Date.now()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, destination)
    return structuredClone(validated)
  }
}

function resolveAnchorFingerprint(snapshot: SemanticSnapshot, elementId?: string, relationshipId?: string): string {
  if (Boolean(elementId) === Boolean(relationshipId)) throw new Error('Finding requires exactly one element or relationship anchor')
  if (elementId) {
    const element = snapshot.elements.find((item) => item.id === elementId)
    if (!element) throw new Error(`Unknown finding element anchor: ${elementId}`)
    return element.fingerprint
  }
  const relationship = snapshot.relationships.find((item) => item.id === relationshipId)
  if (!relationship) throw new Error(`Unknown finding relationship anchor: ${relationshipId}`)
  return relationshipFingerprint(relationship)
}

function relationshipFingerprint(relationship: SemanticSnapshot['relationships'][number]): string {
  return JSON.stringify({ kind: relationship.kind, sourceId: relationship.sourceId, targetId: relationship.targetId })
}

function validateReview(value: unknown): ModelReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Review record must be an object')
  const review = value as ModelReview
  if (review.schemaVersion !== 1) throw new Error('Review schemaVersion must be 1')
  validateId(review.id, 'review')
  if (!Array.isArray(review.findings) || !Array.isArray(review.history)) throw new Error('Review findings and history must be arrays')
  if (!['open', 'in-review', 'closed', 'cancelled'].includes(review.status)) throw new Error('Review status is invalid')
  for (const finding of review.findings) {
    validateId(finding.id, 'finding')
    if (!finding.anchorFingerprint || !Array.isArray(finding.history) || !Array.isArray(finding.evidence)) throw new Error('Review finding is invalid')
  }
  if (Buffer.byteLength(JSON.stringify(review), 'utf8') > 4 * 1024 * 1024) throw new Error('Review exceeds the 4 MiB limit')
  return structuredClone(review)
}

function validateId(value: string, description: string): void {
  if (typeof value !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,79}$/.test(value)) throw new Error(`${description} id must be a bounded uppercase identifier`)
}
function validateTimestamp(value: string): void { if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('Timestamp is invalid') }

async function assertNoSymlinkSegments(root: string, target: string): Promise<void> {
  if (!isWithin(root, target)) throw new Error('Review path escapes workspace')
  let current = root
  for (const segment of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Review paths may not contain symbolic links')
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
