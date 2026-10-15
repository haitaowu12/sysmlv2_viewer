---
name: sysml-v2-modeling
description: Collaboratively build, query, review and evolve source-grounded SysML v2 system models from documents, interfaces, requirements or dialogue. Includes a standalone validated modeling workbench and stakeholder views.
---

# SysML v2 collaborative modeling

Build consistent system understanding with the user and maintain it as an evolving model that both humans and agents can interrogate. Canonical SysML holds current modeled engineering assertions; supporting documents, unresolved decisions and observations retain their own authority. Diagrams, tables and agent contexts are revision-bound projections, never competing sources of truth.

## Engineering output is a reusable capability

Improve the workflow and skill that produce the deliverable, not a generated page. Flashlight, Vehicle and other examples are regression inputs, not special cases or proof of general engineering quality. Do not hard-code their names, IDs, expected diagrams or domain-specific arrangements into generic generation.

**Prepare the engineering answer before rendering.** Establish the audience, review question, source basis, boundary and required facts in the existing model/view recipe. Select concern-specific views and supporting interface, condition or trace tables that answer that question. Use declared support limits to choose scopes; do not invent missing facts or silently narrow away the difficult part of the question. Reuse the existing project contract rather than adding a separate approval process.

**Generate from one semantic basis.** Keep lab diagrams, HTML explanations, tables and agent answers tied to the same model revision and typed facts. Audience changes may alter terminology and detail, not the meaning of overlapping claims. Preserve occurrence identity, direction, multiplicity, units, conditions, unknowns and evidence status wherever they affect the selected question. Keep authored interpretation separate. Regeneration must reproduce those meanings without manual output edits; pixel identity is not required.

**Judge the populated deliverable.** Require readable labels at the declared viewing size, no obscured or overlapping labels, unambiguous endpoints and a stated relationship legend. Split or navigate large scopes without losing their parent context. Include source/revision, scope, omissions, assumptions and review status. The reader must be able to follow the relevant interaction or state change, find its conditions and inspect its source. A parser pass, an SVG count, a font-size floor or a successful screenshot alone does not establish this quality.

**Repair upstream and regenerate.** Turn a failing input into a reproducible regression at the normal workflow entry point. Identify whether the defect belongs to intake, modeling guidance, semantic extraction, projection, view selection, layout or packaging; repair that shared mechanism and rerun affected consumers from the unchanged input. Do not repair emitted HTML/SVG, rewrite a valid source model to accommodate a renderer, or waive a supported-scope failure to make a sample pass.

**Demonstrate generalization before claiming it.** In addition to the original regression, test affected capability families on independent models not used to tune the change, with expected facts and output criteria set before generation. Vary names and label lengths, size and hierarchy, repeated occurrences, conditions and parallelism as relevant; test stale, invalid and unsupported inputs. Once a case informs a fix, it is a regression case, not fresh generalization evidence. Exercise source-change propagation and inspect regenerated lab and HTML views. Keep structural tests, semantic checks, visual findings and human task acceptance separate; record untested coverage.

For supported scopes, unmet criteria block an engineering-ready claim. For unsupported scopes, return the specific limitation and a supported alternative where available, not a plausible substitute. The target is repeatable engineering-quality production across inputs; finite tests do not justify an all-input guarantee. These are workflow and release requirements, not a claim that every check is already automated.

## Start here — one package

All required instructions, executable tools, examples and checks live in this skill folder. Resolve it from this `SKILL.md`; no project notebook, audit worktree or Downloads path is required. Run commands from this folder, or use the absolute path to `scripts/sysml.py` from any working directory. User input/output paths are caller-relative.

```sh
python3 scripts/sysml.py doctor
python3 scripts/sysml.py demo --port 5224
```

