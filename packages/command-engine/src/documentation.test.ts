import { describe, expect, it } from 'vitest'
import {
  directDocumentation,
  DocumentationParseError,
} from './documentation.js'

describe('direct documentation scanner', () => {
  it('returns one documentation comment directly owned by the target body', () => {
    const source = `requirement def InterfaceRequirement {
  doc /* direct owner */
  part def Child {
    doc /* nested child */
  }
}`
    const result = directDocumentation(source)
    expect(result?.body).toBe(' direct owner ')
    expect(source.slice(result!.start, result!.end)).toBe('doc /* direct owner */')
    expect(source.slice(result!.start, result!.end)).not.toContain('nested child')
  })

  it('returns no documentation when only a nested declaration is documented', () => {
    const source = `interface def Parent {
  part def Child {
    doc /* child only */
  }
}`
    expect(directDocumentation(source)).toBeNull()
  })

  it('ignores braces in strings, line comments, and block comments', () => {
    const source = `interface def Parent {
  // } { doc /* fake */
  attribute note : String = "}";
  /* { doc fake } */
  doc /* owner */
  part def Child { doc /* nested */ }
}`
    expect(directDocumentation(source)?.body).toBe(' owner ')
  })

  it('rejects ambiguous or malformed direct documentation', () => {
    expect(() => directDocumentation(`interface def Parent {
  doc /* first */
  doc /* second */
}`)).toThrow(DocumentationParseError)
    expect(() => directDocumentation(`interface def Parent {
  doc /* unterminated
}`)).toThrow('Unterminated documentation')
    expect(() => directDocumentation(`interface def Parent {
  attribute note : String = "unterminated;
}`)).toThrow('Unterminated string')
    expect(() => directDocumentation(`interface def Parent {
  part def Child {
}`)).toThrow('Unterminated declaration body')
  })
})
