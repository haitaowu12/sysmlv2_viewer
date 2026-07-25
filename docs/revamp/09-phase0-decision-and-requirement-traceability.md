# Revised Phase 0 Decision and Requirement Traceability

Status: Gate P0 review record
Owner approval: pending
Rule: covered means a Phase 0 decision/evidence artifact exists; it does not claim implementation.

## Package trace

| Requirement area | Revised disposition | Evidence | Gate |
|---|---|---|---|
| current state | code-traced audit; hand-written parser and dual semantic paths recorded | `00-current-state-audit.md`, baseline evidence | P0 |
| official semantic authority | specs/resolutions/release separated from runtime | ADR-001, ADR-007, `01-*` | P0/P1 |
| engine selection | six paths, exact pins, common harness, weighted/blocking gate; no selection | ADR-001, `02-*`, `14-*` | P1 |
| client/service architecture | shared web UI, SDK/protocol, independent service | ADR-003, ADR-006, `03-*` | P0/P1 |
| identity/commands/persistence | product-owned stable identity, typed source edits, logical artifact format | ADR-002/004/005 | P2/P3 |
| notation/projections | reference/conventional/analytical labels and provenance | ADR-007, `11-*` | P4 |
| semantics/properties | construct-by-construct exposure and rule plan | `12-*` | P1–P5 |
| industry/workflow research | 15 public products/references translated into decisions | `10-*`, `13-*` | P0/P4/P5 |
| deployment/access | A public, B local companion, C Tauri, D future hosted; role matrix | ADR-008, `15-*` | P1/P4/P7 |
| capability claims | versioned supported/partial/preserved/unsupported profiles | `05-*` | each phase |
| migration/deletion/risk | retain/refactor/replace/delete/defer and closure triggers | `06-*` | P1–P4 |
| delivery/testing/performance | staged PRs, gates, fixtures/goldens/properties/benchmarks | `07-*`, `08-*` | each phase |
| product contract/pilot | jobs, invariants, browser non-modeler workflow, OMC4 pilot | `04-*`, `16-*` | P0/P5 |
| security/privacy | transport/deployment trust boundaries and controls | `docs/security/*` | before each profile |

## Revised Gate P0 questions

| Question | Proposed answer | Evidence | Owner |
|---|---|---|---|
| official semantic authority? | OMG SysML 2.0/KerML 1.0/API 1.0 specifications, resolutions, exact official release | ADR-001 | pending |
| behavioral oracle? | matching official Pilot and official fixtures; discrepancies recorded | ADR-001, `14-*` | pending |
| runtime engines qualified? | Spec42, Pilot service, daltskin, VinQut, official hybrid, legacy control | ADR-001 | pending |
| selection method? | reproducible weighted matrix with blocking fidelity/preservation/failure/license gates | `14-*` | pending |
| Workbench Service boundary? | workspace/language adapter/semantics/identity/commands/queries/views/reviews/diff/rules/reports/AI/audit | ADR-003 | pending |
| same UI for desktop/local/hosted? | yes: shared web application + Client SDK + protocol | ADR-003/006/008 | pending |
| practical browser use? | yes: full authoring through B and review/compare/report/disposition without desktop | `13-*`, `15-*` | pending |
| what requires local install? | arbitrary local folders/Git/engine, offline reports, local secrets/evidence | `15-*` | pending |
| non-modeler web functions? | scoped views/traces/properties/findings/reports/baseline compare/dispositions | `04-*`, `15-*` | pending |
| notation provenance? | each view/mark labeled reference, conventional, or analytical | ADR-007, `11-*` | pending |
| industry patterns adopted? | IDE indexing/refactor; viewpoint queries; compartments/matrices; trace gaps; frozen review; Git decision states | `10-*`, `13-*` | pending |
| third-party reuse? | only exact licensed qualified components behind adapters; patterns otherwise | ADR-001, `01-*` | pending |
| product-owned responsibilities? | protocol/SDK, adapter, normalized semantics, identity, commands, projections, reviews/diff/rules/reports/audit | `03-*` | pending |
| licensing/redistribution? | exact pins, notices, SBOM, bundled-library provenance, legal/distribution gate | `01-*`, `14-*` | pending |
| path to hosted? | same service/protocol with auth and persistence adapters; no semantic rewrite | ADR-003/005/008 | pending |

## Pilot steps

| Step | Evidence | Phase |
|---|---|---|
| workspace load/index/reopen | E2E-WS-001 | P1 |
| navigation/diagnostics/text edit | LSP suite and preservation | P1/P2 |
| graphical edit/source preview | CMD-DIAG-001/CMD-TRANS-001 | P3/P4 |
| traceability/interface findings | ASSURE-REQ-001/ASSURE-IF-001 | P5 |
| semantic baseline compare | DIFF-001 | P5 |
| review findings/dispositions | REVIEW-001 | P5 |
| deterministic report/evidence | REPORT-DET-001 | P5 |
| optional grounded AI proposal | AI-SAFE-001 | P6 |

## Owner record template

```yaml
decisionDate: ...
phase0Head: ...
baseline: 638e5aa1cc63ddb3a1c770f36432d6acedfbc541
acceptedAdrs:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-008
ownerDecisions:
  productName: ...
  deploymentProfiles: ...
  publicEvaluation: ...
  drawio: ...
  collaboration: ...
  firstPilot: ...
  aiProviderPolicy: ...
  operatingSystems: ...
  distribution: ...
  qualificationRelease: ...
exceptions: []
authorizedNextPhase: P1-engine-qualification-and-workbench-service-foundation
```

Until this record exists, PR #2 remains draft and no Phase 1 production implementation is authorized.
