# Delivery Backlog and Draft PR Sequence

Each phase is a bounded draft PR based on the accepted prior head. No production claim or next phase begins before its gate.

## Sequence

| Phase/branch | Objective | Required evidence |
|---|---|---|
| P0 `codex/sysml-workbench-phase0-architecture` | audited decisions and qualification plan only | revised package, exact pins, owner packet |
| P1 `codex/sysml-workbench-phase1-engine-service` | Engine Qualification and Workbench Service Foundation | comparative report, selected outcome, protocol/transports, restart/bench/license evidence |
| P2 `codex/sysml-workbench-phase2-semantic-core` | normalized semantics, query, identity | snapshot/query goldens, formatting/rename/move identity |
| P3 `codex/sysml-workbench-phase3-command-editing` | typed commands and first native edit | patch preview, validation, conflict, undo, fail-closed |
| P4 `codex/sysml-workbench-phase4-product-shell` | shared shell, explorers, projections, matrices | B/C contract parity and usability pilot |
| P5 `codex/sysml-workbench-phase5-assurance` | requirements/interface/verification/reviews/Git/reports | representative review/evidence package |
| P6 `codex/sysml-workbench-phase6-ai` | controlled proposal-only AI | cited/validated proposals; no unapproved mutation/egress |
| P7 `codex/sysml-workbench-phase7-release` | security/accessibility/performance/install/recovery | clean-machine release verification |

## P1 — Engine Qualification and Workbench Service Foundation

P1.1 freeze official/candidate pins and produce artifact/license manifests.
P1.2 define versioned Language Service Adapter and normalized observation schemas.
P1.3 build isolated candidate harness for Spec42, Pilot wrapper, daltskin, VinQut, hybrid spike, and legacy control.
P1.4 create mandatory official/isolated fixture pack and differential runner.
P1.5 implement independently executable Workbench Service.
P1.6 define Workbench Protocol and generated Client SDK.
P1.7 implement stdio and authenticated loopback HTTPS/WSS transports.
P1.8 implement initialize/capability negotiation and version mismatch behavior.
P1.9 implement workspace open/index/status/close and safe source/library discovery.
P1.10 observe diagnostics, symbols, definition/references, completion, hover, tokens, rename, formatting, and snapshots through adapters.
P1.11 test libraries/KPAR, imports/aliases/visibility/cycles, preservation, incremental changes, timeout/crash/restart.
P1.12 run 1k/10k/50k benchmarks and clean-machine/offline packaging checks.
P1.13 publish raw/normalized scorecards, discrepancy records, SBOM/notices, and selection recommendation.
P1.14 record `GO`, `GO WITH CONDITIONS`, `NO-GO`, or `HYBRID GO`; amend ADR-001.

Gate P1:

- one runtime authority is unambiguous;
- required profile meets semantic/source/failure/license blocking gates;
- medium multi-file sample indexes deterministically and restarts cleanly;
- standard libraries and cross-file navigation resolve;
- service runs without Tauri;
- stdio and loopback conformance pass;
- no browser-only or candidate-native authoritative state exists.

## P2 — Semantic model, identity, and query

Delivery state: implementation and exact-runtime qualification complete;
clean-checkout/CI/PR delivery gate pending. Measured first-use latency exception
is recorded without reducing the target.

- normalized snapshot and provenance;
- stable identity/locator/fingerprint/alias receipts;
- bounded query API;
- containment/type/dependency/neighbourhood/requirements/verification/interface modes;
- cache invalidation/snapshot versioning;
- identity properties for formatting, edits, command rename/move/file move;
- migrate first projection; remove its legacy AST/store dependency;
- retire remaining parser authority.

Gate: identity survives specified transformations; command rename/move is not delete/create; queries reproduce from source/reference lock.

## P3 — Command engine and source-backed editing

- command registry/schema/authorization;
- proposed workspace edits and preservation-safe ranges;
- diagnostics before/after and semantic diff;
- atomic apply, stale/conflict detection, idempotency, undo/redo receipts;
- core create/delete/rename/move/type/multiplicity/value/documentation commands;
- interface/connection/flow/requirement/verification relationship commands;
- schema-aware properties;
- first structural/interconnection edit;
- opaque-range/property/mutation tests;
- remove direct UI/AI source writes.

Gate: every supported mutation returns a reviewable patch, diagnostics, affected identities, diff, conflict state, approval, and undo; unsupported areas fail closed.

## P4 — Shared workbench UX and projections

- shared web application/activity rail and Client SDK only;
- explorer/editor/problems/output/query/changes regions;
- saved query/projection/view/notation/layout schemas;
- reference/conventional/analytical provenance legends;
- initial diagram profiles and matrices/tables;
- selection/source/visual cross-navigation;
- Profile B local companion product path;
- Profile C Tauri host using the same UI/service;
- Profile A bounded evaluation;
- command palette, keyboard alternatives, onboarding/help;
- remove fixed tabs and Draw.io round trip;
- eight-task usability pilot.

Gate: identical client contracts pass in B/C; browser reviewers complete relevant tasks; all eight pilot tasks complete without developer intervention.

## P5 — Engineering assurance

- requirements hierarchy/coverage/change;
- verification readiness/evidence;
- interface register, ownership, units/type compatibility, basis, coverage, staleness;
- review lifecycle/anchoring/staleness/closure;
- Git working state/baselines;
- identity-aware semantic diff/change impact;
- deterministic HTML/PDF/report manifests;
- OMC4 pilot model, two baselines, full review cycle.

Gate: conduct and reproduce a representative review and closure/evidence package from exact source.

## P6 — Controlled AI

- narrow model tools and citations;
- proposal/validation command tools;
- explicit context, provider, and egress action;
- OS/service-held credentials and visible network state;
- approval operation and audit;
- mocked providers, hallucination/privacy/failure tests;
- offline deterministic fallback.

Gate: AI cannot mutate without exact approved operation; invented identities are rejected; no implicit egress.

## P7 — Release candidate

- threat closure and deployment-profile penetration tests;
- accessibility review;
- performance threshold closure;
- signed macOS/Windows desktop and local-companion packages;
- backup/recovery/crash/update policy;
- migration/user/developer/troubleshooting docs;
- dependency/license scans and SBOM;
- top-level `npm run verify:release`;
- clean-machine B and C installation/recovery;
- release manifest and owner go/no-go.

## Gate P0 approval

The owner approved ADR-001–008 and the recommended decision packet on 2026-07-24 against Phase 0 head `dc276c586dbac5d41150fe62ea9f539c1d29b3ea`.

Phase 1 was accepted with a bounded **HYBRID GO** decision on 2026-07-25.
VinQut/Pilot is semantic authority and Spec42 is non-authoritative authoring
assistance. Exact evidence and carried conditions are recorded in
`docs/revamp/18-phase1-gate-decision.md`. Phase 2 is authorized; production and
release claims remain blocked.
