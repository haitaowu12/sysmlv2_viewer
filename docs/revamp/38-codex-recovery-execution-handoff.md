# Codex Recovery Execution Handoff

Status: executable residual-work package

Repository: `haitaowu12/sysmlv2_viewer`

Recovery branch: `agent/sysml-recovery-safety-floor`

Base commit: `80484f54610124bc3de1e25eb718d768dccff7db`

Governing documents:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## Objective

Complete the recovery from a failed web-product replacement without discarding
the reusable language, service, command, identity, assurance, security, and
packaging foundations.

The next product proof is not another broad phase. It is one vertical slice:

```text
multi-file source
  -> required language authority
  -> native source authoring
  -> InterconnectionProjection
  -> read-only notation view
  -> create port / connect ports / create or change flow
  -> source patch review and approval
  -> undo and restart
  -> interface assurance register
  -> three independent practitioner runs
```

## Work already applied in the safety-floor branch

Codex must preserve these decisions unless new evidence disproves them:

1. P4 and P5 product gates are invalidated.
2. P6 retains service-level safety evidence but no product-gate pass.
3. Git is optional; Interfaces and Verification must not depend on Git status.
4. Existing P4/P5 scripts are service-integration evidence, not usability.
5. Pages source authoring is not exposed until exact-artifact initialization is
   qualified.
6. The current card grid is labelled an element map, not SysML notation.
7. The generic dropdown editor is removed from product claims.
8. Companion dirty provenance includes both checkout and portable-input state.
9. Companion verification recomputes the official-library tree hash.
10. The recovery contract, not the former phase narrative, governs progression.

## Immediate Codex assignment — validate and finish R0

Start from the recovery branch. Do not replay older branches wholesale.

### 1. Inspect exact branch state

