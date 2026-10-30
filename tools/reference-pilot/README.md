# Formal-era reference lab

This independent qualification lane uses the unmodified official SysML Pilot 0.52.0 JAR and bundled library from release `2025-09`. It does **not** replace the production VinQut/Spec42 lock, bridge, identity reconciliation, command service or release gates. See `config/reference-pilot-lock.json` for exact artifact hashes and provenance.

For agent-led model evolution, use [the collaborative agent workflow](AGENT_WORKFLOW.md): revision-bound semantic retrieval, exact evidence-linked candidate patches and objective-led human review routes.

For a new system, start with [system-specific model package assessment](MODEL_PACKAGE.md). `assess_package.py` checks independent facts, citation coverage, source-support links, decisions, supported declaration kinds, counted exchanges and exact requested views. The [pumping-station package](../../fixtures/authoring/pump-station/README.md) adds mixed inputs, repeated/nested components and event-triggered motor states. The older cooler acceptance runner remains a regression fixture, not a template for every system.

Prerequisites: Java 21, Python 3, Graphviz on PATH. The tested host used Java 21.0.8 and Graphviz 16.1.0. Obtain `jupyter-sysml-kernel-0.52.0.zip` from the official [Pilot release](https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases/tag/2025-09); unpack it outside the repository. No binaries or generated evidence belong in source control.

From the product repository, substitute your extracted paths:

```sh
python3 tools/reference-pilot/qualify.py \
  --jar /path/to/sysml/jupyter-sysml-kernel-0.52.0-all.jar \
  --library /path/to/sysml/sysml.library \
  --source fixtures/workspaces/formal-monitor/model/monitor.sysml \
  --views fixtures/workspaces/formal-monitor/views.json \
  --output /path/to/new-evidence-directory
```

The runner refuses mismatched JAR/library hashes and an existing report. It saves input identities, fresh static diagnostics, source-anchored session elements, six SVGs and runtime output. Exit 2 means static validation or rendering failed. `execution: not-evaluated` is intentional. A satisfied relation or verification definition does not establish a successful verification execution.

For editable drafts and model scope/view selection:

```sh
python3 tools/reference-pilot/lab.py \
  --jar /path/to/sysml/jupyter-sysml-kernel-0.52.0-all.jar \
  --library /path/to/sysml/sysml.library \
  --source fixtures/workspaces/formal-monitor/model/monitor.sysml \
  --views fixtures/workspaces/formal-monitor/views.json
```

Open `http://127.0.0.1:5196` in the in-app browser. The server binds only to loopback, checks host/origin/session, and accepts bounded draft text. It never writes canonical source. Every regeneration starts a fresh engine, so views within a result share identities; persistent identity across edits is not claimed. The lab is an audit tool, not a production authoring replacement. Stop with Ctrl-C.

## Reproducible acceptance

Run the three input trials and fresh-engine regressions with the same `--jar` and `--library` arguments as above:

```sh
python3 -B tools/reference-pilot/acceptance_suite.py --jar /path/to/kernel.jar --library /path/to/sysml.library --output /path/to/new-acceptance
python3 -B tools/reference-pilot/regression_suite.py --jar /path/to/kernel.jar --library /path/to/sysml.library --output /path/to/new-regressions
python3 -B -m unittest discover -s tools/reference-pilot -p 'test_*.py'
```

The acceptance suite freshly validates three independently authored models from architecture prose, an interface table, and a completed dialogue describing one fictional cooler. Each must pass 31 common expected-fact checks, produce six views, preserve the three expected directed exchanges, and match a bounded semantic signature. The generators needed diagnostic and semantic repairs; this is assisted forward-testing, not a first-pass success rate, a before/after experiment, or proof over arbitrary systems. See `fixtures/authoring/cooler/README.md`.

`check_contract.py --report report.json --contract contract.json --output new-checks.json` checks actual resolved EMF facts. The regression suite deliberately supplies a statically valid but incorrectly bound satisfaction statement; the independent expected-fact contract must reject it. Requirement `sourceIncludes` checks textual clauses, not evaluated expressions. Verification execution remains `not-evaluated`.

Use `qualify.py --source-set sources.json` instead of `--source` for an explicit manifest `{"schemaVersion":1,"files":["types.sysml","model.sysml"]}`. Files must stay within the manifest directory. Deterministic assembly retains original hashes and maps diagnostics/elements to original paths and lines. This validates a fresh assembled resource; it does not qualify native separate-resource or incremental loading.

## Presentation and supported profile

Six example concerns share one canonical source revision: context, decomposition, interconnection, behavior, requirements and verification. Presets are application projections, not modeled SysML `view`/`viewpoint` declarations. Select a definition or usage to change scope; select a graphical element to inspect its source; use Fit, 100%, or zoom controls. Draft regeneration uses a fresh engine and clears accepted views when validation fails. Restore baseline recovers the original draft without writing the source file.

The engineering renderer reads engine semantics, not a second text parser. Its bounded profile supports:

