# Revised Gate P0 Owner Decision Packet

## Decisions already resolved by evidence

| Question | Proposed decision | Evidence |
|---|---|---|
| semantic authority | OMG SysML 2.0, KerML 1.0, Systems Modeling API 1.0 specifications and adopted resolutions; exact official release artifacts | ADR-001, ADR-007 |
| behavioral oracle | matching official Pilot and official fixtures; disagreements recorded | ADR-001, qualification plan |
| runtime engine | not selected in P0; qualify six paths and amend ADR-001 at P1 | ADR-001, `14-*` |
| application center | independent Workbench Service + shared web UI + Client SDK + versioned protocol | ADR-003, ADR-006 |
| browser status | first-class production client; local companion for local authoritative capabilities | ADR-008, `15-*` |
| Tauri status | offline packaging/OS host for the same product, not semantic architecture | ADR-003 |
| source authority | plain SysML/KerML source; all non-text edits produce validated source patches | ADR-004 |
| model identity | product-owned stable identity/alias receipts independent of line/layout/engine objects | ADR-002 |
| notation truth | every view labeled reference, conventional, or analytical with provenance | ADR-007, `11-*` |
| persistence | source-first project artifacts; filesystem and future hosted adapters share logical schemas | ADR-005 |
| Draw.io | export/markup only; remove bidirectional semantic authority | migration plan |
| collaboration | local Git/review artifacts now; managed collaboration deferred | ADR-008 |

## Consequential owner approvals

Accepted defaults:

1. Product name: **SysML Engineering Workbench**.
2. Approve Profiles B (browser + local companion) and C (Tauri desktop) as production targets; A as public evaluation; D as future.
3. Retain a public web evaluation with packaged samples and real read/query/compare workflows.
4. Keep Draw.io export/markup-only; delete semantic round trip.
5. Defer real-time collaboration until local Git, reviews, semantic diff, and evidence are proven.
6. Use **OMC4 interface assurance** as first production pilot.
7. Provider AI disabled by default; explicit per-provider configuration/action; proposal-only.
8. macOS and Windows first.
9. Signed desktop and local-companion packages at release candidate.
10. Use official release `2026-05` as the Phase 1 qualification baseline; upgrades require a new differential run.

## Phase 1 authorization scope

Approval authorizes only **Engine Qualification and Workbench Service Foundation**:

- candidate adapters/harness and differential evidence;
- independent service;
- Workbench Protocol/Client SDK schemas;
- stdio and authenticated loopback;
- workspace lifecycle and essential LSP/semantic observations;
- official fixtures, libraries, failure tests, benchmarks, SBOM/license evidence;
- final `GO`, `GO WITH CONDITIONS`, `NO-GO`, or `HYBRID GO`.

It does not authorize the new product shell, diagrams, assurance workflows, managed hosting, or production claims.

## Gate P0 answers

1. Official semantic authority? **OMG specifications/resolutions and exact official release.**
2. Behavioral oracle? **Matching official Pilot and official fixtures.**
3. Engines? **Spec42, Pilot service, daltskin, VinQut, official-component hybrid, legacy control.**
4. Selection? **Weighted reproducible qualification with blocking fidelity/preservation/failure gates.**
5. Service boundary? **Workspace/language adapter/semantic/query/command/review/diff/report/audit behind protocol.**
6. Same UI across profiles? **Yes, one built web application and Client SDK.**
7. Practical browser? **Yes, production authoring through local companion and full non-modeler review without desktop.**
8. Local installation required for? **Arbitrary local folders/Git/engine, offline toolchains, local secrets/evidence.**
9. Non-modeler web functions? **Views, properties, traces, findings, reports, baseline compare, dispositions.**
10. Notation distinction? **Required provenance class and legend per view/export.**
11. Industry patterns? **IDE indexing/refactor preview; GitHub review states; MBSE compartments/matrices; Capella viewpoints; Jama trace/review; Valispace verification.**
12. Reusable third-party parts? **Only qualified licensed components behind adapters; pattern/architecture learning otherwise.**
13. Product-owned parts? **protocol, adapter, normalized semantics, identity, commands, projections, reviews, diff, rule/report/audit contracts.**
14. Licensing? **exact pins, SBOM, notices, bundled-library provenance, redistribution gate; proprietary observation only.**
15. Hosted migration? **same protocol/service contracts with authentication and persistence adapters; no semantic rewrite.**

## Approval record

```yaml
decisionDate: 2026-07-24
approvedBy: owner
approvalSource: Codex task message "approve"
approvedPhase0Head: dc276c586dbac5d41150fe62ea9f539c1d29b3ea
baseline: 638e5aa1cc63ddb3a1c770f36432d6acedfbc541
acceptedAdrs:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-008
ownerDecisions:
  productName: SysML Engineering Workbench
  deploymentProfiles:
    publicEvaluation: A
    production: [B-browser-local-companion, C-tauri-desktop]
    future: D-managed-hosted
  publicEvaluation: retained
  drawio: export-and-markup-only
  collaboration: defer-real-time-use-git-and-review-artifacts
  firstPilot: OMC4-interface-assurance
  aiProviderPolicy: disabled-by-default-explicit-proposal-only
  operatingSystems: [macOS, Windows]
  distribution: signed-desktop-and-local-companion-at-P7
  qualificationRelease: 2026-05
exceptions: []
authorizedNextPhase: P1-engine-qualification-and-workbench-service-foundation
nextPhaseStarted: false
```

Gate P0 is approved. Phase 1 is authorized but has not started. This approval does not select a runtime engine or authorize later-phase product claims.
