# Target Product Contract

Working name: **SysML Engineering Workbench**

Status: historical Gate P0 contract, amended for recovery on 2026-07-25

Recovery authority: `docs/revamp/37-recovery-acceptance-contract.md`

## Recovery amendment

The transport-neutral Workbench Service, Protocol, Client SDK, language
adapter, command, identity, assurance, and evidence boundaries remain accepted.
The former web-first production-authoring profile is suspended because P4 and
P5 were invalidated.

The recovery target is a **VS Code-first local authoring workbench** with
notation-specific views backed by the same service and protocol. GitHub Pages
is a bounded recovery/evaluation surface until it independently passes
exact-artifact and practitioner gates. Tauri and managed hosting remain future
packaging/deployment options, not competing semantic implementations.

## Mission

Provide a source-canonical, local-first engineering workbench for opening,
authoring, understanding, reviewing, comparing, and evidencing real multi-file
SysML v2 projects. Deployment hosts may change, but semantic meaning, identity,
commands, validation, approvals, and evidence contracts do not fork.

## Primary users

- systems engineers authoring textual and graphical model content;
- interface managers assuring cross-boundary exchanges;
- requirements and verification leads assessing coverage/readiness;
- review chairs recording findings against stable model elements;
- configuration managers comparing source-controlled baselines;
- tool administrators deploying private/offline engineering environments;
- chief engineers and assurance leads governing baselines, findings, and
  evidence;
- project managers and stakeholders consuming approved views, comparisons,
  reports, and dispositions.

## Product invariants

1. SysML/KerML source is canonical.
2. No hidden authoritative semantic shadow model exists.
3. Every non-text mutation resolves to explicit source edits.
4. Source remains human-readable and version-control-friendly.
5. Unsupported or unresolved semantics are visible and never invented.
6. Derived views reproduce from source, library lock, and versioned
   configuration.
7. Reviews and evidence anchor to stable workbench model identity.
8. Reports identify available source state, commit/baseline when configured,
   language/library, engine, workbench, rule, projection, and query versions.
9. The qualified local authoring profile works without required external
   network access after installation.
10. Git is an optional baseline/change capability; non-Git workspaces retain
    source, language, query, diagram, and non-baseline assurance capabilities.
11. Provider AI is optional, explicit, minimized, and indicated.
12. AI proposes commands or patches; deterministic validation and approval
    remain mandatory.
13. Supported language-profile entries link to mandatory tests.
14. Official OMG specifications and releases, not a third-party engine, are the
    semantic reference.
15. Deployment choices do not fork the semantic or command core.
16. Every visual mark identifies source-backed, conventional, or analytical
    provenance.
17. A diagram is a notation-specific projection, not a generic graph or element
    count.
18. User-facing gates operate the exact delivered artifact; practitioner gates
    require recorded independent users.

## Core jobs

An engineer can:

1. open and reopen a configured multi-file workspace;
2. inspect indexing, libraries, diagnostics, and capability profile;
3. navigate by containment, type, dependency, relationship, requirements,
   verification, and interface;
4. edit text with language intelligence;
5. inspect supported notation-specific views with source reveal;
6. edit supported diagrams or properties through typed commands and source
   previews;
7. query models and save reproducible views and domain matrices;
8. assess requirements, verification, interfaces, and quality rules;
9. compare Git baselines semantically when Git is configured;
10. conduct model-anchored reviews and close findings;
11. generate deterministic evidence packages;
12. request bounded AI analysis or a reviewable proposal after the recovery
    product gate permits it.

A non-modeler can, through an authorized browser or published-view session:

1. open scoped views and reports;
2. navigate properties and trace relationships;
3. compare published baselines when available;
4. comment or record an assigned finding;
5. respond to an invited disposition;
6. download a reproducible evidence package.

## Information architecture

### VS Code-first authoring host

```text
VS Code native surfaces
├── Explorer and Search
├── SysML/KerML text editor
├── Problems and diagnostics
├── Source control and diff when Git is configured
├── Commands, settings, progress, and workspace trust
└── Workbench views
    ├── Interconnection View
    ├── Interface Assurance
    ├── Verification Readiness
    ├── Review/Evidence views (after recovery gates)
    └── Source-patch review and approval
```

A webview may host notation-specific or assurance views. It must not recreate
native editor, Explorer, Search, Problems, SCM, settings, or workspace-trust
capabilities, and it must not contain semantic or source-writing authority.

### Browser profile

