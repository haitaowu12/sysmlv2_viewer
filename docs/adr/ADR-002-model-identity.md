# ADR-002: Model Identity

- Status: accepted at Gate P0
- Date: 2026-07-24

## Context

Current ids depend on name/line/column or hashed occurrence paths. Reviews, layouts, evidence, semantic diff, AI citations, and issue links require durable identity across formatting and controlled rename/move.

## Decision

Use a workbench identity record that separates durable identity from current semantic locator.

Resolution hierarchy:

1. explicit stable model identifier when available and uniqueness-validated;
2. existing durable workbench id from the project identity registry;
3. deterministic initial candidate from workspace namespace + canonical URI + qualified membership path + kind;
4. source-backed structural fingerprint for reconciliation;
5. explicit migration alias produced by a command transaction.

Example:

```yaml
id: wb:omc4:01JZ...
locator:
  uri: model/communications.sysml
  qualifiedPath: OMC4::Communications::radioLink
  kind: InterfaceUsage
fingerprint:
  declarationKind: InterfaceUsage
  ownerPath: OMC4::Communications
  signatureHash: sha256:...
aliases:
  - priorLocator: OMC4::Communications::legacyRadioLink
    commandId: CMD-2026-0042
```

The durable id may be UUIDv7/ULID-like and is stored in a diffable identity/alias registry. This registry anchors external artifacts but does not define model semantics.

## Persistence

Default file: `identities/model-identities.json`, a diffable project artifact. Teams normally commit it with reviews/evidence. A private project may leave it uncommitted, but it remains durable project data and is never placed in the disposable cache. Reviews/evidence store durable ids plus the baseline locator/fingerprint for recovery.

`.sysml-workbench/` caches may mirror identity lookups and engine-native ids but cannot define or replace durable identity.

Clone/reopen reads the versioned registry before resolving review/evidence anchors. Concurrent Git edits merge by durable id: identical locator updates coalesce; divergent locator/alias assignments create an explicit identity conflict and block affected review/diff operations. Recovery rebuilds locators/fingerprints from source and aliases but never fabricates a replacement durable id for an ambiguous match. A missing registry leaves source semantics usable while anchored reviews/evidence are visibly unresolved until the registry is restored or an owner records a migration.

## Rename/move

Command-engine rename/move:

1. resolve current durable id;
2. calculate/validate source edits;
3. compare before/after snapshots;
4. bind the prior and new locators to the same durable id;
5. emit an alias receipt;
6. classify diff as rename/move.

Uncontrolled Git edits use deterministic reconciliation. Ambiguous matches are reported; the user chooses an alias or accepts delete/create. No guessed identity is silently committed.

## Stability requirements

Identity survives:

- formatting and line movement;
- layout changes;
- ordinary property/document edits;
- command-engine rename;
- command-engine move within/across files.

It may intentionally change after delete/recreate unless an owner-approved alias exists.

## Rejected

- line/column ids: unstable under formatting;
- qualified path alone: unstable on rename/move;
- structural hash alone: collisions and ordinary semantic edits;
- engine-native id: unproven stability and vendor coupling;
- source annotations for every element: intrusive and unnecessary by default;
- review-side fuzzy matching without receipts: unreviewable.

## Acceptance

- property tests cover formatting, ordinary edit, rename, move, file rename, collision, delete/recreate;
- two engines/snapshots cannot create duplicate durable ids in one workspace;
- ambiguous reconciliation fails visibly;
- reviews/layouts/evidence resolve or show stale/missing state;
- clone, Git merge conflict, deleted registry, and backup recovery behavior pass;
- command rename/move is not delete/create in semantic diff.

## Consequences

The workbench owns a small non-semantic identity registry. Manual source changes can require reconciliation. This cost is necessary for reliable engineering anchors without polluting canonical source.

## Phase 2 implementation status

The schema-2 registry implements:

- durable id `wb:<workspace-slug>:<sha256(workspace-id, relative-path,
  qualified-name, kind, generation)>`;
- current locator `{workspacePath, qualifiedName, kind}`;
- source-backed structural fingerprint;
- active/tombstone lifecycle and generation increment on same-locator
  delete/recreate;
- explicit command aliases and command-migration receipts;
- unique-fingerprint uncontrolled-move reconciliation with a persisted receipt;
- visible failure with candidate ids when reconciliation is ambiguous;
- anchor states `resolved`, `stale`, and `missing`;
- schema-1 read migration;
- atomic `0600` primary persistence plus atomic `.bak` recovery;
- fail-closed JSON/merge-marker and duplicate active-locator handling.

Formatting, line movement, ordinary content edits, clone portability,
controlled rename/move, uncontrolled unique file move, collision ambiguity,
delete/recreate, backup recovery, and merge-conflict behavior are mandatory
tests. `packages/semantic-diff` classifies one durable id whose name/path moves
as rename/move and proves it is not delete/create.

The registry remains anchoring metadata only. It never defines SysML semantics.
