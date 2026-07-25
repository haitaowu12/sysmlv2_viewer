# ADR-005: Persistence and Project Format

- Status: accepted at Gate P0
- Date: 2026-07-24

## Decision

Use a source-first, diffable logical project format rooted by `sysml-workspace.yaml`. Filesystem storage is the local implementation; hosted repository/object/database adapters may store the same versioned artifacts without changing canonical source or protocol schemas.

```text
project/
  sysml-workspace.yaml
  sysml-workspace.lock.yaml
  model/
  libraries/
  views/
  layouts/
  identities/
  reviews/
  evidence/
  baselines/
  generated/
  .sysml-workbench/
```

`sysml-workspace.yaml` is the reviewed author configuration. `sysml-workspace.lock.yaml` is the generated, diffable resolution containing exact engine, adapter, library, artifact, and content hashes. Workspace open validates both.

## Resolved workspace schema v1 excerpt

```yaml
schemaVersion: 1
workspaceId: omc4
name: OMC4 Engineering Model
languageProfile: sysml-2.0-kerml-1.0
sourceRoots: [model]
libraries:
  - id: omg-sysml
    release: 2026-05
    commit: de1070ae8e79c21532b8004fc663d47b35d0e9fa
    contentSha256: "<verified library/KPAR tree hash>"
    source: libraries/omg-2026-05
    provenance: https://github.com/Systems-Modeling/SysML-v2-Release
modelConfigurations:
  default:
    include: ["model/**/*.sysml", "model/**/*.kerml"]
engineQualification:
  decisionId: pending-phase-1
  candidatePins:
    spec42: a3f066ee4095a0eb8b37545ffd4846d42804658a
  selectedRuntime: null
adapter:
  version: 0.1.0
  schemaVersion: 1
protocol:
  version: 0.1.0
```

## Ownership

- model/libraries: canonical language inputs;
- identities/views/layouts/reviews/evidence/baselines: versionable engineering artifacts;
- generated: reproducible outputs, never source authority;
- `.sysml-workbench`: disposable caches, indexes, local settings, and recoverable transaction journals.

Durable model identities are project artifacts, not cache state. Team policy decides whether private layouts are committed; the schema records that policy.

## Rules

- relative paths resolve under the canonical project root;
- traversal and escaping symlinks are rejected;
- unknown schema versions fail with migration guidance;
- engine/library artifact hashes are required in a resolved lock; mismatch blocks semantic workspace open and never floats to another version;
- caches include source, engine, adapter, library, and config hashes;
- binary evidence is referenced by content hash/manifest;
- generated reports are never used to reconstruct source;
- no browser-local-only authoritative state;
- hosted persistence must preserve source blobs, immutable commits/baselines, artifact schema versions, identity aliases, and audit records; it may not expose database row ids as model identity;
- server-issued workspace and file handles are scoped capabilities, not portable project data;
- migrations are explicit, backed up, previewable, and versioned.

## Git

The workspace may be a local Git repository or a hosted repository adapter. Baselines identify immutable commits/tags or immutable content manifests. Working state is explicit. Review/report manifests include commit or a dirty-tree/content manifest.

## Rejected

- IndexedDB/localStorage authority;
- opaque database as canonical model;
- mixing caches/generated output with source;
- unversioned view/review JSON;
- absolute machine-specific paths in committed configuration.
- a hosted database schema that becomes a second semantic model;
- deployment-specific project schemas.

## Acceptance

- open/reopen preserves committed views/reviews/layouts;
- clean restart reproduces snapshot and diagnostics;
- cache deletion changes no authoritative result;
- schema migration round-trip and rollback pass;
- path traversal/symlink tests pass;
- report/review/evidence manifests resolve by content hash;
- Git clean/dirty/baseline status is accurate.
- filesystem and hosted test adapters produce equivalent logical artifact manifests.
