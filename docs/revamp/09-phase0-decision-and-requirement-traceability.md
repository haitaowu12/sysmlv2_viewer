# Revised Phase 0 Decision and Requirement Traceability

Status: Gate P0 approved
Owner approval: accepted 2026-07-24
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
| official semantic authority? | OMG SysML 2.0/KerML 1.0/API 1.0 specifications, resolutions, exact official release | ADR-001 | approved |
| behavioral oracle? | matching official Pilot and official fixtures; discrepancies recorded | ADR-001, `14-*` | approved |
| runtime engines qualified? | Spec42, Pilot service, daltskin, VinQut, official hybrid, legacy control | ADR-001 | approved |
| selection method? | reproducible weighted matrix with blocking fidelity/preservation/failure/license gates | `14-*` | approved |
| Workbench Service boundary? | workspace/language adapter/semantics/identity/commands/queries/views/reviews/diff/rules/reports/AI/audit | ADR-003 | approved |
| same UI for desktop/local/hosted? | yes: shared web application + Client SDK + protocol | ADR-003/006/008 | approved |
| practical browser use? | yes: full authoring through B and review/compare/report/disposition without desktop | `13-*`, `15-*` | approved |
| what requires local install? | arbitrary local folders/Git/engine, offline reports, local secrets/evidence | `15-*` | approved |
| non-modeler web functions? | scoped views/traces/properties/findings/reports/baseline compare/dispositions | `04-*`, `15-*` | approved |
| notation provenance? | each view/mark labeled reference, conventional, or analytical | ADR-007, `11-*` | approved |
| industry patterns adopted? | IDE indexing/refactor; viewpoint queries; compartments/matrices; trace gaps; frozen review; Git decision states | `10-*`, `13-*` | approved |
| third-party reuse? | only exact licensed qualified components behind adapters; patterns otherwise | ADR-001, `01-*` | approved |
| product-owned responsibilities? | protocol/SDK, adapter, normalized semantics, identity, commands, projections, reviews/diff/rules/reports/audit | `03-*` | approved |
| licensing/redistribution? | exact pins, notices, SBOM, bundled-library provenance, legal/distribution gate | `01-*`, `14-*` | approved |
| path to hosted? | same service/protocol with auth and persistence adapters; no semantic rewrite | ADR-003/005/008 | approved |

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

## Owner approval record

```yaml
decisionDate: 2026-07-24
approvedBy: owner
approvalSource: Codex task message "approve"
approvedPhase0Head: dc276c586dbac5d41150fe62ea9f539c1d29b3ea
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
  productName: SysML Engineering Workbench
  deploymentProfiles:
    publicEvaluation: A
    production: [B-browser-local-companion, C-tauri-desktop]
    future: D-managed-hosted
  publicEvaluation: retained
  drawio: export-and-markup-only
  collaboration: defer-real-time-use-git-and-review-artifacts
  firstPilot: OMC4-interface-assurance
  aiProviderPolicy: disabled-by-default-explicit-proposal-only
  operatingSystems: [macOS, Windows]
  distribution: signed-desktop-and-local-companion-at-P7
  qualificationRelease: 2026-05
exceptions: []
authorizedNextPhase: P1-engine-qualification-and-workbench-service-foundation
nextPhaseStarted: false
```

Gate P0 is approved. Phase 1 is authorized but has not started. Runtime selection remains a Phase 1 decision.
