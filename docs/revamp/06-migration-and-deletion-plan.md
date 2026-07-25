# Migration and Deletion Plan

Principle: migration protects valuable user source and evidence, not obsolete architecture.

## Classification

| Component/data | Action | User value | Architecture fit | Cost/maintenance | Migration |
|---|---|---|---|---|---|
| `.sysml`/`.kerml` source | retain | canonical engineering content | exact | low | open through workspace loader |
| Monaco integration | refactor | strong text UX | high with LSP | medium | replace custom provider wiring |
| React UI/components | selective refactor | shared web product surface | high behind SDK | medium | move behind typed protocol |
| React Flow nodes | provisional retain | useful canvas interactions | medium | medium | diagram DTO/command adapter |
| SVG/PNG export | refactor | stakeholder output | high | medium | deterministic report manifest |
| examples | selective retain | onboarding/fixtures | uncertain syntax | low | validate against selected profile |
| parser | replace/delete | legacy subset only | low | very high if continued | compare-only until deletion gate |
| parser AST in views | delete | none after snapshot | none | high coupling | projection migration |
| bridge semantic graph | delete | Draw.io compatibility | low | high identity risk | one-way export adapter |
| direct source patches | delete | current editing | none | high defect risk | typed commands |
| whole-document AI apply | delete | convenience | prohibited | high assurance risk | proposal transaction |
| Zustand semantic authority | delete/refactor | UI responsiveness | low | high coupling | UI state only |
| browser-only file state | delete | simple demo | low | data-loss risk | project format |
| fixed tab routes/IDs | delete | familiarity only | low | medium | no compatibility promise |
| Draw.io round trip | delete | stakeholder markup | conflicts | high | export/attachment only |
| GitHub Pages production authority | delete role | public reach only | incompatible | low | Profile A evaluation may use static hosting |

## Migration sequence

### Phase 1 — Engine Qualification and Workbench Service Foundation

- introduce product-owned adapter, candidate harness, protocol, Client SDK, and independent service beside the current app;
- run identical evidence against candidates; do not select by integration convenience;
- provide stdio and authenticated loopback transports;
- end with GO/GO WITH CONDITIONS/NO-GO/HYBRID GO and amend ADR-001;
- only then make the selected runtime authoritative for a bounded sample workspace;
- legacy UI remains read-only for non-migrated projections;
- add source-preservation guards;
- no parser feature expansion.

### Phase 2

- normalize semantic snapshots;
- migrate explorer and first projection;
- create workbench identity/alias ledger;
- remove authoritative parser/store reads from migrated paths;
- qualify legacy fixtures through the new engine.

### Phase 3

- route all supported mutations through command transactions;
- disable legacy direct patches and AI whole-document application;
- retain legacy converter only for explicitly valuable data.

### Phase 4

- replace fixed tabs and local layouts with saved projections;
- remove bridge/native duplicated semantic reconstruction;
- make Draw.io one-way export/markup if owner confirms.

### Phase 5+

- remove remaining legacy parser and state schema;
- delete compatibility code after its retirement evidence passes;
- retain an import utility only if identified user artifacts exist.

## Valuable persisted-data assessment

No authoritative browser review, layout, or workspace schema exists at baseline. The application uses browser memory and downloads; local storage contains panel widths/recent UI preferences only.

Therefore:

- no migration converter is justified for panel widths, old routes, fixed diagram ids, or undocumented caches;
- source files remain directly importable;
- Draw.io files may be attached as non-authoritative markup or converted once to a saved layout only if a named user supplies valuable files;
- a converter is created only after real artifacts are inventoried.

## Parallel branch extraction

`codex/sysmlv2-execution-foundation` contains useful official-fixture qualification and headless Pilot validation work. It also expands the custom parser.

Extraction policy:

1. rebase/examine after P0 approval;
2. extract fixture provenance, oracle process controls, output guards, and deterministic qualification reports;
3. reject parser-authority expansion and any tool that bypasses the candidate-independent adapter;
4. port tests before implementation;
5. preserve branch history as evidence; do not force-push or silently merge.

## Compatibility-layer contract

Any retained adapter must declare:

