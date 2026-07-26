# Language and Workbench Capability Matrix

Profile version: `sysml-2.0-kerml-1.0/workbench-6-candidate`
Official corpus pin: `2026-05` / `de1070ae8e79c21532b8004fc663d47b35d0e9fa`
Gate P6 rule: only bounded capabilities backed by mandatory tests and exact
locked-runtime evidence are claimed; release targets remain planned.

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
| multi-file source roots | unsupported | qualified P1, supported after engine decision | WS-LOAD-001 |
| imports and visibility | parsed only | qualified P1 | LANG-IMPORT-001 |
| aliases/qualified names | partial | qualified P1 | LANG-NAME-001 |
| recursive/cyclic dependency handling | unsupported | qualified P1 | LANG-CYCLE-001 |
| standard-library/KPAR resolution | optional/unresolved | qualified P1 | LANG-LIB-001 |
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
| syntax diagnostics | partial local parser | qualify P1 | LSP-DIAG-001 |
| semantic diagnostics | shallow | qualify P1 profile | LSP-DIAG-002 |
| semantic tokens | lexical only | qualify P1 | LSP-TOKEN-001 |
| completion/snippets | snippets | qualify P1 | LSP-COMP-001 |
| hover | unsupported | qualify P1 | LSP-HOVER-001 |
| definition/peek | unsupported | qualify P1 | LSP-DEF-001 |
| references | unsupported | qualify P1 | LSP-REF-001 |
| rename | direct/local string edits | qualify P1; identity P2 | LSP-RENAME-001 |
| document/workspace symbols | containment tree only | qualify P1 | LSP-SYMBOL-001 |
| formatting | unsupported | qualify P1 | LSP-FMT-001 |
| quick fixes/code actions | unsupported | qualify P1 | LSP-ACTION-001 |

## Gate P1 qualified language-service profile

| Capability | P1 status | Authority / limitation | Evidence |
|---|---|---|---|
| multi-file workspace inventory | supported | Workbench Service; source-tree roots only | WS-LOAD-001 |
| exact source-tree standard library | supported | VinQut/Pilot; official 95-document workspace | LANG-LIB-001 |
| direct `.kpar` archives | unsupported | fail closed; safe loader not implemented | LANG-KPAR-001 |
| diagnostics | partial | VinQut authoritative for tested fixtures/library; no conformance claim | LSP-DIAG-001/002 |
| document/workspace symbols | partial | VinQut | LSP-SYMBOL-001 |
| definition | supported in qualified sample | VinQut cross-file result | LSP-DEF-001 |
| references | partial | VinQut returns duplicate/coarse results; P2 normalization required | LSP-REF-001 |
| hover | supported in qualified sample | VinQut | LSP-HOVER-001 |
| completion | partial, proposal-only | Spec42; non-authoritative | LSP-COMP-001 |
| semantic tokens | partial, presentation-only | Spec42; non-authoritative | LSP-TOKEN-001 |
| rename | supported command profile | Spec42 edit plus authoritative overlay validation and human-approved transaction | LSP-RENAME-001/CMD-TRANS-001 |
| formatting | proposal-only | Spec42; cannot apply before P3 validation | LSP-FMT-001 |
| full-document incremental sync | supported | both selected engines; increasing versions | LSP-CHANGE-001 |
| timeout/cancel/restart | supported | visible failure; no fallback | LSP-RECOVER-001 |
| normalized semantic snapshot | unsupported at P1 | supported P2 semantic-evidence profile | SEM-SNAP-001 |
| source preservation | partial | inventory byte stability only; edit safety is P3 | LANG-OPAQUE-001 |
| medium scale | supported P7 target profile | 30-sample p95: warm 1.251 s, first useful 4.687 s, diagnostics 175.89 ms | BENCH-MEDIUM-001 |
| large scale | experimental | no crash; excessive memory and latency | BENCH-LARGE-001 |

## Workbench capabilities

| Area | Baseline | Target phase | Evidence |
|---|---|---|---|
| candidate-independent service/adapter | unsupported | P1 | SERVICE-ADAPTER-001 |
| Workbench Protocol/Client SDK | unsupported | P1 | PROTOCOL-001 |
| stdio service transport | unsupported | P1 | TRANSPORT-STDIO-001 |
| authenticated loopback transport | unsupported | P1 | TRANSPORT-LOOPBACK-001 |
| workspace lifecycle/reopen | unsupported | P1 qualification foundation | E2E-WS-001 |
| normalized semantic snapshot | dual shallow models | supported P2 profile | SEM-SNAP-001 |
| stable identity | line/name/path hash | supported P2 schema 2 lifecycle | ID-STABLE-001 |
| model query API | unsupported | supported P2, seven bounded modes | QUERY-001 |
| explorer projection core | legacy AST/store | supported P2 normalized projection | PROJECTION-001 |
| identity-aware semantic diff core | unsupported | supported P2 lifecycle categories | DIFF-P2-001 |
| typed command transaction | supported P3 candidate | exact runtime plus mandatory transaction/recovery tests | CMD-TRANS-001 |
| native source-backed editing | partial P3 profile | conservative known declaration shapes; ambiguity fails closed | CMD-DIAG-001 |
| service-backed product shell | component-qualified P4 | activity rail, semantic explorer, source/diagram/matrix, inspector, Problems, command palette | SHELL-P4-001 |
| language-aware source surface | component-qualified P4 | service completion, hover, definition, references, formatting; edits require command approval | EDITOR-P4-001 |
| saved projections/layouts | component-qualified P4 | bounded workspace-owned JSON with stable-identity positions | VIEW-SAVE-001 |
| matrices/tables | component-qualified P4 | semantic projection table, sort-ready schema and CSV export | MATRIX-001 |
| requirements coverage | supported P5 profile | deterministic direct satisfy/verify gap rules over normalized relationships | ASSURE-REQ-001 |
| verification readiness | supported P5 profile | direct verification coverage and missing-verification findings | ASSURE-VER-001 |
| interface assurance | supported P5 profile | endpoint/type/ownership/basis/verification rules where normalized semantics exist | ASSURE-IF-001 |
| model-anchored reviews | supported P5 | diffable JSON, frozen baseline/scope, stable anchors, transitions, history, staleness | REVIEW-001 |
| Git semantic diff | supported P5 | branch/status/baseline manifests plus stable-identity semantic comparison | DIFF-001 |
| deterministic reports | supported P5 | sanitized HTML, byte-stable PDF, CSV registers, hashed provenance manifests | REPORT-DET-001 |
| constrained AI | supported P6 profile | twelve narrow tools, stable citations, validated one-command proposals, user-only apply, tamper-evident audit, network disabled | AI-SAFE-001 |
| public web/bootstrap surface | modern Pages shell | companion setup plus linked read-only sample; legacy viewer isolated behind `?legacy=1` | DEPLOY-A-001 |
| browser + local companion | production candidate | exact-origin Pages pairing, PNA preflight, short-lived fragment secret, opaque workspace handle, deterministic exact-runtime portable bundle | DEPLOY-B-001 |
| packaged offline desktop | unsupported | native signed shell/installer not qualified | INSTALL-001 |
| managed hosted | unsupported | future D profile | DEPLOY-D-001 |

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
4. the exact engine/adapter/protocol/library/profile version is recorded;
5. a failure cannot silently route to the legacy parser.
