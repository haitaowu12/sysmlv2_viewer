import { createHash } from 'node:crypto'

export interface IdentityLocator {
  workspacePath: string
  qualifiedName: string
  kind: string
}

export interface IdentityAlias {
  priorLocator: IdentityLocator
  commandId: string
}

export interface IdentityRecord {
  id: string
  locator: IdentityLocator
  fingerprint: string
  aliases: IdentityAlias[]
  status: 'active' | 'tombstone'
  generation: number
}

export interface IdentityReconciliationReceipt {
  id: string
  identityId: string
  kind: 'automatic-reconciliation' | 'command-migration'
  priorLocator: IdentityLocator
  nextLocator: IdentityLocator
  fingerprint: string
  commandId?: string
}

export interface IdentityRegistryData {
  schemaVersion: 2
  workspaceId: string
  records: IdentityRecord[]
  receipts: IdentityReconciliationReceipt[]
}

interface IdentityRegistryDataV1 {
  schemaVersion: 1
  workspaceId: string
  records: Array<Omit<IdentityRecord, 'status' | 'generation'>>
}

const MAX_IDENTITY_RECORDS = 200_000
const MAX_IDENTITY_STRING_LENGTH = 4_096

export class IdentityReconciliationError extends Error {
  constructor(
    message: string,
    readonly locator: IdentityLocator,
    readonly candidateIds: string[],
  ) {
    super(message)
    this.name = 'IdentityReconciliationError'
  }
}

export class IdentityRegistry {
  private changed = false
  private snapshotOpen = false
  private readonly seen = new Set<string>()
  private readonly activeByLocator = new Map<string, IdentityRecord>()
  private readonly recordsById = new Map<string, IdentityRecord>()
  private readonly data: IdentityRegistryData

  constructor(data: IdentityRegistryData | IdentityRegistryDataV1) {
    this.data = migrateRegistryData(data)
    validateRegistryData(this.data)
    for (const record of this.data.records) this.addExisting(record)
  }

  static empty(workspaceId: string): IdentityRegistry {
    return new IdentityRegistry({
      schemaVersion: 2,
      workspaceId,
      records: [],
      receipts: [],
    })
  }

  beginSnapshot(): void {
    if (this.snapshotOpen) {
      throw new Error('Identity snapshot reconciliation is already active')
    }
    this.snapshotOpen = true
    this.seen.clear()
  }

  completeSnapshot(): void {
    if (!this.snapshotOpen) {
      throw new Error('Identity snapshot reconciliation is not active')
    }
    for (const record of this.data.records) {
      if (record.status === 'active' && !this.seen.has(record.id)) {
        record.status = 'tombstone'
        this.activeByLocator.delete(locatorKey(record.locator))
        this.changed = true
      }
    }
    this.snapshotOpen = false
    this.seen.clear()
  }

  abortSnapshot(): void {
    this.snapshotOpen = false
    this.seen.clear()
  }

