# Retired service-backed workbench and recovery proposal

Status: historical product lane; useful safety controls preserved

Reviewed on 2026-10-20 against main
`e05c6dcdd50d16308b8ed677888fb67f281b53b8` and recovery PR #13 head
`447e2ce312dbc0f13d8a07524c49f34c5963c861`.

## Product direction and PR disposition

[PR #14](https://github.com/haitaowu12/sysmlv2_viewer/pull/14) replaced the
Pages companion shell with the maintained browser-only Modeling Lab.
[PR #15](https://github.com/haitaowu12/sysmlv2_viewer/pull/15) recorded the
live replacement, exercised rollback and retired companion launch instructions.
The ,
current README and explicit artifact promotion workflow govern that application.
It processes models in the browser and does not pair with the old service.

[PR #13](https://github.com/haitaowu12/sysmlv2_viewer/pull/13) proposed a
different recovery product: the earlier Pages shell plus a local companion,
followed by VS Code-first authoring. That proposal is superseded. Its wholesale
merge would restore obsolete architecture and deployment instructions.

The original **R0 exact-artifact browser gate remains unpassed and is retired
with that proposed product path**. This is a scope disposition, not a successful
acceptance result. No fresh browser pairing, engine qualification, macOS
companion acceptance or practitioner run is asserted by closing that proposal.
The [original requirements at the final PR head](https://github.com/haitaowu12/sysmlv2_viewer/blob/447e2ce312dbc0f13d8a07524c49f34c5963c861/docs/revamp/38-codex-recovery-execution-handoff.md)
remain preserved. Any future revival must satisfy the relevant real-browser,
exact-artifact, runtime and practitioner requirements before making claims.

## Preserved fixes

The retained service source still contains reusable developer and packaging
code. These independent fixes are carried forward onto current main:

- Companion assembly requires clean portable provenance even when
  `--allow-dirty` permits a nonqualifying local checkout. It validates the exact
  official-library path and compares the recomputed canonical inventory tree
  SHA-256, including same-count byte changes.
- The authoritative packaging implementation performs that preflight itself.
  The npm command, direct TypeScript command and compiled JavaScript command
  cannot bypass it by omitting a wrapper. A source-dirty local assembly remains
  explicitly nonqualifying; these controls grant no distribution approval.
- Interfaces and Verification can load when Git or Git baselines are
  unavailable. Git-dependent baseline/commit controls remain disabled with a
  visible explanation. This is component behavior, not browser qualification.
- P4/P5 qualifier results are labelled `service-integration`; P6 retains only
  service safety evidence. Old screenshot hashing is removed from the P4
  qualifier because it did not establish execution during the current run.
- The predecessor web-companion checker identifies its static/transport
  evidence, `uiExercised: false`, and `R0-exact-artifact-ui` as
  `retired-unpassed`.

The maintained `modeling-lab/` owner, browser adapter, WASM runtime, Lab UI and
Pages promotion workflow are unchanged by this preservation work.

## Reading historical records

The historical P4 and P5 product-gate decisions are invalidated. Their service
observations remain useful but do not prove delivered-UI usability. P6's
product-gate status is withdrawn while bounded tool, citation, proposal,
approval and audit evidence remains available. Historical machine observations
are retained unchanged; a `pass` inside those dated files is not a current
product acceptance decision.

The service-backed product, runtime and deployment documents carry a historical
notice pointing here. Their four deployment profiles do not describe the
maintained browser-only application. The old launchers' default public Pages
URL no longer hosts their pairing UI; preserved-companion experiments require
an explicitly selected, separately served predecessor shell.

P7 and [issue #10](https://github.com/haitaowu12/sysmlv2_viewer/issues/10)
remain subject to their existing release, licensing, distribution, platform
and human acceptance requirements. This disposition neither closes those
requirements nor promotes any unsigned companion artifact.

## Verification scope

Use Node 22, the retained companion's required Node major version, for source
checks. Run `npm ci`, `npm test`, `npm run lint`, `npm run build` and
`npm run audit:production` locally when Actions capacity is unavailable.
The preflight tests include real direct-command rejection as well as library
tree, malformed provenance and canonical ordering cases. The non-Git component
regression opens Interfaces and Verification and checks disabled baseline
controls.

The retained service qualifiers require the exact locked VinQut/Pilot and
Spec42 artifacts. A missing runtime must fail closed and must not be reported
as a successful service qualification. Neither source tests nor that negative
control replace the retired R0 browser gate. The browser-only Lab has its own
qualification and artifact release process.

### Local preservation checks — 2026-10-20

The candidate was checked locally with Node 22.23.3 on Linux. No Actions run,
browser acceptance or native macOS packaging is represented by these results.
