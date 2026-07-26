# SysML Engineering Workbench — User Guide

Status: implemented P1–P6 workflow plus P7 internal release-candidate tooling.
This guide does not claim broad SysML v2 conformance. See
`docs/revamp/05-capability-matrix.md`.

## Start and connect

The production profile is a browser UI served by an authenticated local
Workbench Service. Start the platform bundle with an authorized workspace
directory:

```sh
./bin/start-workbench.sh /absolute/path/to/project
```

Open `http://127.0.0.1:4317`. Enter the one-time pairing code printed by the
service and select the project's `sysml-workspace.yaml`. Pairing is exact-origin
bound and expires after two minutes. Sessions expire after fifteen minutes.

The unsigned bundle is an internal release candidate only. Node.js 22 and Java
21 are required. No network is required after installation.

## Workspace

Canonical engineering content remains `.sysml` and `.kerml` source under the
configured roots. The workbench also owns diffable project artifacts:

```text
project/
  sysml-workspace.yaml
  model/
  libraries/
  views/
  reviews/
  evidence/
  baselines/
  generated/
  .sysml-workbench/
```

The hidden directory holds disposable caches plus identity, command recovery,
and AI audit state. Do not delete it while commands or reviews are active.
Back up the complete project, not only `model/`.

## Primary workflow

1. Open the workspace and wait for `ready · qualified-engine`.
2. Resolve blocking items in Problems.
3. Navigate in Explorer by containment, types, dependencies, neighbourhood,
   requirements, verification, or interfaces.
4. Use Source, Diagram, or Matrix for the same semantic projection.
5. Select an element to inspect identity, kind, source, owner, relationships,
   diagnostics, and native edit controls.
6. Review every proposed patch, diagnostics-before/after, affected identities,
   and semantic diff.
7. Apply only through the explicit approval control.

`Cmd/Ctrl+K` opens the activity palette. `Escape` closes it. All primary
activities and patch approval controls are keyboard reachable.

## Source and model edits

Source is authoritative. Text changes remain drafts until **Review source
patch** and **Generate validated patch** produce a command proposal. Native
rename, move, create, delete, type, multiplicity, property, documentation, and
relationship operations use the same command boundary. A diagram never writes
source directly.

An approved command is rejected if source changed after validation, if an edit
escapes the workspace, overlaps another edit, crosses an opaque source range,
or introduces an invalid semantic state. Undo and redo use validated inverse
transactions.

## Engineering assurance

- **Interfaces** shows the interface register and deterministic quality
  findings.
- **Verification** shows direct requirement satisfaction and verification
  coverage.
- **Changes** creates Git-bound baselines and classifies stable-identity
  semantic changes.
- **Reviews** creates a baseline-frozen scope, model-anchored findings,
  dispositions, staleness checks, and closure.
- **Reports** writes sanitized deterministic HTML/PDF and CSV registers under
  `generated/reports/`.

The current rule pack deliberately reports direction, units, protocol,
capacity, timing, modes, failure behaviour, safety, security, status, and
assumptions as unavailable when the normalized semantic profile cannot prove
them.

## Controlled assistant

Assistant networking is disabled by default. The included deterministic local
provider can search cited elements and propose one rename command. Any provider
result is rejected if it cites an unknown identity. A model-changing response
must display its citations, assumptions, typed command, validation,
diagnostics, semantic diff, and affected identities before a separate
user-only approval.

AI audit records are stored in
`.sysml-workbench/audit/ai/`. The assistant cannot bypass command validation
or approval.

## Data and network indicators

The qualified local profile sends no model content to external services.
External AI is not configured in the release candidate. The legacy static demo
is available only through `?legacy=1`; it is not an authoring authority.
Draw.io is compatibility/export functionality and is not authoritative SysML.

## Recovery

If startup fails, run `node bin/verify-bundle.mjs`. An integrity failure means
the installation must be replaced; do not repair individual bundle files.
Command recovery journals and identity backups are workspace owned. Preserve
them and consult `docs/user/backup-recovery.md` before manual intervention.

See also:

- `docs/user/workspace-format.md`
- `docs/user/installation-and-deployment.md`
- `docs/user/sample-engineering-workflow.md`
- `docs/user/troubleshooting.md`
- `docs/user/backup-recovery.md`
