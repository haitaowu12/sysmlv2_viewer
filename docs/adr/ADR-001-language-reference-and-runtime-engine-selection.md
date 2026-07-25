# ADR-001: Language Reference and Runtime Engine Selection

- Status: amended and accepted at Gate P1
- Date: 2026-07-25
- Decision owner: product owner
- Phase 1 update required: yes, after comparative qualification

## Context

The workbench needs deterministic SysML v2/KerML semantics, language intelligence, source spans, preservation-safe edits, multi-file resolution, standard libraries, and a stable semantic snapshot. No inspected implementation is entitled to define the language merely because it is convenient to embed.

Four roles must remain separate:

| Role | Authority |
|---|---|
| semantic authority | formal OMG SysML 2.0, KerML 1.0, and Systems Modeling API and Services 1.0 specifications; adopted issue resolutions |
| release baseline | exact official release artifacts, standard libraries/KPARs, examples, and release notes |
| behavioral oracle | official Pilot implementation and official fixtures at the matching release, with disagreements recorded rather than concealed |
| production runtime | an engine selected only after Phase 1 comparative qualification behind the product-owned adapter |

The qualification baseline is official release `2026-05` at `de1070ae8e79c21532b8004fc663d47b35d0e9fa`; the matching Pilot tag is `fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa`. These pins are evidence inputs, not a claim that every Pilot behavior is normative.

## Decision

1. Official specifications and adopted resolutions define intended meaning.
2. Official release artifacts define the reproducible conformance baseline.
3. The matching official Pilot is the primary executable oracle and dispute evidence, not automatically the production runtime.
4. Phase 1 qualifies, at minimum:
   - Spec42 `v0.46.0`, commit `a3f066ee4095a0eb8b37545ffd4846d42804658a`;
   - official Pilot `2026-05` wrapped as a local service;
   - `daltskin/sysml-v2-lsp` `v0.24.0`, commit `6838e9c775f15fc3a3662ea294f13809a1c21577`;
   - `VinQut/sysmlv2-lsp`, commit `373dfb960860c3ac259f56169ddabc06d2847eca`;
   - a hybrid using official parsing/semantic components;
   - the current parser as a negative/control case only.
5. Spec42 is the leading packaging and daily-editing candidate. It is not selected.
6. The Workbench Service owns a versioned Language Service Adapter and normalized semantic contract. Clients never receive engine-native AST types.
7. Phase 1 ends with exactly one recorded outcome: `GO`, `GO WITH CONDITIONS`, `NO-GO`, or `HYBRID GO`. A hybrid may split computation only when one runtime authority remains unambiguous for each operation.
8. ADR-001 is amended at the Phase 1 gate with the selected runtime, supported capability profile, exact pin, evidence bundle, and deletion consequences.

## Qualification weights

| Criterion | Weight | Blocking condition |
|---|---:|---|
| semantic fidelity and official corpus agreement | 30% | material unexplained disagreement in the claimed profile |
| source spans and preservation | 20% | comments, metadata, or unknown syntax can be silently damaged |
| integration/adapter stability | 15% | engine-native types leak into product contracts |
| performance and recovery | 15% | mandatory medium-workspace latency or clean-restart gates fail |
| maintainability and upgrade volatility | 10% | no reproducible pin/upgrade path |
| packaging and redistribution | 10% | license or artifact cannot be shipped for required profiles |

Feature count cannot compensate for a blocking failure.

## Failure and disagreement behavior

- A parser/engine crash is isolated, timed out, and surfaced as service health failure.
- The last complete semantic snapshot may be displayed as stale, never as current.
- Unsupported constructs remain source-preserved and semantically opaque.
- A command touching an opaque or unsafe range fails closed.
- Engine/Pilot/specification disagreement produces a versioned differential record with fixture, pins, outputs, classification, and owner disposition.
- No automatic fallback may silently switch semantic authority. Fallback requires a new workspace session and visible capability negotiation.

