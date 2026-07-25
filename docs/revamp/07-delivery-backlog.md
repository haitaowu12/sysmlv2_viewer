# Delivery Backlog and PR Sequence

Rule: each phase is a draft PR. Merge only after its acceptance gate and owner review.

## PR sequence

| PR/branch | Objective | Required evidence |
|---|---|---|
| P0 `codex/sysml-workbench-phase0-architecture` | decisions and baseline only | this package, screenshots, baseline commands |
| P1 `codex/sysml-workbench-phase1-language-workspace` | pinned engine, workspace, LSP, fixtures | multi-file restart, differential corpus, benchmarks |
| P2 `codex/sysml-workbench-phase2-semantic-core` | snapshot, query, identity | formatting/rename/move identity tests |
| P3 `codex/sysml-workbench-phase3-command-editing` | typed commands and native structural edit | source patch preview, conflict, undo, fail-closed |
| P4 `codex/sysml-workbench-phase4-product-shell` | shell, explorer, projections, matrices | usability pilot tasks without developer intervention |
| P5 `codex/sysml-workbench-phase5-assurance` | requirements/interface/verification/reviews/Git/reports | representative review and evidence package |
| P6 `codex/sysml-workbench-phase6-ai` | grounded proposal-only AI | hallucinated refs rejected; no unapproved mutation |
| P7 `codex/sysml-workbench-phase7-release` | security/accessibility/performance/install/recovery | clean machine release verification |

## Phase 1 backlog

P1.1 create minimal monorepo boundaries and typed protocol.
P1.2 package checksum-verified Spec42 `v0.46.0` for macOS/Windows development.
P1.3 implement engine/schema/library handshake and fail-closed lifecycle.
P1.4 define `sysml-workspace.yaml` v1 and source/library lock resolution.
P1.5 implement canonical path/symlink-safe scanning and watching.
P1.6 expose diagnostics, tokens, completion, hover, definition, references, rename, formatting, symbols, actions.
P1.7 create mandatory fixtures and Pilot differential runner.
P1.8 record semantic snapshot metadata and cache keys.
P1.9 run small/medium/large benchmark baselines.
P1.10 spike Tauri macOS/Windows launch, sidecar, reopen, and crash recovery.
P1.11 add root license decision, notices, SBOM, and audit policy.

Gate: one multi-file sample indexes deterministically, resolves libraries/references, restarts cleanly, and never depends on browser-only semantic state.

## Phase 2 backlog

P2.1 normalized semantic DTO/schema.
P2.2 stable workbench identity and alias ledger.
P2.3 query language/API with bounded resource use.
P2.4 containment/type/dependency/relationship/requirements/verification/interface explorers.
P2.5 cache invalidation and snapshot versioning.
P2.6 identity property tests for formatting, edits, command rename/move.
P2.7 migrate one retained projection and delete its AST dependency.
P2.8 retire legacy parser authority.

Gate: stable identities survive required transformations and semantic diff classifies command rename/move correctly.

## Phase 3 backlog

P3.1 command schema/registry and permission model.
P3.2 overlay validation and proposed workspace edits.
P3.3 diagnostics before/after and semantic diff preview.
P3.4 atomic apply, conflict detection, undo/redo receipts.
P3.5 core create/delete/rename/move/type/multiplicity/value/docs commands.
P3.6 relationship/requirement/verification/interface/flow commands.
P3.7 schema-aware property panel.
P3.8 first native structural/interconnection editing.
P3.9 opaque-range fail-closed tests.
P3.10 remove direct source writes.

Gate P3: every supported UI mutation produces reviewable source edits, diagnostics, affected identities, semantic diff, conflict state, and undo. Unsupported areas fail closed.

## Phase 4 backlog

P4.1 Tauri production shell and activity rail.
P4.2 explorer/editor/problems/output/query/changes regions.
P4.3 saved query/projection/view schemas.
P4.4 structural, interconnection, traceability, action, state, verification profiles.
P4.5 matrices/tables with saved filters/columns/export.
P4.6 versioned layouts and source/visual cross-navigation.
P4.7 command palette, keyboard alternatives, help/onboarding.
P4.8 static read-only demo boundary.
P4.9 remove fixed tabs and Draw.io round trip.
P4.10 practical usability pilot.

Gate P4: complete the eight usability tasks without developer intervention and close all critical usability/accessibility failures.

## Phase 5 backlog

P5.1 requirements hierarchy/coverage/gap rules.
P5.2 verification readiness and evidence links.
P5.3 interface register and schema.
P5.4 compatibility/ownership/units/verification/staleness rules.
P5.5 review artifact/lifecycle/staleness/closure.
P5.6 Git status/baseline selection and snapshot loading.
P5.7 identity-aware semantic diff/change impact.
P5.8 deterministic HTML/PDF reports and manifests.
P5.9 OMC4 pilot model/baselines/review cycle.
P5.10 evidence package verification.

Gate P5: conduct a representative engineering review and reproduce its closure/evidence package from the pinned source baseline.

## Phase 6 backlog

P6.1 narrow read tools.
P6.2 command proposal/validation tools.
P6.3 cited response and identity validation.
P6.4 explicit context/egress consent.
P6.5 provider adapter/keystore/network indicator.
P6.6 approval operation and audit record.
P6.7 mocked provider/hallucination/privacy tests.
P6.8 offline deterministic fallback.

Gate P6: AI cannot mutate canonical source without explicit approval; invented identities/references are rejected; configured egress and audit controls pass.

## Phase 7 backlog

P7.1 threat closure and penetration-focused tests.
P7.2 WCAG/practical accessibility review.
P7.3 performance threshold closure.
P7.4 signed macOS/Windows installers.
P7.5 backup/recovery/crash handling.
P7.6 migration/user/developer/troubleshooting docs.
P7.7 license/security/dependency scans and SBOM.
P7.8 top-level `npm run verify:release`.
P7.9 clean machine installation test.
P7.10 release manifest and owner go/no-go.

Gate P7: all release controls pass from a clean checkout and clean-machine installation. No production claim precedes owner go/no-go.

## Cross-phase definition of ready

- accepted prior ADR/gate;
- bounded objective and rollback;
- exact baseline/head;
- mandatory fixtures identified;
- security/privacy impact assessed;
- migration/deletion impact stated;
- no unresolved authority ambiguity.

## Cross-phase definition of done

- user workflow passes from clean checkout;
- mandatory tests and evidence artifacts committed;
- performance/security/accessibility changes measured where applicable;
- README claims match reality;
- known limits are explicit;
- PR remains draft until owner gate approval.

## Gate P0 stop

After this Phase 0 draft PR is opened, no Phase 1 branch or production implementation begins until the owner approves or amends:

- ADR-001 through ADR-005;
- the requirement/decision trace in `09-phase0-decision-and-requirement-traceability.md`;
- the ten owner decisions;
- the first pilot;
- license/distribution direction.
