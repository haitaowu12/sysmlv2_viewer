# Collaborative agent workflow

The notebook's `sysml-v2-modeling` skill owns the engineering conversation. These commands make its bounded retrieval, proposal and review steps executable. They use the existing reference engine, expected-fact and evidence checks; they do not create an autonomous agent service or a second semantic model.

## Retrieve the current model

First qualify current source with `qualify.py` and the locked runtime. Then:

```sh
python3 tools/reference-pilot/agent_model.py context \
  --report /evidence/baseline/report.json \
  --source fixtures/authoring/pump-station/model.sysml \
  --target PumpStationStudy::installedCapacity --depth 1 --limit 30 \
  --output /evidence/requirement-context.json
```

The output binds the query to exact UTF-8 source bytes and a successful supplied static report. It includes resolved facts, bounded source snippets and incoming/outgoing reference roles. It does not interpret every reference as a physical connection or causal impact. Depth is 0–2, element limit 1–100; omitted neighbor/reference counts and excerpt truncation remain explicit. Library references may identify targets outside the returned neighborhood. Session IDs are report-local; named selectors are not rename-stable identities. Use the existing `evidence-contract.json`, intake, decision register and source records for claim authority and unresolved questions.

## Create a reviewable candidate

The `propose` operation takes a schema-1 JSON proposal. Its fields are:

- `baseSourceSha256`: exact current model identity;
- `evidence`: unique `id`, package-relative `path`, exact file `sha256`, inclusive `startLine`/`endLine` and exact `quote`;
- `changes`: qualified `target`, unique exact `before`, replacement `after`, `reason` and nonempty `evidenceIds`.

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

Retrieve the candidate again before explaining its effects. Use the lifecycle impact route for explicitly registered downstream artifacts; missing links mean unknown impact. Preserve historical observations. New input is not permission to invent a design remedy.

## Review the same model with people

Add `--reviews fixtures/authoring/pump-station/reviews.json` to `lab.py`. Choose Stakeholder and a Review route:

- Understand the system: boundary → breakdown → declared exchanges.
- Review operating behavior: context → motor states → subsystem interface.
- Review design assurance: obligation → architecture → planned check.

Routes are schema-1 local configuration: `reviewedSourceSha256`, and `routes` with `id`, `title`, `audience`, `objective`, plus ordered `steps` containing `viewId`, expected `targets` and a `question`. They reuse configured views without a second model execution. Missing views or changed targets make routes unavailable; changed source bytes show a review-basis warning. A matching source hash is not evidence that a review was completed or approved. These sample prompts are facilitator choices for fictional data, not source-derived engineering facts.

To review a proposed source, run a separate lab with that candidate as `--source`, the original views and review routes. The changed-basis warning is expected. The reference lab still holds temporary drafts: it is not the canonical write, concurrency, shared-review or decision-signature service.
