# Phase 2 Semantic Core Status

- Date: 2026-07-25
- Base: Phase 1 merge `89f91991370d85f0b2bbcfc3b584d379c732084b`
- Phase: P2 semantic model, identity, and query
- Current decision: **foundation implemented; Gate P2 remains open**
- Production claim: **not authorized**

## Implemented slice

| Responsibility | Evidence | Status |
|---|---|---|
| normalized snapshot | `packages/semantic-model/src/index.ts` | implemented for engine-qualified symbols and containment |
| stable initial identity | `packages/semantic-model/src/identity-registry.ts` | deterministic workspace-relative locator identity |
| formatting/line stability | semantic-model golden tests | passing |
| clone portability | equivalent clone hash/identity test | passing |
| explicit rename/move alias | identity migration receipt test | registry behavior passing; command integration pending |
| unknown syntax posture | opaque-element test | passing |
| ambiguity handling | duplicate locator and registry tests | fails closed |
| project persistence | `identities/model-identities.json` | atomic, mode `0600`, symlink-contained |
| snapshot invalidation | workspace revision/race tests | passing |
| bounded query | `packages/query-engine/src/index.ts` | deterministic containment query |
| service protocol | `semantic/snapshot`, `model/query` | service and client SDK implemented |

The compiled locked-hybrid smoke performed before final hardening returned
eight normalized sample elements and five containment relationships from the
qualified VinQut symbol tree. The final hardening changes affect hashing,
bounds, persistence, and concurrency; they do not substitute a fake authority
for that result. A fresh locked-hybrid rerun remains required before Gate P2.

## Guarantees in this slice

- source remains canonical;
- no legacy parser fallback is connected;
- only qualified engine symbol/range data can seed a snapshot;
- source classification is confined to engine-owned ranges;
- unknown declarations remain opaque;
- only engine-qualified containment becomes a relationship;
- absolute clone paths do not affect durable ids or the portable snapshot hash;
- identity persistence cannot traverse a pre-existing symlink;
- a document edit racing snapshot creation cannot publish stale semantics;
- queries are bounded and reject unknown runtime kinds.

## Gate P2 work still open

1. Normalize and deduplicate definition/reference evidence without creating
   relationships the engine did not qualify.
2. Add typing, import/dependency, requirement, verification, connection, flow,
   and interface relationships where authority evidence exists.
3. Add identity tombstones so delete/recreate receives a new identity unless an
   approved alias exists.
4. Implement uncontrolled-Git reconciliation, ambiguity receipts, registry
   merge-conflict behavior, deleted-registry recovery, and backup recovery.
5. Connect command-engine rename/move receipts and prove semantic diff reports
   rename/move rather than delete/create.
6. Add query cache invalidation and medium-workspace latency measurements.
7. Add model explorer and trace-graph consumers only after the relationship
   coverage above is qualified.
8. Rerun the exact locked hybrid and mandatory fixture pack from a clean
   checkout.

## Test evidence

Current Phase 2 focused evidence:

- lint: pass;
- Workbench suite: 8 files / 29 tests passed;
- full repository suite: 25 files / 177 tests passed, 1 file / 19 tests
  intentionally skipped by existing optional-corpus controls;
- snapshot/edit race: pass;
- symlink-backed identity persistence: rejected;
- TypeScript, Workbench Service, and Vite production builds: pass;
- production dependency audit: zero vulnerabilities.

The full repository and authenticated-loopback suites are rerun before each
push. Gate P2 is not accepted by test count alone; every open item above must
either pass or be explicitly removed from the P2 contract through owner review.
