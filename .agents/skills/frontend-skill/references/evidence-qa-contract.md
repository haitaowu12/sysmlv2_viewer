# Evidence QA Contract

Source reviewed: `msitarzewski/agency-agents@783f6a72bfd7f3135700ac273c619d92821b419a`.
Adapted from `strategy/coordination/handoff-templates.md`, `testing/testing-evidence-collector.md`, and `testing/testing-reality-checker.md`.

Use this to turn claims into release evidence. The external repo's strongest transferable pattern is not its specific QA scripts; it is the discipline that every readiness claim needs observable proof.

## Default Stance

- Before required evidence is inspected, verdict: `NOT DETERMINED`. Do not infer a defect from an unrun check.
- `READY` requires artifact-backed evidence for every material claim.
- `FAILED` means an observed deviation from agreed acceptance criteria, including a missing deliverable when that deliverable is itself required. Missing test evidence blocks readiness but does not prove the product is broken.
- Zero reproducible issues is valid for the scope tested. Do not invent defects, force a rating, or demand another revision merely because it is a first implementation.
- Prose polish, anti-slop cleanup, and confident summary language do not upgrade evidence. A claim stays `missing` until the required artifact is present.

## Claim Inventory

Before judging readiness, list the claims being made:

| Claim | Required Evidence | Evidence Present | Verdict |
|-------|-------------------|------------------|---------|
| <behavior or deliverable claim> | <test, screenshot, log, diff, rendered output> | <path or observation> | proven / partial / missing |

Examples of material claims:

- "The review screen supports its intended task and chosen design direction" -> inspect final pixels at reading size for hierarchy, typography, useful density, coherence and primary affordance; exercise the affected journey and narrow/state behavior. State the observed result and subjective judgments separately. Capturing a screenshot is evidence collection, not design acceptance.
- "The feature works end to end" -> exercised journey with input, output, and observed state.
- "The report is current" -> current authoritative sources and an input-to-report freshness check; generation time alone is insufficient.
- "The registry is synchronized" -> generator output, diff review, and guard result.

## Evidence Types

- Executed command output with pass/fail signal.
- Browser-backed observations, screenshots, or rendered artifact checks for user-visible changes.
- Diff or generated-file comparison tied to the changed scope.
- Logs, traces, or telemetry proving an operational path ran.
- Source list with dates for factual or current claims.

## Screenshot-first UI critique

For requested independent UI review or a justified risk gate, use the [shared screenshot-first method](ui-direction-decisions.md#3-independent-critique-starts-from-current-pixels). Give an isolated image-capable reviewer current pixels, task and hard constraints before author defense, source implementation or advisory lint explanations. Record initial observations before confirmation with code/traces; review remains read-only unless implementation is separately authorized. Small edits retain proportionate affected checks.

Bind material UI evidence in the existing claim inventory to the source revision and relevant dirty-state context (changed files/diff or version used), artifact path, viewport/state, data origin and actual inspection status. Routine screenshot checks need no hash or new manifest. Use byte verification only for a requested integrity/restore/package check or a consumer that needs exact bytes; preserve such requirements where they apply. A digest proves identity, not inspection or behavior. Changed source, pixels or state invalidates affected claims; preserve other evidence only with a dependency/scope reason. Do not attach a new commit or timestamp to stale pixels. Screenshots and in-memory demos cannot certify backend persistence.

Per-check `PASS` means an inspected criterion is satisfied; `FAIL` means an observed acceptance deviation; `UNVERIFIED` means insufficient evidence; `N/A` requires a task-specific scope reason. Keep these distinct from claim coverage (`proven / partial / missing`) and overall readiness. Missing or unopened evidence cannot become a pass or a fabricated product failure; an unavailable browser is not N/A. Required failed builds/tests remain failures. No numeric aesthetic gate is added.

## Readiness blockers, not automatic product defects

- Release or production-ready claim with no verification artifact.
- User-visible change without browser, screenshot, render, or equivalent visual evidence.
- Generated registry/report changes without running the relevant generator or guard.
- QA handoff missing critical paths, edge cases, or expected evidence.
- Tests passed but the claimed behavior was not actually exercised.
- Known stale state or stale report remains unacknowledged.

## QA Handoff Minimum

```markdown
# QA Handoff

## Scope
- <files, routes, documents, or workflows changed>

## Claim Inventory
| Claim | Required Evidence | Owner |
|-------|-------------------|-------|
| <claim> | <artifact/check> | <skill/person> |

## Critical Paths
- <journey or workflow that must succeed>

## Edge Cases
- <empty, slow/failing dependency, retry, back navigation, stale state>

## Evidence Produced
- <artifact path or observation>

## Open Gaps
- <missing evidence or known residual risk>

## Verdict
READY | NOT DETERMINED | NEEDS WORK | FAILED
```

## Review Rule

Do not let confidence exceed the evidence. A missing evidence item remains explicit and blocks the affected readiness claim; it is not converted into a fabricated defect or a self-awarded score.

## Content reachability and format evidence

For affected UI states, exercise narrow widths, longer/Chinese labels, keyboard use and reduced motion. All meaningful content must remain reachable; disabling animation does not justify clipped horizontal panels. Measure actual contrast at the applicable text size and weight; normal 18px is not 18pt large text. Do not round a failing ratio into a pass.

Exercise failure and recovery: entered values and valid partial results survive, and the offered retry/recovery actually exists. Offline writes and conflict queues are not required unless the product promises them.

For custom Enter handling, stateful DOM relocation or an observed responsiveness issue, use the bounded [browser interaction checks](https://github.com/haitaowu12/tonys-second-brain/blob/262b646b45239b81cf998c0e7bb9c1f6d8f2510f/resources/methods/skill-mechanisms/modern-web-interactions/METHOD.md). Keep an IME branch simulation separate from real IME evidence, an available API separate from observed state preservation, and local traces separate from field performance. Requested audits remain read-only unless repair is authorized.

For data-loading waterfalls, request/cache state or redundant render-state changes, reuse [async work and render state](https://github.com/haitaowu12/tonys-second-brain/blob/262b646b45239b81cf998c0e7bb9c1f6d8f2510f/.agent/skills/development-workflow/references/async-work-and-render-state.md). Inspect dependency, authorization and failure edges; controlled-promise examples do not qualify the target framework or product.

Match evidence to the populated output: UI needs affected interaction checks; PDF/DOCX needs every rendered page inspected; native slides need rendered slides plus editable object/text checks; diagrams need editable text/shapes/connectors when requested. A flattened image or concept board does not prove native editability. Retain review exclusions and proposed-but-unvalidated status through every export. Template checks do not approve populated artifacts.

## Donor delta and local disposition

Reviewed `testing/testing-evidence-collector.md` at `msitarzewski/agency-agents@f99f6aa910a442b0197b768ce0ea7751e35e2060`. Adopt its evidence-type distinction, zero-issue allowance and separation of missing tests from demonstrated failure. Do not adopt the conflicting default-failure, issue-count or automatic-extra-cycle instructions in the same repository's reality-checker. A screenshot establishes appearance; a form submission requires the observed response and persisted outcome.


