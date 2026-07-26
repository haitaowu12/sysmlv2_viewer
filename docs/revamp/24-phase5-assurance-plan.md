# Phase 5 — Engineering Assurance Plan

Status: historical implementation plan; **P5 product-gate result invalidated**

Historical stack base: `codex/sysml-workbench-phase4-product-shell` at `7ac19e6`

Historical branch: `codex/sysml-workbench-phase5-assurance`

Active disposition:

- `docs/revamp/25-phase5-gate-decision.md`
- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## Historical objective

The phase intended to turn the service-backed shell into an engineering review
workbench by adding deterministic requirement, verification, and interface
assurance; Git-backed semantic baselines; stable-identity review records; and
reproducible evidence reports.

The underlying service packages were implemented. The claimed integrated
usability result was later invalidated because the qualification script invoked
`WorkspaceManager` directly rather than operating the delivered application or
recording independent practitioner tasks.

## Retained responsibility boundaries

### Rule engine

- Versioned deterministic rule packs over normalized semantic snapshots.
- Requirement coverage, verification readiness, interface completeness, and
  dependency findings.
- Stable rule ids, severities, affected identities, evidence, and remediation.
- No AI-produced rule result.

### Baseline service

- Read-only Git status, branch, HEAD, and changed-file inventory when Git is
  configured.
- Workspace-owned baseline manifests containing commit, runtime/rule versions,
  semantic snapshot, diagnostics, and creation audit.
- Semantic compare using stable identities and the semantic-diff engine.
- Explicit distinction between semantic, layout-only, review-only, and source
  file changes.
- Git is optional in recovery: non-Git workspaces retain interface and
  verification assurance while baseline operations are unavailable.

### Review service

- Diffable JSON review records in `reviews/`.
- Frozen baseline and query scope.
- Findings anchored to stable element or relationship identity.
- Explicit disposition transitions and append-only history.
- Staleness detection when an anchor disappears or its fingerprint changes.

### Report engine

- Deterministic HTML, PDF, and CSV artifacts.
- Workspace, source state, commit/baseline when available, language/runtime,
  workbench, rule pack, view, generation timestamp, diagnostics, and exclusions
  in manifests.
- Requirement coverage, verification readiness, interface register/quality,
  semantic change impact, review findings/closure, and baseline manifest.

## Historical delivery order

1. Assurance rule engine and golden tests.
2. Baseline and review repositories with traversal, corruption, transition,
   staleness, and deterministic serialization tests.
3. Report engine with byte-determinism tests and sanitization.
4. Typed protocol, workspace service, and client SDK operations.
5. Shell assurance dashboards, review workflow, changes view, and exports.
6. Infrastructure pilot workspace with two baselines and one review cycle.
7. Automated and browser-based eight-task usability pilot.

Items 1-6 produced reusable technical foundations. Item 7 did not produce the
required browser or practitioner evidence.

## Corrected evidence classification

The historical locked-runtime run demonstrated `service-integration` behavior:

- workspace open;
- unresolved-reference diagnostics;
- requirements and interface queries;
- typed interface and requirement changes;
- semantic baseline comparison;
- review finding lifecycle;
- deterministic report generation.

It did not prove diagnostic navigation, graphical interface editing, review
interaction, or export through the product UI. The historical observation is
retained, but active commands classify the run as:

```json
{
  "evidenceLayer": "service-integration",
  "result": "service-integration-pass",
  "productGate": {
    "id": "P5",
    "state": "invalidated"
  }
}
```

## Recovery disposition

- Preserve and requalify the rule, baseline, review, and report packages.
- Keep Interfaces and Verification available without Git.
- Defer broad review/baseline/report product work until the recovery
  Interconnection View and three graphical edits pass.
- Require exact-artifact UI and independent practitioner evidence under R3-R6.
- Do not cite this plan as an active P5 product pass.
