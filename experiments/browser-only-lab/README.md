# Browser-only Modeling Lab feasibility build

Status: working prototype; **not the Pages replacement**. The maintained Lab and public local release remain unchanged. The selected product direction is an interactive GitHub Pages app with no local installation or separate modeling server.

The trial uses the maintained Lab HTML, workflow and projection modules, OpenSysML 0.10.0 compiled to WebAssembly, Pyodide 0.29.3 and Viz 3.31.0. A static server supplies files only. Model validation, projection, guided editing and save/reopen run inside the browser. No model-bearing HTTP endpoint is used.

## Reproduce as a developer

Install Node, Python and Go 1.27.1, then run in this directory:

```sh
npm ci
npm test
npm run build:engine
npm run build
npm run preview
```

`LAB_GO` can name an isolated Go executable. These are developer build prerequisites; the resulting browser application does not need the user to install them. Open `lab.html` for the Lab or `index.html` for the six engine controls. Build assets stay ignored. The source build checks OpenSysML tag `v0.10.0` at commit `08ef397841767b829e492bbecf6d723483b4421e` before applying the retained patch. The patch exposes the existing renderer and API JSON exporter and supplements exported composition/inheritance facts through the engine's own semantic functions. It does not introduce another SysML parser.

`prepare.py` generates UI, fixtures and Python projection assets from `modeling-lab/`; those generated copies are not independent maintained owners. The browser adapter is deliberately experimental. In particular, its analytical fallback for original Pilot tree diagrams is not a claim of notation parity.

## Observed evidence — October 14, 2026 Vancouver

The actual in-app browser ran the production static build, not just the development server:

- Six source-validation controls pass: original/reviewed alarm models, missing type, missing endpoint, broken syntax, and equal short names in distinct packages.
- A captured browser model export matches all nine maintained alarm semantic criteria after the small field adapter. The original contract was not relaxed. The first comparison was 8/9 because composition evidence was absent; the engine's own reflective composition fact repaired that gap.
- The maintained occurrence catalogue retains the alarm scope's eight nodes and eight interface records, including separate cold-room/probe occurrences. This is a bounded comparison, not full language or scale qualification.
- The Lab UI prepares and validates minimum 3 → 4, retains declared capacity 2, shows the shortfall and change basis, and applies the change. Project save → reload → reopen → re-save produces equal project JSON, retaining source, baseline 3, four recipes and one change-history entry. Reader HTML export succeeds and includes the changed source and declared responsibilities.
- A pump project imports with all eight navigation entries and renders its context and motor-state views. **The motor-state parity gate fails:** parallelism and entry-action evidence and explicit empty guard/effect fields from the maintained Pilot report are unavailable to the current browser adapter. The UI reports unknown/incomplete conditions. Navigation counts and a drawn graph do not establish preserved view meaning.

## Required next work, in order

1. Extend the typed engine-export adapter for state parallelism, entry actions, explicit guard/effect absence, satisfaction polarity and verification/subject links. Preserve native identities, anonymous members and occurrence context; do not infer absence from an omitted export field. Re-run the same positive and counterexample contracts.
2. Require all eight pump views, both audiences and every supported custom presentation to preserve the existing facts, labels, source witnesses and omissions. Verify add/rename/copy, scenario/responsibility authoring, undo, invalid/stale rejection, reader export and save/reopen through the actual browser UI. Replace/remove remaining native-runtime labels in the generated browser UI before release.
3. Check a Pages subpath, cold asset delivery, browser memory and the established larger-model tasks. The current development build emits about 50 MB of engine WebAssembly plus the Python/Graphviz assets; it is not a measured large-model or cold-network result.
4. Only after those gates pass, update the existing Pages build to publish this app, review/merge the exact head and verify the deployed workflow. Until then PR #14 stays draft and the old site remains live.

The migration experiment was stopped at the demonstrated view-parity failure, before spending the remaining detour budget on a broader semantic-export rewrite. A review/download landing page is not the selected product direction.

The transport has five deterministic failure-path tests. A timeout or worker failure now settles queued requests, clears their timers and immediately reports the reload recovery for later requests. Successful and out-of-order responses and unsendable requests are also covered. The rebuilt static application was opened successfully in the actual in-app browser; automatic worker restart is not implemented.

## Dependencies and provenance

OpenSysML: Apache-2.0, [source and browser contract](https://github.com/Open-MBEE/OpenSysML/tree/v0.10.0), [WASM documentation](https://runtime.opensysml.org/reference/wasm/). Pyodide: MPL-2.0, [source](https://github.com/pyodide/pyodide/tree/0.29.3), including Python and bundled-library notices. Viz: MIT, [source](https://github.com/mdaines/viz-js), including Graphviz notices. Preserve the full relevant runtime notices in a distributable build; this experiment is not a completed distribution/notice review.
