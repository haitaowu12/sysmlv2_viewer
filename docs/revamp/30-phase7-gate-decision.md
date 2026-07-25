# Phase 7 Gate Decision

Decision: **P7 BLOCKED — technical internal RC only**  
Candidate version: `0.7.0-rc.1`  
Implementation head: `9c1d6abc78f29855b8217a99f13081efe07c715c`

The implemented technical candidate is materially releaseable for controlled
internal evaluation on the qualified macOS arm64 machine. It is not approved
for production or public distribution. The production gate is intentionally
fail-closed and requires an actual `config/release-approval.json`; the example
file is not approval.

## Technical evidence

- release-source verification: 19 workbench files/85 tests and 39 passing +
  1 skipped full files/239 passing + 19 skipped tests;
- TypeScript and production UI/service builds pass;
- production npm audit: zero vulnerabilities;
- production dependency graph: 42 components, no unapproved npm license
  expression;
- automated axe: zero serious/critical findings on the primary shell and
  assistant (rendered contrast remains a manual gate);
- exact P6 controlled-AI regression passes after authoring lifecycle changes;
- deterministic release assembly rejects dirty source, runtime hash drift,
  official-library commit drift, links, extra/missing files, and mutations;
- embedded verifier covers 2,176 files before launch;
- copied bundle serves strict-CSP UI, starts the qualified hybrid authority,
  and opens the four-document pilot without network or repository imports;
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
| product license | blocked | owner selects and records the repository/distribution license |
| runtime license provenance | blocked | reconcile VinQut fat-JAR LGPL notice with pinned Pilot checkout EPL license and redistributed class obligations |
| supported OS | blocked | owner selects minimum OS set; each claimed platform receives its own locked artifact and clean-machine run |
| distribution | blocked | signed/notarized installer or explicit internal-only policy |
| usability | blocked | three independent participants pass all eight tasks in `29-usability-pilot-protocol.md` |
| manual accessibility | blocked | rendered contrast, zoom, screen reader, keyboard, and diagram-alternative evidence |
| recovery/operations | blocked | clean-machine install, backup/restore, incomplete-command recovery, and crash/log-content review |
| product approval | blocked | name, version, residual risks, and evidence manifest signed by owner |

Windows is not a release claim. The runtime lock currently binds one macOS arm64
Spec42 executable hash. A Windows launcher contract does not qualify a Windows
binary.

## Release command behavior

- `npm run verify:release:source`: mandatory clean-CI source/security/license
  evidence; records owner/legal blockers without hiding them.
- `npm run verify:release:technical`: exact-runtime internal RC qualification;
  the waiver flag is explicit in its output.
- `npm run verify:release`: production gate; fails without owner approval,
  legal closure, exact runtime, signed distribution, platform, usability, and
  accessibility evidence.

## Owner decisions required

1. Confirm final product name.
2. Select product license and approve runtime-license reconciliation.
3. Confirm macOS arm64 internal RC scope or fund Windows/signing qualification.
4. Decide whether the read-only GitHub Pages demo remains.
5. Confirm Draw.io export/markup-only policy.
6. Select the first human pilot (OMC4/SCADA interface assurance recommended).
7. Name three independent pilot participants.
8. Approve external AI policy (disabled remains recommended).
9. Approve distribution channel and signing identity.
10. Sign the final release-approval manifest only after evidence exists.

## Gate disposition

Do not merge as a production release, create a public binary, or tag a final
version. The Phase 7 PR can be reviewed as a production-readiness candidate
whose remaining blockers require owner, legal, platform, and human evidence
rather than additional unbounded implementation.
