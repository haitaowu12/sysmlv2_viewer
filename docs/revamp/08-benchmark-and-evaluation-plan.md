# Benchmark and Evaluation Plan

Purpose: qualify architecture choices before product claims.

## Workspaces

| Tier | Files | Elements | Use |
|---|---:|---:|---|
| small | 10 | 1,000 | CI smoke and edit latency |
| medium | 100 | 10,000 | primary engineering laptop acceptance |
| large | 500 | 50,000 | scale characterization and resource limits |

Each tier is generated from deterministic seeds plus reviewed hand-authored edge fixtures. Generated volume cannot replace realistic semantic density.

## Scenario composition

Every benchmark contains:

- nested packages and multiple source roots;
- explicit/imported/aliased names;
- standard-library types/units;
- parts, ports, interfaces, connections, and flows;
- requirements, satisfy, verify, and verification cases;
- actions/states at bounded density;
- cross-file references and cycles;
- unresolved/ambiguous negative cases;
- comments, metadata, Unicode, and unknown preserved ranges;
- two Git baselines with rename, move, type/value/relationship changes;
- saved diagram/matrix queries;
- review findings/evidence manifests.

## Target thresholds

Measured on an identified normal engineering laptop:

| Measure | Target |
|---|---:|
| warm reopen, medium | < 3 s |
| first useful explorer content, medium | < 5 s |
| ordinary incremental diagnostics | < 500 ms p95 |
| go-to-definition | < 300 ms p95 |
| neighbourhood diagram, <500 elements | < 2 s |
| matrix filter/update, 10,000 rows | < 500 ms p95 |
| medium semantic baseline diff | < 10 s |
| UI main-thread long tasks | no >100 ms recurring blockage during index/report |

## Measurement protocol

- fixed CPU/memory/OS/tool versions recorded;
- network disabled;
- cold and warm cache runs separated;
- 5 warm-up operations, then at least 30 measured interactive operations;
- median, p95, max, allocation/RSS, and cancellation latency reported;
- raw JSON committed under `generated/benchmarks/` only when deterministic and size-bounded;
- regression threshold: >10% and statistically credible requires explanation/approval;
- engine, adapter schema, library hash, workspace commit, and benchmark seed included.

## Benchmarks

BENCH-01 cold install/first library materialization.
BENCH-02 cold workspace open.
BENCH-03 warm reopen.
BENCH-04 first partial explorer snapshot.
BENCH-05 single-file ordinary edit diagnostics.
BENCH-06 cross-file rename preview/validation.
BENCH-07 definition/references/workspace symbol.
BENCH-08 neighbourhood projection/layout/render.
BENCH-09 10k-row matrix filter/group/sort.
BENCH-10 baseline checkout/load/semantic comparison.
BENCH-11 report generation/cancellation.
BENCH-12 rule-pack evaluation.
BENCH-13 sidecar crash/restart and cache recovery.
BENCH-14 large-workspace limit/degraded-state behavior.

## Differential language evaluation

For eligible fixtures compare Spec42 and the official Pilot:

- parse/recovery result;
- diagnostic code/category/location/severity;
- qualified names/owners;
- definition/usage/type bindings;
- standard-library provenance;
- relationship endpoints;
- workspace symbol counts;
- command edit validation.

Discrepancies are triaged:

1. workbench adapter defect;
2. Spec42 defect;
3. Pilot defect;
4. allowed/unspecified implementation variance;
5. unsupported capability-profile item.

No discrepancy is silently normalized away.

## Source preservation evaluation

Property/mutation tests generate edits around:

- comments and documentation;
- unknown constructs;
- metadata;
- Unicode identifiers;
- CRLF/LF and indentation;
- malformed/recovered syntax;
- nested braces and expression boundaries.

Pass: untouched ranges remain byte-identical unless formatting is the explicit command. Unsafe overlap rejects the command.

## Identity and semantic diff evaluation

Golden scenarios:

- formatting-only;
- ordinary value/doc edit;
- typed-command rename;
- typed-command move within file;
- move across files;
- file rename;
- type/multiplicity/value changes;
- relationship create/delete;
- layout-only;
- review-only.

Pass: stable identities and aliases behave per ADR-002; rename/move are not reported as delete/create when performed through commands.

## Usability pilot

Participants: at least three engineers not implementing the tested feature; include one keyboard-heavy user. Record completion time, errors, assistance, confidence, and repair actions.

Tasks:

1. open sample workspace;
2. find unresolved reference;
3. navigate requirement to satisfying element;
4. identify unverified requirement;
5. add interface and inspect source edits;
6. compare baselines;
7. record and close finding;
8. export interface report.

Phase 4 gate: all primary tasks complete without developer intervention; critical failures fixed and rerun.

## Security/accessibility evaluation

- path traversal/symlink/watcher abuse;
- malformed IPC/provider/report input;
- CSP and navigation enforcement;
- secrets/log/model-content inspection;
- keyboard-only primary workflows;
- screen-reader names/relationships;
- focus order and restoration;
- contrast, scalable text, reduced motion;
- diagram alternative table/tree.

## Reporting

Every benchmark report includes hardware, OS, commit, engine/library pins, config, sample size, cache state, raw-data link, failures, and mitigation. A missed target remains a failed acceptance item until owner accepts a documented exception; success is not redefined.
