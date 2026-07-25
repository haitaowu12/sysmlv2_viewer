# Phase 5 — Engineering Assurance Plan

Status: completed; Gate P5 passed
Stack base: `codex/sysml-workbench-phase4-product-shell` at `7ac19e6`
Branch: `codex/sysml-workbench-phase5-assurance`

## Objective

Turn the qualified product shell into an engineering review workbench. Add
deterministic requirement, verification, and interface assurance; Git-backed
semantic baselines; stable-identity review records; and reproducible evidence
reports. Complete the integrated usability pilot required by Gates P4 and P5.

## Responsibility boundaries

### Rule engine

- Versioned deterministic rule packs over normalized semantic snapshots.
- Requirement coverage, verification readiness, interface completeness, and
  dependency findings.
- Stable rule ids, severities, affected identities, evidence, and remediation.
- No AI-produced rule result.

### Baseline service

- Read-only Git status, branch, HEAD, and changed-file inventory.
- Workspace-owned baseline manifests containing commit, runtime/rule versions,
  semantic snapshot, diagnostics, and creation audit.
- Semantic compare using stable identities and the semantic-diff engine.
- Explicit distinction between semantic, layout-only, review-only, and source
  file changes.

### Review service

- Diffable JSON review records in `reviews/`.
- Frozen baseline and query scope.
- Findings anchored to stable element or relationship identity.
- Explicit disposition transitions and append-only history.
- Staleness detection when an anchor disappears or its fingerprint changes.

### Report engine

- Deterministic HTML, PDF, and CSV artifacts.
- Workspace, commit, baseline, language/runtime, workbench, rule pack, view,
  generation timestamp, diagnostics, and exclusions in every manifest.
- Requirement coverage, verification readiness, interface register/quality,
  semantic change impact, review findings/closure, and baseline manifest.

## Delivery order

1. Assurance rule engine and golden tests.
2. Baseline and review repositories with traversal, corruption, transition,
   staleness, and deterministic serialization tests.
3. Report engine with byte-determinism tests and sanitization.
4. Typed protocol, workspace service, and client SDK operations.
5. Shell assurance dashboards, review workflow, changes view, and exports.
6. Infrastructure pilot workspace with two baselines and one review cycle.
7. Automated and browser-based eight-task usability pilot.

## Acceptance result

The exact locked-runtime pilot passed all required P4/P5 operations from a
clean copied workspace: workspace opening, diagnostic navigation, requirement
navigation, unverified-requirement identification, approved interface edit,
semantic baseline comparison, review finding closure, and interface report
export. The qualified implementation head is `8a69813`; evidence is in
`phase5-qualification-observation.json`.

The outcome is deliberately bounded. Rules report only semantics present in
the normalized snapshot; unavailable units, protocol, timing, safety, and
security attributes are not invented. Direct traceability is evaluated; broad
SysML conformance is not claimed.
