# Source Edit Command Model

Command envelopes use schema version 1 and bind:

- unique command id and user actor;
- current workspace and base semantic snapshot SHA-256;
- every affected document URI and base SHA-256;
- one typed modeling command;
- proposal/approval timestamps.

Implemented command profiles cover rename, create definition/usage/package,
create port/connection/interface/flow/requirement/satisfy/verification and
action/state constructs, delete, move ownership, change type/multiplicity,
set property/value, update documentation, relationships, replace-document, and
versioned reusable patterns.

A proposal returns exact text edits, affected identities, diagnostics before
and after, semantic diff, conflict state, inverse edits, and validation state.
Source remains unchanged. Approval is a distinct user-only operation and
rechecks document hashes. Writes are ordered, journaled, atomic, and produce an
idempotent receipt. Unsupported or opaque ranges fail closed.

Undo and redo submit validated inverse/forward transactions; they are not
untracked filesystem rewrites. AI uses this same boundary and cannot call
apply.

The executable contract is in `packages/command-engine/` and
`packages/workspace-service/`.
