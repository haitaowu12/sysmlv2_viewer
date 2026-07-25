import {
  failure,
  JSON_RPC_ERRORS,
  requireRecord,
  requireString,
  success,
  WORKBENCH_METHODS,
  WORKBENCH_PROTOCOL_VERSION,
  type InitializeParams,
  type InitializeResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../../workbench-protocol/src/index.js'
import type { LanguageAdapter } from '../../language-adapter/src/index.js'
import { WorkspaceManager } from './workspace.js'

export interface WorkbenchServiceOptions {
  adapter: LanguageAdapter
  allowedRoots: string[]
  transport: InitializeResult['transport']
  serviceVersion?: string
}

export class WorkbenchService {
  readonly workspaces: WorkspaceManager
  private initialized = false

  constructor(private readonly options: WorkbenchServiceOptions) {
    this.workspaces = new WorkspaceManager({
      allowedRoots: options.allowedRoots,
      adapter: options.adapter,
    })
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      if (
        !this.initialized &&
        request.method !== WORKBENCH_METHODS.initialize &&
        request.method !== WORKBENCH_METHODS.health
      ) {
        return failure(
          request.id,
          JSON_RPC_ERRORS.notInitialized,
          'workbench/initialize must be called before this method',
        )
      }

      switch (request.method) {
        case WORKBENCH_METHODS.initialize:
          return success(request.id, await this.initialize(request.params))
        case WORKBENCH_METHODS.health:
          return success(request.id, {
            status: 'ok',
            initialized: this.initialized,
            languageEngine: this.options.adapter.health(),
          })
        case WORKBENCH_METHODS.workspaceOpen: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.open(
              requireString(params.workspaceFile, 'workspaceFile'),
            ),
          )
        }
        case WORKBENCH_METHODS.workspaceStatus: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            this.workspaces.status(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.workspaceClose: {
          const params = requireRecord(request.params)
          return success(request.id, {
            closed: await this.workspaces.close(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          })
        }
        case WORKBENCH_METHODS.languageDiagnostics: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            this.workspaces.diagnostics(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        case WORKBENCH_METHODS.languageDocumentSymbols: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            await this.workspaces.documentSymbols(
              params.workspaceId,
              params.documentUri,
            ),
          )
        }
        case WORKBENCH_METHODS.languageDefinition: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.definition(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageReferences: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.references(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageHover: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.hover(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageCompletion: {
          const params = languagePositionParams(request.params)
          return success(
            request.id,
            await this.workspaces.completion(
              params.workspaceId,
              params.documentUri,
              params.position,
            ),
          )
        }
        case WORKBENCH_METHODS.languageSemanticTokens: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            await this.workspaces.semanticTokens(
              params.workspaceId,
              params.documentUri,
            ),
          )
        }
        case WORKBENCH_METHODS.languageRename: {
          const params = languagePositionParams(request.params)
          const values = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.rename(
              params.workspaceId,
              params.documentUri,
              params.position,
              requireString(values.newName, 'newName'),
            ),
          )
        }
        case WORKBENCH_METHODS.languageFormatting: {
          const params = languageDocumentParams(request.params)
          return success(
            request.id,
            await this.workspaces.formatting(
              params.workspaceId,
              params.documentUri,
            ),
          )
        }
        case WORKBENCH_METHODS.languageDocumentChange: {
          const params = languageDocumentParams(request.params)
          const values = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.changeDocument(
              params.workspaceId,
              params.documentUri,
              requirePositiveInteger(values.version, 'version'),
              requireStringValue(values.text, 'text'),
            ),
          )
        }
        case WORKBENCH_METHODS.languageRestart: {
          const params = requireRecord(request.params)
          return success(
            request.id,
            await this.workspaces.restart(
              requireString(params.workspaceId, 'workspaceId'),
            ),
          )
        }
        default:
          return failure(
            request.id,
            JSON_RPC_ERRORS.methodNotFound,
            `Unknown method: ${request.method}`,
          )
      }
    } catch (error) {
      if (error instanceof TypeError) {
        return failure(
          request.id,
          JSON_RPC_ERRORS.invalidParams,
          error.message,
        )
      }
      return failure(
        request.id,
        JSON_RPC_ERRORS.workspaceRejected,
        error instanceof Error ? error.message : 'Workbench operation failed',
      )
    }
  }

  async dispose(): Promise<void> {
    await this.workspaces.dispose()
  }

  private async initialize(paramsValue: unknown): Promise<InitializeResult> {
    const params = requireRecord(paramsValue) as unknown as InitializeParams
    const version = requireString(params.protocolVersion, 'protocolVersion')
    if (version.split('.')[0] !== WORKBENCH_PROTOCOL_VERSION.split('.')[0]) {
      throw new TypeError(
        `Unsupported protocol version ${version}; service supports ${WORKBENCH_PROTOCOL_VERSION}`,
      )
    }
    await this.workspaces.initialize()
    this.initialized = true
    return {
      protocolVersion: WORKBENCH_PROTOCOL_VERSION,
      service: {
        name: 'SysML Engineering Workbench Service',
        version: this.options.serviceVersion ?? '0.1.0',
      },
      languageAuthority: this.options.adapter.metadata,
      transport: this.options.transport,
      capabilities: this.options.adapter.capabilities,
      capabilitiesFinal: this.options.adapter.capabilitiesFinal(),
    }
  }
}

function languageDocumentParams(value: unknown): {
  workspaceId: string
  documentUri: string
} {
  const params = requireRecord(value)
  return {
    workspaceId: requireString(params.workspaceId, 'workspaceId'),
    documentUri: requireString(params.documentUri, 'documentUri'),
  }
}

function languagePositionParams(value: unknown): {
  workspaceId: string
  documentUri: string
  position: { line: number; character: number }
} {
  const params = languageDocumentParams(value)
  const valueRecord = requireRecord(value)
  const position = requireRecord(valueRecord.position, 'position')
  const line = requireNonNegativeInteger(position.line, 'position.line')
  const character = requireNonNegativeInteger(
    position.character,
    'position.character',
  )
  return {
    ...params,
    position: { line, character },
  }
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`)
  }
  return value as number
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer`)
  }
  return value as number
}

function requireStringValue(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`)
  }
  return value
}
