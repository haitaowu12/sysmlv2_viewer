# Phase 7 Gate Decision

Decision: **P7 BLOCKED — self-contained desktop technical RC only**
Candidate version: `0.7.0-rc.1`
Implementation head: recorded by the exact-head desktop and release manifests

The implemented technical candidate is materially usable for controlled
internal evaluation on macOS arm64. It bundles Node 22, a minimized Java 21
runtime, both locked language engines, the standard library, the UI, and the
Workbench Service. It is not approved for public distribution. The production
gate remains fail-closed and requires genuine hash-bound evidence plus an
actual `config/release-approval.json`; the example file is not approval.

## Technical evidence

- release-source verification: 20 workbench files/92 tests and 40 passing +
  1 skipped full files/246 passing + 19 skipped tests;
- TypeScript and production UI/service builds pass;
- production npm audit: zero vulnerabilities;
- production npm dependency graph: 45 components, no unapproved npm license
  expression;
- product Apache-2.0 license and `NOTICE` are present;
- the exact pinned VinQut/Pilot license conflict has an owner-authorized,
  pin-bound disposition; pin or artifact changes reopen the review;
- the locked Tauri Cargo graph has 441 components and zero unapproved license
  expressions;
- the macOS arm64 resolved Cargo graph has 256 components, zero RustSec
  vulnerabilities, zero unsoundness findings, and five explicit unmaintained
  `unic-*` notices inherited through Tauri's `urlpattern` dependency;
- the initial audit found vulnerable `quick-xml` and `time` versions; the lock
  now selects `plist` 1.10.0, `quick-xml` 0.41.0, and `time` 0.3.54, eliminating
  all three vulnerability findings;
- the Tauri `.app` launches the same qualified protocol/service, opens the
  four-document pilot using only bundled Node/Java runtimes with a restricted
  `PATH`, and shuts down cleanly;
- strict code-integrity verification and log-leak checks pass on the ad-hoc
  technical build;
- automated axe: zero serious/critical findings on the primary shell and
  assistant (rendered contrast remains a manual gate);
- exact P6 controlled-AI regression passes after authoring lifecycle changes;
- hard-exit multi-file recovery restores source byte-exactly, and full-project
  backup/restore preserves the semantic snapshot and stable identity set;
- transaction-journal retention is explicit, dry-run by default, and protects
  all non-terminal recovery states;
- deterministic release assembly rejects dirty source, runtime hash drift,
  official-library commit drift, links, extra/missing files, and mutations;
- embedded verifier covers 2,176 files before launch;
- copied bundle serves strict-CSP UI, starts the qualified hybrid authority,
  opens the four-document pilot without network or repository imports, and
  scans captured output for model/session/CSRF leakage;
- runtime provenance binds 15 local inputs and 36 Maven component records to
  the locked fat JAR: ten inputs match normalized Pilot JAR content and five
  UML inputs reproduce pinned Pilot build directories through the recorded
  packaging process; generated OSGi qualifiers and archive timestamps are not
  misrepresented as byte-reproducible;
- medium performance: five warmups, thirty valid samples, all seven mandated
  p95 targets pass; see `phase7-benchmark-observation.json`.

The semantic workspace opens before the non-authoritative Spec42 document
index. Spec42 capabilities are negotiated at open; its documents are indexed
on first authoring request. Pre-use edits are included in that initial document
set and later changes remain ordered. P6 rename/approval qualification proves
the lazy lifecycle does not bypass authoring or semantic validation.

## Blocking evidence

| Gate | State | Required closure |
|---|---|---|
| product license | passed in source | Apache-2.0 `LICENSE` and product/runtime `NOTICE` committed; final artifact approval remains hash-bound |
| runtime license provenance | passed for exact pins | owner disposition selects the pinned Pilot EPL-2.0 license and preserves the original VinQut NOTICE |
| supported OS selection | passed | macOS 13+ arm64 first; Windows is deferred |
| clean-machine OS evidence | blocked external | install, offline pilot, recovery, and log inspection on a separate supported Mac |
| distribution implementation | passed technical | self-contained Tauri `.app` and mounted read-only DMG smoke pass; every later source commit requires an exact-head rebuild |
| distribution trust | blocked external | Developer ID signing, Apple notarization, stapling, and Gatekeeper evidence |
| usability | blocked | three independent participants pass all eight tasks in `29-usability-pilot-protocol.md` |
| manual accessibility | blocked | rendered contrast, zoom, screen reader, keyboard, and diagram-alternative evidence |
| recovery integrity | passed automated | hard-exit rollback plus project backup/restore reproduce bytes, semantic snapshot, and identities |
| recovery/operations | blocked external | clean-machine signed-install recovery plus OS crash/log-content inspection |
| product name | passed | SysML Engineering Workbench |
| release approval | blocked | version, residual risks, and exact-artifact evidence manifest signed by owner |
| Rust maintenance notices | blocked for final approval | accept with expiry or eliminate the five target-relevant unmaintained `unic-*` notices through an upstream Tauri/urlpattern update |

Windows is not a release claim. The runtime lock currently binds one macOS arm64
Spec42 executable hash. A Windows launcher contract does not qualify a Windows
binary.

## Release command behavior

- `npm run verify:release:source`: mandatory clean-CI source/security/license
  evidence; records owner/legal blockers without hiding them.
- `npm run verify:release:technical`: exact-runtime internal RC qualification;
  the waiver flag is explicit in its output; includes recovery, runtime
  provenance, copied-bundle log safety, and exact bundle checks.
- `npm run verify:release`: production gate; fails without owner approval,
  legal closure, exact runtime, signed distribution, platform, usability, and
  accessibility evidence. Version 2 approval records are external, hash-bound,
  exact-commit/artifact-bound, and validated rather than trusted as booleans.

## Owner decisions required

1. Provide the Apple Developer Team/Developer ID signing identity and protected
   notarization credentials through the release environment.
2. Provide a separate macOS 13+ Apple Silicon clean machine for qualification.
3. Name three independent pilot participants and select the pilot model.
4. Schedule the manual accessibility session.
5. Approve the final release version, residual risks, and hash-bound evidence
   manifest only after those exercises pass.

Decisions about a public read-only demo, Draw.io export-only retention, Windows,
and future collaboration can be made after the first macOS production gate;
they do not broaden the current release claim.

## Gate disposition

Do not merge as a production release, create a public binary, or tag a final
version. The Phase 7 PR can be reviewed as a production-readiness candidate
whose remaining blockers require signing, platform, accessibility, and human
evidence rather than additional unbounded implementation.
