# Deployment Boundaries

## Shared invariant

All profiles use the same shared web application, Workbench Client SDK, versioned Workbench Protocol, independent Workbench Service contract, Language Service Adapter, normalized semantics, command receipts, and artifact schemas. Deployment changes privileges and persistence adapters—not meaning.

## Profile A — Public web evaluation

Trust boundary:

- static/public host → browser sandbox → packaged sample data.

Allowed:

- navigate/query packaged samples;
- inspect reference/analytical views;
- compare packaged baselines;
- export sample reports.

Denied:

- arbitrary local paths/processes/Git;
- local companion auto-discovery;
- provider AI/model egress;
- authoritative private persistence.

Controls: restrictive CSP, no active mixed content, sanitized reports/markdown/SVG, immutable sample provenance, no sensitive logs/telemetry.

## Profile B — Browser + local companion

Trust boundaries:

```text
approved web origin
  ⇄ authenticated loopback HTTPS/WSS
local Workbench Service
  ⇄ scoped workspace/file handles
approved local roots + Git + engine + report tools + keystore
```

Controls:

- explicit IPv4/IPv6 loopback bind only; OS-selected port;
- user-confirmed one-time pairing for exact origin/service/capabilities;
- exact Host and Origin allowlists; no wildcard or reflected CORS;
- short-lived audience/origin/session-bound credentials; expiry, revocation, replay control;
- CSRF protection for state changes and Origin/token validation on WebSocket upgrade;
- service-issued opaque workspace/file capability handles;
- canonical-path, symlink-escape, traversal, watcher, file-size/type, and repository-root validation;
- payload, connection, rate, job, and memory limits;
- outbound egress denied by default and surfaced in UI;
- no source/prompt/token content in logs by default.

TLS is used where practical. If platform/browser constraints require loopback HTTP, credentials are short-lived, never reusable off-session, and the service never binds non-loopback.

## Profile C — Tauri desktop

Trust boundaries:

- signed Tauri host/WebView → scoped IPC/stdio → bundled Workbench Service → approved local roots/processes/keystore.

Tauri grants folder picker, lifecycle, secure storage, and packaging capabilities only. It does not implement semantic operations. Capability files are minimal per window; remote content is not loaded into privileged WebViews; CSP/navigation/external-open inputs are restricted.

Offline mode has no required network after installation.

## Profile D — Managed hosted

Future boundaries:

- authenticated browser → TLS edge/service → tenant/workspace authorization → isolated job/runtime → repository/object/database adapters.

Required before implementation:

- identity/SSO and least-privilege roles;
- tenant/workspace object-level authorization;
- encrypted transport/storage and managed secrets;
- resource isolation, quotas, rate limits, malware/content sanitization;
- immutable baseline/evidence/audit storage and retention;
- backup/recovery and incident response;
- provider/region/egress policy;
- no database row id as model identity;
- protocol/persistence equivalence tests against local profiles.

## External services

AI providers, remote Draw.io/markup, telemetry, crash upload, update checks, and managed repository integrations are separate egress capabilities. Each is off by default except a policy-approved update channel, named in the network indicator, minimized, authenticated server-side, and audited without content by default.

References: [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [RFC 6455](https://www.rfc-editor.org/info/rfc6455/), [Tauri capabilities](https://v2.tauri.app/security/capabilities/).
