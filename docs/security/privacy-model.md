# Privacy Model

## Default posture

- no telemetry;
- no external AI/provider;
- no model content in operational logs;
- no network dependency after the Profile B release bundle is installed;
- local source and engineering artifacts remain under user/project control;
- browser storage is disposable UI/session state, never authoritative reviews/model/evidence.

The public Pages host receives only ordinary static-asset requests. The
companion bootstrap stores the loopback service origin and short-lived pairing
code in the URL fragment, which the workbench consumes and removes. Neither the
workspace path nor model content is placed in that URL or pairing response.
After pairing, model-bearing requests travel only between the browser and the
loopback service. The browser holds an opaque workspace handle.

## Data classes

| Class | Examples | Default location | Egress |
|---|---|---|---|
| canonical model | `.sysml`, `.kerml`, libraries, Git history | approved local/hosted workspace | none |
| governance artifacts | views, layouts, identity aliases, reviews, baselines, rules | versioned project/repository | none |
| evidence | manifests, reports, referenced binary evidence | project/object adapter | explicit export/share |
| derived/cache | indexes, snapshots, thumbnails, temporary report data | disposable service cache | none |
| credentials | provider tokens, hosted auth refresh material | OS keystore/hosted secret manager | only to named service |
| audit metadata | actor/action/id/version/time/result | configured audit store | policy-approved admin access |
| model-bearing request | provider prompt/context/citations | memory/short-lived job | explicit named action only |
| Pages bootstrap | loopback origin, one-time pairing code | browser fragment until consumed | none to Pages host |

## Provider AI

Provider AI is disabled until an administrator configures a provider and the user invokes an action whose confirmation states provider, selected model identities/source ranges, baseline, data classes, and expected output.

The Workbench Service:

- retrieves only requested/needed context;
- redacts secrets and blocks unsupported binary evidence;
- holds credentials outside clients;
- records request metadata, citations, assumptions, proposal hash, validation, approval, and provider/version;
- does not log full prompts/responses by default;
- never applies a provider response directly.

Offline deterministic tools remain available when provider AI is disabled.

The `0.7.0-rc.1` bundle registers only the local deterministic provider.
External provider credentials, adapters, and egress are not shipped.

## Network indicator

The UI displays one of:

- `offline`;
- `local-only: paired companion`;
- `hosted: <service>`;
- `external action active: <provider>`.

The indicator reflects actual service egress capability/state, not only client fetch activity.

## Retention and deletion

- operational logs: configurable, content-minimized, bounded;
- audit: project/security policy with explicit retention and export;
- caches: disposable and safe to delete;
- browser sessions/tokens: short-lived and revoked on unpair/logout;
- provider context: not retained by workbench after the configured audit/minimization policy;
- evidence/reviews: governed project artifacts, never silently purged.

Hosted profile privacy policy must declare tenant region, subprocessors/providers, backups, deletion semantics, admin access, and incident handling before user data is accepted.

## Validation

- scan logs/crash artifacts/browser storage for model text, prompts, evidence contents, tokens, and personal data;
- prove provider calls fail when disabled/unapproved;
- prove context matches confirmation manifest;
- prove local companion tokens expire/revoke and never enter committed files;
- prove the launch URL and pairing response contain no local workspace path,
  the fragment is scrubbed, and only an opaque handle opens the workspace;
- prove cache deletion changes no authoritative result;
- threat-test report/markdown/SVG sanitization;
- generate a privacy manifest for every deployment package.
