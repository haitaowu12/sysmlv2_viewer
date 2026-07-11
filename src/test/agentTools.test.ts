import { describe, expect, it } from 'vitest';
import {
  SYSML_V2_CORPUS,
  sysmlCheck,
  sysmlDoctor,
  sysmlExplainDiagnostic,
  sysmlModelSummary,
  type AgentToolContext,
} from '../agent-tools';

const context: AgentToolContext = {
  engineVersion: 'parser-test-1',
  packageVersion: '0.0.0-test',
};

describe('SysML agent tool kernel', () => {
  it('reports engine, package, corpus, files, and capability health from doctor', () => {
    const result = sysmlDoctor({
      context,
      files: [{ path: 'vehicle.sysml', content: 'part def Vehicle;' }],
    });

    expect(result.tool).toBe('sysml_doctor');
    expect(result.engine).toEqual({
      name: 'sysml-viewer',
      version: 'parser-test-1',
      packageVersion: '0.0.0-test',
    });
    expect(result.corpus).toEqual(SYSML_V2_CORPUS);
    expect(result.filesExamined).toEqual([
      { path: 'vehicle.sysml', bytes: 17 },
    ]);
    expect(result.status).toBe('ready');
    expect(result.capabilities).toEqual([
      'doctor',
      'check',
      'explain-diagnostic',
      'model-summary',
    ]);
    expect(result.truncation).toEqual({
      truncated: false,
      limit: 100,
      total: 0,
      returned: 0,
    });
  });

  it('returns parser diagnostic codes and source locations from check', () => {
    const result = sysmlCheck({
      context,
      files: [
        { path: 'invalid.sysml', content: 'part def {' },
        { path: 'partial.sysml', content: 'calc def FuelEconomy;' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.supportedSubsetComplete).toBe(false);
    expect(result.filesExamined.map((file) => file.path)).toEqual([
      'invalid.sysml',
      'partial.sysml',
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'parser:syntax-error',
          severity: 'error',
          file: 'invalid.sysml',
          sourceLocation: expect.objectContaining({
            start: expect.objectContaining({ line: 1, column: expect.any(Number) }),
            end: expect.objectContaining({ line: 1, column: expect.any(Number) }),
          }),
        }),
        expect.objectContaining({
          code: 'unsupported:calc',
          severity: 'warning',
          file: 'partial.sysml',
          sourceLocation: expect.objectContaining({
            start: expect.objectContaining({ line: 1, column: 1 }),
          }),
        }),
      ]),
    );
  });

  it('marks doctor degraded when checked files contain errors', () => {
    const result = sysmlDoctor({
      context,
      files: [{ path: 'invalid.sysml', content: 'part def {' }],
    });

    expect(result.status).toBe('degraded');
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });

  it('distinguishes parser validity from supported-subset completeness', () => {
    const check = sysmlCheck({
      context,
      files: [{ path: 'partial.sysml', content: 'calc def FuelEconomy;' }],
    });
    const doctor = sysmlDoctor({
      context,
      files: [{ path: 'partial.sysml', content: 'calc def FuelEconomy;' }],
    });

    expect(check.valid).toBe(true);
    expect(check.supportedSubsetComplete).toBe(false);
    expect(doctor.status).toBe('degraded');
  });

  it('reports unresolved semantic references separately from parser validity', () => {
    const check = sysmlCheck({
      context,
      files: [{ path: 'unresolved.sysml', content: 'package P { part x : MissingType; }' }],
    });

    expect(check.valid).toBe(true);
    expect(check.supportedSubsetComplete).toBe(false);
    expect(check.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'semantic:unresolved-reference',
        severity: 'warning',
        file: 'unresolved.sysml',
      }),
    ]));
  });

  it('explains known diagnostics and returns a bounded unknown explanation', () => {
    const known = sysmlExplainDiagnostic({
      context,
      code: 'unsupported:calc',
    });
    const unknown = sysmlExplainDiagnostic({
      context,
      code: 'vendor:future-code',
    });

    expect(known.known).toBe(true);
    expect(known.explanation).toContain('calculation');
    expect(known.remediation.length).toBeGreaterThan(0);
    expect(unknown.known).toBe(false);
    expect(unknown.explanation).toContain('vendor:future-code');
    expect(unknown.filesExamined).toEqual([]);
  });

  it('summarizes semantic nodes and edges with explicit truncation', () => {
    const result = sysmlModelSummary({
      context,
      files: [{
        path: 'vehicle.sysml',
        content: 'package VehicleModel { part def Vehicle; part def Engine; }',
      }],
      maxElements: 2,
    });

    expect(result.counts.nodes).toBe(3);
    expect(result.counts.byKind).toMatchObject({ Package: 1, PartDef: 2 });
    expect(result.elements).toHaveLength(2);
    expect(result.elements.every((element) => element.file === 'vehicle.sysml')).toBe(true);
    expect(result.elementTruncation).toEqual({
      truncated: true,
      limit: 2,
      total: 3,
      returned: 2,
    });
    expect(result.truncation).toEqual({
      truncated: false,
      limit: 100,
      total: 0,
      returned: 0,
    });
    expect(result.filesExamined).toEqual([
      { path: 'vehicle.sysml', bytes: 59 },
    ]);
  });

  it('truncates diagnostics without losing total counts', () => {
    const result = sysmlCheck({
      context,
      files: [
        { path: 'one.sysml', content: 'part def {' },
        { path: 'two.sysml', content: 'port def {' },
      ],
      maxDiagnostics: 1,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.truncation).toEqual({
      truncated: true,
      limit: 1,
      total: 2,
      returned: 1,
    });
  });
});