`doctor` checks package integrity, Python 3.10+, Java 21+, Graphviz and the pinned engine/library. The local engine lives in `.runtime/`. If it is absent, install the official Pilot `2025-09` archive with `python3 scripts/sysml.py setup --archive /path/to/jupyter-sysml-kernel-0.52.0.zip`. The source URL and exact hashes are in [the runtime lock](workbench/config/reference-pilot-lock.json). Setup verifies the runtime and preserves its license files; it does not install a Jupyter kernel or modify machine configuration. Never substitute a regex parser for authoritative validation. See [package scope](PACKAGE.md) for transfer and system dependencies.

`demo` opens a loopback-only workbench over the included fictional pump example. Browser drafts never write canonical source. Engineering/Stakeholder modes and objective-led review routes use one validated report. Use the user's preferred browser and inspect the actual interaction, not just generated markup.

The Lab's Project route records a brief and open decisions, downloads/reopens an explicit local project file (source, baseline, notes, view recipes and change history), and exports a frozen reader review or model source. Develop model supports bounded integer-minimum, component, ordered-scenario and performance-assignment proposals with fresh engine validation and exact-base apply. These are local project changes, not authenticated shared approval or full graphical authoring. Custom views appear in the main selector and share diagram, register, matrix, trace and responsibility presentations across audiences. Preserve downloaded project files; browser storage alone is not a project backup.

## Choose the work

- **Build or evolve understanding:** read [the collaborative method](references/collaborative-method.md). Start with one decision, boundary and supported scenario; progress through behavior, responsibilities, implementation and evidence as useful. This is Arcadia-inspired reasoning, not a claim of Arcadia/UAF conformance.
- **Author from source inputs:** use [authoring and verification](references/authoring.md), the [model package contract](workbench/tools/reference-pilot/MODEL_PACKAGE.md), and [checked syntax](references/validated-syntax.md). Keep exact evidence, unresolved conflicts and independently expected semantic facts.
- **Query or propose an update:** use [the agent workflow](workbench/tools/reference-pilot/AGENT_WORKFLOW.md). Retrieve the current bounded semantic neighborhood, cite source anchors, and create an evidence-linked candidate with a diff. New documentation does not automatically authorize a design remedy.
- **Review with people:** use graphical concern-specific views and the included `reviews.json` pattern. Select audience, objective, relevant scopes and questions. Keep omissions and model changes visible. A review route is not a recorded approval.
- **Plan verification or commissioning:** use [lifecycle boundaries](workbench/tools/reference-pilot/LIFECYCLE.md). Planned checks, executed results, applicability, acceptance and operational handover are separate states.

## Execute without path hunting

```sh
python3 scripts/sysml.py qualify --source /model/model.sysml --views /model/views.json --output /evidence/new-validation
python3 scripts/sysml.py context --report /evidence/new-validation/report.json --source /model/model.sysml --target 'System::subsystem' --output /evidence/context.json
python3 scripts/sysml.py propose --report /evidence/new-validation/report.json --source /model/model.sysml --proposal /intake/proposal.json --output /evidence/new-candidate
python3 scripts/sysml.py serve --source /model/model.sysml --views /model/views.json --reviews /model/reviews.json --port 5224
```

The runtime arguments are resolved internally. `context` requires a verified local report receipt, accepts the same occurrence keys as the human scope picker, and bounds each serialized response to 16 KiB by default with explicit omissions and continuation. It refuses a stale source/report pair. `propose` writes separate baseline/candidate/diff/receipt files; it does not validate, approve or promote the candidate. Re-qualify, inspect semantic changes and run independent expected-fact/evidence checks before representing it as accepted. Existing user authorization governs routine faithful edits; ask at a material unresolved engineering decision, not after every reversible step.

Additional commands: `evolution`, `check`, `evidence`, `assess`, `capacity`, `test`, `regressions`, `community`, `acceptance`. Use `<command> --help` for exact arguments. `test` runs the included Python regression suite. UI development checks are optional in `workbench` using its locked npm development dependencies; the running UI needs no Node service.

