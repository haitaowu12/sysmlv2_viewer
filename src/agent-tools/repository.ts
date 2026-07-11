import { execFileSync } from 'node:child_process';
import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import type { SemanticEdge, SemanticNode } from '../bridge/semantic-types';
import { sysmlCheck, sysmlModelSummary } from './kernel';
import type {
  AgentToolContext,
  CheckResult,
  ModelSummaryResult,
} from './types';

const EXACT_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const MAX_GIT_OUTPUT = 32 * 1024 * 1024;
const MAX_MODEL_FILES = 1_000;
const MAX_MODEL_BYTES = 25 * 1024 * 1024;

export type RepositoryAdapterErrorCode =
  | 'INVALID_REPOSITORY'
  | 'INVALID_COMMIT_PIN'
  | 'COMMIT_NOT_FOUND'
  | 'STALE_COMMIT'
  | 'REPOSITORY_READ_FAILED'
  | 'REPOSITORY_LIMIT_EXCEEDED'
  | 'INVALID_QUERY';

const SAFE_MESSAGES: Record<RepositoryAdapterErrorCode, string> = {
  INVALID_REPOSITORY: 'Repository is unavailable or is not a Git repository.',
  INVALID_COMMIT_PIN: 'Commit must be an exact full hexadecimal object ID.',
  COMMIT_NOT_FOUND: 'Pinned commit is unavailable in the repository.',
  STALE_COMMIT: 'Pinned commit is no longer reachable from repository refs.',
  REPOSITORY_READ_FAILED: 'Pinned repository content could not be read.',
  REPOSITORY_LIMIT_EXCEEDED: 'Pinned repository content exceeds adapter limits.',
  INVALID_QUERY: 'Repository query is invalid.',
};

export class RepositoryAdapterError extends Error {
  readonly code: RepositoryAdapterErrorCode;

  constructor(code: RepositoryAdapterErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'RepositoryAdapterError';
    this.code = code;
  }
}

export interface RepositoryPin {
  repositoryPath: string;
  commit: string;
}

export interface RepositoryIdentity {
  commit: string;
  dirtyWorkingTreeIgnored: boolean;
}

export interface RepositoryCommit {
  commit: string;
  parents: string[];
}

export interface RepositoryElement {
  id: string;
  semanticId: string;
  file: string;
  kind: string;
  name: string;
  qualifiedPath: string;
  parentId?: string;
  typeName?: string;
}

export interface RepositoryRelationship {
  id: string;
  file: string;
  kind: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface RepositoryQueryResult {
  repository: RepositoryIdentity;
}

interface LoadedRepository {
  repository: RepositoryIdentity;
  files: Array<{ path: string; content: string }>;
}

interface IndexedRepository extends LoadedRepository {
  elements: RepositoryElement[];
  relationships: RepositoryRelationship[];
}

function git(repositoryPath: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', repositoryPath, ...args], {
      encoding: 'utf8',
      maxBuffer: MAX_GIT_OUTPUT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new RepositoryAdapterError('REPOSITORY_READ_FAILED');
  }
}

