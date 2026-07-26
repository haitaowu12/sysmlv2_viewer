# SysML Engineering Workbench Failed-Revamp Postmortem

Status: accepted incident record; recovery safety floor active

Audited implementation: `5759e5f9e4cb4e825345b61ec193dabe93075dfc`

Merged baseline: `80484f54610124bc3de1e25eb718d768dccff7db`

Original pre-revamp baseline: `638e5aa1cc63ddb3a1c770f36432d6acedfbc541`

## Executive finding

The revamp failed as a practitioner product even though it produced reusable
service, command, security, packaging, and evidence infrastructure.

The exact implementation did not justify the recorded Phase 4 or Phase 5
product-gate decisions:

- the deployed Pages source editor did not initialize under the delivered
  Content Security Policy;
- the replacement "diagram" rendered an indexed grid of element cards and
  relationship counts, not SysML v2 notation;
- five activity entries shared the same generic source/element-map/inventory
  shell without a distinct practitioner workflow;
- Interface Assurance failed when Git status was unavailable, even though
  interface and verification evaluation do not require Git;
- the native model editor exposed two unconstrained dropdown operations rather
  than diagram interaction;
- saved layout coordinates were persisted but not reapplied by the renderer;
- the matrix surface was an element inventory rather than a domain matrix;
- the Phase 4 and Phase 5 qualification scripts bypassed the delivered UI.

The repository is therefore a **failed pre-alpha product replacement with a
salvageable technical foundation**.

## Gate correction

- **P1-P3:** retained as technical foundation evidence, subject to recovery
  requalification through a vertical slice.
- **P4:** invalidated as a product gate. Its script proves service/component
  behavior only.
- **P5:** invalidated as a product gate. Its script proves service integration
  only.
- **P6:** product-gate status withdrawn. The bounded-tool, citation, proposal,
  approval-separation, and audit results remain useful service-level safety
  evidence.
- **P7:** product/release progression remains blocked. Packaging evidence does
  not compensate for failed product prerequisites.

Historical observation files remain intact. Their classification is corrected
by the active gate documents and by the recovery acceptance contract.

## Directly reproduced or source-confirmed failures

### Source surface

The exact Pages companion attempted to initialize Monaco through the default
`@monaco-editor/react` loading path while the delivered CSP allowed only
self-hosted scripts and workers. Component tests replaced Monaco with a
`textarea`, so they could not detect worker, asset, CSP, or initialization
failures.

Recovery disposition:

- Pages source authoring is disabled until a self-hosted exact-artifact test
  proves initialization and language operations;
- a loading state without a bounded failure state is a stop-the-line defect.

### Element map presented as a diagram

The replacement surface:

- limits the result to 120 elements;
- positions each element by array index;
- renders one button per element;
- displays only relationship counts;
- renders no connector, port, item flow, boundary, compartment, direction,
  multiplicity, requirement relation, verification relation, action flow, or
  state transition.

It is an element map, not a partial SysML diagram.

### Activity model

The overbroad claim that "most activities only change a label" is corrected:

- Interfaces, Verification, Reviews, Changes, and Reports use the assurance
  surface;
- Assistant uses a separate controlled-operation surface;
- Explorer, Model, Diagrams, Traceability, and Settings share a generic shell,
  with Model and Traceability primarily changing query context.

The remaining defect is that several visible activities imply distinct
practitioner workflows that do not exist.

### Git-coupled assurance loading

The assurance surface loaded deterministic assurance, Git status, baselines,
and reviews in one fail-fast operation and refused to render unless both
assurance and Git status succeeded. A non-Git workspace therefore lost
Interfaces and Verification as collateral damage.

Recovery disposition:

- Git is an optional capability;
- interface and verification views remain available without Git;
- baseline and commit-specific operations fail closed with an explicit
  capability message.

### Native editing

The native editor offered only create-port and connect commands. Every semantic
element was presented as a possible owner or endpoint, with no schema-aware
eligibility and no diagram interaction. The command engine remains useful; the
surface is removed from product claims.

## Acceptance-evidence failure

The central failure was qualification methodology, not one UI defect.

### Phase 4

