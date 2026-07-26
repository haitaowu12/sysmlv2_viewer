# Web Companion Deployment Record

Status: historical technical implementation record; production recommendation
withdrawn during recovery

Original branch: `codex/sysml-workbench-web-companion`

Active authority:
`docs/revamp/37-recovery-acceptance-contract.md`

## Corrected outcome

The modern GitHub Pages shell paired with a local companion established a
useful security and transport boundary. It did **not** establish a qualified
production authoring product.

GitHub Pages supplies unprivileged versioned UI assets. The local companion
owns:

- workspace and filesystem authorization;
- locked SysML/KerML engines and libraries;
- semantic snapshots, commands, rules, reviews, optional Git, and reports;
- credentials, audit, and source mutation.

That authority separation is retained. The former recommendation to use this
path as the near-term delivery channel is withdrawn until the profile passes a
real-browser exact-artifact gate and the recovery practitioner gates.

## Implemented technical flow

1. A user launches the companion with a `sysml-workspace.yaml`.
2. The launcher canonicalizes the file, authorizes its containing root, and
   starts the service on an OS-selected loopback port.
3. The launcher opens the exact Pages URL with only the service origin and a
   short-lived pairing code in the URL fragment.
4. The shell consumes and scrubs the fragment.
5. The browser requests Local Network Access for an annotated `loopback` target
   and submits one-time pairing.
6. The service returns short-lived credentials and an opaque workspace handle.
7. The client negotiates protocol/capabilities and opens only that handle.
8. Closing the launcher stops the companion.

Source checkout command:

```bash
npm run workbench:companion -- \
  --workspace-file /absolute/path/to/sysml-workspace.yaml
```

This command is for technical evaluation, not public release distribution.

## Retained security controls

- loopback-only binding, validated Host, and exact Origin allowlist;
- no wildcard/reflected CORS;
- Local Network Access annotation and legacy PNA compatibility;
- one-time short-expiry pairing code with replay rejection;
- fragment bootstrap followed by immediate scrubbing;
- short-lived origin/audience-bound bearer and CSRF credentials;
- opaque workspace handles instead of browser paths;
- canonical root/path/symlink validation;
- strict CSP and deny-by-default provider/network egress;
- framed contexts denied privileged workflows.

These controls are technical security evidence. They do not prove source
editor initialization, diagram semantics, non-Git degradation, accessibility,
or practitioner usability.

## Corrected evidence classification

`npm run verify:web-companion` currently proves built-asset and
service/transport properties through static inspection and direct HTTP/RPC
operations. Its output must state:

```json
{
  "evidenceLayer": "service-integration",
  "outcome": "service-integration-pass",
  "productGate": {
    "id": "R0-exact-artifact-ui",
    "state": "open"
  }
}
```

It does not drive the delivered UI in a browser and cannot close the
exact-artifact gate.

Historical headed-browser observations are not accepted as current gate
evidence because they did not cover the failed Source surface, notation,
graphical editing, non-Git workspace, and recovery workflow together with an
artifact-bound action trace.

## Recovery profile boundary

The Pages profile currently exposes bounded recovery evaluation only:

- source authoring is withheld;
- the card grid is labelled an element map, not a SysML diagram;
- the table is labelled an element inventory, not an engineering matrix;
- generic graphical editing is unavailable;
- Interfaces and Verification must remain available without Git;
- the retained viewer remains a read-only rendering reference.

## Required exact-artifact browser gate

Before making any browser workflow claim, Playwright or equivalent must:

1. build the exact Pages artifact;
2. launch the exact companion against a copied non-Git pilot;
3. pair through the rendered UI;
4. open Interfaces and Verification;
5. confirm explicit Git-unavailable state;
6. confirm Source is not offered in the Pages recovery profile;
7. confirm element-map and inventory warnings;
8. capture console, page errors, failed requests, actions, screenshots, commit,
   browser/OS versions, and artifact hashes;
9. fail on any unhandled error.

Direct RPC calls cannot substitute for this gate.

## Distribution posture

- Pages remains a recovery/evaluation deployment.
- The companion remains an unsigned internal technical candidate.
- No public binary, installer, tag, or production support claim is authorized.
- Signing/notarization, Windows qualification, hosted deployment, and updater
  work remain frozen through Recovery Gate R6.
- Issue #10 remains open.