## Evolve a controlled local baseline

Use `evolution impact --manifest /change/source-change.json --output /change/transaction` for a revised external artifact. Supply exact old/new source anchors and recorded dependency links. The result distinguishes direct, possible and unknown impact, retains removed links, and separates historical observations from new applicability annotations. Inspect the candidate and independent checks, then use `evolution promote` with an exact-bound recorded disposition. Promotion requires fresh managed qualification and the expected unchanged baseline; it keeps the prior source and receipt. This is a single-file local workflow on macOS/Linux with cooperating-writer locking, not authenticated shared approval.

Use `evolution plan` to expose missing setup, independent oracle, instrumentation/calibration applicability, configuration, evidence and authorization. Every plan remains non-executable until the responsible project process releases it. See [the full schema and examples](workbench/tools/reference-pilot/LIFECYCLE.md).

Reports bind frozen source and view inputs, producer snapshots and all rendered artifacts. Preserve the entire qualification directory when transferring evidence. The digest chain detects changed or mixed local evidence; it is not an authenticated signature. A matching view-review basis also requires the complete recipe, including concern, target, renderer and styles. It does not establish that a person completed the review.

## Essential acceptance boundaries

For the independent contributor pilot, use `scripts/sysml.py contributor-check` with both managed baseline/candidate reports and their exact source snapshots, then `contributor-review` for a self-contained read-only HTML package. The [fixture contract](workbench/fixtures/contributor-pilot/README.md) freezes expected engineering facts and failure cases. These reference commands do not mutate the separate product or qualify its different semantic runtime; production edits must continue through that product's approved command service.

- Model ownership, typing, repeated occurrences, ports, connections, flows, behavior succession and trace links retain their different meanings. A connection is not automatically a flow; positive, negative and unknown satisfaction assertions remain distinct. Required and assumed constraints are not interchangeable. A design assertion is not proof.
- Validate with the locked SysML 2.0/KerML 1.0 runtime and check resolved facts, not label strings. A parser pass does not establish fidelity to the intended system.
- Keep the same source revision and identities across human views and agent answers. Reject stale retrieval; expose unknown scope and omitted features. A missing result is not proof of absence.
- Preserve historical observations when source changes. Review affected applicability instead of rewriting old outcomes.
- Do not claim native persistent graphical authoring, full-language notation, simulation, shared approval workflows or commissioning readiness from this bounded package.

Deliver model source, source/evidence/decision records, expected-fact checks, usable views and actual validation results. Record the next unresolved engineering question. Leave generated evidence in a user model/evidence workspace, not in the skill's installed source tree.

## Declared behavior explanations

Use `python3 scripts/sysml.py explain --source /model/model.sysml --report /evidence/report.json --target 'System::behavior' --output /new/behavior.json` for a bounded state/action tree. This consumes a managed report; it does not parse diagram text or execute behavior. Fresh qualification supplies parallelism, entry/do/exit references and source end lines. Older reports keep missing facts unknown.

A STATE or ACTION recipe may select `"renderer": "behavior"` to show the same typed projection in the lab, including its source-linked conditions table. ExhibitStateUsage is supported. The raw Pilot diagram remains separately available; this is a bounded declared-behavior profile, not full SysML graphical notation. Verification-case, inherited or unsupported control semantics are not silently substituted. Use the root HTML adapter's `sysml` command for automatic explanations from this projection; the standalone skill has no dependency on that optional adapter.

Large part views use multiple rows. The initial Fit presents a whole-diagram overview and labels it as an overview when text is small. Read labels keeps at least 12 CSS pixels for diagram text and uses scrolling where a complete sheet cannot fit. Deeper-than-direct port chains remain explicitly unsupported. The public-projection fixture manifest pins external Flashlight and Vehicle test inputs; the root acceptance script downloads their exact bytes to its evidence workspace, not into installed skill source.
