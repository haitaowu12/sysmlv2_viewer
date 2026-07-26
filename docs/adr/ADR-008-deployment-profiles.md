# ADR-008: Deployment Profiles

- Status: accepted at Gate P0
- Date: 2026-07-24

## Decision

Support four profiles from one client/service architecture.

| Profile | Users | Authority | Required installation | Network |
|---|---|---|---|---|
| A public web evaluation | evaluators/stakeholders | packaged samples only | none | web host only |
| B browser + local companion | authors, engineers, reviewers | local source/Git through paired service | Workbench Service | UI origin plus loopback |
| C Tauri desktop | authors/offline programs | local source/Git through bundled service | signed desktop package | none required |
| D managed hosted | distributed teams | hosted workspace/repository adapter | browser only | authenticated TLS |

Profiles A and B use the same modern Pages shell. Without a companion bootstrap
the shell remains a bounded sample surface (A); after explicit pairing it uses
local source and service authority (B). Profile B is the recommended
production-candidate target while native packages lack platform signing.
Profile C packages the same web application, Client SDK, protocol, and
Workbench Service. Profile D is future scope; its authorization and persistence
adapters must not change semantic contracts.

## Access model

- **authors**: source edits, commands, local workspace/Git operations;
- **engineers/reviewers**: navigate, query, comment, create/dispose findings, compare;
- **chief/assurance**: freeze scopes, approve dispositions, generate/review evidence;
- **PM/stakeholder**: read approved views/reports, comment where invited, compare published baselines.

Authorization is server-enforced per workspace capability. UI hiding is not access control.

## Local companion controls

- bind only to explicit IPv4/IPv6 loopback addresses and an ephemeral port;
- request the browser's Local Network Access permission with an explicit
  `loopback` target address space and fail with a bounded, actionable timeout
  when permission is denied or unavailable;
- explicit one-time pairing initiated from the companion; no ambient discovery;
- exact trusted-origin allowlist, no wildcard/reflected origins;
- short-lived, audience-bound tokens held in memory where practical;
- CSRF protection for state-changing HTTPS and Origin/CSRF validation for WebSocket upgrade;
- service-issued opaque workspace/file capability handles instead of arbitrary browser paths;
- session expiry, revocation, reconnect confirmation, rate/payload limits;
- TLS where practical; when loopback HTTP is unavoidable, no long-lived secret and no non-loopback fallback;
- outbound network disabled by default and visible per provider/action.

## Acceptance

- deployment-profile conformance suite proves method and permission matrices;
- authoring workflows pass in B and C;
- offline clean-machine workflow passes in C;
- non-modeler review workflow passes without local install in A for samples and D when implemented;
- B rejects DNS rebinding/non-loopback, malicious origin, token replay/expiry, path traversal, and unauthorized egress;
- reports identify deployment/service/engine versions without including secrets.

References: [RFC 8252 loopback considerations](https://datatracker.ietf.org/doc/html/rfc8252), [RFC 6455 origin considerations](https://www.rfc-editor.org/info/rfc6455/), [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access), [Tauri capabilities](https://v2.tauri.app/security/capabilities/).
