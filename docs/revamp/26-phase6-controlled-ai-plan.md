# Phase 6 — Controlled AI Plan

Status: completed; Gate P6 passed
Baseline: `b42b2baa25fd98bc3c255ec6c67151b878d39c4f`
Branch: `codex/sysml-workbench-phase6-ai`

## Objective

Add a grounded assistant boundary that can inspect only bounded semantic tools,
cite stable model identities, and propose validated typed commands. An AI
provider cannot read arbitrary repository files, cannot suppress deterministic
diagnostics, and cannot apply a command without a separate user approval
operation.

## Responsibility boundaries

### AI orchestrator

- Owns request validation, provider/tool mediation, citation validation,
  command proposal validation, and audit serialization.
- Passes providers semantic tool results, never raw repository access.
- Rejects unknown or stale element citations.
- Returns reviewable source edits, diagnostics, semantic diff, conflicts, and
  affected identities for every model-changing proposal.
- Defaults to proposal-only and network-disabled.

### Narrow tool host

The provider-visible registry is limited to:

- `search_elements`
- `get_element`
- `get_relationships`
- `get_requirements`
- `get_verification`
- `get_interfaces`
- `get_diagnostics`
- `run_model_query`
- `compare_baselines`
- `propose_commands`
- `validate_commands`
- `apply_approved_commands`

`apply_approved_commands` accepts only a prior, unexpired user approval record.
Calling it from a provider without that record fails closed.

### Provider policy

- The production default is the offline deterministic assistant.
- External providers are not enabled by configuration or mere key presence.
- A provider adapter must be registered server-side and invoked by an explicit
  user request.
- Browser payloads never contain provider credentials.
- Provider input and returned proposal metadata are included in the audit.

### Persistence

Audit records are diffable JSON under `.sysml-workbench/audit/ai/`. They bind
the request, provider, workspace snapshot, optional baseline, tool calls,
citations, assumptions, proposal, validation, semantic diff, approval, and
timestamps. They do not log full source documents.

## Delivery order

1. AI contracts, narrow tool registry, provider interface, citation and policy
   validation.
2. Workspace tool host, command validation, user-only approval, and audit
   persistence.
3. Workbench protocol and client SDK operations.
4. Assistant proposal/review surface.
5. Retire legacy whole-document AI mutation endpoints.
6. Mock-provider contract tests and exact locked-runtime Phase 6 qualification.

## Gate P6 acceptance

- A provider can answer/model-query only through the narrow tools.
- Every cited identity resolves in the selected workspace snapshot.
- A hallucinated identity is rejected before a proposal is returned.
- A model-changing response contains typed command, proposed source edits,
  affected identities, diagnostics, semantic diff, and explicit approval state.
- Provider execution leaves canonical source byte-identical.
- Apply without a user approval record is rejected.
- A separate user approval applies the already validated proposal and updates
  the audit.
- External provider networking is disabled by default.
- The legacy whole-document mutation endpoint is unavailable.

## Result

All criteria passed at implementation head `5eb193e`. See
`27-phase6-gate-decision.md` and
`phase6-qualification-observation.json`.
