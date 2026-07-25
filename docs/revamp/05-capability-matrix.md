# Language and Workbench Capability Matrix

Profile version: `sysml-2.0-kerml-1.0/workbench-0`
Official corpus pin: `2026-04`
Phase 0 rule: all target states remain **planned** until mandatory tests exist

## Status vocabulary

| Status | Meaning |
|---|---|
| supported | deterministic behavior meets linked mandatory tests |
| partial | bounded subset is documented and tested |
| parsed/preserved only | source survives; no authoritative semantics/edits promised |
| unsupported | operation is rejected or content is explicitly opaque |
| planned | target only; no feature claim |

## Language capability baseline and target

| Capability | Baseline | Phase target | Mandatory evidence id |
|---|---|---|---|
| package/namespace parsing | partial | supported | LANG-PKG-001 |
| multi-file source roots | unsupported | supported P1 | WS-LOAD-001 |
| imports and visibility | parsed only | supported P1 | LANG-IMPORT-001 |
| aliases/qualified names | partial | supported P1 | LANG-NAME-001 |
| recursive/cyclic dependency handling | unsupported | supported P1 | LANG-CYCLE-001 |
| standard-library/KPAR resolution | optional/unresolved | supported P1 | LANG-LIB-001 |
| definitions and usages | partial | supported P2 profile | LANG-DU-001 |
| typing/specialization/redefinition | partial | partial then supported by profile | LANG-TYPE-001 |
| parts/ports/connections/flows/interfaces | partial | supported structural/interface profile | LANG-IF-001 |
| requirements/satisfy/derive | partial | supported requirements profile | LANG-REQ-001 |
| verification/cases | partial | supported verification profile | LANG-VER-001 |
| actions/control/data flow | partial | partial behaviour profile | LANG-ACT-001 |
| states/transitions | partial | partial behaviour profile | LANG-STATE-001 |
| metadata | recovery/partial | preserved; selected forms supported | LANG-META-001 |
| expressions/quantities/units | partial | partial then supported subset | LANG-EXPR-001 |
| variants/configurations | unsupported/recovery | experimental | LANG-VAR-001 |
| malformed recovery | partial | supported safe recovery | LANG-ERR-001 |
| unknown syntax preservation | not lossless | supported preservation | LANG-OPAQUE-001 |
| formatting round-trip | unsupported | supported | LANG-FMT-001 |

## Language-service features

| Feature | Baseline | Target gate | Test id |
|---|---|---|---|
| syntax diagnostics | partial local parser | P1 | LSP-DIAG-001 |
| semantic diagnostics | shallow | P1 profile | LSP-DIAG-002 |
| semantic tokens | lexical only | P1 | LSP-TOKEN-001 |
| completion/snippets | snippets | P1 | LSP-COMP-001 |
| hover | unsupported | P1 | LSP-HOVER-001 |
| definition/peek | unsupported | P1 | LSP-DEF-001 |
| references | unsupported | P1 | LSP-REF-001 |
| rename | direct/local string edits | P1/P2 identity | LSP-RENAME-001 |
| document/workspace symbols | containment tree only | P1 | LSP-SYMBOL-001 |
| formatting | unsupported | P1 | LSP-FMT-001 |
| quick fixes/code actions | unsupported | P1 | LSP-ACTION-001 |

## Workbench capabilities

| Area | Baseline | Target phase | Evidence |
|---|---|---|---|
| workspace lifecycle/reopen | unsupported | P1 | E2E-WS-001 |
| normalized semantic snapshot | dual shallow models | P2 | SEM-SNAP-001 |
| stable identity | line/name/path hash | P2 | ID-STABLE-001 |
| model query API | unsupported | P2 | QUERY-001 |
| typed command transaction | unsupported | P3 | CMD-TRANS-001 |
| native source-backed editing | ad hoc subset | P3 | CMD-DIAG-001 |
| saved projections/layouts | unsupported | P4 | VIEW-SAVE-001 |
| matrices/tables | unsupported | P4 | MATRIX-001 |
| requirements coverage | simple diagram only | P5 | ASSURE-REQ-001 |
| verification readiness | unsupported | P5 | ASSURE-VER-001 |
| interface assurance | simple interconnection view | P5 | ASSURE-IF-001 |
| model-anchored reviews | unsupported | P5 | REVIEW-001 |
| Git semantic diff | unsupported | P5 | DIFF-001 |
| deterministic reports | SVG/PNG only | P5 | REPORT-DET-001 |
| constrained AI | whole-document mutation | P6 | AI-SAFE-001 |
| packaged offline install | static page | P7 | INSTALL-001 |

## Fixture pack contract

Mandatory CI fixtures will include:

- small grammar positives/negatives;
- multi-file imports, aliases, visibility, cycles;
- pinned standard-library references;
- definitions/usages and typing;
- requirements, satisfy, derive, verification;
- ports, interfaces, connections, flows and units;
- actions and states;
- metadata;
- supported variants/configurations;
- malformed recovery;
- comments/formatting/Unicode/unknown preservation;
- source edits and undo;
- identity formatting/rename/move;
- semantic diff;
- two baseline workspaces.

Official examples are selected and copied/referenced only with provenance and license review. An optional upstream checkout may supplement but never replace this pack.

## Claim gate

Each capability entry becomes `supported` only when:

1. its test id is mandatory in clean CI;
2. expected diagnostics/snapshots/edits are golden-reviewed;
3. unsupported neighboring syntax is documented;
4. the exact engine/library/profile version is recorded;
5. a failure cannot silently route to the legacy parser.
