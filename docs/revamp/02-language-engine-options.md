# Language Engine Options

Status: candidate set approved for qualification by proposed ADR-001; no runtime selected.

## Decision frame

The engine is an implementation component. It does not define SysML/KerML meaning. Every option sits behind the same product-owned Language Service Adapter and must yield normalized observations without leaking native AST types.

## Options

| Option | Composition | Strength | Principal liability | Phase 0 disposition |
|---|---|---|---|---|
| A reusable independent engine/LSP | Spec42 or daltskin | local packaging, editor/CI tooling, active implementation | independent semantic fidelity and pre-1.0 volatility | qualify both exact pins |
| B official Pilot service | exact official Pilot/Xtext/EMF wrapped locally | closest executable lineage to official release | packaging/startup/memory/API coupling | qualify exact-pin wrapper |
| C continue custom parser | current hand-written parser | controlled code and existing subset | no credible KerML/multi-file/full preservation path; high maintenance | negative control only |
| D hybrid official components | product service uses selected official parser/resolver/adapters plus product normalization | may retain fidelity while reducing full Pilot host assumptions | split-brain risk and component upgrade burden | architecture spike and qualify if authority map is unambiguous |
| E wrapper comparison | VinQut architecture rebuilt against exact Pilot | proves standalone LSP feasibility | current bundle/version/license/performance uncertainty | qualify as wrapper/reference path |

There is no “recommended hybrid runtime” in Phase 0. “Hybrid” describes a possible qualification outcome, not permission for silent fallback.

## Required adapter

```text
LanguageServiceAdapter
  initialize(referenceRelease, libraryLock, capabilityRequest)
  openWorkspace(config, sourceHandles)
  applyDocumentChanges(versionedEdits)
  diagnostics(scope)
  symbols(scope)
  definition(position)
  references(identity)
  completion(position)
  hover(position)
  semanticTokens(document)
  rename(identity, newName) -> proposed edits
  snapshot(scope) -> NormalizedSemanticSnapshot
  format(scope) -> proposed edits
  health()
  closeWorkspace()
```

The adapter response includes engine/adapter/reference pins, capability status, source provenance, freshness, partial/opaque markers, timing, and deterministic error codes.

## Mandatory comparative criteria

| Group | Criteria |
|---|---|
| reference | specification/release supported, KerML coverage, SysML coverage, official corpus agreement |
| packages | standard-library loading, KPAR, imports, aliases, visibility, cycles |
| semantics | definitions/usages, typing, specialization, redefinition, subsetting, multiplicity, feature chains |
| source | exact spans, formatting, comments, metadata, Unicode, unknown-syntax preservation |
| editing | incremental update, diagnostics, rename, references, completion, hover, semantic tokens, formatting, command/edit generation |
| snapshot | relationship/type/ownership fidelity, derived values, provenance, stable normalization |
| operations | startup, p50/p95 latency, memory, 1k/10k/50k, cancellation, timeout, crash/restart, cache recovery |
| distribution | license, redistribution, SBOM, macOS/Windows, stdio/loopback packaging, offline |
| sustainability | maintenance health, release cadence, upgrade volatility, test depth, security response |

`14-engine-comparative-qualification-plan.md` defines fixtures, scoring, gates, and discrepancy resolution.

## Runtime outcomes

- **GO:** one engine passes the required production profile.
- **GO WITH CONDITIONS:** one engine passes a bounded profile; unsupported constructs are preserved/opaque and claims are constrained.
- **NO-GO:** no engine satisfies semantic, preservation, operational, and distribution gates.
- **HYBRID GO:** responsibilities are split only with an explicit operation→authority table and no automatic fallback.

## Migration

1. Implement adapter schemas and harness without committing the product to a candidate.
2. Run the same official/mandatory fixtures and operations.
3. Seal raw and normalized evidence.
4. Select outcome and amend ADR-001.
5. Integrate selected runtime into the independent Workbench Service.
6. Remove legacy parser authority and any losing-candidate product coupling.

## Failure behavior

- candidate crash/timeout never promotes legacy output to current truth;
- unsupported/unknown syntax remains source-preserved and commands fail closed;
- version/hash mismatch blocks workspace semantic open;
- stale snapshot is explicitly marked and cannot validate apply;
- disagreement creates an evidence record rather than an invented consensus.
