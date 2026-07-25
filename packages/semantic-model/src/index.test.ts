// @vitest-environment node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { WorkbenchDocumentSymbol } from '../../workbench-protocol/src/index.js'
import type { WorkspaceDocument } from '../../language-adapter/src/index.js'
import {
  buildSemanticSnapshot,
  IdentityRegistry,
  type IdentityLocator,
} from './index.js'

const root = resolve('/workspace')

describe('normalized semantic snapshot', () => {
  it('keeps identities stable through formatting and line movement', () => {
    const registry = IdentityRegistry.empty('sample')
    const first = snapshot(
      'package Sample {\n    part def Vehicle;\n}\n',
      symbol(0, 0, 2, 1, [
        symbol(1, 4, 1, 21, [], 'Sample.Vehicle'),
      ]),
      registry,
    )
    const second = snapshot(
      '\n\npackage Sample {\n\n        part   def   Vehicle;\n}\n',
      symbol(2, 0, 5, 1, [
        symbol(4, 8, 4, 29, [], 'Sample.Vehicle'),
      ]),
      registry,
    )

    expect(first.elements.map((element) => element.id)).toEqual(
      second.elements.map((element) => element.id),
    )
    expect(first.snapshotSha256).not.toBe(second.snapshotSha256)
    expect(second.elements.find((element) => element.name === 'Vehicle')).toMatchObject({
      kind: 'PartDefinition',
      qualifiedName: 'Sample::Vehicle',
      provenance: { classification: 'recognized-declaration' },
    })
  })

  it('preserves unrecognized engine symbols as opaque', () => {
    const result = snapshot(
      'package Sample {\n    experimental thing Mystery;\n}\n',
      symbol(0, 0, 2, 1, [
        symbol(1, 4, 1, 31, [], 'Sample.Mystery'),
      ]),
      IdentityRegistry.empty('sample'),
    )
    expect(result.elements.find((element) => element.name === 'Mystery')).toMatchObject({
      kind: 'OpaqueElement',
      provenance: { classification: 'opaque' },
    })
  })

  it('produces portable identities and hashes across workspace clones', () => {
    const text = 'package Sample {\n    part def Vehicle;\n}\n'
    const symbols = symbol(0, 0, 2, 1, [
      symbol(1, 4, 1, 21, [], 'Sample.Vehicle'),
    ])
    const first = snapshot(
      text,
      symbols,
      IdentityRegistry.empty('sample'),
      resolve('/clone-a'),
    )
    const second = snapshot(
      text,
      symbols,
      IdentityRegistry.empty('sample'),
      resolve('/clone-b'),
    )
    expect(first.elements.map((element) => element.id)).toEqual(
      second.elements.map((element) => element.id),
    )
    expect(first.snapshotSha256).toBe(second.snapshotSha256)
  })

  it('fails closed on invalid engine ranges and ambiguous semantic locators', () => {
    expect(() =>
      snapshot(
        'package Sample {}\n',
        symbol(0, 0, 99, 0, []),
        IdentityRegistry.empty('sample'),
      ),
    ).toThrow('invalid symbol range')

    expect(() =>
      snapshot(
        'package Sample {\n  part vehicle;\n  part vehicle;\n}\n',
        symbol(0, 0, 3, 1, [
          symbol(1, 2, 1, 15, [], 'Sample.vehicle'),
          symbol(2, 2, 2, 15, [], 'Sample.vehicle'),
        ]),
        IdentityRegistry.empty('sample'),
      ),
    ).toThrow('Ambiguous semantic locator')
  })
})

describe('identity registry', () => {
  it('records explicit command rename/move as aliases of one durable id', () => {
    const registry = IdentityRegistry.empty('sample')
    const firstLocator: IdentityLocator = {
      workspacePath: 'model/vehicle.sysml',
      qualifiedName: 'Sample::Vehicle',
      kind: 'PartDefinition',
    }
    const first = registry.resolve(firstLocator, 'before')
    const migrated = registry.migrate(
      first.id,
      {
        workspacePath: 'model/platform.sysml',
        qualifiedName: 'Sample::Platform',
        kind: 'PartDefinition',
      },
      'after',
      'CMD-RENAME-MOVE-001',
    )
    expect(migrated.id).toBe(first.id)
    expect(migrated.aliases).toEqual([
      {
        priorLocator: firstLocator,
        commandId: 'CMD-RENAME-MOVE-001',
      },
    ])
  })

  it('rejects duplicate persisted identities and locators', () => {
    const locator: IdentityLocator = {
      workspacePath: 'model/vehicle.sysml',
      qualifiedName: 'Sample::Vehicle',
      kind: 'PartDefinition',
    }
    expect(
      () =>
        new IdentityRegistry({
          schemaVersion: 1,
          workspaceId: 'sample',
          records: [
            { id: 'wb:sample:one', locator, fingerprint: 'one', aliases: [] },
            { id: 'wb:sample:two', locator, fingerprint: 'two', aliases: [] },
          ],
        }),
    ).toThrow('Duplicate identity registry entry')
  })
})

function snapshot(
  text: string,
  rootSymbol: WorkbenchDocumentSymbol,
  identities: IdentityRegistry,
  workspaceRoot = root,
) {
  const documentUri = pathToFileURL(
    resolve(workspaceRoot, 'model/vehicle.sysml'),
  ).href
  const document: WorkspaceDocument = {
    uri: documentUri,
    absolutePath: fileURLPath(documentUri),
    languageId: 'sysml',
    version: 1,
    text,
    sha256: `sha-${text.length}`,
  }
  return buildSemanticSnapshot({
    status: {
      workspaceId: 'sample',
      rootUri: pathToFileURL(workspaceRoot).href,
      configurationName: 'default',
      indexState: 'ready',
      semanticAuthority: 'qualified-engine',
      documentCount: 1,
      snapshotSha256: 'inventory',
      documents: [
        {
          uri: documentUri,
          languageId: 'sysml',
          sha256: document.sha256,
          byteLength: Buffer.byteLength(text),
        },
      ],
      diagnostics: { errors: 0, warnings: 0, information: 0, hints: 0 },
      languageCapabilities: {
        workspaceLifecycle: true,
        diagnostics: true,
        documentSymbols: true,
        workspaceSymbols: true,
        definitions: true,
        references: true,
        completion: true,
        hover: true,
        semanticTokens: true,
        rename: true,
        formatting: true,
        semanticSnapshot: true,
      },
      capabilitiesFinal: true,
    },
    authority: {
      adapterId: 'qualified-test',
      adapterVersion: '1',
      engineName: 'test',
      engineVersion: '1',
      referenceRelease: 'test',
      qualificationStatus: 'qualified',
    },
    documents: [document],
    symbols: new Map([[documentUri, [rootSymbol]]]),
    identities,
  })
}

function symbol(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  children: WorkbenchDocumentSymbol[],
  name = 'Sample',
): WorkbenchDocumentSymbol {
  const range = {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  }
  return {
    name,
    kind: 'property',
    range,
    selectionRange: range,
    children,
  }
}

function fileURLPath(value: string): string {
  return new URL(value).pathname
}
