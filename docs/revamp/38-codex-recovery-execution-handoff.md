# Codex Recovery Execution Handoff

Status: executable residual-work package

Repository: `haitaowu12/sysmlv2_viewer`

Recovery branch: `agent/sysml-recovery-safety-floor`

Draft PR: `#13 — Recovery safety floor: correct gates and fail closed`

Base commit: `80484f54610124bc3de1e25eb718d768dccff7db`

Resolve the exact PR head immediately before every run. Do not rely on a SHA
copied from an earlier handoff revision.

Governing documents:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## Objective

Complete Recovery Gate R0, then execute one practitioner-value vertical slice
without discarding the reusable language, service, command, identity,
assurance, security, and packaging foundations.

The next product proof is:

```text
multi-file source
  -> one required language authority
  -> native source authoring
  -> InterconnectionProjection
  -> read-only notation view
  -> create port / connect ports / create or change flow
  -> source patch review and approval
  -> undo and restart
  -> interface assurance register
  -> three independent practitioner runs
```

## Decisions and fixes already applied in PR #13

Preserve these unless new evidence disproves them:

1. P4 and P5 are invalidated as product gates.
2. P6 retains service-level safety evidence but no product-gate pass.
3. P7 and issue #10 remain open and blocked.
4. Git is optional; Interfaces and Verification do not depend on Git status.
5. Former P4/P5 qualifiers are `service-integration` evidence, not usability.
6. The web-companion qualifier is static/transport service evidence and leaves
   `R0-exact-artifact-ui` open.
7. Pages source authoring is hidden until exact-artifact editor/CSP/offline
   qualification.
8. The card grid is labelled an element map, not SysML notation.
9. The generic table is labelled an element inventory, not an engineering
   matrix.
10. The dropdown editor is removed from product claims.
11. Normal companion packaging runs a fail-closed portable preflight.
12. Dirty portable provenance is rejected.
13. The exact official-library path and canonical inventory tree hash are
    recomputed and compared.
14. Direct invocation of the original companion implementation module is
    rejected, closing the wrapper-bypass path.
15. Active product, phase, deployment, companion, and packaging records are
    governed by `verify:gate-truth`.
16. The recovery authoring target is VS Code-first, backed by the existing
    Workbench Service, Protocol, and Client SDK.
17. VinQut/Pilot is the candidate required semantic process; Spec42 is optional
    and non-authoritative until separately requalified.

## Immediate Codex assignment — close the residual R0 gate

Start from the recovery branch. Do not replay older branches wholesale.

### 1. Inspect exact branch state