function validateRepository(repositoryPath: string): void {
  try {
    execFileSync('git', ['-C', repositoryPath, 'rev-parse', '--git-dir'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new RepositoryAdapterError('INVALID_REPOSITORY');
  }
}

function validatePin(pin: RepositoryPin): RepositoryIdentity {
  validateRepository(pin.repositoryPath);
  if (!EXACT_COMMIT.test(pin.commit)) {
    throw new RepositoryAdapterError('INVALID_COMMIT_PIN');
  }

  let objectType: string;
  try {
    objectType = execFileSync(
      'git',
      ['-C', pin.repositoryPath, 'cat-file', '-t', pin.commit],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  } catch {
    throw new RepositoryAdapterError('COMMIT_NOT_FOUND');
  }
  if (objectType !== 'commit') {
    throw new RepositoryAdapterError('COMMIT_NOT_FOUND');
  }

  const containingRefs = git(
    pin.repositoryPath,
    ['for-each-ref', `--contains=${pin.commit}`, '--format=%(refname)'],
  ).trim();
  if (!containingRefs) {
    throw new RepositoryAdapterError('STALE_COMMIT');
  }

  let dirtyWorkingTreeIgnored = false;
  try {
    dirtyWorkingTreeIgnored = execFileSync(
      'git',
      ['-C', pin.repositoryPath, 'status', '--porcelain=v1', '-z'],
      {
        encoding: 'utf8',
        maxBuffer: MAX_GIT_OUTPUT,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).length > 0;
  } catch {
    // Bare repositories have no working tree. Blob reads remain commit-pinned.
  }

  return { commit: pin.commit.toLowerCase(), dirtyWorkingTreeIgnored };
}

function loadRepository(pin: RepositoryPin): LoadedRepository {
  const repository = validatePin(pin);
  const paths = git(pin.repositoryPath, ['ls-tree', '-r', '-z', '--name-only', pin.commit])
    .split('\0')
    .filter((path) => /\.(?:sysml|kerml)$/i.test(path))
    .sort((a, b) => a.localeCompare(b));
  if (paths.length > MAX_MODEL_FILES) {
    throw new RepositoryAdapterError('REPOSITORY_LIMIT_EXCEEDED');
  }

  let totalBytes = 0;
  const files = paths.map((path) => {
    const content = git(pin.repositoryPath, ['show', `${pin.commit}:${path}`]);
    totalBytes += Buffer.byteLength(content);
    if (totalBytes > MAX_MODEL_BYTES) {
      throw new RepositoryAdapterError('REPOSITORY_LIMIT_EXCEEDED');
    }
    return { path, content };
  });
  return { repository, files };
}

function repositoryNode(file: string, node: SemanticNode): RepositoryElement {
  return {
    id: `${file}#${node.id}`,
    semanticId: node.id,
    file,
    kind: node.kind,
    name: node.name,
    qualifiedPath: node.sysmlPath,
    ...(node.parentId ? { parentId: `${file}#${node.parentId}` } : {}),
    ...(node.typeName ? { typeName: node.typeName } : {}),
  };
}

function repositoryEdge(file: string, edge: SemanticEdge): RepositoryRelationship {
  return {
    id: `${file}#${edge.id}`,
    file,
    kind: edge.kind,
    sourceId: `${file}#${edge.sourceId}`,
    targetId: `${file}#${edge.targetId}`,
    ...(edge.label ? { label: edge.label } : {}),
  };
}

function indexRepository(pin: RepositoryPin): IndexedRepository {
  const loaded = loadRepository(pin);
  const elements: RepositoryElement[] = [];
  const relationships: RepositoryRelationship[] = [];
  for (const file of loaded.files) {
    const semantic = buildSemanticModelFromSource(file.content);
    elements.push(...semantic.nodes.map((node) => repositoryNode(file.path, node)));
    relationships.push(...semantic.edges.map((edge) => repositoryEdge(file.path, edge)));
  }
  return { ...loaded, elements, relationships };
}

export function listCommits(
  request: RepositoryPin & { maxCount?: number },
): RepositoryQueryResult & { commits: RepositoryCommit[] } {
  const repository = validatePin(request);
  const maxCount = Math.min(500, Math.max(1, Math.floor(request.maxCount ?? 50)));
  const output = git(
    request.repositoryPath,
    ['rev-list', '--parents', `--max-count=${maxCount}`, request.commit],
  );
  const commits = output.trim().split('\n').filter(Boolean).map((line) => {
    const [commit, ...parents] = line.split(' ');
    return { commit, parents };
  });
  return { repository, commits };
}

export function modelSummaryAtCommit(
  request: RepositoryPin & { context: AgentToolContext; maxElements?: number },
): RepositoryQueryResult & { files: string[]; summary: ModelSummaryResult } {
  const loaded = loadRepository(request);
  return {
    repository: loaded.repository,
    files: loaded.files.map((file) => file.path),
    summary: sysmlModelSummary({
      context: request.context,
      files: loaded.files,
      maxElements: request.maxElements,
    }),
  };
}

export function getElement(
  request: RepositoryPin & { elementId?: string; qualifiedPath?: string; name?: string },
): RepositoryQueryResult & { matches: RepositoryElement[] } {
  if (!request.elementId && !request.qualifiedPath && !request.name) {
    throw new RepositoryAdapterError('INVALID_QUERY');
  }
  const indexed = indexRepository(request);
  const matches = indexed.elements.filter((element) => (
    (request.elementId === undefined || element.id === request.elementId)
    && (request.qualifiedPath === undefined || element.qualifiedPath === request.qualifiedPath)
    && (request.name === undefined || element.name === request.name)
  ));
  return { repository: indexed.repository, matches };
}

export function getRelationships(
  request: RepositoryPin & { elementId: string },
): RepositoryQueryResult & {
    element?: RepositoryElement;
    relationships: RepositoryRelationship[];
  } {
  if (!request.elementId) throw new RepositoryAdapterError('INVALID_QUERY');
  const indexed = indexRepository(request);
  return {
    repository: indexed.repository,
    element: indexed.elements.find((element) => element.id === request.elementId),
    relationships: indexed.relationships.filter((relationship) => (
      relationship.sourceId === request.elementId || relationship.targetId === request.elementId
    )),
  };
}

function elementsByKind(
  request: RepositoryPin,
  kinds: ReadonlySet<string>,
): RepositoryQueryResult & { elements: RepositoryElement[] } {
  const indexed = indexRepository(request);
  return {
    repository: indexed.repository,
    elements: indexed.elements.filter((element) => kinds.has(element.kind)),
  };
}

export function getRequirements(
  request: RepositoryPin,
): RepositoryQueryResult & { elements: RepositoryElement[] } {
  return elementsByKind(request, new Set(['RequirementDef', 'RequirementUsage']));
}

export function getInterfaces(
  request: RepositoryPin,
): RepositoryQueryResult & { elements: RepositoryElement[] } {
  return elementsByKind(request, new Set(['InterfaceDef', 'InterfaceUsage']));
}

export function runQualityChecks(
  request: RepositoryPin & { context: AgentToolContext; maxDiagnostics?: number },
): RepositoryQueryResult & { check: CheckResult } {
  const loaded = loadRepository(request);
  return {
    repository: loaded.repository,
    check: sysmlCheck({
      context: request.context,
      files: loaded.files,
      maxDiagnostics: request.maxDiagnostics,
    }),
  };
}
