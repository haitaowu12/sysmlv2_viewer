# Phase 6 — Controlled AI Plan

Status: historical implementation plan; **P6 product-gate status withdrawn**

Historical baseline: `b42b2baa25fd98bc3c255ec6c67151b878d39c4f`

Historical branch: `codex/sysml-workbench-phase6-ai`

Active disposition:

- `docs/revamp/27-phase6-gate-decision.md`
- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## Historical objective

The phase added a grounded assistant boundary that could inspect bounded
semantic tools, cite stable model identities, and propose validated typed
commands. A provider could not read arbitrary repository files, suppress
deterministic diagnostics, or apply a command without a separate user
approval operation.

The service-level safety mechanisms remain useful. The phase can no longer be
cited as a passed product gate because its P4/P5 product prerequisites were
invalidated and no independent Assistant usability evidence exists.

## Retained responsibility boundaries

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

- The installed default is the offline deterministic assistant.
- External providers are not enabled by configuration or mere key presence.
- A provider adapter must be registered server-side and invoked by an explicit
  user request.
- Browser payloads never contain provider credentials.
- Provider input and returned proposal metadata are included in the audit.

No external provider is a production claim. Provider expansion remains frozen
under the recovery contract.

### Persistence

Audit records are diffable JSON under `.sysml-workbench/audit/ai/`. They bind
the request, provider, workspace snapshot, optional baseline, tool calls,
citations, assumptions, proposal, validation, semantic diff, approval, and
timestamps. They do not log full source documents.

## Historical delivery order

1. AI contracts, narrow tool registry, provider interface, citation and policy
   validation.
2. Workspace tool host, command validation, user-only approval, and audit
   persistence.
3. Workbench protocol and client SDK operations.
4. Assistant proposal/review surface.
5. Retire legacy whole-document AI mutation endpoints.
6. Mock-provider contract tests and exact locked-runtime Phase 6 qualification.

Items 1-3, 5, and bounded portions of 6 produced reusable service safety
foundations. The product surface remains unqualified.

## Retained service-safety evidence

The historical run demonstrated that:

- providers were limited to narrow tools;
- cited identities had to resolve;
- hallucinated identities were rejected before proposal acceptance;
- model-changing responses contained typed commands and source-edit evidence;
- provider execution left canonical source unchanged;
- apply without a distinct user approval was rejected;
- a later user approval revalidated and applied the proposal;
- external provider networking was disabled;
- retired whole-document mutation endpoints were unavailable;
- tamper-evident audit records were generated.

This evidence is classified as service-level controlled-operation safety. It
does not prove practitioner comprehension, a usable Assistant surface, source
editor reliability, diagram interaction, or product readiness.

## Recovery disposition

- Preserve the narrow tools, citation checks, proposal validation, user-only
  approval, and audit code.
- Freeze Assistant UI expansion and external providers.
- Exclude AI from recovery progression through R6.
- Requalify the safety boundary after the source/notation/edit vertical slice
  passes.
- Do not cite this plan as an active P6 product pass.
