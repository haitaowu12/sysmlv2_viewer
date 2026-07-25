# Phase 3 Command Editing Plan

- Date: 2026-07-25
- Base: Gate P2 merge `e018dc8cde07a3a9b2a4da2ef33680f7c5d4d9cf`
- Branch: `codex/sysml-workbench-phase3-command-editing`
- Gate state: open

## Current gap

The P2 service can return authoring-engine rename/format proposals but has no
typed command envelope, base-hash contract, proposal store, approval boundary,
overlay validation, source commit journal, undo receipt, or command audit. The
legacy UI still contains direct in-memory source patching. None of that meets
ADR-004.

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

## Gate evidence

Every supported command must return edits, affected durable identities,
diagnostics before/after, semantic diff, conflict state, approval state, undo,
authority/profile versions, and audit identity. Unsupported or ambiguous source
ranges fail closed. Source files remain unchanged until explicit approval.
