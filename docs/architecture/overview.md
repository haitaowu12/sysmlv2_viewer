# Architecture Overview

```text
React workbench
  │ typed Workbench Protocol 0.7.0
  ▼
Workbench Service
  ├─ workspace / identity / query / projection
  ├─ command / diff / baseline / review
  ├─ assurance rules / reports / controlled AI
  ├─ exact hybrid language adapter
  │    ├─ VinQut/Pilot semantic authority
  │    └─ Spec42 authoring assistant
  └─ project source, libraries, Git, and diffable artifacts
```

The service is the application boundary. React components request commands and
queries; they do not parse or write SysML. The semantic engine produces
diagnostics, navigation, and explicit semantic evidence. The authoring engine
can propose completion, token, rename, and formatting edits but cannot override
semantic diagnostics. Incremental semantic diagnostics return independently;
authoring requests wait until their ordered document synchronization finishes.

The normalized semantic snapshot contains source-backed elements,
relationships, provenance, current/stale state, and stable identities. Query,
projection, rules, reviews, baseline diff, reports, and AI citations consume
that snapshot.

Every mutation follows:

```text
typed command
  → base-hash and opaque-range checks
  → proposed source edits
  → authoritative overlay validation
  → diagnostics + semantic diff
  → explicit user approval
  → recovery-journaled atomic write
  → identity/undo/audit receipt
```

Deployment profile B serves immutable UI assets and JSON-RPC/WebSocket from the
same loopback origin. Host, Origin, one-time pairing, bearer, CSRF, payload
limits, CSP, and workspace roots constrain the local privilege boundary.
