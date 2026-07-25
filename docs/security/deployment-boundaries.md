# Deployment Boundaries

Status: Phase 0 baseline

## Desktop production

- Tauri application with packaged local UI;
- privileged application service;
- checksum-verified Spec42 sidecar/library;
- pinned standard libraries;
- approved local workspace roots;
- OS keystore;
- no listening network socket required;
- outbound network denied except explicitly enabled provider/update/export adapters.

## Local development

Vite UI may connect to an authenticated loopback service. Bind loopback only, use an ephemeral credential, validate origin, and expose the same typed protocol. Development convenience must not enter production defaults.

## Static web demo

- packaged sample semantic snapshots only;
- read-only;
- no local filesystem, Git, report writes, AI credentials, or source mutations;
- CSP and no privileged service assumptions;
- visibly labeled demonstration, not production workbench.

## Remote/shared deployment

Deferred. Requires a new ADR and:

- authentication and authorization;
- tenant isolation and encryption;
- repository/storage authority decision;
- audit/retention/privacy policy;
- rate/resource limits;
- secrets management;
- collaboration/concurrency semantics;
- threat model and operational controls.

The local daemon must never be exposed as a remote service by configuration alone.

## Optional Draw.io

Default export is local file generation with no remote code. If the owner retains remote diagrams.net markup, it is a separate sandboxed WebView with no application IPC, no source/library access, explicit per-action diagram-payload consent, visible network state, and documented provider/privacy/retention terms. Local-only mode disables it. Returned markup is evidence input only and cannot write canonical source.

## Updates

Application and engine updates are signed, version-pinned, rollback-capable, and never silently change the language/library profile of an existing workspace.
