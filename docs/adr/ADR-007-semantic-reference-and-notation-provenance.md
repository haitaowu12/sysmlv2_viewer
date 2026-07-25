# ADR-007: Semantic Reference and Notation Provenance

- Status: accepted at Gate P0
- Date: 2026-07-24

## Decision

Every semantic capability and visual projection declares provenance:

1. **normative/reference** — meaning or notation traced to the adopted OMG specifications, resolutions, or official release material;
2. **conventional** — established SysML v1, MBSE, IDE, CAD/CAE, or industry practice, explicitly not claimed as normative SysML v2;
3. **workbench analytical** — product-specific graph, matrix, overlay, status, diff, or assurance visualization.

Official specifications define semantics. Official release notation material and examples provide the primary graphical reference. The Pilot is behavioral evidence. Third-party products are pattern donors only.

Each view definition records:

```yaml
notation:
  class: normative | conventional | analytical
  reference: "<specification section, official artifact, or pattern source>"
  profileVersion: "<workbench notation profile>"
  deviations: []
```

A view may combine classes only when each mark/compartment/overlay has an inspectable legend. Analytical overlays may not alter the underlying semantic snapshot.

## Product-owned responsibilities

- normalized semantic DTOs and terminology;
- provenance registry and capability matrix links;
- notation profile, legend, accessibility alternatives, and deterministic renderer;
- query/projection definitions;
- mapping selection to source and stable model identity;
- source-edit commands and validation.

No copied commercial icon set, stylesheet, proprietary stencil, or bundled asset becomes part of the product.

## Failure behavior

- absent provenance labels a view `analytical/unverified`, never `official`;
- unsupported semantics render as opaque/unresolved with source navigation;
- a renderer may omit unsupported elements only with an explicit exclusion count/list;
- exports embed notation profile, workbench version, query, source commit, and exclusions.

## Acceptance

- every production view and legend has a provenance record;
- normative claims link to an official reference and reviewed fixture;
- custom graphs cannot use “official SysML notation” labeling;
- visual regression includes legend/provenance metadata;
- keyboard/table alternatives expose the same engineering facts;
- reports reproduce notation and exclusion manifests.