- Part definitions, part usages and source-defined inherited ports; repeated usage contexts remain distinct.
- Rectangular definitions, rounded usages, dashed references and docked square ports.
- Explicit binary connections and bindings, including distinct parallel connectors.
- Item-flow direction and payload from resolved interface flow roles, with filled flow arrows on the connection.
- Deterministic named presentation identities across fresh engine sessions. These are presentation keys, not production rename/reconciliation identities.

The profile is grounded in OMG SysML 2.0 Language `formal/26-03-02`, graphical notation for parts, ports, connections, interfaces and flows (§8.2.3.11–§8.2.3.16). It is not full graphical conformance. Direct part.port endpoint chains and at most 12 part usages per sheet are supported. Unsupported chains/relationships are reported explicitly. Choose a smaller scope for large systems. Multiplicity, nested end paths, all inheritance/redefinition forms and every flow syntax are not generally qualified.

Set `renderer: "engineering"` on a single-root `INTERCONNECTION` preset. Other concerns use the Pilot renderer. The unmodified engine SVG remains `*-raw.svg`; spaced Pilot output remains `*-pilot.svg` for custom sheets. The lab's **Pilot reference** toggle exposes the original for comparison. Reference-renderer ordering can vary across fresh loads, so semantic equality does not imply identical pixels.

**Exchange summary (analytical)**, or `renderer: "summary"` on an interconnection request, groups explicit flows by source occurrence, target occurrence and item. It hides ports, retains every supporting flow/connector ID, and lists omitted non-exchange connectors such as bindings. It does not create semantic connections or establish behavioral equivalence.

## Authority and limits

The usable agent route is Tony's notebook knowledge-engine specialist `sysml-v2-modeling`. It handles evidence, uncertainty, input-specific authoring, expected facts and iterative user decisions; this tool supplies authoritative parse/static checks and inspectable views. The lab itself is not an autonomous conversational agent.

The independent reference lane does not qualify the production VinQut/Spec42 bridge, persistent edit identity, general graphical mutation, simulation, evaluated constraints, Arcadia/UAF compliance, external AI integration, distribution or multi-user acceptance. Each new real system needs its own evidence and expected-fact contract. Run and inspect the actual views; a green parser or polished image alone does not establish engineering adequacy.

## Citation integrity and community regression checks

The acceptance suite now also checks `evidence-contract.json` for each input trial, using the [schema and coverage contract](EVIDENCE_CONTRACT.md). Exact source hashes, quotations, model revision and explicit declaration targets are checked; new uncited usages cannot inherit coverage from a cited package. Coverage is bounded and excludes expressions and other engine scaffolding. Source entailment remains an engineering review, and the 29 resolved-fact checks remain independent. Original `evidence.json` files retain the initial authors' records.

```sh
python3 -B tools/reference-pilot/community_regressions.py --jar /path/to/kernel.jar --library /path/to/sysml.library --output /path/to/new-community-regressions
```

This runs positive language controls, a malformed enumeration negative control and an uncited-part negative control. See `fixtures/language/community-review/README.md` and `docs/reaudit/2026-10-02-community-comparison.md`. Do not import community syntax claims without a primary-language or pinned-engine check.

The October 3 Pro review led to additional verified repairs: exact symmetric binding endpoints, Controller performance assignment, resolved requirement expression structure, selector cardinality, preserved exchange multiplicity, six distinct concern/scope/mode checks, per-view model/artifact hashes, independent intake catalogs, shared CLI/suite receipt identities and explicit infrastructure failure receipts. Use `--intake intake.json` with `check_evidence.py`. The current reference unit suite has 44 tests; community regressions contain 14 checks. No constraint execution is claimed. Details and independently classified feedback are in `docs/reaudit/2026-10-03-pro-review-closeout.md`.

The subsequent October 3 pumping-station extension has 56 unit tests and seven fresh-engine checks in `pump_regressions.py`; it preserves the cooler's three input regressions. Run it with the same `--jar`, `--library` and new `--output` arguments. Its package has 35 expected facts, 77 source-declaration anchors and eight projections. See `docs/reaudit/2026-10-03-pump-package.md` for rendered and interactive evidence and limits. Lab controls use explicit event listeners after an in-app-browser failure was reproduced; state spacing and the horizontal preset correct the tested frame/label collision.

## October 3 lifecycle extension

See [LIFECYCLE.md](LIFECYCLE.md) for automatic draft/view updates, baseline-triggered impact review, external artifact trace registration, test planning limits, the declared integer capacity analysis and report integrity boundaries.

## Custom perspectives and matrices

In the lab, choose **+ Create a perspective** to select a contextual component, decomposition depth, interface-neighbor hops and explicit include/hide filters. Switch between the analytical diagram, interface matrix/register, requirements matrix and direct trace links, then save the recipe locally. View-only composition uses the current validated report without rerunning the engine; edits revalidate and reapply the recipe. Scope omissions and extraction limits remain visible.

. Recipes are browser-local application state, not native SysML view declarations or shared controlled baselines. This increment passes 85 reference Python tests and 15 lab DOM tests; it does not qualify enterprise-scale models or commissioning readiness.
