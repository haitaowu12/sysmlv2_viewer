# Browser Lab artifact qualification and Pages promotion

The root build opens the generated maintained Lab. `lab.html` remains an equivalent
entry for existing trial links; `probe.html` is the separate diagnostic engine probe.
No model processing service is started. Vite emits relative asset URLs for both an
origin root and the `/sysmlv2_viewer/` Pages project subpath.

## Build one candidate

From this directory, use Node 22, Python 3.13 and Go 1.27.1:

```sh
npm ci
npm test
npm run build:engine
npm run build
npm audit --omit=dev
```

`LAB_GO` can name an isolated Go SDK executable. No Go/Python/Node installation is
required for end users. The build checks the exact upstream engine commit and only
the retained patch, including patch-added test files. It compares filesystem bytes with a clean pinned-and-patched tree, so Git ignore
rules and assume-unchanged/skip-worktree flags cannot hide extra or modified inputs.
It refuses extra tracked or untracked modifications. Do not reset an occupied engine checkout to bypass this;
use a fresh `_build/OpenSysML` directory after preserving any investigation work.
The embedded language library comes from that exact pinned tree.

Before compiling WASM, the engine build runs the retained native `TestLab` typed-fact
regressions. The engine build copies its matching Go `wasm_exec.js`, records both hashes and the
patch identity in `engine-build.json`, and collects licenses for modules actually
linked under the js/wasm target. `prepare.py` generates the UI/Python copies from
`modeling-lab`; those files remain generated. Runtime license texts are distributed
under `licenses/`, linked from the visible build identity. `build-info.json` records
the Git revision plus a content digest covering the actual selected UI/runtime
inputs, including uncommitted changes. A Git revision alone does not imply a clean
or qualified source tree.

`audit_build.py` rejects a missing runtime asset, incorrect default entry,
root-relative entry asset, changed engine patch or mismatched WASM/Go loader pair.
It writes `artifact-manifest.json` for every distributed file. That layout check
is not browser usability, language conformance or performance qualification.

## Retain and qualify the exact bytes

The `Browser Lab candidate` workflow watches both the adapter and maintained owner.
It runs the tests, builds the pinned engine and distributable, audits dependencies
and retains `browser-lab-<workflow SHA>` for 90 days. Its separate rollback job
runs the predecessor's exact `verify:web-companion` build profile and retains the old Pages source at `80484f54610124bc3de1e25eb718d768dccff7db`
as `pages-rollback-80484f5`. This is a rebuilt predecessor; equivalence to previously
deployed bytes is not claimed without comparison. This predecessor is retained for recovery; building it
does not establish that its obsolete workflow is acceptable for new work.

Use a successful **push or workflow_dispatch** run for promotion. Pull-request
merge builds are useful checks but are not promotable because their synthetic merge
identity differs from the workflow head. Download the candidate artifact and run
its real browser gates before promotion. Record the run ID, head SHA, content
identity and browser evidence in the completion record. Do not rebuild between
qualification and deployment.

The release gate includes root and project-subpath startup, required views and
facts, custom-view selector persistence, editing/acceptance/save/reopen/undo,
complete reader export, failed-file/worker recovery, supported viewport/browser
checks and the agreed large-model envelope. Missing evidence stays explicit.

## Promote or roll back

Once the candidate gates pass, run `Promote qualified Pages artifact` on the default
branch with its exact successful candidate run ID and head SHA. Select `lab` for
the candidate or `rollback` for that run's retained predecessor. This workflow
checks the originating workflow/repository/conclusion/commit, downloads the chosen
artifact and validates the candidate's complete file manifest. It uploads those
same bytes to Pages; there is no deployment rebuild and no automatic main-push
replacement. These workflow files alone do not deploy the site.

After promotion, inspect the actual public root in the in-app browser and confirm
its visible content identity, startup, project reopen and reader export. Retain
the successful run and rollback artifact before its 90-day expiry. Rollback is a
new explicit promotion of the retained predecessor from the same successful run;
it does not require rewriting Git history. Verify public startup after rollback.

## Evidence limits

Five build regressions cover valid subpath layout, missing/mismatched assets,
root-relative references, unexpected engine edits/added files and both upstream/
Homebrew Go SDK license layouts. The runtime
notices catalogue records the upstream commits and retained license texts. Browser
layout/performance gates and actual public promotion are owned by the release
lead; this build work does not claim those gates passed.
