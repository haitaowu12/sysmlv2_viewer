# Lifecycle boundaries for this package

The bundled workbench validates draft source, clears stale views, renders concern-specific diagrams/tables and creates evidence-linked candidate edits. `capacity_analysis.py` checks only an explicit integer default against the supported >= literal predicate. It does not count installed equipment or execute behavior.

Maintain model facts, requirements, design artifacts, configuration records, procedures and observations with their respective source identities/revisions. A new document is evidence for a proposed change, not automatic authority over all existing records. The candidate workflow preserves the baseline and shows a diff; revalidate and review expected facts before promotion.

`evolution.py` implements one bounded local source-change transaction. It verifies one external artifact's old/new bytes and exact line quotations, snapshots the model base, traverses supplied old/new dependency graphs, preserves removed links and lists known unlinked artifacts as unknown impact. A direct impact has a one-link witness from a changed source anchor; a possible impact has a longer explicit path. Removed old links still contribute impact witnesses. The graph records engineering judgments supplied by its author; traversal does not prove causality, entailment, complete coverage or physical behavior. Unlisted artifacts remain unknown.

Historical observations are copied byte-for-byte into immutable transaction snapshots. Applicability review annotations live in the transaction separately from the original observation. Promotion does not update an observation's configuration, values or outcome.

A verification planning candidate needs an independently sourced oracle, configuration/setup, stimuli/results, units/tolerances, instrumentation/calibration applicability, evidence capture, stop conditions and appropriate authorization. `plan` reports missing inputs as `blocked-nonexecutable-draft`. An oracle requires a revision-bound exact citation and an independence rationale. Complete supplied inputs remain `planning-inputs-complete-draft` with `executable: false`: input presence and a local authorization record do not release a procedure for execution or establish commissioning readiness.

Keep these gates separate: design reviewed; ready to execute a named procedure for a named configuration; executed result and deviation/retest disposition; commissioning acceptance by the responsible authority; operational handover. Static checks, trace coverage, declared-value comparisons and a modeled satisfaction assertion do not establish those gates.

See [the agent workflow](AGENT_WORKFLOW.md) for a runnable fictional requirement change that preserves the two-unit design and detects the new three-unit shortfall.

The independent fictional parcel inputs also have a complete local example:

```bash
python3 fixtures/authoring/parcel-sorter/run_change.py --output /absolute/new/evidence-directory
```

Run from the workbench directory after installing its locked runtime. The script verifies the exact independent input freeze, qualifies the original and candidate model, changes only the ICD revision and declared 120→80 ms bound, and carries the frozen LC1 dependency witnesses through a disposable local baseline promotion. The historical 95 ms mock observation keeps its R1 criterion and reported result. `ACTUATOR-SUPPLIER` remains unknown impact, the removed R1 view link stays reviewable, ACK-MEANING-01 remains open and the commissioning draft remains blocked. The script records itself as an automated fixture recorder and expressly makes no human engineering-approval claim. `change-summary.json` states what changed, what remains unchanged, unresolved consequences and unestablished timing/physical verification. This is a fictional workflow exercise, not a real participant test or an applicable timing-analysis profile.

## Local transaction interface

Run through the package CLI after installation, or directly from this tool directory:

```bash
python3 evolution.py impact --manifest source-change.json --output transaction
python3 evolution.py plan --plan planning.json --output planning-result.json
python3 evolution.py promote --transaction transaction --candidate candidate.sysml \
  --report qualification/report.json --baseline controlled.sysml \
  --disposition recorded-disposition.json --output promotion
```

All output directories/files are created exclusively. Existing output is preserved. Paths in source-change and oracle citations are relative to their manifest/plan directory and must resolve to local files within it. This supports one model source file and one revised external artifact; it does not update a source set, Git branch, external service or shared approval system.

The source-change manifest has this schema:

```json
{
  "schemaVersion": 1,
  "id": "ICD-change-B",
  "artifactId": "fictional-sorter-ICD",
  "old": {
    "path": "icd-A.txt", "sha256": "EXACT_OLD_DIGEST", "revision": "A",
    "anchors": [{"id": "ack", "startLine": 3, "endLine": 3, "quote": "EXACT_OLD_LINE"}]
  },
  "new": {
    "path": "icd-B.txt", "sha256": "EXACT_NEW_DIGEST", "revision": "B",
    "anchors": [{"id": "ack", "startLine": 3, "endLine": 3, "quote": "EXACT_NEW_LINE"}]
  },
  "modelBaseline": {"path": "controlled.sysml", "sha256": "EXACT_MODEL_BASE_DIGEST"},
  "changedAnchorIds": ["ack"],
  "nodes": [
    {"id": "ack", "kind": "source-anchor"},
    {"id": "timing", "kind": "model-selector", "selector": "Sorter::AcknowledgementTiming"},
    {"id": "timing-view", "kind": "view"},
    {"id": "timing-test", "kind": "procedure"},
    {"id": "allocation", "kind": "decision"},
    {"id": "supplier-design", "kind": "artifact"},
    {"id": "historical-test", "kind": "observation"}
  ],
  "oldLinks": [
    {"id": "requirement-basis", "from": "ack", "to": "timing", "reason": "Recorded ICD basis"},
    {"id": "test-basis", "from": "timing", "to": "timing-test", "reason": "Recorded procedure dependency"}
  ],
  "newLinks": [
    {"id": "requirement-basis", "from": "ack", "to": "timing", "reason": "Recorded ICD basis"}
  ],
  "inventory": [{"id": "unlinked-maintenance-guide", "kind": "artifact"}],
  "observations": [{"id": "historical-test", "path": "test-A.json", "sha256": "EXACT_OBSERVATION_DIGEST"}]
}
```

