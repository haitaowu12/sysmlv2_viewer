import { createHash } from 'node:crypto'

let input = Buffer.alloc(0)
let documentUri = ''
let crashScheduled = false
let initialized = false
let documentVersion = 0
let semanticEvidenceRevision = 0
let openedDocumentCount = 0
const documentTexts = new Map()

process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk])
  consume()
})

function consume() {
  while (true) {
    const headerEnd = input.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = input.subarray(0, headerEnd).toString('ascii')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) process.exit(2)
    const length = Number.parseInt(match[1], 10)
    const start = headerEnd + 4
    if (input.byteLength < start + length) return
    const message = JSON.parse(input.subarray(start, start + length).toString())
    input = input.subarray(start + length)
    handle(message)
  }
}

function handle(message) {
  if (message.method === 'initialize') {
    if (initialized) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32600, message: 'initialize may only be sent once' }
      })
      return
    }
    initialized = true
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        capabilities: {
          documentSymbolProvider: true,
          definitionProvider: true,
          referencesProvider: true,
          completionProvider: {},
          hoverProvider: true,
          semanticTokensProvider: {
            legend: {
              tokenTypes: ['namespace'],
              tokenModifiers: ['declaration']
            },
            full: true
          },
          renameProvider: true,
          documentFormattingProvider: true
        }
      }
    })
  } else if (message.method === 'textDocument/didOpen') {
    openedDocumentCount += 1
    documentUri = message.params.textDocument.uri
    documentVersion = message.params.textDocument.version
    documentTexts.set(documentUri, message.params.textDocument.text ?? '')
    const persistentError = process.env.FAKE_LSP_PERSISTENT_OPEN_ERROR === '1'
      ? [{
          range: range(),
          severity: 1,
          code: 'FAKE-PERSISTENT-001',
          message: 'persistent indexing error'
        }]
      : null
    const transientError = process.env.FAKE_LSP_TRANSIENT_OPEN_ERROR === '1'
      ? openedDocumentCount === 1
        ? [{
            range: range(),
            severity: 1,
            code: 'FAKE-TRANSIENT-001',
            message: 'transient initial indexing error'
          }]
        : []
      : null
    send({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: message.params.textDocument.uri,
        diagnostics: persistentError ?? transientError ?? [{
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 }
          },
          severity: 2,
          code: 'FAKE-001',
          message: 'deterministic fake diagnostic'
        }]
      }
    })
    if (process.env.FAKE_LSP_CRASH_AFTER_OPEN === '1' && !crashScheduled) {
      crashScheduled = true
      setTimeout(
        () => process.exit(17),
        Number(process.env.FAKE_LSP_CRASH_DELAY_MS ?? 25)
      )
    }
  } else if (message.method === 'textDocument/didChange') {
    documentVersion = message.params.textDocument.version
    const text = message.params.contentChanges[0]?.text ?? ''
    if (process.env.FAKE_LSP_NO_CHANGE_DIAGNOSTICS === '1') return
    documentTexts.set(message.params.textDocument.uri, text)
    const publishChangedDiagnostics = () => send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri: message.params.textDocument.uri,
          version: documentVersion,
          diagnostics: process.env.FAKE_LSP_PERSISTENT_OPEN_ERROR === '1'
            ? [{
                range: range(),
                severity: 1,
                code: 'FAKE-PERSISTENT-001',
                message: 'persistent indexing error'
              }]
            : text.includes('BROKEN')
            ? [{
                range: range(),
                severity: 1,
                code: 'FAKE-CHANGE-001',
                message: 'changed document is broken'
              }]
            : []
        }
      })
    if (process.env.FAKE_LSP_DELAY_CHANGE_DIAGNOSTICS === '1') {
      setTimeout(publishChangedDiagnostics, 400)
    } else {
      publishChangedDiagnostics()
    }
  } else if (message.method === 'textDocument/documentSymbol') {
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: [{
        name: 'Fake',
        detail: 'package',
        kind: 4,
        range: range(),
        selectionRange: range(),
        children: []
      }]
    }
    const delay = Number(process.env.FAKE_LSP_SYMBOL_DELAY_MS ?? 0)
    if (delay > 0) setTimeout(() => send(response), delay)
    else send(response)
  } else if (message.method === 'textDocument/definition') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: [{ uri: documentUri, range: range() }]
    })
  } else if (message.method === 'textDocument/references') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: [{ uri: documentUri, range: range() }]
    })
  } else if (message.method === 'textDocument/hover') {
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        contents: { kind: 'markdown', value: '**Fake** package' },
        range: range()
      }
    }
    const delay = Number(process.env.FAKE_LSP_HOVER_DELAY_MS ?? 0)
    if (delay > 0) setTimeout(() => send(response), delay)
    else send(response)
  } else if (message.method === 'textDocument/completion') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        isIncomplete: false,
        items: [{ label: 'package', kind: 14, insertText: 'package' }]
      }
    })
  } else if (message.method === 'textDocument/semanticTokens/full') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { data: [0, 0, 4, 0, 1] }
    })
  } else if (message.method === 'textDocument/rename') {
    const renameUri = message.params.textDocument.uri
    const renameRange = process.env.FAKE_LSP_DYNAMIC_SEMANTICS === '1'
      ? identifierRangeAt(
          documentTexts.get(renameUri) ?? '',
          message.params.position
        )
      : range()
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        changes: {
          [renameUri]: [{
            range: renameRange,
            newText: message.params.newName
          }]
        }
      }
    })
  } else if (message.method === 'textDocument/formatting') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: [{ range: range(), newText: 'package Fake {}\\n' }]
    })
  } else if (message.method === 'sysml/semanticEvidence') {
    semanticEvidenceRevision += 1
    if (process.env.FAKE_LSP_STALE_VERSIONLESS_REVALIDATION === '1') {
      setTimeout(() => send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri: message.params.uri,
          diagnostics: []
        }
      }), 20)
    }
    const dynamic = process.env.FAKE_LSP_DYNAMIC_SEMANTICS === '1'
      ? packageEvidence(documentTexts.get(message.params.uri) ?? '')
      : null
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        schemaVersion: 1,
        uri: message.params.uri,
        elements: [{
          engineId: process.env.FAKE_LSP_VOLATILE_ENGINE_IDS === '1'
            ? `fake-package:${message.params.uri}:${semanticEvidenceRevision}`
            : `fake-package:${message.params.uri}`,
          metaclass: 'Package',
          name: dynamic?.name ?? process.env.FAKE_LSP_SEMANTIC_NAME ?? 'Fake',
          qualifiedName: dynamic?.name ?? process.env.FAKE_LSP_SEMANTIC_NAME ?? 'Fake',
          ownerEngineId: null,
          range: dynamic?.range ?? (process.env.FAKE_LSP_SEMANTIC_NAME
            ? {
                start: { line: 0, character: 0 },
                end: {
                  line: 0,
                  character: process.env.FAKE_LSP_SEMANTIC_NAME.length
                }
              }
            : range())
        }],
        relationships: []
      }
    }
    if (process.env.FAKE_LSP_CORRELATED_SEMANTIC_EVIDENCE === '1') {
      response.result.documentVersion = documentVersion
      response.result.documentSha256 = sha256(
        documentTexts.get(message.params.uri) ?? '',
      )
      response.result.diagnosticsComplete = true
      response.result.diagnosticsError = null
      response.result.diagnostics = process.env.FAKE_LSP_PERSISTENT_OPEN_ERROR === '1'
        ? [{
            range: range(),
            severity: 1,
            code: 'FAKE-PERSISTENT-001',
            message: 'persistent indexing error'
          }]
        : []
    }
    if (process.env.FAKE_LSP_CORRELATED_BAD_VERSION === '1') {
      response.result.documentVersion = documentVersion - 1
    }
    if (process.env.FAKE_LSP_CORRELATED_BAD_HASH === '1') {
      response.result.documentSha256 = '0'.repeat(64)
    }
    if (process.env.FAKE_LSP_CORRELATED_MISSING_DIAGNOSTICS === '1') {
      delete response.result.diagnostics
    }
    const delay = Number(process.env.FAKE_LSP_SYMBOL_DELAY_MS ?? 0)
    if (delay > 0) setTimeout(() => send(response), delay)
    else send(response)
  } else if (message.method === '$/cancelRequest') {
    // Cancellation is deliberately accepted without a response.
  } else if (message.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: message.id, result: null })
  } else if (message.method === 'exit') {
    process.exit(0)
  }
}

function range() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 4 }
  }
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function packageEvidence(text) {
  const match = /\bpackage\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(text)
  if (!match) return { name: 'package', range: range() }
  const start = match.index + match[0].lastIndexOf(match[1])
  return {
    name: match[1],
    range: rangeFromOffsets(text, start, start + match[1].length)
  }
}

function identifierRangeAt(text, position) {
  const offset = offsetAt(text, position)
  let start = offset
  let end = offset
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++
  return rangeFromOffsets(text, start, end)
}

function offsetAt(text, position) {
  const lines = text.split('\n')
  let offset = 0
  for (let line = 0; line < position.line; line++) {
    offset += (lines[line] ?? '').length + 1
  }
  return offset + position.character
}

function rangeFromOffsets(text, start, end) {
  return { start: positionAt(text, start), end: positionAt(text, end) }
}

function positionAt(text, offset) {
  const prefix = text.slice(0, offset)
  const lines = prefix.split('\n')
  return { line: lines.length - 1, character: lines.at(-1).length }
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message))
  process.stdout.write(`Content-Length: ${body.byteLength}\r\n\r\n`)
  process.stdout.write(body)
}
