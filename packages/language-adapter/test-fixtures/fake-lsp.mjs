let input = Buffer.alloc(0)
let documentUri = ''
let crashScheduled = false

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
          semanticTokensProvider: { legend: { tokenTypes: [], tokenModifiers: [] } },
          renameProvider: true,
          documentFormattingProvider: true
        }
      }
    })
  } else if (message.method === 'textDocument/didOpen') {
    documentUri = message.params.textDocument.uri
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
      setTimeout(() => process.exit(17), 25)
    }
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
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        contents: { kind: 'markdown', value: '**Fake** package' },
        range: range()
      }
    })
  } else if (message.method === 'textDocument/completion') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        isIncomplete: false,
        items: [{ label: 'package', kind: 14, insertText: 'package' }]
      }
    })
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
