# ADR-003: Application Shell

- Status: proposed for Gate P0
- Date: 2026-07-24

## Decision

Build a Tauri 2 desktop-first application for macOS arm64/x64 and Windows x64.

- shared React UI;
- privileged Rust application service;
- pinned language engine sidecar using local stdio only;
- typed least-privilege IPC;
- optional read-only static web demo;
- local development web/service mode using the same protocol.

## Why

The workbench requires safe folder access, file watching, Git, local language processes, report generation, keystore integration, offline libraries, large-workspace resource control, and packaged installation. Browser-only/GitHub Pages cannot meet these requirements. Tauri aligns with the selected Rust engine and exposes scoped capabilities and sidecar packaging.

## Alternatives

- VS Code-first: rejected as primary because review, assurance, reports, and information architecture should be product-owned.
- Electron: viable fallback; higher runtime/supply-chain footprint and broad Node privilege require additional hardening.
- browser + daemon: retained only for development/future deployment; daemon discovery/auth expands attack surface.
- static browser: read-only sample demo only.

## Security boundaries

- WebView has no arbitrary shell/filesystem/provider access.
- IPC commands and payloads are allowlisted and schema-validated.
- Paths are canonicalized and constrained to approved workspace/library roots.
- Application service reads/watches files and supplies versioned documents to the language sidecar; the sidecar has no arbitrary path/write API.
- Sidecar network access is denied and its process is resource-bounded and OS-sandboxed where supported.
- Sidecar executable and library assets are checksum-verified.
- Restrictive CSP; no remote code.
- Draw.io remote embed excluded from local-only mode.
- Credentials use OS keystore/privileged service.

See `docs/security/`.

## Draw.io

Retain export/markup-only if owner approves. Remove semantic round trip. Any remote embed is isolated and explicitly network-enabled.

## Failure modes

- WebView incompatibility: fix or qualify Electron fallback through a new ADR.
- sidecar failure: degraded semantic state, no legacy authority.
- watcher/Git/report task: cancellable background operation; UI remains responsive.
- update/install failure: prior signed version and project data remain recoverable.

## Acceptance

- signed development builds launch on target OS/architectures;
- open/reopen workspace and engine sidecar survive restart;
- capability tests prove the renderer cannot read arbitrary paths or spawn processes;
- crash/timeout/recovery behavior passes;
- keyboard/screen-reader workflows pass;
- static demo contains no privileged or write path.
