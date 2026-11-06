# SysML v2 Viewer project instructions

Use README.md and the affected application/modeling contracts and tests for repository-specific work. Preserve model semantics, engineering claims and release authority.

## Publication

Firebase Hosting is the primary destination for future public releases: https://modeling-lab.web.app/. From `experiments/browser-only-lab/`, run `npm ci`, `npm test`, `npm run build:engine`, `npm run test:engine-views`, `npm run build` and `npm audit --omit=dev`. Publish only this browser-only Lab output, including its WASM runtime; the root application and companion service are separate products.

Deploy from the repository root with `firebase deploy --only hosting --project tony-wu-projects`. The checked-in `firebase.json` pins this site and its public output. Keep the shared project on the no-cost Spark plan. Source pushes and Hosting releases are separate operations; retain the existing hosts unless their retirement is requested. Exercise the main journey and any worker, download or nested page on the published address.
