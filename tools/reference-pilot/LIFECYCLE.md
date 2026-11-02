# Lifecycle change and evidence review — bounded local capability

The model owns its model content. A requirement source, supplier drawing, installed configuration and test observation retain their own authority. Automatic propagation means regenerating derived views and review results; it does not authorize redesign, overwrite observations, approve a procedure or accept equipment.

## Runnable paths

- `lab.py`: source edits invalidate all prior diagrams immediately. Automatic updates (default enabled) debounce typing and fresh-load all preset views. The editor stays available; a result for an older edit revision is discarded. Invalid drafts, transport failures and malformed responses cannot resurrect old diagrams through the reference toggle. These are temporary drafts, without canonical-file persistence or a filesystem watcher.
- Production `BaselineRepository`: captures optional `lifecycle/artifacts.json` in each new baseline and recomputes semantic and artifact impact when comparing a current snapshot. `semantic-change-impact` HTML/PDF contains witness paths, artifact review status, incomplete coverage and blocked verification planning candidates. Existing SDK/service comparison and report methods expose it. It is comparison-triggered, not background synchronization with external suppliers.
- `capacity_analysis.py`: supports exactly one explicit `ScalarValues::Integer` default and one resolved `>=` literal constraint. It evaluates declared values only. It rejects unsupported operators, unresolved/multiple inputs and invalid reports. It does not count hardware occurrences or establish physical performance, satisfaction or operational validation.
- `npx tsx scripts/workbench-demonstrate-lifecycle.ts /absolute/new/output`: exercises a synthetic normalized graph, historical observation preservation, downstream artifact review and one blocked test candidate. This is not reference-to-production bridge qualification.

## Artifact register

Optional workspace file `lifecycle/artifacts.json`:

```json
{
  "schemaVersion": 1,
  "artifacts": [
    {
      "id": "supplier-drawing",
      "kind": "design-artifact",
      "revision": "reviewed-content-digest-or-controlled-revision",
      "configuration": "default",
      "modelElementIds": ["persistent-workbench-element-id"],
      "dependsOn": []
    },
    {
      "id": "sat-observation-001",
      "kind": "test-observation",
      "revision": "immutable-observation-content-digest",
      "configuration": "default",
      "modelElementIds": [],
      "dependsOn": ["supplier-drawing"]
    }
  ]
}
```

Kinds: `design-artifact`, `test-procedure`, `test-observation`, `assurance-claim`. IDs survive revisions and path moves. The caller must verify artifact revisions against controlled content: this engine does not fetch remote documents or authenticate declared revisions. Use the workspace's configuration identity; mixed configurations are rejected. Dependencies must identify the actual reviewed basis, not merely a document that mentions the same noun.

Semantic propagation reverses typing, dependency, satisfaction and verification links; containment travels child-to-container; explicit connections/flows/interfaces are conservatively traversed both ways for review. Before/after graphs are both retained. This is potential review impact, not causal or safety analysis. One deterministic shortest semantic witness is retained. Unknown endpoints, opaque elements, unlinked artifacts and unresolved artifact dependencies are exposed. Models above 10,000 elements/50,000 relationships or one million retained witness steps fail with an explicit incomplete-impact error; artifact registers are bounded to 1,000 entries.

Historical observations never change their recorded outcome. Changed dependencies yield `applicability-review-required`. Other artifacts yield `revision-review-required`. An unchanged/no-path result does not establish absence of engineering impact outside the registered profile. Cycles terminate. Old baselines without an artifact register have unknown prior lifecycle coverage; newly supplied records are reviewed as additions.

## Verification and commissioning discipline

Generation yields `draft-not-executable` planning candidates only, tied to the model revision, configuration and explicit verification targets. Missing requirements are listed. Every candidate requires an independent acceptance oracle, configuration/setup, stimuli and expected results, tolerances/units or justified non-applicability, instrumentation/calibration basis, evidence capture, stop conditions and revision-bound review/authorization. No source is invented for these fields.

Track procedure maturity, execution state, recorded outcome, current applicability, disposition and acceptance as separate dimensions. A waiver is not a pass. Requirement verification is not stakeholder validation. A generated model check is not a FAT/SAT procedure. Actual execution records, deviations, repair/retest authorizations, asset effectivity and stakeholder acceptance remain outside the implemented engine; use the actual project's controlled systems until these workflows are separately qualified.

## Evidence and exports

Decision registers now use schema **2**, with `resolutionChecks` identifying independently reviewed expected facts for a resolved issue (empty for open issues). The resolution claim must support those facts. Fact-support links must target the selected subject or an explicitly checked semantic referent. Neither check proves prose entailment or authenticates an approver.

Assurance reports require matching workspace, model revision, configuration, language release and rule-pack context. Generated report IDs are single-use: all artifacts are staged and one directory rename publishes a bundle. This does not create an executed-test evidence repository or an authorization transaction.

HTML/CSV preserve text; the current PDF font uses reversible `\u{HEX}` encoding for non-ASCII code points and doubles literal backslashes. This prevents silent corruption but is less readable than a qualified Unicode font. Do not treat the PDF as a polished issued engineering sheet without rendered review. CSV carries status, unavailable fields, context and limitations.

Reference receipts distinguish assessor implementation bytes from producer inputs. Existing-report assessment is explicitly historical assessment, not a new engine run. Runtime qualification remains lane-specific.

## Remaining acceptance work

Expected-base atomic change promotion, real supplier content adapters, immutable executed-test/repair/retest records, typed hazard/claim arguments, physical applicability and authorized evidence reuse require further implementation. Hold-out impact benchmarks and real practitioner task trials must measure missed impacts, false clearance, excess review and time to a responsible next action. The simulated Pro review does not satisfy these gates.
