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
}

export interface IdentityRegistryData {
  schemaVersion: 1
  workspaceId: string
  records: IdentityRecord[]
}

const MAX_IDENTITY_RECORDS = 200_000
const MAX_IDENTITY_STRING_LENGTH = 4_096

export class IdentityRegistry {
  private changed = false
  private readonly recordsByLocator = new Map<string, IdentityRecord>()
  private readonly recordsById = new Map<string, IdentityRecord>()

  constructor(private readonly data: IdentityRegistryData) {
    validateRegistryData(data)
    for (const record of data.records) {
      this.addExisting(record)
    }
  }

  static empty(workspaceId: string): IdentityRegistry {
    return new IdentityRegistry({
      schemaVersion: 1,
      workspaceId,
      records: [],
    })
  }

  resolve(locator: IdentityLocator, fingerprint: string): IdentityRecord {
    const key = locatorKey(locator)
    const existing = this.recordsByLocator.get(key)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        existing.fingerprint = fingerprint
        this.changed = true
      }
      return structuredClone(existing)
    }
    const id = initialIdentity(this.data.workspaceId, locator)
    const collision = this.recordsById.get(id)
    if (collision) {
      throw new Error(
        `Identity collision between ${locatorKey(collision.locator)} and ${key}`,
      )
    }
    const record: IdentityRecord = {
      id,
      locator: structuredClone(locator),
      fingerprint,
      aliases: [],
    }
    this.data.records.push(record)
    this.recordsByLocator.set(key, record)
    this.recordsById.set(id, record)
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
    if (!record) throw new Error(`Unknown durable model identity: ${id}`)
    const nextKey = locatorKey(nextLocator)
    const occupied = this.recordsByLocator.get(nextKey)
    if (occupied && occupied.id !== id) {
      throw new Error(`Identity locator is already assigned: ${nextKey}`)
    }
    this.recordsByLocator.delete(locatorKey(record.locator))
    record.aliases.push({
      priorLocator: structuredClone(record.locator),
      commandId,
    })
    record.locator = structuredClone(nextLocator)
    record.fingerprint = fingerprint
    this.recordsByLocator.set(nextKey, record)
    this.changed = true
    return structuredClone(record)
  }

  hasChanges(): boolean {
    return this.changed
  }

  serialize(): IdentityRegistryData {
    return {
      schemaVersion: 1,
      workspaceId: this.data.workspaceId,
      records: this.data.records
        .map((record) => structuredClone(record))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }
  }

  markPersisted(): void {
    this.changed = false
  }

  private addExisting(record: IdentityRecord): void {
    const key = locatorKey(record.locator)
    if (this.recordsByLocator.has(key) || this.recordsById.has(record.id)) {
      throw new Error(`Duplicate identity registry entry: ${record.id}`)
    }
    const copy = structuredClone(record)
    this.recordsByLocator.set(key, copy)
    this.recordsById.set(copy.id, copy)
    const index = this.data.records.indexOf(record)
    this.data.records[index] = copy
  }
}

function initialIdentity(
  workspaceId: string,
  locator: IdentityLocator,
): string {
  const digest = createHash('sha256')
    .update(
      [
        workspaceId,
        locator.workspacePath,
        locator.qualifiedName,
        locator.kind,
      ].join('\u0000'),
    )
    .digest('hex')
    .slice(0, 32)
  return `wb:${slug(workspaceId)}:${digest}`
}

function locatorKey(locator: IdentityLocator): string {
  return [
    locator.workspacePath,
    locator.qualifiedName,
    locator.kind,
  ].join('\u0000')
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 48)
}

function validateRegistryData(data: IdentityRegistryData): void {
  if (
    !isRecord(data) ||
    data.schemaVersion !== 1 ||
    !isBoundedString(data.workspaceId) ||
    !Array.isArray(data.records) ||
    data.records.length > MAX_IDENTITY_RECORDS
  ) {
    throw new Error(
      'Identity registry must use schemaVersion 1, a workspaceId, and a bounded records array',
    )
  }
  for (const record of data.records) {
    if (
      !isRecord(record) ||
      !isBoundedString(record.id) ||
      !isLocator(record.locator) ||
      !isBoundedString(record.fingerprint) ||
      !Array.isArray(record.aliases) ||
      record.aliases.length > MAX_IDENTITY_RECORDS
    ) {
      throw new Error(`Invalid identity registry record: ${String(record?.id)}`)
    }
    for (const alias of record.aliases) {
      if (
        !isRecord(alias) ||
        !isLocator(alias.priorLocator) ||
        !isBoundedString(alias.commandId)
      ) {
        throw new Error(`Invalid identity alias for ${record.id}`)
      }
    }
  }
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
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_IDENTITY_STRING_LENGTH
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
