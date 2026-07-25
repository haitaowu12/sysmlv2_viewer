# Privacy Model

Status: Phase 0 baseline

## Default

Local-only. No telemetry. No provider enabled. No model content in logs.

## Data classes

| Class | Default location | Egress |
|---|---|---|
| model/library source | workspace | none |
| cache/index | local disposable cache | none |
| reviews/evidence | workspace | Git only by user action |
| logs | local, redacted | none |
| credentials | OS keystore | provider authentication only |
| AI context | ephemeral privileged process | explicit provider action only |
| Draw.io/markup export | generated diagram only | local file by default; explicit scoped remote action if enabled |
| reports | workspace/generated output | explicit export/share |

## AI consent

Before provider egress show:

- provider and endpoint;
- network indicator;
- source/baseline scope;
- model identities/documents included;
- attachment inclusion;
- retention caveat from configured provider policy;
- action to proceed/cancel.

Responses and proposals are audited locally. Audit retention is configurable. Secrets and unnecessary source are excluded.

Remote Draw.io, if the owner retains it, follows the same consent pattern: show destination, exact generated diagram payload, provider terms/retention link, and cancel/proceed. Canonical source, libraries, reviews, credentials, and application IPC are never exposed to the remote WebView.

## Logging

Default logs contain operation ids, durations, versions, result codes, and hashes—not source text, prompts, credentials, paths beyond normalized project-relative ids, or report content.

## User controls

- disable all network adapters;
- inspect current network state;
- clear caches/logs/audit within retention policy;
- export/delete reviews/evidence;
- select provider and allowed context;
- use deterministic offline alternatives.

## Open items

Owner must approve provider policy, audit retention defaults, crash-reporting posture, and any future collaboration/privacy terms before P6/P7.
