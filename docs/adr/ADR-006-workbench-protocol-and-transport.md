# ADR-006: Workbench Protocol and Transport

- Status: accepted at Gate P0
- Date: 2026-07-24
- Amended: 2026-07-25

## Decision

Define a product-owned, versioned Workbench Protocol above language-engine LSP:

- LSP remains the standard contract for editor intelligence where applicable.
- Workbench operations use typed JSON messages generated from versioned schemas.
- JSON-RPC 2.0 framing is used for bidirectional stdio and WebSocket bindings.
- HTTPS resource endpoints are allowed for bounded reports/evidence and large immutable artifacts.
- the Workbench Client SDK owns transport selection, validation, cancellation, reconnect, and capability negotiation.

Initial method families:

```text
workbench/initialize
workspace/open | status | close
semantic/snapshot | element | relationships
query/run
projection/get
command/propose | validate | apply | undo
review/*
baseline/compare
report/generate
audit/query
health/status
```

`workbench/initialize` exchanges protocol versions, deployment profile, authentication mode, server build, engine adapter/pin, language/library release, workspace capabilities, method capabilities, payload limits, and feature flags. Unsupported methods fail explicitly.

## Compatibility

- protocol versions follow semantic versioning;
- additive optional fields/methods are minor changes;
- incompatible schema or meaning changes require a major version;
- clients declare a supported range and must reject incompatible major versions;
- unknown fields are preserved where schemas permit but never interpreted as authority;
- durable artifacts store schema version and migration history.

## Transport rules

| Binding | Use | Security |
|---|---|---|
| stdio | service harness, CLI, desktop child process | inherited process trust, framed messages, no implicit filesystem scope |
| desktop IPC | optional host integration | capability-scoped bridge; same validated DTOs |
| loopback HTTP/WS | browser + local companion | loopback-only, exact origin/Host, browser Local Network Access permission, explicit loopback target annotation, legacy Private Network Access preflight compatibility, pairing, short-lived bearer/session token, CSRF/WS protections, opaque handles |
| remote HTTPS/WSS | future hosted | TLS, authenticated identity, tenant/workspace authorization, rate/resource limits |

All requests carry a correlation id, workspace/session id where relevant, deadline, and idempotency key for mutating operations. Long work reports progress and supports cancellation. Apply operations require the exact validated proposal/base snapshot.

The 2026-07-25 Profile B implementation intentionally uses HTTP/WS on an
ephemeral IPv4 loopback port. Managing a trusted localhost certificate would
add installation and trust-store complexity without protecting against a local
machine compromise. The compensating controls are: exact Pages Origin and Host,
browser Local Network Access permission, an explicit `loopback` target address
space, legacy Private Network Access preflight compatibility, no wildcard CORS, a short-lived
one-time fragment pairing secret, audience-bound session credentials, opaque
workspace handles, and no non-loopback fallback. A future managed certificate
mechanism may add TLS without changing the protocol.

## Prohibited coupling

- no engine-native AST/object serialization;
- no filesystem paths accepted as authority without a service-issued capability handle;
- no transport-specific semantic behavior;
- no mutation notification without an auditable response/receipt;
- no automatic retry of non-idempotent apply.

## Acceptance

- generated client/server conformance tests cover every schema;
- identical golden responses are produced across transports;
- compatibility tests cover one prior minor client/server combination;
- cancellation, timeout, backpressure, reconnect, duplicate idempotency key, stale snapshot, and oversized payload tests pass;
- fuzzed/invalid messages fail without process compromise;
- security controls in the deployment profile are enforced before workspace access.

References: [JSON-RPC 2.0](https://www.jsonrpc.org/specification), [LSP](https://microsoft.github.io/language-server-protocol/), [Semantic Versioning](https://semver.org/), [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access), [WICG Local Network Access explainer](https://github.com/WICG/local-network-access/blob/main/explainer.md).