  resolve(locator: IdentityLocator, fingerprint: string): IdentityRecord {
    validateLocator(locator)
    validateBoundedString(fingerprint, 'fingerprint')
    const key = locatorKey(locator)
    const existing = this.activeByLocator.get(key)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        existing.fingerprint = fingerprint
        this.changed = true
      }
      this.markSeen(existing)
      return structuredClone(existing)
    }

    const tombstoneAtSameLocator = this.data.records.some(
      (record) =>
        record.status === 'tombstone' && locatorKey(record.locator) === key,
    )
    if (!tombstoneAtSameLocator && this.snapshotOpen) {
      const candidates = this.data.records.filter(
        (record) =>
          !this.seen.has(record.id) &&
          record.fingerprint === fingerprint &&
          record.locator.kind === locator.kind &&
          locatorKey(record.locator) !== key,
      )
      if (candidates.length > 1) {
        throw new IdentityReconciliationError(
          `Identity reconciliation is ambiguous for ${key}`,
          locator,
          candidates.map((candidate) => candidate.id).sort(),
        )
      }
      if (candidates.length === 1) {
        const candidate = candidates[0]!
        const priorLocator = structuredClone(candidate.locator)
        this.activeByLocator.delete(locatorKey(candidate.locator))
        candidate.locator = structuredClone(locator)
        candidate.fingerprint = fingerprint
        candidate.status = 'active'
        candidate.aliases.push({
          priorLocator,
          commandId: `reconcile:${receiptDigest(candidate.id, priorLocator, locator)}`,
        })
        this.activeByLocator.set(key, candidate)
        this.appendReceipt(candidate, 'automatic-reconciliation', priorLocator, locator)
        this.markSeen(candidate)
        this.changed = true
        return structuredClone(candidate)
      }
    }

    const generation = this.data.records
      .filter((record) => locatorKey(record.locator) === key)
      .reduce((maximum, record) => Math.max(maximum, record.generation), -1) + 1
    const id = initialIdentity(this.data.workspaceId, locator, generation)
    if (this.recordsById.has(id)) {
      throw new Error(`Identity collision for ${key}`)
    }
    const record: IdentityRecord = {
      id,
      locator: structuredClone(locator),
      fingerprint,
      aliases: [],
      status: 'active',
      generation,
    }
    this.data.records.push(record)
    this.activeByLocator.set(key, record)
    this.recordsById.set(id, record)
    this.markSeen(record)
    this.changed = true
    return structuredClone(record)
  }

  migrate(
    id: string,
    nextLocator: IdentityLocator,
    fingerprint: string,
    commandId: string,
  ): IdentityRecord {
    const record = this.recordsById.get(id)
    if (!record || record.status !== 'active') {
      throw new Error(`Unknown active durable model identity: ${id}`)
    }
    validateLocator(nextLocator)
    validateBoundedString(fingerprint, 'fingerprint')
    validateBoundedString(commandId, 'commandId')
    const nextKey = locatorKey(nextLocator)
    const occupied = this.activeByLocator.get(nextKey)
    if (occupied && occupied.id !== id) {
      throw new Error(`Identity locator is already assigned: ${nextKey}`)
    }
    const priorLocator = structuredClone(record.locator)
    this.activeByLocator.delete(locatorKey(record.locator))
    record.aliases.push({ priorLocator, commandId })
    record.locator = structuredClone(nextLocator)
    record.fingerprint = fingerprint
    this.activeByLocator.set(nextKey, record)
    this.appendReceipt(
      record,
      'command-migration',
      priorLocator,
      nextLocator,
      commandId,
    )
    this.markSeen(record)
    this.changed = true
    return structuredClone(record)
  }

  anchorState(id: string): 'resolved' | 'stale' | 'missing' {
    const record = this.recordsById.get(id)
    if (!record) return 'missing'
    return record.status === 'active' ? 'resolved' : 'stale'
  }

  hasChanges(): boolean {
    return this.changed
  }

  serialize(): IdentityRegistryData {
    return {
      schemaVersion: 2,
      workspaceId: this.data.workspaceId,
      records: this.data.records
        .map((record) => structuredClone(record))
        .sort((left, right) => left.id.localeCompare(right.id)),
      receipts: this.data.receipts
        .map((receipt) => structuredClone(receipt))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }
  }

  markPersisted(): void {
    this.changed = false
  }

  private markSeen(record: IdentityRecord): void {
    if (this.snapshotOpen) this.seen.add(record.id)
  }

  private appendReceipt(
    record: IdentityRecord,
    kind: IdentityReconciliationReceipt['kind'],
    priorLocator: IdentityLocator,
    nextLocator: IdentityLocator,
    commandId?: string,
  ): void {
    const id = `identity-receipt:${receiptDigest(record.id, priorLocator, nextLocator, commandId)}`
    if (this.data.receipts.some((receipt) => receipt.id === id)) return
    this.data.receipts.push({
      id,
      identityId: record.id,
      kind,
      priorLocator: structuredClone(priorLocator),
      nextLocator: structuredClone(nextLocator),
      fingerprint: record.fingerprint,
      commandId,
    })
  }

  private addExisting(record: IdentityRecord): void {
    const copy = structuredClone(record)
    if (this.recordsById.has(copy.id)) {
      throw new Error(`Duplicate identity registry entry: ${copy.id}`)
    }
    if (copy.status === 'active') {
      const key = locatorKey(copy.locator)
      if (this.activeByLocator.has(key)) {
        throw new Error(`Duplicate identity registry entry: ${copy.id}`)
      }
      this.activeByLocator.set(key, copy)
    }
    this.recordsById.set(copy.id, copy)
    const index = this.data.records.indexOf(record)
    this.data.records[index] = copy
  }
}

