# Phase 4 Product Shell Status

Status: **invalidated as a product gate**

Historical implementation head: `8a69813`

Historical branch: `codex/sysml-workbench-phase4-product-shell`

Invalidation authority:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## What remains valid

The Phase 4 implementation and qualification established useful
`service-integration` evidence:

- the Workbench Service can open a configured multi-file workspace;
- bounded model queries execute over the normalized semantic snapshot;
- source documents can be read;
- saved view definitions can be persisted and listed;
- a `replace-document` command can be proposed without changing canonical
  source;
- authoritative validation, explicit approval, apply, semantic refresh, and
  byte-exact undo can complete;
- stable identity can link an approved source change to a semantic projection.

These results support the retained service, command, and identity foundation.

## What is not proved

The evidence does not prove that the delivered application provides a usable
product shell.

`workbench-qualify-phase4.ts` drives `WorkspaceManager` directly. It does not
operate:

- the exact built UI;
- Monaco and its workers under the delivered CSP;
- the activity rail as a user;
- source/model cross-navigation through browser interaction;
- the element map or notation-specific diagrams;
- saved layout restoration;
- graphical editing;
- keyboard and screen-reader workflows;
- an independent practitioner task.

The historical script also hashed pre-existing screenshots rather than
capturing them during the qualifying run.

## Gate disposition

P4 is invalidated as a product gate.

The script is retained and renamed in active commands as the
**service product-shell foundation qualifier**. Its output must state:

```json
{
  "evidenceLayer": "service-integration",
  "result": "service-integration-pass",
  "productGate": {
    "id": "P4",
    "state": "invalidated"
  }
}
```

No service/component result may be relabelled as UI, usability, practitioner,
or product-pass evidence.

## Recovery path

P4 is replaced by Recovery Gates R0-R3:

- R0: truthful status and exact-artifact safety floor;
- R1: accepted pilot and reference answers;
- R2: packaged source-authoring extension;
- R3: notation-specific Interconnection View.

The product shell remains pre-alpha until those gates pass.
