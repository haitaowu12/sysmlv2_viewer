# Gate P6 Decision — Controlled AI

Decision: **product-gate status withdrawn; service safety evidence retained**

Historical qualified implementation head: `5eb193e`

Historical branch: `codex/sysml-workbench-phase6-ai`

Runtime lock outcome at the historical run: `HYBRID GO`

Amendment authority:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## Retained service-level evidence

The locked-runtime qualification demonstrated bounded safety mechanisms:

- twelve narrow tools were registered;
- provider networking was disabled;
- an invented identity was rejected and audit-recorded;
- source remained unchanged after the hallucinated response;
- a grounded target was resolved through model tools;
- a rename produced a typed command, source edits, affected identities,
  diagnostics, and semantic diff;
- source remained unchanged before approval;
- provider/non-user approval was rejected;
- proposal audit survived workspace restart;
- a separate user approval revalidated and applied the patch;
- stable identity survived the rename;
- the command transaction finalized and audit integrity verified;
- retired whole-document AI routes returned `410 Gone`.

The machine-readable record remains:
`docs/revamp/phase6-qualification-observation.json`.

## Boundary of the retained claim

This evidence supports the `packages/ai-orchestrator`, command, approval, and
audit boundaries at the service layer.

It does not prove:

- a usable Assistant product surface;
- a qualified source editor;
- a notation-specific diagram;
- graphical editing;
- practitioner comprehension of citations or patch review;
- product readiness.

P4 and P5 product prerequisites were invalidated after P6 was recorded.
Consequently, P6 cannot remain a passed product gate.

## Recovery disposition

- Preserve the bounded tools, citation validation, proposal validation,
  approval separation, and tamper-evident audit code.
- Freeze AI feature expansion and external provider adapters.
- Do not include Assistant tasks in recovery progression before R6.
- Requalify the retained safety boundary after the source/diagram/edit vertical
  slice passes.
- No AI response may expand the supported language or notation profile.

## Decision

P6 is retained as **service-level controlled-operation safety evidence**.

It is not an active product-gate pass and does not authorize P7 or release
promotion.