The browser may provide bounded evaluation, published/scoped views, and later
review workflows through the same Client SDK and Protocol. It is not a
production-authoring profile until it independently passes the recovery gates.

## First recovery pilot

The first pilot is a bounded OMC4/SCADA-style interface slice containing:

- remote station, communications path, and control centre;
- system/subsystem and organizational boundaries;
- part definitions and usages;
- boundary ports;
- primary and backup connections/interfaces;
- directed item flow and exchanged type;
- one requirement chain and verification case;
- one operating mode;
- deliberate incomplete or conflicting content;
- an unresolved reference;
- Git-backed and non-Git variants;
- three source-preserving graphical operations;
- an interface-register output.

Pass criteria are defined by Recovery Gates R1-R6. A rendered toy model or a
direct service script does not pass.

## Capability contract

Language and product support is versioned by profile and construct state:

- `supported`;
- `partial`;
- `parsed-preserved-only`;
- `unsupported`.

Only `supported` entries may appear as unqualified product claims. Each entry
maps to exact reference pins, fixtures, service tests, exact-artifact tests,
and practitioner evidence where required.

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

No diagram, property panel, bulk operation, imported markup, webview, or AI
response bypasses this receipt. Canonical source remains unchanged until the
validated proposal receives explicit user approval.

## Review contract

Reviews are diffable project artifacts with:

- unique review and finding ids;
- frozen source/baseline and scope;
- participants and roles;
- stable element and relationship anchors;
- severity, category, owner, and due date;
- disposition history;
- evidence references;
- staleness state after model change;
- closure manifest.

A non-Git workspace records source hashes and states that commit/baseline
provenance is unavailable.

## Evidence contract

HTML/PDF/CSV or future native reports have deterministic content and a
machine-readable manifest. Generation time may be recorded outside content
hashes. Exclusions, unsupported facts, unresolved diagnostics, source state,
runtime, projection, query, and rule versions are visible.

Evidence layers remain distinct:

- unit/component;
- service/integration;
- exact-artifact UI;
- practitioner.

No layer substitutes for another.

## Privacy contract

- telemetry is off by default;
- logs exclude model content by default;
- network indicators reflect actual egress capability and state;
- provider actions require explicit configuration and per-action consent when
  model content leaves the machine;
- credentials remain in the OS keystore or privileged local service;
- public/static samples contain no private project material;
- local source, engines, Git, reviews, and evidence remain local unless a user
  selects an authorized remote profile.

Browser plus local companion, when enabled for evaluation, requires explicit
pairing, loopback-only binding, trusted-origin allowlists, short-lived
credentials, server-issued workspace/file capability handles, CSRF/WebSocket
protections, expiry/revocation, and deny-by-default egress.

## Deployment contract

1. **VS Code local authoring** — recovery target; native text/source-control
   surfaces plus notation and assurance views backed by the Workbench Service.
2. **Public web evaluation** — packaged samples and bounded recovery workflows;
   no arbitrary local filesystem authority.
3. **Browser scoped review** — future authorized review/published-view profile
   using the same protocol and service contracts.
4. **Tauri desktop** — future offline packaging host for the same UI/service
   contracts; no semantic logic in Tauri commands.
5. **Managed hosted** — future authenticated deployment using repository,
   object, and database adapters behind the same protocol.

No deployment profile becomes a product claim until its exact artifact passes
the applicable recovery gates.

## Deferred or non-goals through Recovery Gate R6

- real-time multi-user collaboration;
- cloud repository as canonical storage;
- official conformance certification;
- all SysML 2.1 Beta constructs;
- arbitrary Draw.io round-trip editing;
- autonomous AI source mutation;
- external AI-provider adapters;
- broad diagram-profile coverage;
- full commercial-suite feature parity;
- signed/notarized public installers;
- Windows and managed-hosted product claims.

## Release truth

README, UI, documentation, packages, and release records report only completed
evidence. Build/test success, parser acceptance, service calls, screenshot
quality, node count, or diagram count cannot substitute for exact-artifact and
practitioner acceptance.

P4 and P5 are invalidated as product gates. P6 retains service-level safety
evidence only. P7 and production/release-candidate progression remain blocked
until the recovery contract is satisfied.

## Governance

The historical Gate P0 approval remains evidence for the retained service and
contract boundaries. Active product progression is governed by
`docs/revamp/37-recovery-acceptance-contract.md`. Scope changes require an
explicit owner disposition and corresponding gate/test updates.
