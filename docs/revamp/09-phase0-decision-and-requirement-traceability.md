# Phase 0 Decision and Requirement Traceability

Status: Gate P0 review record
Owner approval: pending
Rule: `covered` means a Phase 0 decision/evidence artifact exists; it does not mean the production capability is implemented

## Handoff traceability

| Handoff section | Phase 0 disposition | Authority/evidence | Implementation gate |
|---|---|---|---|
| 0 Executive mandate | accepted without scope reduction | `04-target-product-contract.md` | all |
| 1 Product decision/invariants | proposed contract and working name | `04-target-product-contract.md` | P0 owner approval |
| 2 Current-state assumptions/audit | code-traced audit; Peggy assumption corrected | `00-current-state-audit.md`, baseline manifest | P0 |
| 3 Discovery/language decision | Option D recommended; alternatives/licensing recorded | `01`, `02`, ADR-001 | P0 decision; P1 qualification |
| 4 Target architecture | responsibility boundaries, projections, commands, identity, persistence, shell proposed | `03`, ADR-001..005 | P0 |
| 5 Product experience | target jobs/IA recorded; no implementation claim | `04`, `05`, `07` | P1–P4 |
| 6 Engineering workflows | requirements/interface/review/diff/report backlog and gates | `04`, `07` | P5 |
| 7 AI architecture | proposal-only contract, egress/privacy boundaries | `04`, ADR-004, security docs | P6 |
| 8 Language/conformance | versioned profile, fixture and preservation gates | `05`, `08`, ADR-001 | P1–P3 |
| 9 Migration/deletion | retain/refactor/replace/delete/defer with retirement triggers | `06` | P1–P4 |
| 10 Security/privacy | threat, privacy, deployment boundaries and phase closures | `docs/security/`, risk register | P1/P4/P6/P7 before use |
| 11 Performance | tiers, thresholds, protocol, differential plan | `08` | P1 and each later affected gate |
| 12 Accessibility/usability | acceptance tasks and evaluation protocol | `08`, `07` | P4/P7 |
| 13 Repository structure | bounded monorepo direction; no empty scaffolding | `03` | introduced incrementally |
| 14 Delivery plan | staged draft PR sequence and explicit P1–P7 gates | `07` | per phase |
| 15 Testing | fixture/golden/property/E2E/performance/security layers mapped | `05`, `08`, `07` | per phase; release command P7 |
| 16 Documentation | Phase 0 decisions complete; implementation docs remain backlog-owned | `00`–`09`, ADRs, security docs, `07` | synchronize each phase |
| 17 Codex operating instructions | exact head, branch, tests, screenshots, conflicts, audit, draft-PR stop | audit, manifest, screenshots, PR | P0 |
| 18 Required Phase 0 package | nine requested files, five ADRs, diagrams, dependencies, tests, licenses, PR/risk/decisions plus this trace | package index by filenames | P0 |
| 19 Owner decisions | ten recommended defaults; none silently approved | `03-architecture-options.md` | P0 owner record |
| 20 Pilot acceptance | realistic OMC4 interface-assurance pilot recommended and mapped below | `04`, this file | P1–P6 |
| 21 Definition of done | retained as release truth; no broad conformance claim | `04`, P7 gate in `07` | P7 |
| 22 Immediate instruction | Phase 0 only; no UI/parser/diagram/Draw.io production change | Git diff and draft PR | P0 stop |

## Gate P0 answer record

| Owner question | Proposed answer | Decision artifact | Owner state |
|---|---|---|---|
| language authority | Spec42 `v0.46.0` exact pin behind workbench sidecar/adapter | ADR-001 | pending |
| multi-file resolution | app-mediated workspace documents + pinned libraries resolved by one authority | ADR-001, ADR-005 | pending |
| canonical content | plain SysML/KerML source; versioned project artifacts are non-semantic governance state | product contract, ADR-005 | pending |
| diagram mutation | typed command → overlay edits → validation/diff → explicit apply | ADR-004 | pending |
| stable identity | explicit id or durable workbench id + locator/fingerprint + versioned alias ledger | ADR-002 | pending |
| unsupported constructs | preserve source/opaque ranges; unsafe commands fail closed | ADR-001, ADR-004 | pending |
| retain/delete | Monaco/UI primitives retained selectively; parser authority/direct patches/round trip replaced | audit, migration plan | pending |
| shell/deployment | Tauri desktop-first; optional read-only demo | ADR-003 | pending |
| evidence | exact source pins, test baseline, screenshots, license/risk/benchmark plans | package + manifest | pending |

## Pilot scenario traceability

The “twelve scenario steps” in `04-target-product-contract.md` are:

| Step | Required demonstration | Delivering phase | Acceptance evidence |
|---:|---|---|---|
| 1 | workspace load | P1 | E2E-WS-001 |
| 2 | model navigation | P2/P4 | LSP-DEF-001, QUERY-001, usability task 2 |
| 3 | deterministic diagnostics | P1 | LSP-DIAG-001/002 |
| 4 | text edit | P1 | LSP feature suite + preservation fixtures |
| 5 | graphical edit | P3/P4 | CMD-DIAG-001 |
| 6 | source patch preview | P3 | CMD-TRANS-001 |
| 7 | traceability analysis | P5 | ASSURE-REQ-001 |
| 8 | interface quality findings | P5 | ASSURE-IF-001 |
| 9 | semantic baseline comparison | P5 | DIFF-001 |
| 10 | review findings/dispositions | P5 | REVIEW-001 |
| 11 | deterministic report generation | P5 | REPORT-DET-001 |
| 12 | optional grounded AI proposal | P6 | AI-SAFE-001 |

## Owner decision record template

Gate P0 remains blocked until the owner records:

```yaml
decisionDate: ...
baseline: 638e5aa1cc63ddb3a1c770f36432d6acedfbc541
acceptedAdrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005]
ownerDecisions:
  productName: ...
  shell: ...
  webDemo: ...
  drawio: ...
  collaboration: ...
  firstPilot: ...
  pilotFocus: ...
  aiProviderPolicy: ...
  operatingSystems: ...
  distribution: ...
exceptions: []
authorizedNextPhase: P1
```

An exception identifies affected requirements, evidence, residual risk owner, expiry/review date, and alternative.