```bash
git fetch origin
git switch agent/sysml-recovery-safety-floor
git status --short
git log --oneline --decorate -10
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

Fail if unrelated generated files, fixture identities, local runtime artifacts,
or handoff directories enter the PR.

### 2. Run the full source baseline

```bash
npm ci
npm run verify:gate-truth
npm run lint
npm run test:workbench
npm test
npm run build
npm run audit:production
```

Repair only defects caused by the recovery branch. Record all pre-existing
failures separately.

### 3. Run targeted recovery checks

```bash
npm run qualify:service-product-shell-foundation
npm run qualify:service-assurance-workflow
```

Confirm their JSON output includes:

- `evidenceLayer: "service-integration"`;
- `productGate.state: "invalidated"`;
- no `usability`, `practitioner-pass`, or `product-pass` result.

Run the companion support tests and prove:

- clean checkout + dirty portable input => nonqualifying;
- dirty checkout + clean portable input => nonqualifying;
- changed library bytes with unchanged file count => rejection;
- reversed inventory order => identical canonical tree hash;
- untouched clean input => candidate classification.

### 4. Add the exact-artifact R0 browser check

This is residual because the connector environment could not execute the
repository or install a browser.

Use Playwright against the built Pages profile and the exact local companion.
The test must:

1. build the exact artifact;
2. launch the companion with a copied non-Git pilot;
3. open a real browser;
4. pair through the UI;
5. open Interfaces and Verification;
6. verify a visible Git-unavailable capability state;
7. verify no Source tab is offered in the Pages recovery profile;
8. verify the element-map warning is visible;
9. collect console errors, failed requests, action trace, screenshots, and
   artifact hashes during that run;
10. fail on any unhandled error.

Do not substitute direct RPC calls.

### 5. Review PR scope and update the draft PR

The R0 PR may contain only:

- gate/status truth;
- evidence classification;
- non-Git degradation;
- recovery-profile UI truth;
- companion provenance/integrity fixes;
- tests and the Codex handoff.

Do not add the VS Code extension, notation engine, new AI work, additional
reports, or packaging expansion to R0.

## Residual architecture sequence

### Slice A — R1 pilot and reference answers

Create a bounded `fixtures/workspaces/recovery-interface-pilot/` with Git and
non-Git variants.

Required scope:

- remote station;
- communications path;
- control centre;
- telemetry output/input ports;
- primary and backup interfaces;
- one directed telemetry item flow;
- one requirement chain;
- one verification case;
- one operating mode;
- seeded unresolved and incomplete facts.

Create machine-readable expected answers for:

- hierarchy;
- stable identities and source ranges;
- interconnection objects and relationships;
- interface register;
- deterministic findings;
- exact source patches for three edits.

Obtain practitioner review before renderer implementation.

### Slice B — single required runtime

Retain the official release and Pilot pins as authority inputs.

Qualify VinQut/Pilot as the only required process for the R1/R2 profile:

- semantic open;
- diagnostics;
- symbols;
- definition;
- references;
- hover;
- source-backed semantic evidence;
- incremental change;
- restart.

Spec42 may remain optional for completion or tokens. Its absence must not close
the workspace. Rename/format proposals remain disabled until they pass
preservation and differential tests.

Amend ADR-001 and the runtime lock only after exact qualification evidence
exists.

### Slice C — VS Code-first R2 shell

Create a VS Code extension package that reuses the Workbench Service and
Protocol.

Use native VS Code capabilities:

- Explorer;
- text editor;
- Search;
- Problems;
- SCM/diff;
- commands;
- settings;
- workspace trust;
- progress/cancellation.

Do not recreate these in a webview. Use a webview only for notation-specific
views and assurance surfaces.

Package a VSIX and qualify the packaged extension in a clean profile.

### Slice D — InterconnectionProjection

Create `packages/view-projection` with a versioned
`InterconnectionProjection` contract.

The projection must expose source-backed facts, not UI inference:

- frame owner;
- nested parts;
- boundary ports;
- owned/inherited state;
- type and multiplicity;
- connection/interface ends;
- item-flow direction and exchanged item/type;
- unresolved and unsupported facts;
- source reference and stable identity for every object.

Every projected mark maps to:

- official-release notation reference;
- extraction rule;
- fixture expectation;
- renderer rule;
- practitioner disposition.

### Slice E — renderer and saved layout

Extract only neutral React Flow primitives from the retained viewer:

- canvas;
- pan/zoom/fit;
- minimap;
- layout;
- selection;
- keyboard handling;
- error boundary.

Do not import the legacy parser, store, or string-derived relationship logic.

Render from `InterconnectionProjection`, provide a tabular alternative, and
persist/reapply stable-identity positions.

### Slice F — three graphical edits

Implement in order:

1. create port;
2. connect eligible ports;
3. create/change item flow.

Each operation must use the existing typed-command, validation, approval,
transaction, and undo boundary. Add source-preservation and opaque-range
negative tests before UI polish.

### Slice G — interface assurance and practitioner gate

Expand the interface profile only to facts available from the supported
semantic contract. Use explicit field states:

- `modeled`;
- `not-modeled`;
- `unsupported-by-profile`;
- `not-applicable`.

Run three independent practitioners through the full R6 task set. Repair
material failures and rerun all participants against the repaired exact
artifact.

## Required controls

### Import boundaries

Add CI rules that fail when:

- authoritative packages import `src/parser` or the legacy store;
- React/webview code becomes a source writer;
- engine-native AST/EMF types cross the product protocol;
- notation facts are created by parsing labels or qualified-name strings.

### Gate ledger

Create one machine-readable recovery ledger. Every requirement records:

- requirement id;
- implementation commit;
- source/reference pin;
- fixture;
- unit/component evidence;
- service evidence;
- exact-artifact evidence;
- practitioner evidence when required;
- unresolved defects;
- owner disposition.

### Evidence freshness

A qualifying run creates its own screenshots and logs. Reject evidence whose
timestamp, commit, or artifact hash does not match the run.

## Stop conditions

Stop and report rather than advancing when:

- the source editor or extension host fails to initialize;
- the exact artifact logs an unhandled error;
- a visual relationship is missing, duplicated, or invented;
- a mutation writes before approval;
- a non-Git workspace loses Interfaces or Verification;
- saved layout does not survive restart;
- optional Spec42 loss closes the semantic session;
- practitioner evidence is missing;
- the proposed change expands scope beyond the current recovery gate.

## Publication rules

- Keep the recovery PR draft until exact-head CI and independent review pass.
- Do not merge automatically.
- Do not tag or publish a binary.
- Do not close issue #10.
- Do not describe the product as production-ready or release-candidate-ready.
- Post exact commands, commit hashes, artifact hashes, and remaining blockers
  in the PR body.