Node kinds are `source-anchor`, `model-selector`, `view`, `procedure`, `decision`, `artifact` and `observation`. Links point from basis to dependent and require a unique ID, existing endpoints and a reason. A model selector is explicit author-supplied evidence, not automatically resolved by graph traversal. Changed anchor IDs refer to changed, added or removed exact quotations. Add every known reviewed work product to `nodes` or `inventory`; absence of a witnessed path yields unknown impact, never a no-impact conclusion.

`transaction.json` contains the manifest, `sourceChangeId`, `baseSourceSha256`, immutable snapshot digests, witnessed `impact`, `removedLinks`, `unknownImpact` and separate `applicabilityAnnotations`. `transactionSha256` binds this exact content. Each reachable node includes a shortest witness path for each changed anchor and artifact revision. This bounded path summary can omit alternative paths; it does not claim all paths were enumerated. Source, model and observation originals are read only.

Planning fields are `setup`, `oracle`, `configuration`, `stimuli`, `units`, `instrumentation`, `calibrationApplicability`, `evidenceCapture`, `stopConditions` and `authorization`, plus schema version and ID. Supply explicit applicability and rationale where calibration does not apply. Empty/missing values and placeholders such as `unknown` or `TBD` block the draft. The oracle is an object containing `independenceRationale` and `source: {path, sha256, startLine, endLine, quote}`; the exact file and quotation are checked. Authorization is `{status: "recorded-local", recordedBy, recordedAt, scope}`. These fields record supplied evidence and scope; they do not authenticate the recorder or independently judge technical adequacy.

## Expected-base local promotion

An explicit disposition binds all exact transaction identities:

```json
{
  "schemaVersion": 1,
  "action": "promote",
  "sourceChangeId": "ICD-change-B",
  "transactionSha256": "EXACT_TRANSACTION_DIGEST",
  "baseSourceSha256": "EXACT_MODEL_BASE_DIGEST",
  "candidateSourceSha256": "EXACT_CANDIDATE_DIGEST",
  "recordedBy": "Named local recorder",
  "recordedAt": "2026-10-04",
  "rationale": "Promote the revised obligation while retaining the unresolved design assessment.",
  "impacts": [{"nodeId": "timing", "action": "review", "reason": "Reassess supporting design evidence."}],
  "retainedShortfalls": ["Delivered acknowledgement timing has not been demonstrated."]
}
```

Every witnessed impact node requires one disposition with action `retain`, `revise`, `review` or `out-of-scope` and a reason. `retainedShortfalls` is an explicit list and may be empty. A retained shortfall does not block model promotion, so a new obligation can coexist with an unresolved design consequence. Promotion makes no numerical timing or physical-verification finding.

Promotion requires a managed qualification report whose bound immutable source exactly matches the candidate bytes, whose integrity chain passes, and whose static checks pass with extracted elements. Imported/unverified reports, missing receipts, stale candidates and tampered report/snapshot bytes are rejected. A managed local report is a digest-bound producer record, not an authenticated signature; a party able to replace the entire evidence set can replace its digest chain. Engineering review of the candidate and its disposition remains necessary.

An adjacent stable cooperative file lock serializes promotions for each baseline. Promotion supports POSIX `fcntl` locking on macOS/Linux; unsupported platforms reject promotion explicitly before modifying a baseline. Impact assessment and planning remain available. Under that lock, the current baseline digest must match the transaction's expected base. The first of two competing candidates can promote; the second rejects the changed base. The candidate is written to a temporary file in the same directory, flushed, and atomically replaces the baseline. The output retains `baseline-before.sysml`, the exact promoted candidate, the exact recorded disposition, a prepared receipt and a final promotion receipt. It does not force an all-green design.

The lock protects writers using this workflow. It cannot stop an editor or another process that bypasses the lock. The digest is a local expected-base identity rather than an authenticated shared baseline service. If a process fails after replacement but before the final receipt is saved, the prepared receipt plus backup/candidate bytes support explicit recovery; the absence of a final receipt must not be reported as confirmed closeout.
