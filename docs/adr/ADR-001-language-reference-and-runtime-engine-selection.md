# ADR-001: Language Reference and Runtime Engine Selection

- Status: accepted at Gate P0
- Date: 2026-07-24
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
