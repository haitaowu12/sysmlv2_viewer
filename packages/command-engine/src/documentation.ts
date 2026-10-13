export interface DirectDocumentation {
  /** Offset of the complete documentation token in the declaration text. */
  start: number
  end: number
  /** Text between the block-comment delimiters, without trimming. */
  body: string
}

export class DocumentationParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentationParseError'
  }
}

/**
 * Finds documentation owned directly by one declaration body.
 *
 * The source passed here is expected to be one authoritative declaration
 * range. Braces, strings, line comments, and block comments are scanned so a
 * nested declaration's documentation cannot be mistaken for its owner's.
 * At most one direct documentation comment is accepted; malformed source or
 * ambiguous direct documentation fails closed.
 */
export function directDocumentation(text: string): DirectDocumentation | null {
  let bodyOpened = false
  let bodyClosed = false
  let depth = 0
  let documentation: DirectDocumentation | null = null

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]!
    const next = text[index + 1] ?? ''

    if (current === '/' && next === '/') {
      const newline = text.indexOf('\n', index + 2)
      index = newline < 0 ? text.length : newline - 1
      continue
    }

    if (current === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2)
      if (close < 0) {
        throw new DocumentationParseError('Unterminated block comment')
      }
      index = close + 1
      continue
    }

    if (current === '"' || current === "'") {
      index = consumeString(text, index, current)
      continue
    }

    if (current === '{') {
      if (bodyClosed) {
        throw new DocumentationParseError('Unexpected declaration body after the target body')
      }
      if (!bodyOpened) bodyOpened = true
      depth += 1
      continue
    }

    if (current === '}') {
      if (!bodyOpened || depth === 0) {
        throw new DocumentationParseError('Unmatched closing brace in declaration')
      }
      depth -= 1
      if (depth === 0) bodyClosed = true
      continue
    }

    if (
      bodyOpened &&
      !bodyClosed &&
      depth === 1 &&
      text.startsWith('doc', index) &&
      isWordBoundary(text[index - 1]) &&
      isWordBoundary(text[index + 3])
    ) {
      let commentStart = index + 3
      while (/\s/u.test(text[commentStart] ?? '')) commentStart += 1
      if (text[commentStart] === '/' && text[commentStart + 1] === '*') {
        const close = text.indexOf('*/', commentStart + 2)
        if (close < 0) {
          throw new DocumentationParseError('Unterminated documentation block comment')
        }
        if (documentation) {
          throw new DocumentationParseError(
            'Multiple directly owned documentation comments are ambiguous',
          )
        }
        documentation = {
          start: index,
          end: close + 2,
          body: text.slice(commentStart + 2, close),
        }
        index = close + 1
      }
    }
  }

  if (bodyOpened && depth !== 0) {
    throw new DocumentationParseError('Unterminated declaration body')
  }
  return documentation
}

function consumeString(text: string, start: number, quote: string): number {
  for (let index = start + 1; index < text.length; index += 1) {
    const current = text[index]!
    if (current === '\\') {
      index += 1
      continue
    }
    if (current === quote) return index
    if (current === '\n' || current === '\r') {
      throw new DocumentationParseError('Unterminated string literal')
    }
  }
  throw new DocumentationParseError('Unterminated string literal')
}

function isWordBoundary(value: string | undefined): boolean {
  return value === undefined || !/[\p{L}\p{N}_]/u.test(value)
}
