# SysML Engineering Workbench — Developer Guide

## Authority boundaries

The React application is a client. It does not parse SysML for authoritative
behavior. The Workbench Service owns workspace lifecycle, queries, commands,
identity, reviews, diff, reports, rules, and controlled AI. The locked hybrid
language adapter owns language diagnostics and semantic evidence:

- VinQut/Pilot: semantic authority and navigation;
- Spec42: non-authoritative completion, tokens, rename, and formatting;
- normalized semantic snapshot: the only input to projections and assurance.

The legacy Peggy/parser/store/Draw.io path remains isolated behind `?legacy=1`
and must not be imported into `packages/`, `apps/workbench-service/`, or
`src/workbench/`.

## Repository map

```text
apps/workbench-service/       authenticated stdio/loopback service
packages/language-adapter/    locked engine processes and hybrid boundary
packages/semantic-model/      normalized snapshot and identity
packages/workspace-service/   workspace application service
packages/command-engine/      typed proposals, validation, apply, undo/redo
packages/query-engine/        bounded model queries
packages/projection-engine/   reproducible derived projections
packages/rule-engine/         deterministic assurance rules
packages/semantic-diff/       stable-identity semantic comparison
packages/review-service/      durable model-anchored reviews
packages/report-engine/       deterministic evidence output
packages/ai-orchestrator/     proposal-only narrow AI tools and audit
src/workbench/                service-backed primary UI
fixtures/                     mandatory language and workflow evidence
scripts/workbench-*.ts        qualification, benchmark, and release tooling
```

## Local verification

```sh
npm ci
npm run verify:release:source
```

This runs lint, workbench and full tests, TypeScript/build, production
vulnerability audit, deterministic SBOM generation, and dependency-license
policy. It allows recorded owner/legal release blockers but no unapproved npm
license or vulnerability.

Exact-runtime technical qualification additionally requires:

```sh
export SYSML_WORKBENCH_SEMANTIC_ARTIFACT=/path/sysmlv2-lsp-server.jar
export SYSML_WORKBENCH_AUTHORING_ARTIFACT=/path/spec42
export SYSML_WORKBENCH_LIBRARY_ROOT=/path/SysML-v2-Release/sysml.library
export SYSML_WORKBENCH_SEMANTIC_LICENSE_ROOT=/path/VinQut
export SYSML_WORKBENCH_PILOT_LICENSE=/path/Pilot/LICENSE
export SYSML_WORKBENCH_VINQUT_COMMAND=/path/java
export SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON='["-jar","/path/sysmlv2-lsp-server.jar"]'
export SYSML_WORKBENCH_SPEC42_COMMAND=/path/spec42
export SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON='["lsp","--stdlib-path","/path/sysml.library"]'
npm run verify:release:technical
```

`npm run verify:release` is the production gate. It intentionally fails while
product/runtime license, signing, claimed-OS clean-machine, and human pilot
gates remain unresolved.

## Change rules

1. Source is canonical; generated state cannot become a shadow model.
2. UI mutations call a typed command and cannot write files.
3. Every command binds base snapshot/document hashes, produces diagnostics and
   semantic diff, and requires an explicit user approval.
4. Unknown syntax is preserved or the edit fails closed.
5. Stable identities—not line numbers or names—anchor views, reviews, evidence,
   AI citations, and semantic diff.
6. Language capability claims require mandatory fixtures and golden evidence.
7. External network access is a separate disabled capability.

## Testing

Tests are colocated with packages plus `src/test/`. Golden fixtures cover
semantic evidence, identity, commands, source patches, diff, reports, and
workflows. Update a golden only with an explicit semantic reason. Security
tests cover path/symlink escape, loopback Origin/Host/pairing/CSRF/WebSocket,
audit tampering, and runtime artifact hashes.

The medium benchmark requires five warmups and thirty recorded samples:

```sh
npm run benchmark:workbench -- \
  --candidate qualified-hybrid --profile medium \
  --warmups 5 --repetitions 30 --output generated/benchmarks/phase7-medium
```

## Release artifacts

The release assembler refuses a dirty worktree, wrong engine hash, or wrong
official-library commit. It creates a deterministic `.tar.gz`, exact file
inventory, runtime/library provenance, notices, launchers, and an embedded
integrity verifier. The copied-bundle smoke must open the Phase 5 pilot without
repository-relative imports or network.

See `docs/developer/release-checklist.md`,
`docs/developer/release-evidence.md`, and
`docs/revamp/28-phase7-release-plan.md`.
