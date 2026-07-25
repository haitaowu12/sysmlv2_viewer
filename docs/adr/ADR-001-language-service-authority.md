# ADR-001: Language Service Authority

- Status: proposed for Gate P0
- Date: 2026-07-24
- Decision owners: product owner and workbench architecture

## Context

The baseline hand-written parser is single-document, subset-oriented, non-lossless, and coupled into UI/store/projections. The target requires multi-file resolution, libraries, language intelligence, source edits, deterministic diagnostics, and a stable semantic snapshot.

## Decision

Adopt one interactive authority:

- Spec42 `v0.46.0`;
- commit `a3f066ee4095a0eb8b37545ffd4846d42804658a`;
- built into a checksum-verified workbench-managed sidecar;
- accessed only through a versioned workbench adapter over local stdio;
- standard LSP methods for editor services;
- custom `workbench/*` JSON-RPC methods backed by the protocol-neutral host/snapshot API for semantic facts.

Adopt one independent conformance oracle:

- official SysML v2 Release `2026-04`, commit `9baca5908ca28b53da085de69336fde48420ea8f`;
- official Pilot `2026-04`, commit `20897e3122f2c2f8b29389745f0caaaeb7c6e21a`.

The current parser is temporary compare-only/import compatibility. It never overrides or silently substitutes for the authority.

## Rejected alternatives

- VoidAliot: non-OSS terms prohibit the needed modification/redistribution; product benchmark only.
- SysIDE Legacy: archived and 2024-12 language baseline.
- current Syside: no redistributable open SDK/license selected.
- `daltskin/sysml-v2-lsp`: active MIT ANTLR LSP, but pinned grammar/profile and semantic-host contract do not match the selected qualification target.
- `VinQut/sysmlv2-lsp` binary: valuable proof of a Pilot LSP wrapper, but reported startup, bundled license/version, and exact-pin qualification do not pass this decision.
- official Pilot first: no officially supported standalone LSP distribution found; community wrapper evidence still has Java/Eclipse packaging and latency limits.
- continued custom parser: would require owning a complete KerML/SysML language implementation.
- Spec42 without adapter/oracle: pre-1.0 and partial coverage require containment and independent evidence.

## Evidence

See:

- `docs/revamp/01-external-capability-review.md`
- `docs/revamp/02-language-engine-options.md`
- [Spec42 exact source](https://github.com/elan8/spec42/tree/a3f066ee4095a0eb8b37545ffd4846d42804658a)
- [Spec42 conformance matrix](https://github.com/elan8/spec42/blob/a3f066ee4095a0eb8b37545ffd4846d42804658a/docs/reference/CONFORMANCE-MATRIX.md)
- [official 2026-04 release](https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-04)
- [official Pilot 2026-04](https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases/tag/2026-04)

## License implications

- Spec42 code is MIT.
- Bundled official libraries and the selected official corpus are EPL-2.0 at the selected release.
- Distributions require exact notices, source/pin availability, SBOM, and legal review.
- The workbench repository has no root license; owner selection is required before distribution.

## Versioning

No floating dependency. Engine version, commit, binary checksum, adapter schema, standard-library hash, and language profile are recorded in workspace locks, caches, reports, and evidence.

`2026-05` contains SysML 2.1/KerML 1.1 Beta behavior and is a separate experimental profile.

## Failure and fallback

- Missing, corrupt, mismatched, crashed, timed-out, or incompatible engine: explicit degraded state.
- Source remains available as text.
- Authoritative navigation, projection, rules, command application, and reports are blocked or clearly incomplete.
- No legacy parser fallback.
- If qualification fails, prototype a Java 21 official Pilot sidecar through the same adapter and benchmark pack.

## Migration

1. integrate pinned engine and adapter;
2. qualify mandatory fixtures/differential corpus;
3. migrate editor and workspace services;
4. normalize semantic snapshot;
5. migrate projections/commands;
6. delete parser authority by end of Phase 2.

## Expected deletions

- `src/parser/parser.ts`, types, and serializer as authority;
- parser-derived semantic reads in store/views;
- unused `peggy`;
- duplicated native/Draw.io semantic reconstruction.

Temporary compatibility code must have tests and a deletion issue.

## Acceptance tests

The twelve tests in `02-language-engine-options.md` are binding. Production use is not approved until coverage, preservation, failure injection, and target-scale benchmarks pass.

## Consequences

Positive: immediate access to mature editor protocols and workspace semantics while keeping product ownership and conformance skepticism.
Negative: Rust/native distribution, pre-1.0 churn, adapter maintenance, and a mandatory differential qualification program.
