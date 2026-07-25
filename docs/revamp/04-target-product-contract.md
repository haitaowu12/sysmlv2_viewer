# Target Product Contract

Working name: **SysML Engineering Workbench**
Phase 0 status: accepted at Gate P0 on 2026-07-24; no production feature claims

## Mission

Provide a web-native, local-first engineering workbench for opening, authoring, understanding, reviewing, comparing, and evidencing real multi-file SysML v2 projects. The same client operates against a local companion, an offline desktop package, or a future hosted service.

## Primary users

- systems engineers authoring textual and graphical model content;
- interface managers assuring cross-boundary exchanges;
- requirements and verification leads assessing coverage/readiness;
- review chairs recording findings against stable model elements;
- configuration managers comparing source-controlled baselines;
- tool administrators deploying private/offline engineering environments.
- chief engineers and assurance leads governing baselines, findings, and evidence;
- project managers and stakeholders consuming approved views, comparisons, reports, and dispositions without installing modeling software.

## Product invariants

1. SysML/KerML source is canonical.
2. No hidden authoritative semantic shadow model exists.
3. Every non-text mutation resolves to explicit source edits.
4. Source remains human-readable and version-control-friendly.
5. Unsupported/unresolved semantics are visible and never invented.
6. Derived views reproduce from source, library lock, and versioned configuration.
7. Reviews/evidence anchor to stable workbench model identity.
8. Reports identify commit, baseline, language/library, engine, workbench, rule, and query versions.
9. Local-only mode works without network after installation.
10. Provider AI is optional, explicit, minimized, and indicated.
11. AI proposes commands/patches; deterministic validation and approval remain mandatory.
12. Supported language profile entries link to mandatory tests.
13. Official OMG specifications/releases, not any third-party engine, are the semantic reference.
14. Deployment choices do not fork the semantic or command core.
15. Every visual mark identifies reference, conventional, or analytical provenance.

## Core jobs

An engineer can:

1. open/reopen a configured multi-file workspace;
2. inspect indexing, libraries, diagnostics, and capability profile;
3. navigate by containment, type, dependency, relationship, requirements, verification, and interface;
4. edit text with LSP intelligence;
5. edit supported diagrams/properties through typed commands and source previews;
6. query models and save diagrams/matrices as projections;
7. assess requirements, verification, interfaces, and quality rules;
8. compare Git baselines semantically;
9. conduct model-anchored reviews and close findings;
10. generate deterministic evidence packages;
11. request grounded AI analysis or a reviewable proposal.

A non-modeler can, through an authorized browser session:

1. open published/scoped views and reports;
2. navigate properties and trace relationships;
3. compare two published baselines;
4. comment or record an assigned finding;
5. respond to and approve/reject an invited disposition;
6. download a reproducible evidence package.

## Information architecture

```text
Activity rail
├── Explorer
├── Model
├── Diagrams
├── Traceability
├── Interfaces
├── Verification
├── Reviews
├── Changes
├── Reports
└── Settings
```

Primary regions: left navigation, central editor/view, right properties/relationships/review, bottom problems/output/query/changes. Fixed diagram tabs are not the product model. The shell is one shared web application behind the Workbench Client SDK; Tauri may package it but owns no semantic logic.

## First production pilot

Recommended: OMC4 interface assurance.

Pilot content:

- system/subsystem decomposition;
- stakeholder/system requirements;
- cross-organization communication interfaces and flows;
- operating modes and verification cases;
- deliberate incomplete/conflicting content;
- two Git baselines;
- requirement and interface changes;
- unresolved reference;
- complete review cycle.

Pass requires all twelve scenario steps enumerated in `09-phase0-decision-and-requirement-traceability.md`. A rendered toy model does not pass.

## Capability contract

Language support is versioned by profile and construct state:

- supported;
- partial;
- parsed/preserved only;
- unsupported.

Only `supported` entries may appear as unqualified product claims, and each maps to mandatory CI evidence.

## Mutation contract

Every mutation returns a command receipt:

```yaml
commandId: CMD-...
baseSnapshot: ...
proposedWorkspaceEdits: []
affectedElementIds: []
diagnosticsBefore: []
diagnosticsAfter: []
semanticDiff: {}
conflicts: []
undo: {}
approvalState: proposed
```

No diagram, property panel, bulk operation, imported markup, or AI response bypasses this receipt.

## Review contract

Reviews are diffable project artifacts with:

- unique review/finding ids;
- frozen baseline and scope;
- participants and roles;
- stable element/relationship anchors;
- severity/category/owner/due date;
- disposition history;
- evidence references;
- staleness state after model change;
- closure manifest.

## Evidence contract

HTML/PDF reports have deterministic content and a machine-readable manifest. Generation time is recorded but excluded from content hashes where necessary. Exclusions and unresolved diagnostics are visible.

## Privacy contract

- telemetry off by default;
- logs exclude model content by default;
- network indicator reflects actual egress capability/state;
- provider actions require explicit configuration and per-action consent when model content leaves the machine;
- credentials stay in OS keystore or privileged local service;
- static demo contains only packaged samples.

Browser + local companion adds explicit pairing, loopback-only binding, trusted-origin allowlists, short-lived credentials, server-issued workspace/file capability handles, CSRF/WebSocket protections, expiry/revocation, and deny-by-default egress.

## Deployment contract

- public web evaluation: packaged samples and bounded real workflows;
- browser + local companion: first-class local production authoring/review;
- Tauri desktop: same product, fully offline packaging;
- managed hosted: future authenticated deployment of the same protocol/service contracts.

Local installation is required only for arbitrary local folders/Git/engine execution, offline report toolchains, local keystore/provider access, or private evidence files.

## Non-goals through Phase 5

- real-time multi-user collaboration;
- cloud repository as canonical storage;
- official conformance certification;
- all SysML 2.1 Beta constructs;
- arbitrary Draw.io round-trip editing;
- autonomous AI source mutation;
- feature parity with every commercial modeling suite.

## Release truth

README and marketing must report only completed phase gates. Build/test success, parser acceptance, screenshot quality, node count, or diagram count cannot substitute for workflow acceptance.

## Gate P0 owner approval

Approve or change the ten decisions in `16-owner-decision-packet.md`. Approval authorizes the revised Phase 1, **Engine Qualification and Workbench Service Foundation**, only. It does not select a runtime engine, approve production claims, or merge later phases.