- identified user data/workflow;
- owner;
- supported versions;
- tests;
- retirement phase/date;
- failure behavior;
- deletion issue.

Initial legacy parser adapter retirement: end of Phase 2 if gates pass; hard stop before Phase 4 production UX acceptance.

## Deletion checklist

A component can be deleted when:

- its replacement passes the relevant user workflow;
- canonical source remains readable and preserved;
- retained fixtures pass;
- no named user data depends on it;
- rollback is possible from Git;
- documentation and imports no longer reference it.

## Risk register

| ID | Risk | P/I | Control | Accountable role | Introduce / close | Evidence |
|---|---|---|---|---|---|---|
| R1 | runtime candidates drift/pre-1.0 churn | H/H | exact pins, common adapter/harness, upgrade suite | language lead | P1 / before selection | ENG-UPGRADE-001 |
| R2 | incomplete language semantics | H/H | capability profile + Pilot differential fixtures | language lead | P1 / before each profile claim | LANG-DIFF-001 |
| R3 | no candidate meets fidelity/performance together | M/H | weighted differential qualification; conditional/hybrid only with unambiguous authority | architecture lead | P1 / selection gate | PERF-P1-001 |
| R4 | dual authority persists | M/C | compare-only flag and deletion trigger | architecture lead | P1 / before P2 gate | ARCH-AUTH-001 |
| R5 | unknown syntax damaged | M/C | opaque ranges and fail-closed commands | command-engine lead | P1 / before first P3 write | CMD-OPAQUE-001 |
| R6 | identity breaks review anchors | M/C | identity property tests and alias receipts | semantic-core lead | P2 / before P2 gate | ID-STABLE-001 |
| R7 | local service/IPC/path escape | M/C | capability handles, path allowlists, sandbox and escape tests | security lead | P1 / before first workspace open | SEC-LOCAL-001 |
| R8 | Draw.io reintroduces authority/egress | M/H | local export default; isolated consented remote markup only | product + security leads | P4 / before P4 integration | SEC-DRAWIO-001 |
| R9 | license/notices block distribution | M/H | root license, SBOM, EPL source/notices review | release manager | P1 / source use before P1; distribution before P7 | LIC-001 |
| R10 | CI corpus remains optional | M/H | repository-managed mandatory fixtures | quality lead | P1 / before P1 gate | CI-FIXTURE-001 |
| R11 | reports vary by environment | M/H | deterministic renderer/golden manifests | report lead | P5 / before P5 gate | REPORT-DET-001 |
| R12 | AI leaks or mutates source | M/C | disabled default, narrow tools, consent, approval transaction | AI privacy lead | P6 / before first provider action | AI-SAFE-001 |
| R13 | local branch conflicts with revamp | M/M | evidence-only extraction after ADR approval | repository maintainer | P1 / before extracted merge | MIG-BRANCH-001 |
| R14 | browser/local companion hijack or DNS rebinding | M/C | loopback-only, pairing, origin/Host allowlist, short-lived tokens, CSRF/WS tests | security lead | P1 / before loopback acceptance | SEC-LOOPBACK-001 |
| R15 | scope expands before gate | H/H | phase branches/draft PRs and gate checklist | product owner | all / every phase gate | GATE-CHECK-<phase> |
| R16 | protocol/deployment contracts fork | M/C | generated schemas and cross-transport conformance suite | architecture lead | P1 / every transport release | PROTOCOL-001 |
| R17 | Tauri becomes semantic dependency | M/H | service executable and UI contract tests without Tauri | architecture lead | P1 / P4 | ARCH-SHELL-001 |
| R18 | hosted persistence creates shadow model | M/C | ADR-005 logical artifacts and adapter equivalence | data/security leads | before Profile D | PERSIST-EQUIV-001 |

No critical residual risk is silently accepted. A residual risk needs a dated owner disposition with evidence, scope, expiry/review date, and affected acceptance criteria. Controls close before the capability enters; P7 re-verifies them rather than deferring first closure.

## Rollback

Each phase is a separate draft PR based on the accepted prior phase. No history rewrite. Legacy source remains available until its replacement passes. Failed engine/shell experiments are removed as bounded commits; canonical model data is never auto-migrated without preview and backup.
