# Phase 4 — Product Shell and Projection UX Plan

Status: in progress  
Baseline: `a8c8d69847231da6a5cd40e00a92815021e7ca82`  
Branch: `codex/sysml-workbench-phase4-product-shell`

## Objective

Replace the legacy viewer as the primary product route with a workbench client
whose authoritative state comes from the workspace service. Deliver the
Explorer/editor/diagram/matrix/properties/Problems composition required by
Gate P4 without reintroducing browser-only model authority.

## Architectural slice

1. Extend the typed protocol with bounded source reads, diagnostics, and saved
   view configuration operations.
2. Add a source-text command that uses the existing proposal, authoritative
   validation, semantic-diff, explicit approval, transaction, and audit path.
3. Introduce a service-backed React application controller and shell. Keep the
   legacy viewer reachable only as a clearly labelled compatibility demo until
   its remaining useful components are extracted.
4. Build projections for containment, type, dependency, neighbourhood,
   requirements, verification, and interface modes from semantic snapshots.
5. Add first-class table/matrix, diagram, source, properties, diagnostics, and
   command-review surfaces with source/visual cross-navigation.
6. Persist view definitions under `views/` and layout state under `layouts/`;
   keep caches and browser preferences non-authoritative.
7. Qualify the eight-task usability pilot and capture deterministic evidence.

## Gate evidence

- Protocol/service/client contract tests.
- Source read and source edit proposal/apply/reopen tests.
- Saved-view persistence and path-boundary tests.
- Component tests for keyboard navigation, cross-navigation, Problems, and
  explicit source-patch approval.
- Browser workflow test against the local service.
- Accessibility scan and keyboard-only pilot.
- Clean-checkout `verify:phase4` and exact-head CI.

## Fail-closed boundaries

- No UI component parses SysML for authority.
- No source mutation occurs outside a validated command transaction.
- A text draft remains a draft until a human approves its source patch.
- The shell displays unavailable capabilities instead of substituting the
  legacy Peggy parser.
- Saved views may select semantic elements but may not create model semantics.

## Exit criteria

Gate P4 passes only when a user can open the sample workspace, navigate an
unresolved reference, follow a requirement trace, identify an unverified
requirement, propose and approve an interface edit, compare the resulting view,
record the UI observation, and export the interface table without developer
intervention. Review persistence and baseline semantics remain Gate P5 work.
