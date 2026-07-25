# ADR-005: Persistence and Project Format

- Status: proposed for Gate P0
- Date: 2026-07-24

## Decision

Use a source-first, diffable project format rooted by `sysml-workspace.yaml`.

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
    release: 2026-04
    commit: 9baca5908ca28b53da085de69336fde48420ea8f
    contentSha256: "<verified library/KPAR tree hash>"
    source: libraries/omg-2026-04
    provenance: https://github.com/Systems-Modeling/SysML-v2-Release
modelConfigurations:
  default:
    include: ["model/**/*.sysml", "model/**/*.kerml"]
engine:
  name: spec42
  version: 0.46.0
  commit: a3f066ee4095a0eb8b37545ffd4846d42804658a
  artifact: spec42-workbench-sidecar-aarch64-apple-darwin
  artifactSha256: "<verified binary hash>"
adapter:
  version: 0.1.0
  schemaVersion: 1
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
- migrations are explicit, backed up, previewable, and versioned.

## Git

The workspace may be a Git repository. Baselines identify immutable commits/tags. Working state is explicit. Review/report manifests include commit or a dirty-tree content manifest.

## Rejected

- IndexedDB/localStorage authority;
- opaque database as canonical model;
- mixing caches/generated output with source;
- unversioned view/review JSON;
- absolute machine-specific paths in committed configuration.

## Acceptance

- open/reopen preserves committed views/reviews/layouts;
- clean restart reproduces snapshot and diagnostics;
- cache deletion changes no authoritative result;
- schema migration round-trip and rollback pass;
- path traversal/symlink tests pass;
- report/review/evidence manifests resolve by content hash;
- Git clean/dirty/baseline status is accurate.
