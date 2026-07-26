# ADR-008: Deployment Profiles

- Status: amended for recovery
- Original date: 2026-07-24
- Recovery amendment: 2026-07-25

## Decision

Support staged clients over one Workbench Service, Client SDK, Protocol,
identity model, command boundary, and evidence architecture.

| Profile | Current disposition | Authority | Installation | Network |
|---|---|---|---|---|
| A VS Code local authoring | recovery target | local source through Workbench Service | packaged VSIX plus required local service/runtime | no required external network after install |
| B public web recovery evaluation | implemented, unqualified product surface | packaged sample or paired local service with reduced capability set | browser; optional technical companion | web origin plus loopback when paired |
| C browser scoped review | future | authorized published/scoped workspace service | browser | authenticated TLS |
| D Tauri/managed hosts | deferred | same service contracts through local or hosted adapters | future package or browser | profile-specific |

No deployment profile receives a production claim until its exact delivered
artifact and required practitioner workflow pass the recovery gates.

## Profile A — VS Code local authoring

The recovery authoring host uses native VS Code Explorer, editor, Search,
Problems, SCM/diff, settings, commands, progress, cancellation, and workspace
trust. Webviews are limited to notation-specific projections, assurance, and
source-patch review.

The extension and webviews do not contain semantic or source-writing authority.
All source mutation uses the Workbench Protocol typed-command and explicit user
approval boundary.

Git is optional. Its absence disables baseline/commit-specific operations but
must not remove source, language, query, diagram, interface, or verification
capabilities.

## Profile B — Public web recovery evaluation

The Pages shell is a pre-alpha evaluation client:

- no production-authoring claim;
- no arbitrary local filesystem authority;
- source authoring withheld until exact-artifact CSP/offline qualification;
- current element map and inventory labelled as diagnostic, not notation;
- local source and engines remain behind explicit loopback pairing and opaque
  handles;
- the retained viewer remains a read-only rendering reference.

The companion security boundary remains useful technical evidence. Direct
HTTP/RPC qualification is service evidence, not browser UI evidence.

## Profile C — Browser scoped review

Future authorized review/published-view profile for non-modelers. It may expose
bounded views, reports, findings, dispositions, and approved baseline
comparisons. Authentication, authorization, tenant/workspace scope, and a
separate practitioner gate are mandatory.

## Profile D — Future packaging and hosting

Tauri may package the same service/client contracts for offline OS integration.
Managed hosting may provide authenticated repository, object, database, and job
adapters. Neither path may fork semantic DTOs, identity, commands, validation,
or evidence rules.

## Access model

- **authors:** source editing, typed proposals, authorized local workspace
  operations;
- **engineers/reviewers:** navigation, query, assurance, assigned findings and
  comparison where configured;
- **chief/assurance:** frozen scopes, dispositions, evidence governance;
- **PM/stakeholders:** published/scoped views, reports, comments, assigned
  decisions.

Authorization is server-enforced per workspace capability. UI hiding is not
access control.

## Local companion controls

- explicit IPv4/IPv6 loopback bind and ephemeral port;
- exact trusted-origin allowlist, no wildcard/reflected CORS;
- Local Network Access `loopback` annotation with bounded recovery;
- one-time pairing initiated by the companion, no ambient discovery;
- short-lived origin/audience-bound credentials;
- CSRF and WebSocket Origin/token validation;
- opaque workspace/file capability handles, not browser paths;
- expiry, revocation, restart confirmation, rate/payload limits;
- deny-by-default egress and visible network state;
- no model content or credentials in operational logs.

## Acceptance

- service/transport contract suites pass without changing semantic DTOs;
- the packaged VSIX passes R2-R6 on the frozen pilot;
- a non-Git workspace retains all non-baseline capabilities;
- Profile B rejects DNS rebinding, non-loopback binding, malicious origins,
  token replay/expiry, path traversal, and unauthorized egress;
- Profile B additionally passes a real-browser exact-artifact gate before any
  browser workflow claim;
- reports identify available source/baseline, service, runtime, projection,
  query, and rule versions without including secrets;
- Tauri/hosted profiles remain unclaimed until independently qualified.

References: ADR-003, ADR-006,
`docs/revamp/37-recovery-acceptance-contract.md`, RFC 8252 loopback
considerations, RFC 6455 origin considerations, OWASP WebSocket Security,
Chrome Local Network Access, and Tauri capabilities.
