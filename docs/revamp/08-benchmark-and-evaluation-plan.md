# Benchmark and Evaluation Plan

Purpose: qualify engines, service/protocol/transports, and later product workflows before claims.

## Workspaces

| Tier | Files | Elements | Use |
|---|---:|---:|---|
| small | 10 | 1,000 | CI smoke, candidate operations, edit latency |
| medium | 100 | 10,000 | primary laptop acceptance |
| large | 500 | 50,000 | scale/resource/degraded-state characterization |

Deterministic generated volume is supplemented by reviewed engineering fixtures containing imports/aliases/cycles, official libraries/units, definitions/usages, structures/interfaces/flows, requirements/verification, bounded behaviors, unresolved/ambiguous cases, metadata/comments/Unicode/unknown ranges, two baselines, views, reviews, and evidence.

## P1 candidate qualification

Run the identical operation manifest against every viable candidate through the adapter harness. Capture raw evidence before normalization.

| Group | Measures |
|---|---|
| correctness | parse/recovery; diagnostics; owners/names/types/relationships; library provenance; Pilot/spec agreement |
| preservation | spans, comments, docs, metadata, Unicode, line endings, formatting, unknown syntax, edit boundaries |
| LSP | completion/hover/definition/references/rename/tokens/symbols/formatting/actions |
| operations | cold/warm startup, first content, incremental p50/p95, memory, cancellation, crash/restart/cache |
| distribution | clean build/install, artifact hash/size/SBOM/notices, macOS/Windows, stdio/loopback, offline |

Discrepancies are classified against formal specifications/resolutions, official release artifacts, and matching Pilot as described in `14-engine-comparative-qualification-plan.md`. No candidate output is silently declared correct by majority.

## Targets

| Measure | Target |
|---|---:|
| warm reopen, medium | <3 s |
| first useful explorer content, medium | <5 s |
| ordinary incremental diagnostics | <500 ms p95 |
| go-to-definition | <300 ms p95 |
| neighbourhood generation under 500 elements | <2 s |
| 10,000-row matrix update | <500 ms p95 |
| medium semantic diff | <10 s |
| UI long tasks | no recurring >100 ms block during index/report |

P1 measures language/service targets. Later phases measure projections, matrices, diff, report, and UI separately so transport/render time is not attributed to the engine.

## Protocol

- identify hardware, OS, power mode, commit, candidate/adapter/protocol/reference/library pins;
- disable external network except the explicitly tested transport;
- separate cold library, cold workspace, and warm workspace;
- five warm-ups and at least 30 interactive samples;
- report median, p95, max, RSS/peak memory, CPU, output size, and cancellation;
- commit bounded raw JSON plus exact operation/seed/config;
- explain statistically credible regressions over 10%;
- never redefine a missed target; owner exceptions identify impact, mitigation, owner, and expiry.

## Benchmark catalog

BENCH-01 clean build/install/library materialization.
BENCH-02 cold workspace open and progressive status.
BENCH-03 warm reopen.
BENCH-04 first partial semantic/explorer data.
BENCH-05 ordinary edit diagnostics.
BENCH-06 cross-file definition/references/rename preview.
BENCH-07 symbols/completion/hover/tokens/format.
BENCH-08 snapshot creation/serialization/invalidation.
BENCH-09 forced timeout/crash/restart/corrupt cache.
BENCH-10 stdio versus loopback overhead/backpressure/reconnect.
BENCH-11 neighbourhood projection/layout/render.
BENCH-12 10k-row matrix filter/group/sort.
BENCH-13 baseline load/semantic comparison.
BENCH-14 rules/report generation/cancellation.
BENCH-15 large-workspace resource/degraded-state behavior.

## Preservation and identity

Property/mutation tests place edits around comments, unknown constructs, metadata, Unicode, CRLF/LF, malformed recovery, nested expressions, and multiple files. Untouched ranges remain byte-identical unless formatting is explicit; unsafe overlap rejects.

Identity/diff goldens include formatting, ordinary edit, command rename, same/cross-file move, file rename, type/multiplicity/value/documentation, relationships, layout-only, and review-only. ADR-002 continuity and semantic categories must hold.

## Transport/deployment security evaluation

- stdio framing, invalid schema, timeout, cancellation, idempotency;
- loopback-only bind, IPv4/IPv6, Host/Origin allowlist, pairing, expiry/revocation;
- malicious origin, DNS rebinding, CSRF/CSWSH, replay, oversized message, rate/connection exhaustion;
- path traversal/symlink/watcher abuse and workspace-handle authorization;
- Tauri capability scope and no semantic dependency;
- hosted test profile role/tenant isolation before Profile D;
- secrets/log/model-content inspection, CSP/report sanitization, egress indicator.

## Usability/accessibility

At least three engineers not implementing the feature, including a keyboard-heavy user, perform the eight tasks in `13-ui-ux-pattern-review.md`. Include a non-modeler reviewer for web-only tasks. Record time, errors, backtracks, assistance, confidence, and repairs.

Gate P4 requires successful rerun without developer intervention and closure of critical accessibility/usability failures.

## Report schema

Every evaluation report includes workspace/source commit, reference release, candidate/selected engine, adapter/protocol/service/UI/rule versions, deployment profile/transport, hardware/OS, cache state, sample size, raw evidence, exclusions, discrepancies, failures, and mitigation.
