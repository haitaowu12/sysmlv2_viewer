# Phase 3 Command Editing Plan

- Date: 2026-07-25
- Base: Gate P2 merge `e018dc8cde07a3a9b2a4da2ef33680f7c5d4d9cf`
- Branch: `codex/sysml-workbench-phase3-command-editing`
- Gate state: candidate complete; exact-head CI and PR merge pending

## Closed gap

The workbench service now owns typed command planning, overlay validation,
approval, commit, audit, recovery, and command history. The legacy UI remains a
compatibility/demo surface; its mutation paths are not a production authority.
The P4 shell must integrate the new native command editor and remove legacy
mutation entry points from the production profile.

## Delivery slices

1. command registry, envelope validation, deterministic edit application,
   overlap/range/hash protection, inverse edits;
2. proposal-only rename vertical slice through protocol/service/client with
   authoritative overlay validation and semantic diff;
3. explicit approval, idempotent apply, external-writer conflict detection,
   durable journal/recovery, undo as a new transaction;
4. bounded create/delete/move/type/multiplicity/value/documentation operations
   over engine-owned ranges;
5. structural/interface relationship commands and first native editor consumer;
6. opaque/unknown preservation, mutation/property tests, exact-runtime fixture,
   clean-checkout and exact-head CI.

## Implemented command profile

| Command | Planning boundary | Apply boundary |
|---|---|---|
| rename | authoring language-service workspace edit | validated atomic transaction |
| create element/package/definition/usage/port | engine-owned owner body | validated atomic transaction |
| create connection/interface/flow/satisfy/verify | engine-owned owner body and stable endpoint ids | validated atomic transaction |
| delete | complete authoritative declaration range only | validated atomic transaction |
| move | complete declaration plus target owner body; cycle rejection | multi-file validated atomic transaction |
| change type/multiplicity | known usage declaration shape inside authoritative range | validated atomic transaction |
| set property/update documentation | source-backed body or existing documentation range | validated atomic transaction |
| apply pattern | exact id and version allowlist | validated atomic transaction |
| undo/redo | durable prior audit plus current-head hash | new validated atomic transaction |

Every structured profile is a conservative patch renderer, not a parser or
semantic authority. A truncated range, unknown declaration shape, opaque target,
unknown pattern, stale base, new authoritative error, or empty semantic change
rejects the proposal.

## Evidence

- `npm run verify:phase3`: lint, Workbench and repository tests, TypeScript
  builds, production build, and production dependency audit;
- deterministic generated edit/inverse cases: 200 per test run;
- journal recovery tests: prepare crash, mixed commit rollback, historic
  finalized journals, and final pre-replacement external-writer race;
- native `NativeCommandEditor` and `CommandReviewPanel` component tests prove
  no apply call occurs before explicit approval;
- locked-runtime `npm run qualify:phase3` proves create, no-write proposal,
  human approval, semantic reindex, durable transaction, undo, byte-exact
  source restore, semantic restore, and clean reopen;
- exact evidence: `phase3-qualification-observation.json`.

## Deliberate Phase 4 handoff

The native editor consumer is implemented and tested but is not yet the primary
shell. P4 owns shell integration, capability-driven disabling, diagrams,
matrices, properties, Problems, command palette, and removal/isolation of legacy
store mutation paths. This is not presented as completed P4 UX.

## Gate evidence

Every supported command must return edits, affected durable identities,
diagnostics before/after, semantic diff, conflict state, approval state, undo,
authority/profile versions, and audit identity. Unsupported or ambiguous source
ranges fail closed. Source files remain unchanged until explicit approval.
