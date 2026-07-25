# Normalized Semantic Snapshot

- Schema: `1`
- Workbench Protocol: `0.2.0`
- Protocol method: `semantic/snapshot`
- Runtime authority: qualified hybrid language adapter
- Product status: Phase 2 foundation; not a SysML v2 conformance claim

## Contract

The snapshot is the only model-shaped product DTO exposed by the Workbench
Service. React, diagrams, matrices, reports, and AI clients must consume this
DTO or a query over it. They must not invoke the legacy Peggy parser for
authoritative behavior.

```text
qualified language engine
  -> document symbol trees and source ranges
  -> bounded source classification inside each engine-owned range
  -> normalized elements with source provenance
  -> durable identity resolution
  -> qualified containment relationships
  -> deterministic snapshot hash
```

Source remains canonical. The snapshot is disposable derived state. Unknown
declarations are emitted as `OpaqueElement`; they are not discarded or assigned
invented semantics.

## Element provenance

Every element includes:

- durable workbench identity;
- normalized and raw kind;
- name and qualified name;
- owner identity when qualified containment supplies one;
- workspace-relative source path, URI, range, and document SHA-256;
- structural fingerprint;
- extraction and classification provenance.

The engine's document-symbol tree is authoritative for element/range and
containment boundaries. The product classifies a recognized declaration only
from text inside that bounded range. A declaration that cannot be classified
is opaque.

Only `containment` is emitted in schema 1. Imports, typing, references, flows,
requirements, and verification are deliberately absent until the selected
authority exposes evidence that can be normalized without invention.

## Determinism and portability

Elements and relationships are sorted by durable identity. The portable
snapshot hash excludes absolute workspace and document URIs, and excludes
freshness. It includes:

- workspace id and active configuration;
- authority version metadata;
- workspace-relative document paths and content hashes;
- normalized elements, relative provenance, and ranges;
- qualified relationships.

Equivalent clones therefore produce the same identities and hash. Formatting
changes alter document/range evidence and consequently alter the snapshot hash,
while durable identities remain stable.

## Bounds and failure behavior

- maximum workspace inventory: service-configured file/byte limits;
- maximum normalized elements: 100,000;
- maximum symbol nesting: 256;
- invalid or reversed engine ranges fail the snapshot;
- duplicate semantic locators fail the snapshot;
- an unqualified/control-only adapter cannot create a snapshot;
- an engine failure before the first complete snapshot fails the request;
- a prior complete snapshot is returned as `stale` after engine failure;
- a document edit/restart invalidates the cache;
- a snapshot racing an edit is rejected rather than cached.

The identity registry is written atomically to
`identities/model-identities.json`. Path containment and every existing path
segment are checked; symlink-backed identity paths are rejected.

## Schema evolution

Breaking changes require a new schema version and golden migration tests.
Adding relationship kinds requires:

1. language-authority evidence;
2. normalization and deduplication rules;
3. provenance fields;
4. malformed/ambiguous tests;
5. query-engine support;
6. capability-matrix update.