function migrateRegistryData(
  data: IdentityRegistryData | IdentityRegistryDataV1,
): IdentityRegistryData {
  if (data.schemaVersion === 2) return structuredClone(data)
  return {
    schemaVersion: 2,
    workspaceId: data.workspaceId,
    records: data.records.map((record) => ({
      ...structuredClone(record),
      status: 'active',
      generation: 0,
    })),
    receipts: [],
  }
}

function initialIdentity(
  workspaceId: string,
  locator: IdentityLocator,
  generation: number,
): string {
  const digest = createHash('sha256')
    .update([
      workspaceId,
      locator.workspacePath,
      locator.qualifiedName,
      locator.kind,
      String(generation),
    ].join('\u0000'))
    .digest('hex')
    .slice(0, 32)
  return `wb:${slug(workspaceId)}:${digest}`
}

function receiptDigest(
  id: string,
  priorLocator: IdentityLocator,
  nextLocator: IdentityLocator,
  commandId = '',
): string {
  return createHash('sha256')
    .update(JSON.stringify({ id, priorLocator, nextLocator, commandId }))
    .digest('hex')
    .slice(0, 24)
}

function locatorKey(locator: IdentityLocator): string {
  return [locator.workspacePath, locator.qualifiedName, locator.kind].join('\u0000')
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48)
}

function validateRegistryData(data: IdentityRegistryData): void {
  if (
    data.schemaVersion !== 2 ||
    !isBoundedString(data.workspaceId) ||
    !Array.isArray(data.records) ||
    data.records.length > MAX_IDENTITY_RECORDS ||
    !Array.isArray(data.receipts) ||
    data.receipts.length > MAX_IDENTITY_RECORDS
  ) {
    throw new Error('Identity registry must use schemaVersion 2 and bounded arrays')
  }
  for (const record of data.records) {
    if (
      !isBoundedString(record.id) ||
      !isLocator(record.locator) ||
      !isBoundedString(record.fingerprint) ||
      !Array.isArray(record.aliases) ||
      !['active', 'tombstone'].includes(record.status) ||
      !Number.isInteger(record.generation) ||
      record.generation < 0
    ) {
      throw new Error(`Invalid identity registry record: ${String(record?.id)}`)
    }
    for (const alias of record.aliases) {
      if (!isLocator(alias.priorLocator) || !isBoundedString(alias.commandId)) {
        throw new Error(`Invalid identity alias for ${record.id}`)
      }
    }
  }
  for (const receipt of data.receipts) {
    if (
      !isBoundedString(receipt.id) ||
      !isBoundedString(receipt.identityId) ||
      !isLocator(receipt.priorLocator) ||
      !isLocator(receipt.nextLocator) ||
      !isBoundedString(receipt.fingerprint) ||
      !['automatic-reconciliation', 'command-migration'].includes(receipt.kind)
    ) {
      throw new Error(`Invalid identity reconciliation receipt: ${String(receipt?.id)}`)
    }
  }
}

function validateLocator(locator: IdentityLocator): void {
  if (!isLocator(locator)) throw new Error('Invalid identity locator')
}

function validateBoundedString(value: unknown, name: string): void {
  if (!isBoundedString(value)) throw new Error(`Invalid identity ${name}`)
}

function isLocator(value: unknown): value is IdentityLocator {
  return (
    isRecord(value) &&
    isBoundedString(value.workspacePath) &&
    isBoundedString(value.qualifiedName) &&
    isBoundedString(value.kind)
  )
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTITY_STRING_LENGTH
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