`workbench-qualify-phase4.ts` exercised `WorkspaceManager` directly. It ran
queries, saved a view definition, proposed and applied a source edit, verified
undo, and hashed pre-existing screenshots. It did not operate the application,
Monaco, navigation, rendering, or a human workflow.

Its evidence layer is now classified as `service-integration`.

### Phase 5

`workbench-qualify-phase5.ts` performed direct service operations and labeled
them an integrated usability pilot. Workspace load was a literal boolean,
navigation was inferred from query contents, and the interface edit bypassed
the UI.

Its evidence layer is now classified as `service-integration`.

## Root causes

1. **Priority inversion.** Infrastructure, governance, AI, reporting, and
   packaging preceded proof of source authoring and one useful diagram.
2. **Representation error.** A normalized semantic graph was treated as a
   notation-specific view model.
3. **Proxy acceptance.** Service checks were promoted to product and usability
   evidence.
4. **No parity gate.** The retained viewer was demoted before its useful
   interaction baseline was replaced.
5. **No practitioner notation review.** Graphical meaning and eligibility were
   not accepted against the official SysML release.
6. **Breadth before vertical value.** More activities were added while primary
   surfaces remained unqualified.
7. **Artifact mismatch.** Tests did not execute the same assets, CSP, service
   boundary, and workspace packaging delivered to users.
8. **Premature productionization.** Deployment and release work continued after
   product stop-the-line conditions existed.

## Recovery rules

### Evidence must exercise the claim

- Component evidence proves components.
- Service evidence proves service behavior.
- Exact-artifact UI evidence must operate the delivered artifact.
- Practitioner evidence requires recorded independent task execution.
- No evidence layer may be relabeled as another.

### Replacement requires parity

- Useful retained behavior remains a regression reference.
- A replacement does not become primary until a named parity matrix passes.
- A compatibility route does not excuse regression of the default route.

### One vertical slice before breadth

The first recovery slice joins:

1. real multi-file source;
2. one required language authority;
3. immediate text authoring;
4. one notation-specific Interconnection View;
5. three bounded graphical edits;
6. validation, approval, undo, and restart;
7. interface assurance output.

AI expansion, packaging expansion, additional diagram profiles, and release
promotion remain frozen until the slice passes practitioner testing.

### Stop-the-line conditions

Progress stops when any of the following occurs:

- source/editor surface does not load;
- a primary workflow emits an unhandled error;
- a claimed diagram omits a required relationship;
- a non-Git workspace loses a non-Git capability;
- saved layout does not survive restart;
- a mutation writes before approval;
- the gate bypasses the layer it claims to qualify;
- required practitioner evidence is missing.

## Component disposition

### Retain and requalify

- Workbench Service, Protocol, and Client SDK;
- filesystem/workspace boundary;
- VinQut/Pilot semantic evidence integration;
- normalized semantic snapshot and stable identity;
- query primitives;
- typed command receipts, validation, approval, transactions, and undo;
- deterministic rule, baseline, review, and report schemas;
- loopback pairing and capability-handle security controls.

### Reuse only as rendering donors

- React Flow canvas, pan/zoom, minimap, layout, selection, and error boundary
  from the retained viewer.

Do not reuse its parser, browser store, string-derived relationship semantics,
or mutation authority.

### Replace

- current element-card `DiagramSurface`;
- generic inventory presented as a matrix;
- current `NativeCommandEditor`;
- activity entries without a distinct workflow;
- Git-coupled assurance initialization;
- P4/P5 qualification methodology.

### Freeze

- AI feature expansion;
- GitHub Pages production-authoring claims;
- Tauri/signing/notarization work;
- report-catalog breadth;
- additional diagram profiles;
- managed hosting.

## Learning closure

This incident closes only when:

1. P4 and P5 are visibly invalidated;
2. P6 is described as retained service-level safety evidence, not a qualified
   product gate;
3. the recovery contract governs active work;
4. exact-artifact and practitioner evidence are mandatory;
5. the delivered recovery slice passes source, diagram, edit, validation,
   approval, undo, restart, and interface-assurance tasks;
6. no production or release-candidate product claim precedes that evidence.