## License implications

- Official release and Pilot materials are EPL-2.0 at the selected pins; specification documents retain their stated OMG copyright terms.
- Spec42 and the two inspected independent LSP candidates are MIT at the evaluated pins.
- VoidAliot is observation-only under its published proprietary/freeware terms; no implementation or bundled assets are copied.
- Every candidate build records source pin, dependency SBOM, bundled-library provenance, notices, and redistribution decision. Legal review remains a release gate.

## Expected legacy deletion

The current hand-written parser may remain only as a qualification control and time-bounded compatibility reader. It receives no grammar expansion. Authoritative parser/store reads are removed after the selected adapter passes P1; remaining legacy semantic reconstruction is deleted before P4.

## Acceptance

- the identical mandatory suite runs against every viable candidate;
- official examples, libraries, KPAR, imports, aliases, visibility, malformed input, unknown constructs, Unicode, metadata, comments, clean restart, incremental edit, LSP operations, snapshots, 1k/10k/50k benchmarks, crash recovery, packaging, and license notices are covered;
- results are normalized without hiding candidate-specific evidence;
- the selection report is reproducible from exact pins;
- one runtime authority and bounded capability profile are explicit;
- legacy-parser fallback cannot activate silently.

## Primary references

- [OMG SysML 2.0 specification page](https://www.omg.org/spec/SysML/)
- [Official SysML v2 release repository](https://github.com/Systems-Modeling/SysML-v2-Release)
- [Official Pilot implementation](https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation)
- [LSP specification](https://microsoft.github.io/language-server-protocol/)

## Gate P1 amendment

Phase 1 records **HYBRID GO** for adapter `0.2.0`.

VinQut `373dfb960860c3ac259f56169ddabc06d2847eca`, rebuilt
against official Pilot `fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa`, is the
only semantic authority for parse, resolve, diagnostics, symbols, definition,
references, and hover. Spec42
`a3f066ee4095a0eb8b37545ffd4846d42804658a` is limited to
non-authoritative completion, semantic tokens, rename proposals, and formatting
proposals. Product-owned code owns source inventory, security, normalized DTOs,
artifact locking, health, and visible failure.

Rationale:

- VinQut alone passed the 95-document exact `2026-05` official-library
  workspace with zero diagnostics;
- Spec42 produced 859 errors on that library but supplied materially better
  authoring operations;
- daltskin parsed the library but had release-skew and scale/stability concerns;
- no standalone official Pilot service artifact was qualified.

The responsibility table, exact artifact hashes, comparative report, supported
profile, performance conditions, license state, and migration consequences are
recorded in `docs/revamp/18-phase1-gate-decision.md` and
`config/language-engine-runtime-lock.json`.

No automatic fallback is permitted. Both processes must be present for the
declared hybrid capability set; loss of either fails the session. Semantic
snapshot remains false until P2 supplies the normalized product-owned contract.
Direct KPAR loading and the large production profile are excluded. This is not
a SysML v2 conformance or production-release claim.

## Gate P2 amendment

The semantic runtime now carries a product-owned, read-only
`sysml/semanticEvidence` extension. The extension returns source-backed Pilot
EMF metaclasses and explicit, resolved, non-derived `EReference` evidence. The
workbench normalizer—not React and not the legacy parser—maps that evidence to
the versioned semantic snapshot.

The overlay source, exact upstream pins, reproducible ShadowJar settings, and
patch hash are in `integrations/vinqut-semantic-evidence/`. The qualified jar
SHA-256 is locked in `config/language-engine-runtime-lock.json`. Exact hybrid
qualification proves all eight P2 relationship kinds and clean restart from
the mandatory multi-file fixture.

Failure behavior is closed: no endpoint/capability means no semantic snapshot;
derived, unresolved, unknown-document, invalid-range, over-limit, and
conflicting engine evidence cannot become authoritative relationships.
