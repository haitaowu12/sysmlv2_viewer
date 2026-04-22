import { describe, it, expect } from 'vitest';
import { parseSysML } from '../parser/parser';

describe('parser error severity', () => {
  it('includes severity in parse errors for invalid input', () => {
    const result = parseSysML('part def {\n}');
    expect(result.errors.length).toBeGreaterThan(0);
    const error = result.errors[0];
    expect(error.severity).toBeDefined();
    expect(['error', 'warning', 'info']).toContain(error.severity);
  });

  it('marks syntax errors as error severity', () => {
    const result = parseSysML('part def {\n}');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].severity).toBe('error');
  });
});

describe('parser error suggestions', () => {
  it('suggests adding missing semicolon', () => {
    // Missing semicolon between statements on same line
    const result = parseSysML('part def Vehicle part def Engine;');
    expect(result.errors.length).toBeGreaterThan(0);
    const hasSemicolonSuggestion = result.errors.some(
      (err) => err.suggestion && err.suggestion.includes("add ';'")
    );
    expect(hasSemicolonSuggestion).toBe(true);
  });

  it('suggests closing unmatched brace', () => {
    const result = parseSysML('package Test {\n  part def Vehicle;');
    expect(result.errors.length).toBeGreaterThan(0);
    const hasBraceSuggestion = result.errors.some(
      (err) =>
        err.suggestion && err.suggestion.includes('unmatched opening brace')
    );
    expect(hasBraceSuggestion).toBe(true);
  });

  it('suggests correcting misspelled keyword partdef', () => {
    const result = parseSysML('partdef Vehicle {\n}');
    expect(result.errors.length).toBeGreaterThan(0);
    const hasKeywordSuggestion = result.errors.some(
      (err) =>
        err.suggestion &&
        err.suggestion.includes('part def')
    );
    expect(hasKeywordSuggestion).toBe(true);
  });

  it('suggests port def correction for portdef', () => {
    const result = parseSysML('portdef PowerPort;');
    expect(result.errors.length).toBeGreaterThan(0);
    const hasSuggestion = result.errors.some(
      (err) => err.suggestion && err.suggestion.includes('port def')
    );
    expect(hasSuggestion).toBe(true);
  });

  it('suggests action def correction for actiondef', () => {
    const result = parseSysML('actiondef Move;');
    expect(result.errors.length).toBeGreaterThan(0);
    const hasSuggestion = result.errors.some(
      (err) => err.suggestion && err.suggestion.includes('action def')
    );
    expect(hasSuggestion).toBe(true);
  });
});

describe('parser error context', () => {
  it('includes context lines in parse errors', () => {
    const result = parseSysML('part def {\n}');
    expect(result.errors.length).toBeGreaterThan(0);
    const error = result.errors[0];
    expect(error.context).toBeDefined();
    expect(error.context!.length).toBeGreaterThan(0);
  });

  it('includes location information in parse errors', () => {
    const result = parseSysML('part def {\n}');
    expect(result.errors.length).toBeGreaterThan(0);
    const error = result.errors[0];
    expect(error.location).toBeDefined();
    expect(error.location!.start.line).toBeGreaterThan(0);
    expect(error.location!.start.column).toBeGreaterThan(0);
  });
});

describe('parser error recovery', () => {
  it('continues parsing after an error and finds subsequent valid nodes', () => {
    const result = parseSysML('part def {\n}\npart def Vehicle;');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.children.length).toBeGreaterThanOrEqual(1);
    const partDef = result.children.find((c) => c.kind === 'PartDef');
    expect(partDef).toBeDefined();
    expect(partDef!.name).toBe('Vehicle');
  });

  it('reports unmatched brace at end of file', () => {
    const result = parseSysML('package Test {\n  part def Vehicle;\n');
    expect(result.errors.length).toBeGreaterThan(0);
    const hasUnmatchedBrace = result.errors.some(
      (err) =>
        err.message.includes('Unmatched opening brace') ||
        (err.suggestion && err.suggestion.includes('unmatched opening brace'))
    );
    expect(hasUnmatchedBrace).toBe(true);
  });
});
