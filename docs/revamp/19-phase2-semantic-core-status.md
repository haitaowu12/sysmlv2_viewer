# Phase 2 Semantic Core Status

- Date: 2026-07-25
- Base: Phase 1 merge `89f91991370d85f0b2bbcfc3b584d379c732084b`
- Phase: P2 semantic model, identity, query, projection, and identity-aware diff
- Current decision: **Gate P2 accepted; Phase 3 is next**
- Production claim: **not authorized**; P3-P7 remain required

## Implemented contract

| Responsibility | Evidence | Status |
|---|---|---|
| authoritative semantic evidence | locked VinQut/Pilot extension `sysml/semanticEvidence` | implemented and hash-locked |
| normalized semantic snapshot | `packages/semantic-model/src/index.ts` | implemented from Pilot EMF evidence only |
| semantic relationships | mandatory golden fixture | containment, typing, dependency, satisfaction, verification, connection, flow, interface |
| stable identity lifecycle | `packages/semantic-model/src/identity-registry.ts` | schema 2 active/tombstone generations and aliases |
| formatting/line/clone stability | semantic-model identity tests | passing |
| rename/move continuity | command migration receipts and semantic-diff tests | rename/move, not delete/create |
| uncontrolled move reconciliation | fingerprint/kind reconciliation | unique match accepted; ambiguity fails closed |
| registry recovery | workspace-service tests | atomic primary/backup; corrupt or conflicted primary fails closed |
| bounded model query | `packages/query-engine/src/index.ts` | seven deterministic query modes |
| query cache | workspace service | snapshot-keyed, bounded to 128, invalidated on edit/restart |
| first projection migration | `packages/projection-engine` | explorer projection consumes normalized snapshot/query only |
| identity-aware semantic diff | `packages/semantic-diff` | element and relationship lifecycle categories |

The former document-symbol plus source-keyword reconstruction is no longer an
authoritative path. The UI, legacy parser, React store, and Draw.io bridge are
not allowed to seed semantic snapshots or relationships.

## Exact locked-runtime evidence

`phase2-qualification-observation.json` records a passing exact-runtime run:

- official reference release `2026-05` at
  `de1070ae8e79c21532b8004fc663d47b35d0e9fa`;
- VinQut/Pilot commit `373dfb960860c3ac259f56169ddabc06d2847eca`;
- reproducible semantic artifact SHA-256
  `8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160`;
- Spec42 executable SHA-256
  `22911d70f7f41251e257aef3ae4a3a402e77063d2271ed394a114834d7ee362e`;
- two source documents, zero diagnostics, 18 normalized elements, 26
  relationships, and all eight required relationship kinds;
- identical durable identities and semantic snapshot after restart;
- all seven query modes completed below 1 ms on the assurance fixture;
- explorer projection declared `normalized-semantic-snapshot` as its only
  semantic source.

The mandatory raw semantic-evidence golden is
`fixtures/language/golden/phase2-semantic-evidence.json`. The extension source,
reproducible patch, and integration instructions are under
`integrations/vinqut-semantic-evidence/`.

## Identity and preservation guarantees

- engine-native identifiers are provenance only and do not enter portable ids
  or snapshot hashes;
- formatting, line changes, and equivalent workspace clones retain ids;
- delete/recreate creates a new generation and durable id;
- unique source-backed move reconciliation emits a receipt;
- ambiguous reconciliation rejects with candidate identities;
- approved rename/move migration retains the durable id and alias history;
- stale/missing anchors remain distinguishable for later reviews/evidence;
- invalid ranges, conflicting identities, unresolved relationship endpoints,
  unsafe paths, corrupt registries, and merge markers fail closed;
- a document edit racing snapshot creation cannot publish stale semantics.

## Measured limitation

The medium 100-file/10,000-declaration observation is valid and deterministic:
warm reopen 1.381 s and cached explorer query 131 ms meet their initial targets.
Semantic snapshot construction took 6.647 s, so first useful semantic explorer
content does **not** yet meet the 5 s target. This is not redefined as success.
The mitigation is a workspace-wide/batched evidence endpoint plus incremental
semantic caching in P3/P4. See `phase2-benchmark-observation.json`.

## Gate closure checklist

- [x] authoritative multi-file semantic evidence and mandatory golden;
- [x] normalized relationship coverage required by P2;
- [x] identity tombstone/recreate/reconciliation/recovery behavior;
- [x] rename/move semantic-diff classification;
- [x] bounded cached queries and first normalized projection;
- [x] exact locked-hybrid qualification and medium measurement;
- [x] full verification from the final source state: 37 Workbench and 185
  repository tests passed; lint/build/audit passed;
- [x] clean-checkout reproduction at implementation commit `176405f`;
- [x] GitHub exact-head CI on the implementation and evidence changes.

Gate P2 is accepted on the combined semantic authority, identity lifecycle,
query/projection, diff, clean-checkout, exact-runtime, benchmark, and CI
evidence above. The measured latency miss remains an explicit P3/P4 mitigation.
