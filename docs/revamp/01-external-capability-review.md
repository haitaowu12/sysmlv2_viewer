# External Capability Review

Status: Phase 0 decision evidence
Observed: 2026-07-24
Rule: product claims are not treated as reusable implementation rights

## Decision summary

- Use VoidAliot as a product-experience benchmark only.
- Pin the official `2026-04` SysML 2.0/KerML 1.0 release and Pilot as the conformance corpus/oracle.
- Use Spec42 `v0.46.0` as the selected interactive engine candidate behind a workbench-owned adapter.
- Reject archived SysIDE Legacy as authority.
- Defer the official API repository implementation to future interoperability; do not make a repository shadow model canonical.

## VoidAliot VS Code extension

[Marketplace listing](https://marketplace.visualstudio.com/items?itemName=voidaliot.vscode-sysml-v2)

Observed baseline expectations:

- local/offline language server;
- bundled standard library and KPAR support;
- diagnostics, semantic tokens, completion, hover, definitions, references, rename, formatting, symbols, and quick fixes;
- source-backed editable diagrams and Git-friendly external layout;
- model-aware AI tools rather than raw prompt-only access;
- zero telemetry claim.

The listing claims full language coverage and nine views while also describing active development. No independent conformance result or reusable public implementation was found. The available release material is not an acceptable integration source: its freeware terms prohibit the modification and redistribution required by this product.

Use: UX and workflow benchmark.
Do not use: code, bundled assets, reverse engineering, or engine embedding.

## Official SysML v2 Release

Selected pin:

- tag `2026-04`
- commit `9baca5908ca28b53da085de69336fde48420ea8f`
- [release](https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-04)

This release contains the formally adopted KerML 1.0, SysML 2.0, and Systems Modeling API 1.0 documents, examples, textual standard libraries, KPAR libraries, and BNF extracts. Software and included models are EPL-2.0; specification documents retain their stated copyrights.

The later [`2026-05` release](https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-05) introduces KerML 1.1/SysML 2.1 Beta 1 content. It must be a separately versioned experimental profile, not an unreviewed “latest” update to the 2.0 profile.

Use:

- versioned standard-library source;
- mandatory fixture selection where licensing permits;
- syntax/semantics provenance;
- versioned capability profiles.

Do not use XMI as a hidden authoritative model; the release itself notes its Eclipse XMI is not fully normative OMG XMI.

## Official Pilot Implementation

Selected pin:

- tag `2026-04`
- commit `20897e3122f2c2f8b29389745f0caaaeb7c6e21a`
- [release](https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases/tag/2026-04)

Architecture:

- Java, Maven/Tycho, Eclipse, Xtext, EMF, and semantic/transformation modules;
- generated metamodel, linker/validation logic, Eclipse editor services, and model-library tooling;
- broad reference implementation provenance;
- EPL-2.0 at the selected release.

The 2026-04 release begins separating the generated EMF model from Eclipse plug-ins. The 2026-05 release further separates semantic logic, but also moves to 2.1 Beta semantics. No officially supported standalone LSP distribution was found; [issue 571](https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/issues/571) remains the public LSP request, although a community wrapper now demonstrates feasibility.

Use:

- differential validation oracle;
- semantic reference during discrepancy triage;
- fallback Java 21 sidecar prototype only if the selected engine fails qualification.

Do not use as the first interactive engine: packaging, latency, process lifecycle, and standalone editor-service integration are not proven for this workbench.

## Spec42

Selected candidate:

- release `v0.46.0`
- commit `a3f066ee4095a0eb8b37545ffd4846d42804658a`
- [source](https://github.com/elan8/spec42/tree/a3f066ee4095a0eb8b37545ffd4846d42804658a)
- MIT code license; separate notices for bundled standard libraries

Relevant capabilities:

- Rust CLI, LSP, API/host crates, VS Code extension, and local binaries;
- diagnostics, tokens, completion, hover, definitions, references, rename, formatting, symbols, and code actions;
- workspace/library resolution and immutable semantic snapshots;
- structured version metadata and document hashes;
- semantic snapshot comparison;
- cancellation, deadlines, and resource limits;
- local binaries for macOS arm64/x64, Windows x64, and Linux x64 with published SHA-256 digests.

Important limitations:

- pre-1.0 and very rapid cadence;
- the `v0.46.0` annotated tag is unsigned; release assets publish GitHub digests and `SHA256SUMS.txt`, so Phase 1 must build/verify provenance rather than trusting the tag alone;
- its generated [conformance matrix](https://github.com/elan8/spec42/blob/a3f066ee4095a0eb8b37545ffd4846d42804658a/docs/reference/CONFORMANCE-MATRIX.md) classifies parsing as partial;
- [workspace API notes](https://github.com/elan8/spec42/blob/a3f066ee4095a0eb8b37545ffd4846d42804658a/crates/workspace/README.md) say end-to-end incremental speedup is not yet demonstrated;
- target workbench scale is not proven;
- release notes disclose recently fixed parser misparses and stack overflows;
- native engine identities are insufficient for durable workbench review identity.

Use:

- pinned interactive language authority behind a versioned adapter;
- LSP for editor operations;
- protocol-neutral host/snapshot API for normalized semantic facts.

Do not use:

- Spec42 UI/diagram architecture as product architecture;
- floating versions;
- unqualified diagnostic or conformance claims.

## Other language engines

### SysIDE Editor Legacy

[Repository](https://github.com/sensmetry/sysml-2ls/tree/a0b3ddbf783063dd7291aac0b51d4282decc789e)

Strengths: TypeScript/Langium, EPL-2.0 or GPLv2 with Classpath Exception, conventional LSP capabilities.
Blocking facts: archived/deprecated, targets the 2024-12 release, upstream recommends the replacement product.
Decision: reject as authority.

### Current Syside

The current engine is a licensed product rather than a redistributable open core. Vendor performance and language-coverage statements are not reproducible evidence for this architecture.
Decision: reject absent a separate owner-approved commercial SDK agreement, offline/privacy terms, and qualification.

### daltskin/sysml-v2-lsp

[Repository](https://github.com/daltskin/sysml-v2-lsp/tree/6838e9c775f15fc3a3662ea294f13809a1c21577) / npm `sysml-v2-lsp@0.24.0`

This active MIT TypeScript/ANTLR implementation exposes standard LSP features, a symbol table, semantic-validation claims, benchmarks, web/Python clients, and MCP tooling. Its grammar identifies official release `2026-01`, not the selected `2026-04` profile. No protocol-neutral compiler-grade semantic snapshot comparable to the selected host API was demonstrated in this spike. It remains a useful second differential implementation and a lower-packaging-cost contingency, but its grammar/semantic ownership and same-day pre-1.0 cadence carry the same qualification burden as the selected engine.

Decision: include in fixture discrepancy sampling; reject as the primary authority for P1.

### VinQut/sysmlv2-lsp

[Repository](https://github.com/VinQut/sysmlv2-lsp/tree/373dfb960860c3ac259f56169ddabc06d2847eca)

This active MIT wrapper proves the official Pilot can be exposed through a standalone Java 21/Xtext LSP. It reports 45–60 seconds to live-index the bundled standard library and a 30 MB fat JAR. Its published notice describes bundled LGPL-3.0 Pilot artifacts, which do not match the selected 2026-04 EPL pin without a rebuild and legal/version audit.

Decision: use as fallback architecture evidence, not as a prebuilt authority. A Pilot fallback must rebuild from the exact selected pin, pass the shared adapter/fixture suite, and meet startup/latency gates.

### Eclipse SysON

[Repository](https://github.com/eclipse-syson/syson)

SysON is an active EPL-2.0 web modeling environment and a useful reference for graphical/product patterns. Its server/repository architecture is larger than the required local language boundary and risks introducing a separate repository model as authority.
Decision: architecture reference only.

## Standard libraries and packages

The official release provides:

- plain `.sysml`/`.kerml` library trees;
- KPAR archives containing textual notation;
- non-normative Eclipse XMI variants.

Selected workbench posture:

1. pin a language profile and library lock together;
2. preserve source and KPAR provenance;
3. materialize libraries into a disposable content-addressed cache;
4. record library hashes in every semantic snapshot and report;
5. reject cache/library mismatch rather than silently using another version.

Future package-manager support may integrate Sysand through an adapter, but package installation/update is not a Phase 1 prerequisite.

## Language-server interfaces

Use standard LSP for editor functions. LSP is insufficient for all workbench queries, stable engineering identities, command transactions, semantic diff, and report provenance.

Add a versioned workbench language protocol:

```text
initialize(engine pin, schema versions, library lock)
loadWorkspace(config) -> snapshot metadata
getSemanticSnapshot(snapshotId, query)
validateWorkspace(snapshotId)
validateEdits(baseSnapshotId, workspaceEdits)
compareSnapshots(previousId, nextId)
shutdown()
```

No UI component calls the parser or engine-native graph directly.

## SysML v2 API and repository interoperability

The [official API Services repository](https://github.com/Systems-Modeling/SysML-v2-API-Services/tree/0af711b14bbcea7b240bb0a3a65817ae68302092) provides a local Scala/Play/PostgreSQL pilot and remote REST scenario. It is useful for future import/export and shared repository integration.

It is not selected for the local canonical model because:

- the target requires plain source and Git history as canonical;
- its database is an additional authoritative state;
- it adds deployment and authentication complexity;
- Phase 0 has no collaboration requirement beyond Git and review artifacts.

Future adapter rule: API/repository exchange imports/exports source-backed semantic facts and never bypasses command validation.

## Licensing controls

| Asset | License posture | Required control |
|---|---|---|
| Spec42 code | MIT | pin source/release; include notice and SBOM |
| bundled official libraries | EPL-2.0 at selected pin | include exact source/pin and notices; legal review distribution |
| official release examples/models | EPL-2.0 unless otherwise stated | retain attribution and fixture provenance |
| official specification documents | document-specific copyright | link/reference; do not redistribute without review |
| Pilot implementation | EPL-2.0 | oracle tooling isolated; source notices |
| VoidAliot | non-OSS freeware | no copying/embedding/reverse engineering |
| current repository | no root license | owner must select/add license before distribution |

## Offline deployment

The selected architecture can operate offline after installation:

- Tauri desktop shell;
- bundled, checksum-verified engine sidecar;
- pinned standard-library archive;
- local Git executable/library;
- no provider AI enabled by default;
- no remote fonts, analytics, diagram iframe, or CDN requirement.

Every network-capable adapter has an explicit enablement and visible indicator.

## Evidence caveats

- Candidate claims were checked against source trees, release notes, licenses, and capability matrices where available.
- No candidate has yet passed this repository’s mandatory fixture or performance plan.
- Selection means “proceed to qualification,” not “claim production conformance.”
