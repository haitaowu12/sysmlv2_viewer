import { describe, expect, it } from 'vitest';
import {
  runInterfaceReviewer,
  runReleaseReviewer,
  runRequirementParentReviewer,
  runSemanticCompatibilityReviewer,
  runTraceabilityReviewer,
} from '../agent-tools/reviewers';

const context = { engineVersion: 'test-engine', packageVersion: 'test-package' };

describe('deterministic SysML reviewer capabilities', () => {
  it('returns traceability and parent findings with stable rule and evidence identifiers', () => {
    const files = [{ path: 'requirements.sysml', content: 'requirement def SafeStop; requirement safeStop : SafeStop;' }];
    const trace = runTraceabilityReviewer(files);
    const parent = runRequirementParentReviewer(files);
    expect(trace.findings.map((item) => item.ruleId)).toContain('SYSML-TRACE-001');
    expect(trace.findings.every((item) => item.requiresHumanReview)).toBe(true);
    expect(trace.findings[0].evidenceIds[0]).toContain('requirements.sysml#');
    expect(trace.findings[0].sourceLocations[0]).toMatchObject({ file: 'requirements.sysml', line: 1 });
    expect(parent.findings).toHaveLength(1);
    expect(parent.findings[0].ruleId).toBe('SYSML-REQ-PARENT-001');
  });

  it('finds incomplete interface flows without rewriting the model', () => {
    const review = runInterfaceReviewer([{ path: 'interfaces.sysml', content: 'flow from source;' }]);
    expect(review.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'SYSML-FLOW-001', proposedDisposition: 'repair' }),
    ]));
  });

  it('holds release for parse errors and discloses target-tool limitations', () => {
    const review = runReleaseReviewer([{ path: 'broken.sysml', content: 'package Broken { part def A' }], context);
    expect(review.counts.error).toBeGreaterThan(0);
    expect(review.findings.some((item) => item.proposedDisposition === 'hold_release')).toBe(true);
    expect(review.limitations.join(' ')).toContain('Target-tool');
  });

  it('flags structurally incompatible connection endpoint types', () => {
    const review = runSemanticCompatibilityReviewer([{
      path: 'connection.sysml',
      content: 'port def A; port def B; port a : A; port b : B; connection c connect a to b;',
    }]);
    expect(review.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'SYSML-COMPAT-001', requiresHumanReview: true }),
    ]));
  });
});
