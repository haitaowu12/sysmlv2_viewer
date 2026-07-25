# Gate P6 Decision — Controlled AI

Decision: **pass**
Qualified implementation head: `5eb193e`
Branch: `codex/sysml-workbench-phase6-ai`
Runtime lock outcome: `HYBRID GO`

## Acceptance evidence

The exact locked-runtime qualification passed against the four-document
infrastructure workspace:

- semantic authority artifact SHA-256:
  `8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160`;
- all twelve narrow tools are registered;
- provider networking is disabled;
- an invented model identity was rejected and audit-recorded;
- canonical source remained byte-exact after the hallucinated response;
- a grounded provider resolved the target through `get_element` and
  `get_relationships`;
- a rename returned a typed command, source edits, affected identities,
  diagnostics, and an `element-renamed` semantic diff;
- canonical source remained byte-exact before approval;
- provider/non-user approval was rejected;
- the workspace closed and reopened with the proposal preserved in audit;
- a separate user approval revalidated and applied the patch;
- the renamed element retained its stable workbench identity;
- the command transaction finalized and the applied audit hash verified;
- legacy whole-document AI implementation was deleted and its routes return
  `410 Gone`.

Machine-readable evidence:
`docs/revamp/phase6-qualification-observation.json`.

## Verification baseline

- `npm run test:workbench`: 19 files, 80 tests passed.
- `npm test`: 39 files passed plus one optional fixture file skipped; 233 tests
  passed and 19 optional upstream-corpus tests skipped.
- `npm run build`: passed.
- `npm audit --omit=dev`: zero production vulnerabilities.
- `npm run verify:phase6`: passed.

## Delivered boundaries

- `packages/ai-orchestrator` owns provider policy, bounded tools, citations,
  proposal validation, approval separation, and tamper-evident audit.
- Workbench Protocol `0.7.0` exposes status, request, audit-list, and user-apply
  operations.
- The workspace service hosts tools over the normalized model and command
  engine. React contains no AI authority or source writer.
- The Assistant surface shows network state, provider identity, citations,
  assumptions, exact patch, deterministic validation, semantic diff, audit
  path, and the explicit approval action.
- The offline deterministic provider is the only installed provider.

## Known limitations

- The P6 profile permits one typed command per approval.
- It ships no external provider adapter. The extension contract exists, but
  provider-specific privacy/retention behavior is not claimed.
- The local deterministic provider supports bounded search and explicit stable-
  identity rename requests; it is an offline fallback, not a generative model.
- Audit retention controls, OS-keystore integration, signed packaging, and
  clean-machine installation remain Gate P7.
- No AI response can expand the supported SysML capability profile.

## Decision

Gate P6 passes. AI cannot mutate canonical source without a distinct user
approval, and hallucinated references fail before a proposal is accepted.
Gate P7 hardening and release-candidate evidence are next. The project is not
yet a production release.
