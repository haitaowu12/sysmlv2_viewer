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
exact GitHub Pages origin
  ⇄ authenticated loopback HTTP/WS + Private Network Access preflight
local Workbench Service
  ⇄ scoped workspace/file handles
approved local roots + Git + engine + report tools + keystore
```

Controls:

- explicit IPv4 loopback bind only for the Pages launcher, using
  `127.0.0.1` and an OS-selected port;
- launcher-selected workspace file beneath a canonical allowed root;
- one-time pairing restricted to the exact configured Pages origin;
- exact Host and Origin allowlists; no wildcard or reflected CORS;
- successful browser Private Network Access preflight for the same origin;
- short-lived audience/origin/session-bound credentials; expiry, revocation, replay control;
- pairing data only in a URL fragment that the workbench consumes and scrubs;
- CSRF protection for state changes and Origin/token validation on WebSocket upgrade;
- service-issued opaque workspace handle; local paths are absent from the
  launch URL and pairing response;
- canonical-path, symlink-escape, traversal, watcher, file-size/type, and repository-root validation;
- payload, connection, rate, job, and memory limits;
- outbound egress denied by default and surfaced in UI;
- no source/prompt/token content in logs by default.

The implemented Pages companion uses loopback HTTP/WS. Credentials are
short-lived, audience-bound, never reusable off-session, and the service has no
non-loopback fallback. Remote/shared transport still requires TLS.

The Pages host serves the immutable UI assets under a restrictive CSP. It
receives neither the model nor the local workspace path. The companion serves
only authenticated API/WebSocket operations after exact-origin pairing.

## Profile C — Tauri desktop

Trust boundaries:

- signed Tauri host/WebView → typed Tauri commands → bundled Workbench Service
  on an operating-system-selected loopback port with short-lived pairing →
  approved local roots and locked language processes.

Tauri grants the native file dialog and exact bundled sidecar capabilities
only. It does not implement semantic operations. Capability files are minimal
per window; remote content is not loaded into privileged WebViews;
CSP/navigation/external-open inputs are restricted. The bundled Node sidecar
requires only the macOS `allow-jit` entitlement; the
`allow-unsigned-executable-memory` entitlement is not granted.

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
