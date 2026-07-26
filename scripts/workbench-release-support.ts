import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export interface ReleaseFile {
  path: string
  bytes: number
  mode: string
  sha256: string
}

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

export async function inventoryFiles(
  root: string,
  excludedPaths: ReadonlySet<string> = new Set(),
): Promise<ReleaseFile[]> {
  const files: ReleaseFile[] = []
  await walk(root)
  return files.sort((left, right) => left.path.localeCompare(right.path))

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name)
      const path = normalizePath(relative(root, absolute))
      if (excludedPaths.has(path)) continue
      if (entry.isDirectory()) {
        await walk(absolute)
      } else if (entry.isFile()) {
        const details = await stat(absolute)
        files.push({
          path,
          bytes: details.size,
          mode: (details.mode & 0o777).toString(8).padStart(3, '0'),
          sha256: await sha256File(absolute),
        })
      } else {
        throw new Error(`Release tree cannot contain links or special files: ${path}`)
      }
    }
  }
}

export function normalizePath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    )
  }
  return value
}
