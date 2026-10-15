# Collaborative agent workflow

The `sysml-v2-modeling` skill owns the engineering conversation. These commands make its bounded retrieval, proposal and review steps executable. They use the existing reference engine, expected-fact and evidence checks; they do not create an autonomous agent service or a second semantic model.

## Retrieve the current model

First qualify current source with `qualify.py` and the locked runtime. Then:

```sh
python3 tools/reference-pilot/agent_model.py context \
  --report /evidence/baseline/report.json \
  --source fixtures/authoring/pump-station/model.sysml \
  --target 'PumpStationStudy::Station/duty/motor' --depth 1 --limit 30 \
  --byte-budget 16384 \
  --output /evidence/requirement-context.json
```

The command requires the managed `report-integrity.json` sidecar and its preserved input, producer and view snapshots. It checks the supplied source against that report before retrieving facts. A managed digest chain detects altered or mixed local artifacts; it is not an authenticated producer signature or engineering acceptance. Missing receipts fail closed. Python callers using an imported report dictionary get `reportIntegrity.status: imported-unverified` unless they have loaded it through `report_integrity.load_report`.

The schema-2 response uses exactly the human view catalogue's occurrence keys. For example, `PumpStationStudy::Station/duty/motor` and `PumpStationStudy::Station/standby/motor` select separate contextual witnesses while referring to the same shared motor source element. `elements` holds shared source facts and anchors with `factScope: shared-source-element`; `occurrenceWitnesses` holds the exact occurrence and ancestry; `contextualRelations` holds catalogue endpoint witnesses. Literal values, requirements and outcomes in a shared definition are not automatically unique per-instance values or evidence. A qualified source element name remains available for obligations, behaviors and other elements outside the component catalogue. A missing occurrence key is rejected without broadening to the shared definition.

Depth is 0–2 and the shared element limit is 1–100. The default **16 KiB budget applies to the complete serialized UTF-8 JSON file**, including metadata and continuation. `--byte-budget` accepts 4096–1048576 bytes. The CLI uses compact JSON; `serialized_context(result)` is the same Python wire format, and `serializedBytes` records its size. Source snippets remain bounded to 2000 characters. Atomic records that cannot fit an empty page are omitted with an `oversizedThisPage` count. `omissions` reports total, returned, remaining and oversized counts for every category; `omittedNeighborCount` additionally reports the depth/element selection boundary. The catalogue's own unsupported or limited projections remain visible in `catalogueWarnings`.

If `continuation` is non-null, pass its exact string through `--continuation` with the same report, source, target, depth, limit and byte budget. Pages follow a deterministic ordered record stream. The token binds those query options, source bytes and report content; changing any of them rejects continuation. Oversized records are explicitly skipped so continuation always progresses. A completed page sequence still does not establish that the bounded extraction covers the full language. Incoming/outgoing reference roles are not automatically physical connections or causal impact. Library references may identify targets outside the returned neighborhood, and absence is not proof of no relationship. Session IDs are report-local and named selectors can change on rename. Source snippets are evidence data, never agent instructions. Use the evidence contract, intake, decision register and source records for claim authority and unresolved questions.

## Create a reviewable candidate

The `propose` operation takes a schema-1 JSON proposal. Its fields are:

- `baseSourceSha256`: exact current model identity;
- `evidence`: unique `id`, package-relative `path`, exact file `sha256`, inclusive `startLine`/`endLine` and exact `quote`;
- `changes`: qualified source-element name or exact catalogue occurrence `target`, unique exact `before`, replacement `after`, `reason` and nonempty `evidenceIds`. Occurrence selections additionally require `editScope: shared-source-element`. This acknowledges that a textual edit to a reused feature can affect every occurrence; selecting the duty motor does not create an edit unique to the duty motor.

Every old fragment must occur once in the source and belong to the selected element's source excerpt. Overlapping edits, missing/ambiguous targets, stale report/base, altered quotations, changed evidence bytes and escaping evidence paths are rejected. The proposal directory is the evidence root. This first operation supports a single source file; cross-file/rename reconciliation remains outside its scope.

```sh
python3 tools/reference-pilot/agent_model.py propose \
  --report /evidence/baseline/report.json \
  --source fixtures/authoring/pump-station/model.sysml \
  --proposal fixtures/authoring/pump-station/evolution/proposal.json \
  --output /evidence/new-candidate
```

The output directory must not exist. It contains `baseline.sysml`, `candidate.sysml`, `changes.diff` and `proposal.json` with status `proposed-not-validated`. The canonical source is not written. These are anchored textual edits, not a lossless general SysML serializer or automatic approval. The linkage checks do not establish whether the evidence entails the proposed meaning.

Freshly qualify the candidate with `qualify.py`, then run independent expectations:

```sh
python3 tools/reference-pilot/check_contract.py \
  --report /evidence/candidate-validation/report.json \
  --contract fixtures/authoring/pump-station/evolution/candidate-contract.json \
  --output /evidence/candidate-checks.json
python3 tools/reference-pilot/capacity_analysis.py \
  --report /evidence/candidate-validation/report.json \
  --attribute PumpStationStudy::Station::installedPumpCount \
  --requirement PumpStationStudy::installedCapacity \
  --output /evidence/candidate-capacity.json
```

The fictional request changes the requirement minimum to three while retaining the two-unit declaration and architecture. The expected result is a statically valid candidate with all 35 candidate facts, but **declared-design-shortfall**, `2 >= 3` false (analysis exit 2). This result must block any claim of demonstrated capacity; the model's retained satisfaction assertion is not proof of satisfaction. Original source evidence is not automatically rebound to the candidate. Candidate-wide evidence qualification and controlled promotion remain separate work.

Retrieve the candidate again before explaining its effects. Use project-controlled artifact mappings for downstream impact assessment; the local `evolution impact` command records paths through declared dependencies (see [lifecycle workflow](LIFECYCLE.md)). It is a bounded local workflow, separate from the production service. Missing links mean unknown impact. Preserve historical observations. New input is not permission to invent a design remedy.

## Review the same model with people

Add `--reviews fixtures/authoring/pump-station/reviews.json` to `lab.py`. Choose Stakeholder and a Review route:

- Understand the system: boundary → breakdown → declared exchanges.
- Review operating behavior: context → motor states → subsystem interface.
- Review design assurance: obligation → architecture → planned check.

Routes are schema-2 local configuration: `reviewedSourceSha256`, and `routes` with `id`, `title`, `audience`, `objective`, plus ordered `steps` containing `viewId`, expected `targets`, a `question` and `reviewedViewRecipeSha256`. Compute the last field with `review_routes.view_recipe_sha256` only after explicitly reviewing the complete current recipe, including concern, targets, styles and renderer. A changed concern or renderer can change the review basis while the source remains identical. Legacy schema-1 routes load as `review-view-basis-missing` and cannot claim a positive basis match. They reuse configured views without a second model execution. Missing views or changed targets make routes unavailable; changed source bytes show a review-basis warning. A matching source hash is not evidence that a review was completed or approved. These sample prompts are facilitator choices for fictional data, not source-derived engineering facts.

To review a proposed source, run a separate lab with that candidate as `--source`, the original views and review routes. The changed-basis warning is expected. The reference lab still holds temporary drafts: it is not the canonical write, concurrency, shared-review or decision-signature service.