```bash
git fetch origin
git switch agent/sysml-recovery-safety-floor
git pull --ff-only
git status --short
git rev-parse HEAD
git log --oneline --decorate -40
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

Fail if unrelated generated files, fixture identity output, runtime artifacts,
or local handoff directories enter the PR.

### 2. Run the full source baseline

```bash
node --version
npm --version
java -version
npm ci
npm run verify:gate-truth
npm run lint
npm run test:workbench
npm test
npm run build
npm run audit:production
```

Record exact commands, exit codes, tool versions, branch head, and workflow
URLs. Repair only failures caused by this branch. Separate pre-existing defects.

### 3. Run retained service qualifiers

```bash
npm run qualify:service-product-shell-foundation
npm run qualify:service-assurance-workflow
npm run verify:web-companion
```

Require the first two outputs to contain:

- `evidenceLayer: "service-integration"`;
- `productGate.state: "invalidated"`;
- no `usability`, `practitioner-pass`, or `product-pass` result.

Require the web-companion output to contain:

- `evidenceLayer: "service-integration"`;
- `productGate.id: "R0-exact-artifact-ui"`;
- `productGate.state: "open"`;
- `uiExercised: false`;
- `exactArtifactBrowserEvidence: false`.

Run companion tests and prove:

- direct TypeScript and compiled implementation entrypoints are rejected;
- clean checkout plus dirty portable input is rejected;
- dirty checkout plus clean portable input is nonqualifying/rejected;
- changed library bytes with unchanged file count are rejected;
- path substitution/traversal and malformed hashes are rejected;
- reversed inventory order yields the same canonical tree hash;
- untouched clean input remains eligible only as an unsigned technical
  candidate.

### 4. Add the exact-artifact R0 browser qualification

This is the blocking residual task. Add Playwright or an equivalent maintained
real-browser harness. Do not substitute direct RPC calls, JSDOM, static string
inspection, or pre-existing screenshots.

The command should be explicit, for example:

```bash
npm run qualify:recovery-ui
```

The test must:

1. build the exact Pages recovery artifact;
2. create a copied non-Git pilot outside the repository Git worktree;
3. launch the exact local companion and required service runtime;
4. open a supported real browser;
5. pair through the rendered UI and Local Network Access flow;
6. confirm the bootstrap fragment is scrubbed;
7. open Interfaces and Verification through user interaction;
8. verify a visible Git-unavailable state;
9. verify baseline/commit-specific controls are absent or disabled;
10. verify no Source tab is exposed in the Pages recovery profile;
11. verify the element-map and inventory warnings;
12. verify graphical editing is unavailable;
13. capture console errors, page errors, failed requests, user-action trace,
    screenshots, browser/OS versions, commit, build-manifest hash, and exact
    companion/runtime hashes;
14. fail on any unhandled error, unexpected external request, stale screenshot,
    missing hash, or bypass of the UI;
15. generate every screenshot and log during that exact run;
16. emit one machine-readable observation with
    `evidenceLayer: "exact-artifact-ui"`.

The gate remains open if the test runs only on a development server, uses a Git
workspace, calls RPC directly for the claimed task, or omits artifact binding.

### 5. Review and close only addressed review threads

- Resolve the direct companion-entrypoint thread only after its negative tests
  pass at the exact head.
- Resolve the contradictory-gate-document thread only after
  `verify:gate-truth` passes at the exact head.
- Keep the exact-artifact browser thread open until the browser command and
  evidence pass.
- Request a fresh Codex review after all fixes; do not rely on an outdated
  review attached to an earlier head.

### 6. Keep the R0 PR bounded

PR #13 may contain only:

- gate/status/deployment truth;
- evidence classification;
- non-Git degradation;
- recovery-profile UI truth;
- companion provenance/integrity controls;
- exact-artifact recovery qualification;
- tests and handoff documentation.

Do not add the VS Code extension, notation engine, new AI work, additional
report breadth, production packaging, or the R1 pilot to this PR.

Keep the PR draft until exact-head CI, the exact-artifact browser gate, and a
fresh independent review pass. Do not merge automatically.

## Residual architecture sequence after R0

### R1 — bounded pilot and reference answers

Create `fixtures/workspaces/recovery-interface-pilot/` with Git-backed and
non-Git variants. Bound it to:

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

Create machine-readable expected answers for hierarchy, identities, source
ranges, interconnection objects/relationships, interface register,
deterministic findings, and exact source patches for the three edits. Obtain
SysML practitioner approval before renderer implementation.

### R2A — one required runtime

Qualify VinQut/Pilot alone for:

- semantic open;
- diagnostics;
- symbols;
- definition;
- references;
- hover;
- source-backed semantic evidence;
- incremental change;
- deterministic restart.

Spec42 absence must not close the workspace. Do not amend ADR-001 or the runtime
lock until exact qualification evidence exists. Keep rename/format proposals
disabled until preservation and differential tests pass.

### R2B — VS Code-first authoring shell

Create a VS Code extension that reuses the Workbench Service, Protocol, and
Client SDK. Use native Explorer, text editor, Search, Problems, SCM/diff,
commands, settings, workspace trust, progress, and cancellation. Use webviews
only for notation-specific and assurance surfaces. Package a VSIX and qualify
it in a clean profile.

### R3 — InterconnectionProjection and renderer

Create `packages/view-projection` with a versioned
`InterconnectionProjection` contract containing source-backed:

- frame owner;
- nested parts;
- boundary ports;
- owned/inherited status;
- type and multiplicity;
- connection/interface ends;
- item-flow direction and exchanged item/type;
- unresolved/unsupported facts;
- source reference and stable identity for every object.

Map every projected mark to an official-release notation reference, extraction
rule, fixture expectation, renderer rule, and practitioner disposition.

Reuse only neutral React Flow primitives from the retained viewer: canvas,
pan/zoom/fit, minimap, layout, selection, keyboard support, and error boundary.
Do not import the legacy parser, store, or string-derived semantics. Persist and
reapply stable-identity positions and provide a tabular alternative.

### R4 — three graphical edits

Implement only:

1. create an eligible port;
2. connect eligible ports;
3. create/change an item flow.

Each operation must use typed commands, preview readable source edits, validate
through the required authority, preview diagnostics and semantic diff, require
user approval, update all views, support undo, and fail closed near opaque
source.

### R5 — interface assurance

Use explicit field states: `modeled`, `not-modeled`,
`unsupported-by-profile`, and `not-applicable`. Never invent unavailable facts.
Reproduce the interface register after clean restart with source, runtime,
projection, query, rule, and tool provenance. Non-Git output must state that
commit/baseline provenance is unavailable.

### R6 — practitioner gate

At least three independent practitioners must complete the full task set
without developer intervention. Record task time, errors, confusion, recovery,
and abandonment. Repair material failures and rerun the complete pilot against
the repaired exact artifact.

## Required controls

### Import boundaries

Add CI rules that fail when:

- authoritative packages import the legacy parser or browser store;
- React/webview code becomes a source writer;
- engine-native AST/EMF types cross the product protocol;
- notation facts are created by parsing labels or qualified-name strings.

### Recovery gate ledger

Create one machine-readable ledger linking every requirement to:

- requirement id and owner;
- official source/reference pin;
- fixture and expected answer;
- implementation commit;
- unit/component evidence;
- service/integration evidence;
- exact-artifact evidence;
- practitioner evidence when required;
- open defects and owner disposition.

### Evidence freshness

A qualifying run creates its own screenshots, logs, and machine record. Reject
evidence whose commit, timestamp, artifact hash, runtime hash, browser/OS
version, or action trace does not match the run.

## Stop conditions

Stop and report rather than advancing when:

- source or extension host does not initialize;
- an exact artifact logs an unhandled error;
- a required visual relationship is missing, duplicated, or invented;
- a mutation writes before approval;
- a non-Git workspace loses Interfaces or Verification;
- saved layout does not survive restart;
- optional Spec42 loss closes the semantic session;
- evidence lacks exact commit/artifact/runtime hashes;
- the claimed gate bypasses the UI or practitioner;
- practitioner evidence is missing;
- scope expands beyond the current recovery gate.

## Publication boundary

- Keep PR #13 draft until all R0 requirements pass.
- Do not merge automatically.
- Do not tag or publish a binary.
- Do not close issue #10.
- Do not describe the repository as production-ready or release-candidate-ready.
- Post exact commands, commit hashes, workflow URLs, artifact hashes, review
  dispositions, and remaining blockers in the PR before requesting promotion.
