# Gate P5 Decision — Engineering Assurance

Decision: **invalidated as a product gate**

Historical implementation head: `8a69813`

Historical branch: `codex/sysml-workbench-phase5-assurance`

Runtime lock outcome at the historical run: `HYBRID GO`

Invalidation authority:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## What remains valid

The exact locked-runtime service workflow produced useful
`service-integration` evidence:

- deterministic requirements, verification, and interface rule evaluation;
- a deliberately injected unresolved reference was diagnosed;
- canonical source remained unchanged before approval;
- a typed interface command and requirement documentation command validated and
  applied through the command engine;
- two Git baselines were created and compared;
- a stable-identity review finding completed its service lifecycle;
- deterministic HTML/PDF reports and an interface-register CSV were generated;
- report manifests captured source/runtime/rule/query provenance.

These results support retained assurance, baseline, review, and report
packages.

## Why the product gate is invalid

`workbench-qualify-phase5.ts` directly invokes `WorkspaceManager`. Its former
`integratedUsabilityPilot` label was unsupported:

- workspace load was recorded as a literal boolean;
- requirement navigation passed when a service query contained a
  `RequirementUsage`;
- the interface was created through a direct typed command, not diagram
  interaction;
- baseline, review, finding, and report tasks bypassed the delivered UI;
- no independent practitioner executed the workflow.

The script therefore proves service integration, not usability or product
readiness.

## Additional product defect

The assurance UI originally loaded assurance, Git status, baselines, and
reviews in one fail-fast operation. A non-Git workspace could not open
Interfaces or Verification even though those capabilities do not require Git.

The recovery safety floor makes Git optional for those views. Git-backed
baseline operations remain disabled when the capability is unavailable.

## Gate disposition

P5 is invalidated as a product gate.

The script is retained and renamed in active commands as the
**service assurance workflow qualifier**. Its output must state:

```json
{
  "evidenceLayer": "service-integration",
  "result": "service-integration-pass",
  "productGate": {
    "id": "P5",
    "state": "invalidated"
  }
}
```

Historical machine-readable observations remain evidence of the service run;
they are not practitioner evidence.

## Recovery path

P5 is replaced by Recovery Gates R3-R6:

- notation-specific Interconnection View;
- three source-preserving graphical edits;
- bounded interface assurance;
- independent practitioner pilot and rerun.

No product or release claim may depend on P5 until those gates pass.
