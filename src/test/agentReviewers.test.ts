import { describe, expect, it } from 'vitest';
import {
  runCompletenessReviewer,
  runInterfaceReviewer,
  runReleaseReviewer,
  runRequirementParentReviewer,
  runSemanticCompatibilityReviewer,
  runTraceabilityReviewer,
} from '../agent-tools/reviewers';

const context = { engineVersion: 'test-engine', packageVersion: 'test-package' };

describe('deterministic SysML reviewer capabilities', () => {
  it('fails operational semantic omissions and accepts an explicit complete slice', () => {
    const incomplete = runCompletenessReviewer([{
      path: 'incomplete.sysml',
      content: 'part def System; use case def Operate; requirement def Safe;',
    }]);
    expect(incomplete).toMatchObject({ tool: 'sysml_review', reviewer: 'completeness' });
    expect(incomplete.counts.error).toBeGreaterThan(0);
    expect(incomplete.findings.map((item) => item.ruleId)).toEqual(expect.arrayContaining([
      'SYSML-COMP-UC-SUBJECT-001',
      'SYSML-COMP-UC-ACTOR-002',
      'SYSML-COMP-UC-OBJECTIVE-003',
      'SYSML-COMP-REQ-SUBJECT-007',
    ]));

    const complete = runCompletenessReviewer([{
      path: 'complete.sysml',
      content: `
        part def System;
        part def Operator;
        use case def Operate {
          subject system : System;
          actor operator : Operator;
          objective { doc /* Operate the system. */ }
        }
        requirement safe { subject system : System; }
        verification def SafeReview {
          subject system : System;
          objective reviewObjective { verify safe; }
        }
      `,
    }]);
    expect(complete.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('returns traceability and parent findings with stable rule and evidence identifiers', () => {
    const files = [{ path: 'requirements.sysml', content: 'requirement def SafeStop; requirement safeStop : SafeStop;' }];
    const trace = runTraceabilityReviewer(files);
    const parent = runRequirementParentReviewer(files);
    expect(trace.findings.map((item) => item.ruleId)).toEqual([
      'SYSML-TRACE-SAT-STATUS-001',
      'SYSML-TRACE-VER-PLAN-002',
    ]);
    expect(trace.counts).toEqual({ error: 0, warning: 0, info: 2 });
    expect(trace.findings.every((item) => item.requiresHumanReview)).toBe(true);
    expect(trace.findings[0].evidenceIds[0]).toContain('requirements.sysml#');
    expect(trace.findings[0].sourceLocations[0]).toMatchObject({ file: 'requirements.sysml', line: 1 });
    expect(parent.findings).toHaveLength(1);
    expect(parent.findings[0].ruleId).toBe('SYSML-REQ-PARENT-001');
  });

  it('reviews requirement usages only and counts incoming trace relationships', () => {
    const trace = runTraceabilityReviewer([{
      path: 'planned.sysml',
      content: `package Planned {
        part def System;
        requirement def Safe { subject system : System; }
        requirement safe : Safe;
        verification def Review {
          subject system : System;
          objective reviewObjective { verify safe; }
        }
        verification review : Review;
      }`,
    }]);

    expect(trace.findings).toHaveLength(1);
    expect(trace.findings[0]).toMatchObject({
      ruleId: 'SYSML-TRACE-SAT-STATUS-001',
      severity: 'info',
      sourceLocations: [{ file: 'planned.sysml', line: 4 }],
    });
    expect(trace.findings[0].message).toContain("Requirement usage 'safe'");
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
