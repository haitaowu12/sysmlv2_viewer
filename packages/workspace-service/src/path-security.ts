import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspacePathError'
  }
}

export function assertLoopbackAddress(address: string): void {
  if (address !== '127.0.0.1' && address !== '::1') {
    throw new WorkspacePathError(
      `Workbench service may bind only to a loopback address, received ${address}`,
    )
  }
}

export function isPathWithin(root: string, candidate: string): boolean {
  const delta = relative(root, candidate)
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..' && !isAbsolute(delta))
}

export async function resolveExistingWithin(
  root: string,
  candidate: string,
): Promise<string> {
  const resolvedRoot = await realpath(resolve(root))
  const absoluteCandidate = resolve(resolvedRoot, candidate)
  const resolvedCandidate = await realpath(absoluteCandidate)

  if (!isPathWithin(resolvedRoot, resolvedCandidate)) {
    throw new WorkspacePathError(
      `Path resolves outside the authorized root: ${candidate}`,
    )
  }

  return resolvedCandidate
}

export async function resolveWithinAnyRoot(
  roots: string[],
  candidate: string,
): Promise<{ root: string; path: string }> {
  const resolvedCandidate = await realpath(resolve(candidate))
  for (const root of roots) {
    const resolvedRoot = await realpath(resolve(root))
    if (isPathWithin(resolvedRoot, resolvedCandidate)) {
      return { root: resolvedRoot, path: resolvedCandidate }
    }
  }

  throw new WorkspacePathError(
    `Path is outside all authorized workspace roots: ${candidate}`,
  )
}
