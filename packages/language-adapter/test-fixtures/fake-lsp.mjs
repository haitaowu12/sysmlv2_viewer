let input = Buffer.alloc(0)
let documentUri = ''
let crashScheduled = false
let initialized = false
let documentVersion = 0

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
    documentUri = message.params.textDocument.uri
    documentVersion = message.params.textDocument.version
    send({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: message.params.textDocument.uri,
        diagnostics: [{
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
    send({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: message.params.textDocument.uri,
        version: documentVersion,
        diagnostics: text.includes('BROKEN')
          ? [{
              range: range(),
              severity: 1,
              code: 'FAKE-CHANGE-001',
              message: 'changed document is broken'
            }]
          : []
      }
    })
  } else if (message.method === 'textDocument/documentSymbol') {
    send({
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
    })
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
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        changes: {
          [documentUri]: [{
            range: range(),
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

function send(message) {
  const body = Buffer.from(JSON.stringify(message))
  process.stdout.write(`Content-Length: ${body.byteLength}\r\n\r\n`)
  process.stdout.write(body)
}
